import { NextResponse, type NextRequest } from "next/server";
import { makeSessionToken, publicOrigin, safeNext, sessionCookie } from "../../../../lib/auth";
import { upsertGithubUser } from "../../../../lib/claudexhub";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const saved =
    req.cookies.get("claudexhub_oauth_state")?.value ??
    req.cookies.get("ctxhub_oauth_state")?.value;

  if (!code || !state || !saved || state !== saved) {
    return NextResponse.redirect(`${origin}/login?error=oauth_state`);
  }

  // Exchange the code for an access token.
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${origin}/api/auth/github/callback`,
    }),
  });
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) {
    return NextResponse.redirect(`${origin}/login?error=oauth_token`);
  }

  // Fetch the authenticated user's profile.
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "claudexhub",
    },
  });
  const gh = (await userRes.json()) as {
    id: number;
    login: string;
    name?: string;
    avatar_url?: string;
  };

  const user = upsertGithubUser({
    githubId: String(gh.id),
    login: gh.login,
    name: gh.name ?? undefined,
    avatarUrl: gh.avatar_url ?? undefined,
  });

  const next = safeNext(
    req.cookies.get("claudexhub_oauth_next")?.value ??
      req.cookies.get("ctxhub_oauth_next")?.value,
  );
  const res = NextResponse.redirect(`${origin}${next ?? "/profile"}`);
  res.cookies.set(sessionCookie.name, makeSessionToken(user.id), sessionCookie.options);
  res.cookies.delete("claudexhub_oauth_state");
  res.cookies.delete("claudexhub_oauth_next");
  res.cookies.delete("ctxhub_oauth_state");
  res.cookies.delete("ctxhub_oauth_next");
  return res;
}
