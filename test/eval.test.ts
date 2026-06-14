import { describe, it, expect, afterEach } from "vitest";
import type { DB } from "../src/db/connection.js";
import { Repository } from "../src/domain/repository.js";
import { cardInputSchema } from "../src/domain/card-schema.js";
import { evaluateSearch, selfRetrievalCases, type Searcher } from "../src/domain/eval.js";
import { freshDb } from "./helpers.js";

/** Stub searcher returning a fixed ranking per query for deterministic metrics. */
function stub(byQuery: Record<string, string[]>): Searcher {
  return {
    async search({ query, limit = 5 }) {
      return (byQuery[query] ?? []).slice(0, limit).map((id) => ({ id }));
    },
  };
}

describe("evaluateSearch", () => {
  it("computes hit@1, hit@k, MRR and precision", async () => {
    const search = stub({
      // relevant 'a' is first -> hit@1, RR=1
      q1: ["a", "x", "y"],
      // relevant 'b' is third -> hit@k, RR=1/3
      q2: ["x", "y", "b"],
      // no relevant in results
      q3: ["x", "y", "z"],
    });
    const report = await evaluateSearch(
      search,
      [
        { query: "q1", relevantIds: ["a"] },
        { query: "q2", relevantIds: ["b"] },
        { query: "q3", relevantIds: ["c"] },
      ],
      3,
    );

    expect(report.cases).toBe(3);
    expect(report.hitAt1Rate).toBeCloseTo(1 / 3, 5);
    expect(report.hitAtKRate).toBeCloseTo(2 / 3, 5);
    // MRR = (1 + 1/3 + 0) / 3
    expect(report.mrr).toBeCloseTo((1 + 1 / 3) / 3, 5);
    // precision@3 = (1/3 + 1/3 + 0) / 3
    expect(report.meanPrecisionAtK).toBeCloseTo((1 / 3 + 1 / 3) / 3, 5);
  });

  it("selfRetrievalCases builds one case per published card", async () => {
    const db: DB = freshDb();
    try {
      const repo = new Repository(db);
      const c = await repo.createCard(
        cardInputSchema.parse({ title: "Kafka rebalance", problem: "p", status: "published", visibility: "public" }),
      );
      await repo.createCard(cardInputSchema.parse({ title: "Draft", problem: "p", status: "draft" }));

      const cases = selfRetrievalCases(db);
      expect(cases).toHaveLength(1); // drafts excluded
      expect(cases[0]).toEqual({ query: "Kafka rebalance", relevantIds: [c.id] });
    } finally {
      db.close();
    }
  });
});
