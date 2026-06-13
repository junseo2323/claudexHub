import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { getCurrentUser } from "./lib/auth";
import { Avatar } from "./components";

export const metadata = {
  title: "AI Agent Context Hub",
  description: "Agent-first developer knowledge platform — searchable, reusable Context Cards.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
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
            {user ? (
              <>
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
