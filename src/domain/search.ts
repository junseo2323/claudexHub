import type { DB } from "../db/connection.js";
import { config } from "../config.js";
import { getEmbeddingProvider } from "../embeddings/provider.js";
import type { CardBrief, SearchInput } from "./types.js";
import { Repository } from "./repository.js";
import { buildBrief, type MatchSignals } from "./brief.js";

/** Statuses an agent is allowed to retrieve via search. */
const SEARCHABLE_STATUSES = new Set(["published", "approved"]);

/** Escape FTS5 special chars and OR-join terms for a forgiving keyword query. */
function toFtsQuery(text: string): string {
  const terms = text
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((t) => t.length > 1);
  if (!terms || terms.length === 0) return "";
  // Quote each term to neutralize FTS operators, join with OR.
  return [...new Set(terms)].map((t) => `"${t}"`).join(" OR ");
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => t.length > 1);
}

interface Candidate {
  kwScore: number;
  vecScore: number;
}

export class SearchService {
  private readonly repo: Repository;

  constructor(private readonly db: DB) {
    this.repo = new Repository(db);
  }

  async search(input: SearchInput): Promise<CardBrief[]> {
    const limit = Math.min(Math.max(input.limit ?? 5, 1), 10);
    const queryText = [input.query, input.error, (input.stack ?? []).join(" ")]
      .filter(Boolean)
      .join(" ");
    const queryTerms = new Set(tokenize(queryText));

    const candidates = new Map<string, Candidate>();
    const ensure = (id: string): Candidate => {
      let c = candidates.get(id);
      if (!c) {
        c = { kwScore: 0, vecScore: 0 };
        candidates.set(id, c);
      }
      return c;
    };

    // --- Keyword (FTS5 / BM25) ---
    const ftsQuery = toFtsQuery(queryText);
    if (ftsQuery) {
      const rows = this.db
        .prepare(
          `SELECT id, bm25(context_cards_fts) AS rank
           FROM context_cards_fts
           WHERE context_cards_fts MATCH ?
           ORDER BY rank
           LIMIT 25`,
        )
        .all(ftsQuery) as { id: string; rank: number }[];
      for (const row of rows) {
        // bm25 returns lower = better (can be negative); map to (0,1].
        ensure(row.id).kwScore = 1 / (1 + Math.max(row.rank, 0));
      }
    }

    // --- Vector (sqlite-vec KNN) ---
    const provider = await getEmbeddingProvider();
    const qvec = await provider.embed(queryText);
    const qbuf = Buffer.from(qvec.buffer, qvec.byteOffset, qvec.byteLength);
    const vrows = this.db
      .prepare(
        `SELECT card_id AS id, distance
         FROM context_cards_vec
         WHERE embedding MATCH ? AND k = 25
         ORDER BY distance`,
      )
      .all(qbuf) as { id: string; distance: number }[];
    for (const row of vrows) {
      // cosine distance in [0,2]; similarity = 1 - distance.
      ensure(row.id).vecScore = Math.min(Math.max(1 - row.distance, 0), 1);
    }

    // --- Fuse + filter + project ---
    const results: CardBrief[] = [];
    for (const [id, scores] of candidates) {
      const card = this.repo.getCard(id);
      if (!card || !SEARCHABLE_STATUSES.has(card.status)) continue;

      let fused = config.keywordWeight * scores.kwScore + config.vectorWeight * scores.vecScore;

      // Light env/stack/repo boost.
      const envValues = Object.values(card.environment).filter(Boolean).join(" ").toLowerCase();
      const envMatches: string[] = [];
      for (const s of input.stack ?? []) {
        if (envValues.includes(s.toLowerCase())) envMatches.push(s);
      }
      if (envMatches.length) fused = Math.min(fused + 0.05, 1);

      const cardTerms = new Set(tokenize(`${card.title} ${card.problem}`));
      const overlapTerms = [...queryTerms].filter((t) => cardTerms.has(t));

      const confidence = Math.round(Math.min(fused, 1) * 100);
      const signals: MatchSignals = {
        matchedKeyword: scores.kwScore > 0,
        matchedVector: scores.vecScore > 0,
        overlapTerms,
        envMatches,
      };
      results.push(buildBrief(card, confidence, signals));
    }

    results.sort((a, b) => b.confidence - a.confidence);
    return results.slice(0, limit);
  }
}
