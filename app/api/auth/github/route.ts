import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { githubConfigured, publicOrigin } from "../../../lib/auth";
import { rateLimitAuth } from "../../../lib/limits";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const rl = rateLimitAuth(req.headers);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } },
    );
  }
  if (!githubConfigured) {
    return NextResponse.json({ error: "GitHub OAuth is not configured" }, { status: 501 });
  }
  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${publicOrigin(req)}/api/auth/github/callback`;

  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID!);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", "read:user");
  authorize.searchParams.set("state", state);

  const res = NextResponse.redirect(authorize.toString());
  res.cookies.set("ctxhub_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
