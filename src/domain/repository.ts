import { nanoid } from "nanoid";
import type { DB } from "../db/connection.js";
import { getEmbeddingProvider } from "../embeddings/provider.js";
import type {
  ContextCard,
  SourceEvidence,
  CardEnvironment,
  EvidenceSource,
} from "./types.js";
import type { CardInput } from "./card-schema.js";
import { computeConfidence, estimateTokensSaved } from "./scoring.js";

const JSON_FIELDS = [
  "environment",
  "symptoms",
  "likely_causes",
  "failed_attempts",
  "verified_fix",
  "verification",
  "source_links",
] as const;

interface CardRow {
  id: string;
  title: string;
  problem: string;
  environment: string | null;
  symptoms: string | null;
  likely_causes: string | null;
  failed_attempts: string | null;
  verified_fix: string | null;
  verification: string | null;
  agent_hint: string | null;
  source_links: string | null;
  visibility: string;
  status: string;
  confidence_score: number;
  estimated_tokens_saved: number;
  successful_reuse_count: number;
  failed_reuse_count: number;
  created_at: string;
  updated_at: string;
  last_verified_at: string | null;
}

function rowToCard(row: CardRow): ContextCard {
  return {
    id: row.id,
    title: row.title,
    problem: row.problem,
    environment: (row.environment ? JSON.parse(row.environment) : {}) as CardEnvironment,
    symptoms: row.symptoms ? JSON.parse(row.symptoms) : [],
    likelyCauses: row.likely_causes ? JSON.parse(row.likely_causes) : [],
    failedAttempts: row.failed_attempts ? JSON.parse(row.failed_attempts) : [],
    verifiedFix: row.verified_fix ? JSON.parse(row.verified_fix) : [],
    verification: row.verification ? JSON.parse(row.verification) : [],
    agentHint: row.agent_hint ?? "",
    sourceLinks: row.source_links ? JSON.parse(row.source_links) : [],
    visibility: row.visibility as ContextCard["visibility"],
    status: row.status as ContextCard["status"],
    confidenceScore: row.confidence_score,
    estimatedTokensSaved: row.estimated_tokens_saved,
    successfulReuseCount: row.successful_reuse_count,
    failedReuseCount: row.failed_reuse_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastVerifiedAt: row.last_verified_at ?? undefined,
  };
}

/** Text used to build the embedding + the FTS searchable projection. */
export function cardSearchText(card: ContextCard): string {
  return [
    card.title,
    card.problem,
    card.symptoms.join(" "),
    card.likelyCauses.join(" "),
    card.verifiedFix.join(" "),
  ]
    .filter(Boolean)
    .join("\n");
}

export class Repository {
  // Mark JSON_FIELDS as used (documents the column<->json mapping).
  static readonly jsonColumns = JSON_FIELDS;

  constructor(private readonly db: DB) {}

  /** Create a new card from validated input. Runs scoring + index sync. */
  async createCard(input: CardInput): Promise<ContextCard> {
    const now = new Date().toISOString();
    const card: ContextCard = {
      id: `card_${nanoid(12)}`,
      title: input.title,
      problem: input.problem,
      environment: input.environment ?? {},
      symptoms: input.symptoms,
      likelyCauses: input.likelyCauses,
      failedAttempts: input.failedAttempts,
      verifiedFix: input.verifiedFix,
      verification: input.verification,
      agentHint: input.agentHint,
      sourceLinks: input.sourceLinks,
      visibility: input.visibility,
      status: input.status,
      confidenceScore: 0,
      estimatedTokensSaved: 0,
      successfulReuseCount: 0,
      failedReuseCount: 0,
      createdAt: now,
      updatedAt: now,
      lastVerifiedAt: input.verification.length > 0 ? now : undefined,
    };
    card.confidenceScore = computeConfidence(card);
    card.estimatedTokensSaved = estimateTokensSaved(card);
    await this.persist(card, "insert");
    return card;
  }

  /** Update an existing card (partial), re-score, and re-sync indexes. */
  async updateCard(id: string, patch: Partial<ContextCard>): Promise<ContextCard> {
    const existing = this.getCard(id);
    if (!existing) throw new Error(`Card not found: ${id}`);
    const card: ContextCard = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    card.confidenceScore = computeConfidence(card);
    card.estimatedTokensSaved = estimateTokensSaved(card);
    await this.persist(card, "update");
    return card;
  }

  getCard(id: string): ContextCard | undefined {
    const row = this.db.prepare("SELECT * FROM context_cards WHERE id = ?").get(id) as
      | CardRow
      | undefined;
    return row ? rowToCard(row) : undefined;
  }

