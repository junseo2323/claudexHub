import type { DB } from "../db/connection.js";
import { Repository } from "./repository.js";
import type { SearchService } from "./search.js";

export interface EvalCase {
  query: string;
  stack?: string[];
  /** Card ids considered relevant for this query. */
  relevantIds: string[];
}

export interface EvalCaseResult {
  query: string;
  /** 1-based rank of the first relevant card, or null if none in the top-k. */
  rankOfFirstRelevant: number | null;
  hitAt1: boolean;
  hitAtK: boolean;
  precisionAtK: number;
}

export interface EvalReport {
  k: number;
  cases: number;
  hitAt1Rate: number;
  hitAtKRate: number;
  /** Mean reciprocal rank of the first relevant result. */
  mrr: number;
  meanPrecisionAtK: number;
  results: EvalCaseResult[];
}

/** Minimal search surface the harness needs (lets tests pass a stub). */
export interface Searcher {
  search(input: {
    query: string;
    stack?: string[];
    limit?: number;
  }): Promise<{ id: string }[]>;
}

/** Run a labelled query set through search and report ranking-quality metrics. */
export async function evaluateSearch(
  search: Searcher,
  cases: EvalCase[],
  k = 5,
): Promise<EvalReport> {
  const results: EvalCaseResult[] = [];
  for (const c of cases) {
    const briefs = await search.search({ query: c.query, stack: c.stack, limit: k });
    const ids = briefs.slice(0, k).map((b) => b.id);
    const relevant = new Set(c.relevantIds);

    let rank: number | null = null;
    for (let i = 0; i < ids.length; i++) {
      if (relevant.has(ids[i])) {
        rank = i + 1;
        break;
      }
    }
    const hits = ids.filter((id) => relevant.has(id)).length;
    results.push({
      query: c.query,
      rankOfFirstRelevant: rank,
      hitAt1: ids.length > 0 && relevant.has(ids[0]),
      hitAtK: rank != null,
      precisionAtK: ids.length > 0 ? hits / ids.length : 0,
    });
  }

  const n = results.length || 1;
  return {
    k,
    cases: results.length,
    hitAt1Rate: results.filter((r) => r.hitAt1).length / n,
    hitAtKRate: results.filter((r) => r.hitAtK).length / n,
    mrr: results.reduce((s, r) => s + (r.rankOfFirstRelevant ? 1 / r.rankOfFirstRelevant : 0), 0) / n,
    meanPrecisionAtK: results.reduce((s, r) => s + r.precisionAtK, 0) / n,
    results,
  };
}

/**
 * Build a self-retrieval eval set from the live data: each published card's
 * title becomes a query that should retrieve that card. A coarse but useful
 * "can the hub find its own cards?" signal.
 */
export function selfRetrievalCases(db: DB): EvalCase[] {
  return new Repository(db)
    .listCards()
    .filter((c) => c.status === "published")
    .map((c) => ({ query: c.title, relevantIds: [c.id] }));
}

/** Convenience: run the self-retrieval eval over the live search index. */
export async function evaluateSelfRetrieval(
  search: SearchService,
  db: DB,
  k = 5,
): Promise<EvalReport> {
  return evaluateSearch(search as unknown as Searcher, selfRetrievalCases(db), k);
}
