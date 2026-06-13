import { describe, it, expect, afterEach } from "vitest";
import type { DB } from "../src/db/connection.js";
import { Repository } from "../src/domain/repository.js";
import { SearchService } from "../src/domain/search.js";
import { cardInputSchema } from "../src/domain/card-schema.js";
import { makeRecordFeedbackHandler } from "../src/mcp/tools/record-feedback.js";
import { makeMarkStaleHandler } from "../src/mcp/tools/mark-stale.js";
import { freshDb } from "./helpers.js";

function parse(result: { content: { text: string }[] }) {
  return JSON.parse(result.content[0].text);
}

async function publishedCard(repo: Repository, title = "Cookie fix") {
  return repo.createCard(
    cardInputSchema.parse({
      title,
      problem: "cookie not stored cross-site",
      verifiedFix: ["SameSite=None; Secure"],
      verification: ["cookie present"],
      status: "published",
      visibility: "public",
    }),
  );
}

describe("agent feedback loop", () => {
  let db: DB;
  afterEach(() => db?.close());

  it("success feedback bumps reuse count and accumulates tokens saved", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const card = await publishedCard(repo);
    const before = card.estimatedTokensSaved;

    const record = makeRecordFeedbackHandler(repo);
    const res = parse(
      await record({ card_id: card.id, outcome: "success", agent: "codex" }),
    );

    expect(res.recorded).toBe(true);
    expect(res.tokens_saved).toBeGreaterThan(0);
    const updated = repo.getCard(card.id)!;
    expect(updated.successfulReuseCount).toBe(1);
    expect(updated.failedReuseCount).toBe(0);
    expect(updated.estimatedTokensSaved).toBe(before + res.tokens_saved);

    const usageRows = db.prepare("SELECT count(*) c FROM agent_usage WHERE card_id = ?").get(card.id) as { c: number };
    expect(usageRows.c).toBe(1);
  });

  it("failed feedback increments failed count and saves no tokens", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const card = await publishedCard(repo);
    const before = card.estimatedTokensSaved;
    const record = makeRecordFeedbackHandler(repo);
    const res = parse(await record({ card_id: card.id, outcome: "failed", agent: "claude_code" }));

    expect(res.tokens_saved).toBe(0);
    const updated = repo.getCard(card.id)!;
    expect(updated.failedReuseCount).toBe(1);
    expect(updated.estimatedTokensSaved).toBe(before);
  });

  it("uses measured before/after tokens when provided", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const card = await publishedCard(repo);
    const record = makeRecordFeedbackHandler(repo);
    const res = parse(
      await record({
        card_id: card.id,
        outcome: "success",
        tokens_before_estimate: 12000,
        tokens_after_actual: 2000,
      }),
    );
    expect(res.tokens_saved).toBe(10000);
  });

  it("mark_stale removes a card from search results", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const card = await publishedCard(repo, "Cookie cross-site stale candidate");
    const search = new SearchService(db);

    let results = await search.search({ query: "cookie cross-site" });
    expect(results.find((r) => r.id === card.id)).toBeTruthy();

    const stale = makeMarkStaleHandler(repo);
    const res = parse(await stale({ card_id: card.id, reason: "Next.js 16 changed cookie defaults", affected_versions: ["Next.js 16"] }));
    expect(res.status).toBe("stale");

    results = await search.search({ query: "cookie cross-site" });
    expect(results.find((r) => r.id === card.id)).toBeUndefined();
  });

  it("records error for unknown card", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const record = makeRecordFeedbackHandler(repo);
    const res = await record({ card_id: "card_missing", outcome: "success" });
    expect(res.isError).toBe(true);
  });
});
