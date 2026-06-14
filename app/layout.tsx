import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { getCurrentUser } from "./lib/auth";
import { getUnreadNotificationCount } from "./lib/hub";
import { Avatar } from "./components";

export const metadata = {
  title: "AI Agent Context Hub",
  description: "Agent-first developer knowledge platform — searchable, reusable Context Cards.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const unread = user ? getUnreadNotificationCount(user.id) : 0;
  return (
    <html lang="en">
      <body>
        <header className="nav">
          <Link href="/" className="brand">
            🧩 Context Hub
          </Link>
          <nav>
            <Link href="/">Dashboard</Link>
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
        <footer className="footer">Phase 1 prototype · read-only view over the local Context Hub</footer>
      </body>
    </html>
  );
}
