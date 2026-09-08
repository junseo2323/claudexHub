import { describe, it, expect, afterEach } from "vitest";
import type { DB } from "../src/db/connection.js";
import { Repository } from "../src/domain/repository.js";
import { SearchService } from "../src/domain/search.js";
import { cardInputSchema } from "../src/domain/card-schema.js";
import { ClusterService } from "../src/domain/clusters.js";
import { makeDraftContextCardHandler } from "../src/mcp/tools/draft-context-card.js";
import { makePublishContextCardHandler } from "../src/mcp/tools/publish-context-card.js";
import { makeGetContextCardHandler } from "../src/mcp/tools/get-context-card.js";
import { freshDb, FakeJudge } from "./helpers.js";

const parse = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

const COOKIE = {
  title: "Kakao OAuth cookie not stored in Safari after callback",
  problem: "Set-Cookie is returned but Safari never stores the session cookie after the Kakao login callback",
  verifiedFix: ["SameSite=None; Secure", "credentials: include"],
  verification: ["cookie visible in Application tab"],
};
const CLOUDFRONT = {
  title: "CloudFront returns 403 on SPA deep link refresh",
  problem: "S3 origin behind CloudFront answers 403 AccessDenied when a deep link is refreshed",
  verifiedFix: ["map 403 to /index.html with 200"],
  verification: ["deep link refresh renders the app"],
};

async function published(repo: Repository, seed: typeof COOKIE, over: Record<string, unknown> = {}) {
  return repo.createCard(cardInputSchema.parse({ ...seed, visibility: "public", status: "published", ...over }));
}

describe("ClusterService", () => {
  let db: DB;
  afterEach(() => db?.close());

  it("findSimilar returns identical published cards and skips drafts + itself", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const a = await published(repo, COOKIE);
    const twin = await published(repo, COOKIE);
    await repo.createCard(cardInputSchema.parse({ ...COOKIE, status: "draft" })); // draft twin
    await published(repo, CLOUDFRONT);

    const sims = new ClusterService(db).findSimilar(a.id, { limit: 5, minSimilarity: 0.5 });
    expect(sims.map((s) => s.cardId)).toEqual([twin.id]);
    expect(sims[0].similarity).toBeGreaterThan(0.99);
  });

  it("assign groups near-duplicates, picks a canonical, merges, and search collapses the group", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const clusters = new ClusterService(db, { threshold: 0.9 });
    const a = await published(repo, COOKIE);
    const b = await published(repo, COOKIE, { sourceLinks: ["https://github.com/x/y/pull/1"] }); // higher confidence
    const other = await published(repo, CLOUDFRONT);

    expect(await clusters.assign(other.id)).toBeUndefined();
    const res = await clusters.assign(b.id);
    expect(res).toBeDefined();
    expect(res!.matched.map((m) => m.cardId)).toEqual([a.id]);
    expect(res!.llmConfirmed).toBe(false);
    expect(clusters.clusterOf(a.id)?.id).toBe(res!.cluster.id);
    // b has an extra source link → higher intrinsic confidence → canonical.
    expect(clusters.getCluster(res!.cluster.id)?.canonicalCardId).toBe(b.id);

    const c = await published(repo, COOKIE);
    const res2 = await clusters.assign(c.id);
    expect(res2!.cluster.id).toBe(res!.cluster.id);
    expect(clusters.members(res!.cluster.id)).toHaveLength(3);

    const results = await new SearchService(db).search({ query: "kakao safari cookie not stored", limit: 10 });
    const grouped = results.filter((r) => r.cluster);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].cluster).toEqual({ id: res!.cluster.id, size: 3, canonical_id: b.id });
    expect(results.filter((r) => [a.id, b.id, c.id].includes(r.id))).toHaveLength(1);

    // Leaving: canonical recomputed, and a 1-member group dissolves.
    clusters.removeMember(b.id);
    expect(clusters.clusterOf(b.id)).toBeUndefined();
    expect(clusters.getCluster(res!.cluster.id)?.canonicalCardId).not.toBe(b.id);
    clusters.removeMember(c.id);
    expect(clusters.getCluster(res!.cluster.id)).toBeUndefined();
    expect(clusters.clusterOf(a.id)).toBeUndefined();

    // Manual canonical + full rebuild.
    const rebuilt = await clusters.recluster();
    expect(rebuilt).toEqual({ clusters: 1, grouped: 3 });
    const g = clusters.listClusters()[0];
    expect(clusters.setCanonical(g.cluster.id, a.id)).toBe(true);
    expect(clusters.getCluster(g.cluster.id)?.canonicalCardId).toBe(a.id);
    expect(clusters.setCanonical(g.cluster.id, other.id)).toBe(false);
  });

  it("consults the judge only in the gray zone and respects its answer", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const a = await published(repo, COOKIE);
    // Near-identical (one extra token) → high but < 0.99 similarity under hash embeddings.
    const b = await published(repo, { ...COOKIE, problem: COOKIE.problem + " chrome" });

    const yes = new FakeJudge(undefined, { same: true, confidence: 0.8, reason: "same" });
    const strict = new ClusterService(db, { threshold: 0.99, confirmMin: 0.5 });
    const res = await strict.assign(b.id, { judge: yes });
    expect(yes.comparisons).toHaveLength(1);
    expect(res?.llmConfirmed).toBe(true);
    expect(strict.clusterOf(a.id)?.id).toBe(res!.cluster.id);

    strict.removeMember(b.id);
    const no = new FakeJudge(undefined, { same: false, confidence: 0.9, reason: "different root cause" });
    expect(await strict.assign(b.id, { judge: no })).toBeUndefined();
    expect(no.comparisons).toHaveLength(1);

    // Without a judge the gray zone is left alone.
    expect(await strict.assign(b.id)).toBeUndefined();
  });
});

describe("MCP grouping surface", () => {
  let db: DB;
  afterEach(() => db?.close());

  it("draft reports similar_existing, publish groups, get_context_card exposes the group", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const clusters = new ClusterService(db, { threshold: 0.9 });
    const existing = await published(repo, COOKIE);

    const draft = parse(
      await makeDraftContextCardHandler(repo, undefined, clusters)({
        source: "conversation",
        title: COOKIE.title,
        problem_summary: COOKIE.problem,
        verified_fix: COOKIE.verifiedFix,
        verification: COOKIE.verification,
      }),
    );
    expect(draft.similar_existing).toHaveLength(1);
    expect(draft.similar_existing[0].id).toBe(existing.id);
    expect(draft.note).toMatch(/same problem/);

    const pub = parse(await makePublishContextCardHandler(repo, { clusters })({ id: draft.id, approve: true }));
    expect(pub.status).toBe("published");
    expect(pub.cluster.size).toBe(2);

    const full = parse(await makeGetContextCardHandler(repo, { clusters })({ id: existing.id, mode: "full" }));
    expect(full.same_problem_group.size).toBe(2);
    expect(full.same_problem_group.members[0].id).toBe(draft.id);
    const compact = parse(await makeGetContextCardHandler(repo, { clusters })({ id: existing.id, mode: "agent_json" }));
    expect(compact.same_problem_group.id).toBe(pub.cluster.id);
  });
});
