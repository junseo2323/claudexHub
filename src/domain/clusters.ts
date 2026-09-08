import { nanoid } from "nanoid";
import type { DB } from "../db/connection.js";
import { config } from "../config.js";
import type { ContextCard } from "./types.js";
import { Repository } from "./repository.js";
import { toCardForJudge } from "../llm/types.js";
import type { LlmJudge } from "../llm/types.js";

export interface SimilarCard {
  cardId: string;
  /** Cosine similarity in [0, 1]. */
  similarity: number;
}

/** A same-problem group. The canonical card represents it in search. */
export interface CardCluster {
  id: string;
  canonicalCardId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClusterMember {
  cardId: string;
  clusterId: string;
  similarity: number;
  createdAt: string;
}

export interface AssignResult {
  cluster: CardCluster;
  /** Cards the new member was matched against (with similarity). */
  matched: SimilarCard[];
  /** Whether an LLM judge confirmed any gray-zone match. */
  llmConfirmed: boolean;
}

interface ClusterRow {
  id: string;
  canonical_card_id: string;
  created_at: string;
  updated_at: string;
}
interface MemberRow {
  card_id: string;
  cluster_id: string;
  similarity: number;
  created_at: string;
}

const rowToCluster = (r: ClusterRow): CardCluster => ({
  id: r.id,
  canonicalCardId: r.canonical_card_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const rowToMember = (r: MemberRow): ClusterMember => ({
  cardId: r.card_id,
  clusterId: r.cluster_id,
  similarity: r.similarity,
  createdAt: r.created_at,
});

/** Drafts are never grouped: they're private and still being edited. */
const GROUPABLE_STATUSES = new Set(["published", "approved", "stale", "deprecated"]);

/** Prefer live cards, then confidence, then age when picking a representative. */
function canonicalRank(card: ContextCard): [number, number, number] {
  const live = card.status === "published" || card.status === "approved" ? 1 : 0;
  return [live, card.confidenceScore, -new Date(card.createdAt).getTime()];
}

export interface ClusterOptions {
  /** Similarity at/above which cards group without asking the judge. */
  threshold?: number;
  /** Lower bound of the band where the judge is consulted. */
  confirmMin?: number;
}

/**
 * Groups near-duplicate cards ("같은 문제") by embedding similarity, optionally
 * asking the LLM judge to confirm borderline pairs. Groups are additive
 * metadata: cards keep their own rows, and search collapses a group to its
 * canonical card while reporting the group size.
 */
export class ClusterService {
  private readonly repo: Repository;
  private readonly threshold: number;
  private readonly confirmMin: number;

  constructor(
    private readonly db: DB,
    opts: ClusterOptions = {},
  ) {
    this.repo = new Repository(db);
    this.threshold = opts.threshold ?? config.clusterSimilarityThreshold;
    this.confirmMin = Math.min(opts.confirmMin ?? config.clusterLlmConfirmMin, this.threshold);
  }

  /** Nearest non-draft cards by stored embedding (excludes the card itself). */
  findSimilar(
    cardId: string,
    opts: { limit?: number; minSimilarity?: number } = {},
  ): SimilarCard[] {
    const limit = opts.limit ?? 5;
    const minSimilarity = opts.minSimilarity ?? 0.5;
    const row = this.db
      .prepare("SELECT embedding FROM context_cards_vec WHERE card_id = ?")
      .get(cardId) as { embedding: Buffer } | undefined;
    if (!row) return [];
    const rows = this.db
      .prepare(
        `SELECT card_id AS id, distance
         FROM context_cards_vec
         WHERE embedding MATCH ? AND k = ?
         ORDER BY distance`,
      )
      .all(row.embedding, limit + 10) as { id: string; distance: number }[];
    const out: SimilarCard[] = [];
    for (const r of rows) {
      if (r.id === cardId) continue;
      const similarity = Math.min(Math.max(1 - r.distance, 0), 1);
      if (similarity < minSimilarity) continue;
      const other = this.repo.getCard(r.id);
      if (!other || !GROUPABLE_STATUSES.has(other.status)) continue;
      out.push({ cardId: r.id, similarity });
      if (out.length >= limit) break;
    }
    return out;
  }

  getCluster(id: string): CardCluster | undefined {
    const row = this.db.prepare("SELECT * FROM card_clusters WHERE id = ?").get(id) as ClusterRow | undefined;
    return row ? rowToCluster(row) : undefined;
  }

  clusterOf(cardId: string): CardCluster | undefined {
    const row = this.db
      .prepare(
        `SELECT c.* FROM card_clusters c
         JOIN card_cluster_members m ON m.cluster_id = c.id
         WHERE m.card_id = ?`,
      )
      .get(cardId) as ClusterRow | undefined;
    return row ? rowToCluster(row) : undefined;
  }

  members(clusterId: string): ClusterMember[] {
    const rows = this.db
      .prepare("SELECT * FROM card_cluster_members WHERE cluster_id = ? ORDER BY created_at ASC")
      .all(clusterId) as MemberRow[];
    return rows.map(rowToMember);
  }

  /** Every group with at least two members, largest first. */
  listClusters(): { cluster: CardCluster; members: ClusterMember[] }[] {
    const rows = this.db
      .prepare(
        `SELECT c.*, (SELECT count(*) FROM card_cluster_members m WHERE m.cluster_id = c.id) AS n
         FROM card_clusters c ORDER BY n DESC, c.updated_at DESC`,
      )
      .all() as (ClusterRow & { n: number })[];
    return rows
      .filter((r) => r.n >= 2)
      .map((r) => ({ cluster: rowToCluster(r), members: this.members(r.id) }));
  }

  /**
   * Place a (non-draft) card into a group if it matches existing cards: strong
   * matches (>= threshold) join directly; borderline ones (>= confirmMin) join
   * only when the judge agrees they are the same problem. Merges groups when a
   * card bridges two of them. Returns undefined when nothing matched.
   */
  async assign(cardId: string, opts: { judge?: LlmJudge } = {}): Promise<AssignResult | undefined> {
    const card = this.repo.getCard(cardId);
    if (!card || !GROUPABLE_STATUSES.has(card.status)) return undefined;
    const candidates = this.findSimilar(cardId, { limit: 8, minSimilarity: this.confirmMin });
    const matched: SimilarCard[] = [];
    let llmConfirmed = false;
    for (const c of candidates) {
      if (c.similarity >= this.threshold) {
        matched.push(c);
        continue;
      }
      if (!opts.judge) continue;
      const other = this.repo.getCard(c.cardId);
      if (!other) continue;
      const verdict = await opts.judge.sameProblem(toCardForJudge(card), toCardForJudge(other));
      if (verdict.same && verdict.confidence >= 0.6) {
        matched.push(c);
        llmConfirmed = true;
      }
    }
    if (matched.length === 0) return undefined;

    const now = new Date().toISOString();
    const clusterId = this.db.transaction(() => {
      const existing = [...new Set(matched.map((m) => this.clusterOf(m.cardId)?.id).filter((x): x is string => !!x))];
      const own = this.clusterOf(cardId)?.id;
      if (own && !existing.includes(own)) existing.unshift(own);
      let target = existing[0];
      if (!target) {
        target = `cl_${nanoid(10)}`;
        this.db
          .prepare("INSERT INTO card_clusters (id, canonical_card_id, created_at, updated_at) VALUES (?, ?, ?, ?)")
          .run(target, cardId, now, now);
      }
      // Merge any other groups the matches belonged to into the target.
      for (const other of existing.slice(1)) {
        this.db.prepare("UPDATE card_cluster_members SET cluster_id = ? WHERE cluster_id = ?").run(target, other);
        this.db.prepare("DELETE FROM card_clusters WHERE id = ?").run(other);
      }
      const upsert = this.db.prepare(
        `INSERT INTO card_cluster_members (card_id, cluster_id, similarity, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(card_id) DO UPDATE SET cluster_id = excluded.cluster_id,
           similarity = max(similarity, excluded.similarity)`,
      );
      upsert.run(cardId, target, Math.max(...matched.map((m) => m.similarity)), now);
      for (const m of matched) upsert.run(m.cardId, target, m.similarity, now);
      this.recomputeCanonical(target, now);
      return target;
    })();

    return { cluster: this.getCluster(clusterId)!, matched, llmConfirmed };
  }

  /** Pick the representative: live > confidence > oldest. */
  recomputeCanonical(clusterId: string, now = new Date().toISOString()): void {
    const cards = this.members(clusterId)
      .map((m) => this.repo.getCard(m.cardId))
      .filter((c): c is ContextCard => !!c);
    if (cards.length === 0) {
      this.db.prepare("DELETE FROM card_clusters WHERE id = ?").run(clusterId);
      return;
    }
    cards.sort((a, b) => {
      const ra = canonicalRank(a);
      const rb = canonicalRank(b);
      for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return rb[i] - ra[i];
      return 0;
    });
    this.db
      .prepare("UPDATE card_clusters SET canonical_card_id = ?, updated_at = ? WHERE id = ?")
      .run(cards[0].id, now, clusterId);
  }

  /** Manually choose the representative card of a group. */
  setCanonical(clusterId: string, cardId: string): boolean {
    const isMember = this.members(clusterId).some((m) => m.cardId === cardId);
    if (!isMember) return false;
    this.db
      .prepare("UPDATE card_clusters SET canonical_card_id = ?, updated_at = ? WHERE id = ?")
      .run(cardId, new Date().toISOString(), clusterId);
    return true;
  }

  /** Take a card out of its group; a group left with one member is dissolved. */
  removeMember(cardId: string): void {
    const cluster = this.clusterOf(cardId);
    if (!cluster) return;
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM card_cluster_members WHERE card_id = ?").run(cardId);
      const left = this.members(cluster.id);
      if (left.length < 2) {
        this.db.prepare("DELETE FROM card_clusters WHERE id = ?").run(cluster.id);
      } else if (cluster.canonicalCardId === cardId) {
        this.recomputeCanonical(cluster.id);
      }
    })();
  }

  /** Drop every group and rebuild from scratch (oldest cards first). */
  async recluster(opts: { judge?: LlmJudge } = {}): Promise<{ clusters: number; grouped: number }> {
    this.db.exec("DELETE FROM card_cluster_members; DELETE FROM card_clusters;");
    const cards = this.repo
      .listCards()
      .filter((c) => GROUPABLE_STATUSES.has(c.status))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const c of cards) await this.assign(c.id, opts);
    const groups = this.listClusters();
    return { clusters: groups.length, grouped: groups.reduce((n, g) => n + g.members.length, 0) };
  }
}
