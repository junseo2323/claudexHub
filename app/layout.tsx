import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "AI Agent Context Hub",
  description: "Agent-first developer knowledge platform — searchable, reusable Context Cards.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
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
          </nav>
        </header>
        <main className="container">{children}</main>
        <footer className="footer">Phase 1 prototype · read-only view over the local Context Hub</footer>
      </body>
    </html>
  );
}
