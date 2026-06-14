import { NextResponse, type NextRequest } from "next/server";
import { search, verifyApiToken } from "../../../lib/hub";
import { rateLimitApi } from "../../../lib/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Programmatic search API. Authenticate with `Authorization: Bearer <token>`
// (create a token at /settings/tokens). Results respect the token owner's
// visibility (public + their team cards).
export async function GET(req: NextRequest) {
  const rl = rateLimitApi(req.headers);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } },
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const userId = token ? verifyApiToken(token) : undefined;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json({ error: "missing query parameter 'q'" }, { status: 400 });
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
  return NextResponse.json({ results });
}
