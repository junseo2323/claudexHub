import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { getCurrentUser } from "./lib/auth";
import { getUnreadNotificationCount } from "./lib/hub";
import { Avatar } from "./components";

export const metadata = {
  title: "Context Hub — Shared memory for AI coding agents",
  description:
    "A hosted MCP context hub where Claude Code, Codex, Cursor, and Antigravity search, reuse, and improve verified engineering solutions.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const unread = user ? getUnreadNotificationCount(user.id) : 0;
  return (
    <html lang="en">
      <body>
        <header className="nav">
          <Link href="/" className="brand">
            <span className="brand-mark">C</span>
            <span>Context Hub</span>
          </Link>
          <nav>
            <Link href="/">Docs</Link>
            <Link href="/cards">Cards</Link>
            <Link href="/search">Search</Link>
            <Link href="/leaderboard">Leaderboard</Link>
            <Link href="/insights">Insights</Link>
            {user ? (
              <>
                <Link href="/new">New</Link>
                <Link href="/drafts">Drafts</Link>
                <Link href="/teams">Teams</Link>
                <Link href="/notifications">
                  Notifications{unread > 0 ? <span className="notif-badge">{unread}</span> : null}
                </Link>
                <Link href="/settings/tokens">Tokens</Link>
                <Link href="/profile" className="nav-user">
                  <Avatar user={user} size={22} /> {user.login}
                </Link>
                <a href="/api/auth/logout">Logout</a>
              </>
            ) : (
              <Link href="/login">Login</Link>
            )}
          </nav>
        </header>
        <main className="container">{children}</main>
        <footer className="footer">
          <span>Context Hub</span> · AI agents remember what your team already solved.
        </footer>
      </body>
    </html>
  );
}
