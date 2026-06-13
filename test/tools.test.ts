import { describe, it, expect, afterEach } from "vitest";
import type { DB } from "../src/db/connection.js";
import { Repository } from "../src/domain/repository.js";
import { makeDraftContextCardHandler } from "../src/mcp/tools/draft-context-card.js";
import { makePublishContextCardHandler } from "../src/mcp/tools/publish-context-card.js";
import { makeGetContextCardHandler } from "../src/mcp/tools/get-context-card.js";
import { makeRelatedContextHandler } from "../src/mcp/tools/related-context.js";
import { SearchService } from "../src/domain/search.js";
import { freshDb } from "./helpers.js";

function parse(result: { content: { text: string }[] }) {
  return JSON.parse(result.content[0].text);
}

describe("MCP tool handlers", () => {
  let db: DB;
  afterEach(() => db?.close());

  it("draft_context_card runs redaction and stores a draft", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const draft = makeDraftContextCardHandler(repo);

    const res = await draft({
      source: "conversation",
      problem_summary: "Login broke",
      content: "fixed it, db at postgres://user:pw@host/db and api_key: 'secret123456'",
      verified_fix: ["set SameSite=None"],
    });
    const out = parse(res);
    expect(out.status).toBe("draft");
    expect(out.redaction_report.findingsCount).toBeGreaterThan(0);

    // Evidence is stored redacted.
    const ev = db.prepare("SELECT content FROM source_evidence WHERE card_id = ?").get(out.id) as
      | { content: string }
      | undefined;
    expect(ev?.content).toContain("[REDACTED:");
    expect(ev?.content).not.toContain("secret123456");
  });

  it("draft_context_card links GitHub evidence onto the draft", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const draft = makeDraftContextCardHandler(repo);

    const res = await draft({
      source: "diff",
      repo: "junseo2323/claudexHub",
      commit_sha: "a1b2c3d4e5",
      problem_summary: "Team card access bug",
      content: "Resolved in PR #5 after the failing issue #9 reproduction.",
      verified_fix: ["gate team cards by membership"],
    });
    const out = parse(res);
    const card = repo.getCard(out.id);
    expect(card?.sourceLinks).toEqual([
      "https://github.com/junseo2323/claudexHub/commit/a1b2c3d4e5",
      "https://github.com/junseo2323/claudexHub/pull/5",
      "https://github.com/junseo2323/claudexHub/issues/9",
    ]);
    expect(out.extraction_report.githubReferences).toHaveLength(3);

    const ev = db.prepare("SELECT url, commit_sha FROM source_evidence WHERE card_id = ?").get(out.id) as
      | { url: string; commit_sha: string }
      | undefined;
    expect(ev?.url).toBe("https://github.com/junseo2323/claudexHub/commit/a1b2c3d4e5");
    expect(ev?.commit_sha).toBe("a1b2c3d4e5");
  });

  it("publish blocks when secrets remain in the card", async () => {
    db = freshDb();
    const repo = new Repository(db);
    // Insert a card that still contains a secret (bypassing draft redaction).
    const card = await repo.createCard({
      title: "Leaky",
      problem: "token is ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      environment: {},
      symptoms: [],
      likelyCauses: [],
      failedAttempts: [],
      verifiedFix: [],
      verification: [],
      agentHint: "",
      sourceLinks: [],
      visibility: "private",
      status: "draft",
    });

    const publish = makePublishContextCardHandler(repo);
    const res = await publish({ id: card.id, approve: true });
    expect(res.isError).toBe(true);
    expect(parse(res).error).toBe("secrets_detected");
  });

  it("publish requires approve=true", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const card = await repo.createCard({
      title: "Clean", problem: "clean problem", environment: {}, symptoms: [], likelyCauses: [],
      failedAttempts: [], verifiedFix: ["fix"], verification: [], agentHint: "", sourceLinks: [],
      visibility: "private", status: "draft",
    });
    const publish = makePublishContextCardHandler(repo);
    const res = await publish({ id: card.id, approve: false });
    expect(res.isError).toBe(true);
    expect(parse(res).error).toBe("approval_required");
  });

  it("publish then succeeds and flips status to published", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const card = await repo.createCard({
      title: "Clean", problem: "clean problem", environment: {}, symptoms: [], likelyCauses: [],
      failedAttempts: [], verifiedFix: ["fix"], verification: ["ok"], agentHint: "", sourceLinks: [],
      visibility: "private", status: "draft",
    });
    const publish = makePublishContextCardHandler(repo);
    const res = await publish({ id: card.id, approve: true, visibility: "public" });
    expect(res.isError).toBeUndefined();
    expect(parse(res).status).toBe("published");
    expect(repo.getCard(card.id)?.visibility).toBe("public");
  });

  it("get_context_card agent_json returns a compact subset", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const card = await repo.createCard({
      title: "T", problem: "P", environment: { frontend: "Next.js" }, symptoms: ["s"],
      likelyCauses: ["c"], failedAttempts: ["f"], verifiedFix: ["fix"], verification: ["v"],
      agentHint: "hint", sourceLinks: [], visibility: "public", status: "published",
    });
    const get = makeGetContextCardHandler(repo);
    const res = await get({ id: card.id, mode: "agent_json" });
    const out = parse(res);
    expect(out).toHaveProperty("verified_fix");
    expect(out).toHaveProperty("agent_hint");
    // Compact: heavy fields like failedAttempts/symptoms are omitted.
    expect(out).not.toHaveProperty("failedAttempts");
  });

  it("related_context returns brief siblings, excluding the source card", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const a = await repo.createCard({
      title: "OAuth cookie not stored", problem: "cookie missing on cross-site fetch",
      environment: {}, symptoms: [], likelyCauses: [], failedAttempts: [],
      verifiedFix: ["SameSite=None"], verification: [], agentHint: "", sourceLinks: [],
      visibility: "public", status: "published",
    });
    const b = await repo.createCard({
      title: "CloudFront SPA 403", problem: "403 on deep-link refresh",
      environment: {}, symptoms: [], likelyCauses: [], failedAttempts: [],
      verifiedFix: ["map 403 to index.html"], verification: [], agentHint: "", sourceLinks: [],
      visibility: "public", status: "published",
    });

    const related = makeRelatedContextHandler(new SearchService(db));
    const out = parse(await related({ id: a.id, limit: 3 }));
    expect(Array.isArray(out.related)).toBe(true);
    expect(out.related.find((r: { id: string }) => r.id === a.id)).toBeUndefined();
    expect(out.related.find((r: { id: string }) => r.id === b.id)).toBeTruthy();
    // Brief shape: no full body leaks.
    expect(out.related[0]).not.toHaveProperty("problem");
  });
});
