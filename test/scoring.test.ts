import { describe, it, expect } from "vitest";
import {
  computeConfidence,
  confidenceBreakdown,
  estimateTokens,
  estimateTokensSaved,
} from "../src/domain/scoring.js";
import type { ContextCard } from "../src/domain/types.js";

function card(overrides: Partial<ContextCard> = {}): ContextCard {
  const now = new Date().toISOString();
  return {
    id: "card_x",
    title: "t",
    problem: "p",
    environment: {},
    symptoms: [],
    likelyCauses: [],
    failedAttempts: [],
    verifiedFix: [],
    verification: [],
    agentHint: "",
    sourceLinks: [],
    visibility: "public",
    status: "published",
    confidenceScore: 0,
    estimatedTokensSaved: 0,
    successfulReuseCount: 0,
    failedReuseCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("scoring", () => {
  it("verified + recently-verified card scores higher than a bare draft", () => {
    const bare = computeConfidence(card());
    const strong = computeConfidence(
      card({
        verifiedFix: ["fix"],
        verification: ["tested"],
        sourceLinks: ["https://docs"],
        lastVerifiedAt: new Date().toISOString(),
      }),
    );
    expect(strong).toBeGreaterThan(bare);
  });

  it("confidence stays within 0..100", () => {
    const v = computeConfidence(
      card({ verifiedFix: ["a"], verification: ["b"], sourceLinks: ["c"], successfulReuseCount: 10 }),
    );
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
  });

  it("failed reuse and stale status penalize confidence", () => {
    const base = card({ verifiedFix: ["fix"], verification: ["ok"], lastVerifiedAt: new Date().toISOString() });
    const baseScore = computeConfidence(base);

    const failed = computeConfidence({ ...base, failedReuseCount: 3 });
    expect(failed).toBeLessThan(baseScore);

    const stale = computeConfidence({ ...base, status: "stale" });
    expect(stale).toBeLessThan(baseScore);

    const deprecated = computeConfidence({ ...base, status: "deprecated" });
    expect(deprecated).toBeLessThanOrEqual(stale);
  });

  it("breakdown components sum into the clamped total", () => {
    const b = confidenceBreakdown(
      card({ verifiedFix: ["f"], verification: ["v"], failedReuseCount: 5, status: "stale" }),
    );
    expect(b.failedPenalty).toBeGreaterThan(0);
    expect(b.stalePenalty).toBeGreaterThan(0);
    expect(b.total).toBeGreaterThanOrEqual(0);
    expect(b.total).toBeLessThanOrEqual(100);
  });

  it("estimateTokens ~ chars/4", () => {
    expect(estimateTokens("a".repeat(40))).toBe(10);
  });

  it("estimateTokensSaved scales with content", () => {
    const small = estimateTokensSaved(card({ problem: "short" }));
    const big = estimateTokensSaved(card({ problem: "x".repeat(2000) }));
    expect(big).toBeGreaterThan(small);
  });
});
