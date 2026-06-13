import { NextResponse, type NextRequest } from "next/server";
import { devLoginEnabled, makeSessionToken, sessionCookie } from "../../../lib/auth";
import { getOrCreateDevUser } from "../../../lib/hub";

export const runtime = "nodejs";

// Local demo login — only available when GitHub OAuth isn't configured (or
// AUTH_ALLOW_DEV=1). Lets you sign in as a seeded demo author without secrets.
export async function GET(req: NextRequest) {
  if (!devLoginEnabled) {
    return NextResponse.json({ error: "Dev login is disabled" }, { status: 403 });
  }
  const login = (req.nextUrl.searchParams.get("login") || "alice").trim();
  const user = getOrCreateDevUser(login);

  const res = NextResponse.redirect(`${req.nextUrl.origin}/profile`);
  res.cookies.set(sessionCookie.name, makeSessionToken(user.id), sessionCookie.options);
  return res;
}
