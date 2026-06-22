import { NextResponse, type NextRequest } from "next/server";
import { search, verifyApiToken } from "../../../lib/claudexhub";
import { rateLimitApi } from "../../../lib/limits";
import { newRequestId, logEvent } from "../../../../src/logger.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Programmatic search API. Authenticate with `Authorization: Bearer <token>`
// (create a token at /settings/tokens). Results respect the token owner's
// visibility (public + their team cards).
export async function GET(req: NextRequest) {
  const reqId = newRequestId();
  const start = Date.now();
  const done = (status: number, fields: Record<string, unknown> = {}) => {
    logEvent(status >= 500 ? "error" : "info", "api.search", {
      reqId,
      status,
      ms: Date.now() - start,
      ...fields,
    });
  };
  const json = (body: unknown, status: number, headers?: Record<string, string>) =>
    NextResponse.json(body, { status, headers: { "x-request-id": reqId, ...headers } });

  const rl = rateLimitApi(req.headers);
  if (!rl.allowed) {
    done(429);
    return json({ error: "rate_limited" }, 429, { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) });
  }

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const userId = token ? verifyApiToken(token) : undefined;
  if (!userId) {
    done(401);
    return json({ error: "unauthorized" }, 401);
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) {
    done(400, { userId });
    return json({ error: "missing query parameter 'q'" }, 400);
  }
  const stackParam = req.nextUrl.searchParams.get("stack");
  const stack = stackParam
    ? stackParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  const min = req.nextUrl.searchParams.get("min");
  const limitParam = req.nextUrl.searchParams.get("limit");

  const results = await search(
    {
      query: q,
      stack,
      minConfidence: min ? Number(min) : undefined,
      limit: limitParam ? Number(limitParam) : 10,
    },
    userId,
  );
  done(200, { userId, results: results.length });
  return json({ results }, 200);
}