  listCards(opts: { status?: string; includeDrafts?: boolean } = {}): ContextCard[] {
    let sql = "SELECT * FROM context_cards";
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.status) {
      where.push("status = ?");
      params.push(opts.status);
    } else if (!opts.includeDrafts) {
      where.push("status NOT IN ('draft')");
    }
    if (where.length) sql += " WHERE " + where.join(" AND ");
    sql += " ORDER BY updated_at DESC";
    const rows = this.db.prepare(sql).all(...params) as CardRow[];
    return rows.map(rowToCard);
  }

  deleteCard(id: string): void {
    const tx = this.db.transaction(() => {
      this.db.prepare("DELETE FROM context_cards_fts WHERE id = ?").run(id);
      this.db.prepare("DELETE FROM context_cards_vec WHERE card_id = ?").run(id);
      this.db.prepare("DELETE FROM context_cards WHERE id = ?").run(id); // cascades evidence
    });
    tx();
  }

  addEvidence(
    cardId: string,
    evidence: {
      source: EvidenceSource;
      repo?: string;
      commitSha?: string;
      files?: string[];
      content: string;
    },
  ): SourceEvidence {
    const row: SourceEvidence = {
      id: `ev_${nanoid(12)}`,
      cardId,
      source: evidence.source,
      repo: evidence.repo,
      commitSha: evidence.commitSha,
      files: evidence.files ?? [],
      content: evidence.content,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO source_evidence (id, card_id, source, repo, commit_sha, files, content, created_at)
         VALUES (@id, @cardId, @source, @repo, @commitSha, @files, @content, @createdAt)`,
      )
      .run({
        ...row,
        repo: row.repo ?? null,
        commitSha: row.commitSha ?? null,
        files: JSON.stringify(row.files),
      });
    return row;
  }

  /** Rebuild FTS + vector tables from the canonical table. */
  async reindexAll(): Promise<number> {
    const cards = this.listCards({ includeDrafts: true });
    for (const card of cards) {
      await this.persist(card, "update");
    }
    return cards.length;
  }

  /** Write the card row and keep FTS + vector tables in sync, atomically. */
  private async persist(card: ContextCard, mode: "insert" | "update"): Promise<void> {
    // Embedding must be computed before the transaction (async, can't run inside
    // better-sqlite3's synchronous transaction).
    const provider = await getEmbeddingProvider();
    const embedding = await provider.embed(cardSearchText(card));

    const tx = this.db.transaction(() => {
      const params = {
        id: card.id,
        title: card.title,
        problem: card.problem,
        environment: JSON.stringify(card.environment),
        symptoms: JSON.stringify(card.symptoms),
        likely_causes: JSON.stringify(card.likelyCauses),
        failed_attempts: JSON.stringify(card.failedAttempts),
        verified_fix: JSON.stringify(card.verifiedFix),
        verification: JSON.stringify(card.verification),
        agent_hint: card.agentHint,
        source_links: JSON.stringify(card.sourceLinks),
        visibility: card.visibility,
        status: card.status,
        confidence_score: card.confidenceScore,
        estimated_tokens_saved: card.estimatedTokensSaved,
        successful_reuse_count: card.successfulReuseCount,
        failed_reuse_count: card.failedReuseCount,
        created_at: card.createdAt,
        updated_at: card.updatedAt,
        last_verified_at: card.lastVerifiedAt ?? null,
      };

      if (mode === "insert") {
        this.db
          .prepare(
            `INSERT INTO context_cards
             (id,title,problem,environment,symptoms,likely_causes,failed_attempts,verified_fix,
              verification,agent_hint,source_links,visibility,status,confidence_score,
              estimated_tokens_saved,successful_reuse_count,failed_reuse_count,created_at,updated_at,last_verified_at)
             VALUES
             (@id,@title,@problem,@environment,@symptoms,@likely_causes,@failed_attempts,@verified_fix,
              @verification,@agent_hint,@source_links,@visibility,@status,@confidence_score,
              @estimated_tokens_saved,@successful_reuse_count,@failed_reuse_count,@created_at,@updated_at,@last_verified_at)`,
          )
          .run(params);
      } else {
        this.db
          .prepare(
            `UPDATE context_cards SET
              title=@title, problem=@problem, environment=@environment, symptoms=@symptoms,
              likely_causes=@likely_causes, failed_attempts=@failed_attempts, verified_fix=@verified_fix,
              verification=@verification, agent_hint=@agent_hint, source_links=@source_links,
              visibility=@visibility, status=@status, confidence_score=@confidence_score,
              estimated_tokens_saved=@estimated_tokens_saved, successful_reuse_count=@successful_reuse_count,
              failed_reuse_count=@failed_reuse_count, updated_at=@updated_at, last_verified_at=@last_verified_at
             WHERE id=@id`,
          )
          .run(params);
      }

      // FTS sync (contentless: delete + insert).
      this.db.prepare("DELETE FROM context_cards_fts WHERE id = ?").run(card.id);
      this.db
        .prepare(
          `INSERT INTO context_cards_fts (id, title, problem, symptoms, likely_causes, verified_fix)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          card.id,
          card.title,
          card.problem,
          card.symptoms.join(" "),
          card.likelyCauses.join(" "),
          card.verifiedFix.join(" "),
        );

      // Vector sync.
      this.db.prepare("DELETE FROM context_cards_vec WHERE card_id = ?").run(card.id);
      this.db
        .prepare("INSERT INTO context_cards_vec (card_id, embedding) VALUES (?, ?)")
        .run(card.id, Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength));
    });
    tx();
  }
}
