import { describe, it, expect, afterEach } from "vitest";
import type { DB } from "../src/db/connection.js";
import { Repository } from "../src/domain/repository.js";
import { SearchService } from "../src/domain/search.js";
import { cardInputSchema } from "../src/domain/card-schema.js";
import { evaluateSearch, type EvalCase, type Searcher } from "../src/domain/eval.js";
import { freshDb } from "./helpers.js";

/**
 * Ranking-regression gate. A fixed corpus + labelled keyword queries run through
 * the real SearchService (deterministic noop embeddings). Thresholds are set
 * below the current baseline so an accidental ranking regression fails CI, but
 * normal variation does not. Re-tune intentionally if you change ranking.
 */

interface Seed {
  title: string;
  problem: string;
  verifiedFix: string[];
}

const CORPUS: Seed[] = [
  {
    title: "HttpOnly cookie not sent on cross-site requests",
    problem: "Set-Cookie present but the cookie is not sent on a cross-site fetch with credentials",
    verifiedFix: ["SameSite=None; Secure", "credentials: include"],
  },
  {
    title: "CloudFront SPA returns 403 on deep-link refresh",
    problem: "S3 origin returns 403 AccessDenied on a deep-link refresh behind CloudFront",
    verifiedFix: ["map 403 to /index.html"],
  },
  {
    title: "Kakao login redirect_uri mismatch KOE006",
    problem: "Kakao OAuth login fails with KOE006 because the redirect uri does not match",
    verifiedFix: ["register the exact redirect uri in the Kakao console"],
  },
  {
    title: "Nginx returns 413 Request Entity Too Large on upload",
    problem: "File uploads fail with 413 because the default client_max_body_size is too small",
    verifiedFix: ["raise client_max_body_size"],
  },
  {
    title: "Prisma connection pool timeout on serverless",
    problem: "P2024 timed out fetching a connection from the pool on serverless under load",
    verifiedFix: ["use a pgbouncer pool and cap connection_limit"],
  },
  {
    title: "GitHub Actions OIDC AssumeRole access denied",
    problem: "sts AssumeRoleWithWebIdentity is denied for the GitHub Actions OIDC token",
    verifiedFix: ["fix the role trust policy sub condition", "add id-token write permission"],
  },
];

async function seedCorpus(db: DB): Promise<string[]> {
  const repo = new Repository(db);
  const ids: string[] = [];
  for (const s of CORPUS) {
    const c = await repo.createCard(
      cardInputSchema.parse({ ...s, status: "published", visibility: "public" }),
    );
    ids.push(c.id);
  }
  return ids;
}

describe("ranking regression gate", () => {
  let db: DB;
  afterEach(() => db?.close());

  it("keyword queries retrieve the right card with strong metrics", async () => {
    db = freshDb();
    const ids = await seedCorpus(db);
    const [cookie, cloudfront, kakao, nginx, prisma, oidc] = ids;
    const search = new SearchService(db);

    const cases: EvalCase[] = [
      { query: "cookie not sent cross-site credentials", relevantIds: [cookie] },
      { query: "set-cookie samesite secure cross site", relevantIds: [cookie] },
      { query: "cloudfront spa 403 deep-link refresh", relevantIds: [cloudfront] },
      { query: "s3 access denied 403 refresh", relevantIds: [cloudfront] },
      { query: "kakao redirect uri mismatch koe006", relevantIds: [kakao] },
      { query: "nginx 413 upload client_max_body_size", relevantIds: [nginx] },
      { query: "prisma connection pool timeout serverless", relevantIds: [prisma] },
      { query: "github actions oidc assume role denied", relevantIds: [oidc] },
    ];

    const report = await evaluateSearch(search as unknown as Searcher, cases, 3);

    // Baseline (noop embeddings) is hit@1 = hit@3 = MRR = 1.0; gate a bit below.
    expect(report.hitAtKRate).toBeGreaterThanOrEqual(0.875);
    expect(report.hitAt1Rate).toBeGreaterThanOrEqual(0.75);
    expect(report.mrr).toBeGreaterThanOrEqual(0.8);
  });
});
