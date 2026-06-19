import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "../../src/db/connection.js";
import { migrate } from "../../src/db/migrate.js";
import { UserRepository, type User } from "../../src/domain/users.js";

const COOKIE = "ctxhub_session";
const SECRET = process.env.AUTH_SECRET ?? "dev-insecure-secret-change-me";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export const githubConfigured = Boolean(
  process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
);
/** Local demo login is allowed when explicitly enabled, or GitHub isn't set up. */
export const devLoginEnabled = process.env.AUTH_ALLOW_DEV === "1" || !githubConfigured;

function hmac(value: string): string {
  return crypto.createHmac("sha256", SECRET).update(value).digest("base64url");
}

/** Create a signed `userId:expiry` session token. */
export function makeSessionToken(userId: string): string {
  const value = `${userId}:${Date.now() + MAX_AGE * 1000}`;
  return `${value}.${hmac(value)}`;
}

function verify(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const value = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = hmac(value);
  if (
    mac.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  ) {
    return null;
  }
  const [userId, expStr] = value.split(":");
  if (!userId || !expStr || Date.now() > Number(expStr)) return null;
  return userId;
}

/**
 * Resolve the app's public origin for building OAuth redirect/callback URLs.
 * Behind a proxy (e.g. Fly), `req.nextUrl.origin` can resolve to the internal
 * `localhost:3000`, which breaks the OAuth round trip. Prefer an explicit
 * `APP_ORIGIN`, then the forwarded host/proto headers, then `nextUrl.origin`.
 */
export function publicOrigin(req: {
  headers: Headers;
  nextUrl: { origin: string };
}): string {
  const explicit = process.env.APP_ORIGIN?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const proto =
      req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
      (process.env.NODE_ENV === "production" ? "https" : "http");
    return `${proto}://${host}`;
  }
  return req.nextUrl.origin;
}

/**
 * Sanitize a post-login `next` target: only same-app absolute paths are allowed
 * (must start with a single `/`), preventing open-redirects to other hosts.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export const sessionCookie = {
  name: COOKIE,
  options: {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  },
};

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  const userId = verify(token);
  if (!userId) return null;
  const db = getDb();
  migrate(db);
  return new UserRepository(db).getById(userId) ?? null;
}

/**
 * Admins are listed in ADMIN_LOGINS (comma-separated). When that's unset there
 * are no restrictions and any authenticated user is treated as an admin — handy
 * for local/dev; set ADMIN_LOGINS in production.
 */
export function isAdmin(user: User): boolean {
  const list = (process.env.ADMIN_LOGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length === 0 || list.includes(user.login);
}

export type { User };
