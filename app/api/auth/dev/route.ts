import { NextResponse, type NextRequest } from "next/server";
import { devLoginEnabled, makeSessionToken, publicOrigin, safeNext, sessionCookie } from "../../../lib/auth";
import { getOrCreateDevUser } from "../../../lib/hub";
import { rateLimitAuth } from "../../../lib/limits";

export const runtime = "nodejs";

// Local demo login — only available when GitHub OAuth isn't configured (or
// AUTH_ALLOW_DEV=1). Lets you sign in as a seeded demo author without secrets.
export async function GET(req: NextRequest) {
  const rl = rateLimitAuth(req.headers);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } },
    );
  }
  if (!devLoginEnabled) {
    return NextResponse.json({ error: "Dev login is disabled" }, { status: 403 });
  }
  const login = (req.nextUrl.searchParams.get("login") || "alice").trim();
  const user = getOrCreateDevUser(login);

  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const res = NextResponse.redirect(`${publicOrigin(req)}${next ?? "/profile"}`);
  res.cookies.set(sessionCookie.name, makeSessionToken(user.id), sessionCookie.options);
  return res;
}
