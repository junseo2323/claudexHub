import { describe, it, expect } from "vitest";
import type { ContextCard } from "../src/domain/types.js";
import { daysSinceVerified, needsReverification, DEFAULT_REVERIFY_DAYS } from "../src/domain/freshness.js";

function card(over: Partial<ContextCard>): ContextCard {
  return {
    id: "c",
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
    confidenceScore: 60,
    estimatedTokensSaved: 0,
    successfulReuseCount: 0,
    failedReuseCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

const now = new Date("2026-06-13T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();

describe("freshness", () => {
  it("daysSinceVerified is null when never verified", () => {
    expect(daysSinceVerified(card({ lastVerifiedAt: undefined }), now)).toBeNull();
  });

  it("daysSinceVerified counts whole days", () => {
    expect(daysSinceVerified(card({ lastVerifiedAt: daysAgo(10) }), now)).toBe(10);
  });

  it("flags a long-unverified published card", () => {
    const old = card({ verification: ["ok"], lastVerifiedAt: daysAgo(DEFAULT_REVERIFY_DAYS + 5) });
    expect(needsReverification(old, DEFAULT_REVERIFY_DAYS, now)).toBe(true);
  });

  it("does not flag recently verified, never-verified, or non-published cards", () => {
    expect(needsReverification(card({ verification: ["ok"], lastVerifiedAt: daysAgo(10) }), DEFAULT_REVERIFY_DAYS, now)).toBe(false);
    expect(needsReverification(card({ verification: [], lastVerifiedAt: daysAgo(400) }), DEFAULT_REVERIFY_DAYS, now)).toBe(false);
    expect(needsReverification(card({ status: "draft", verification: ["ok"], lastVerifiedAt: daysAgo(400) }), DEFAULT_REVERIFY_DAYS, now)).toBe(false);
  });
});
