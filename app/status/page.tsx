import { notFound, redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "../lib/auth";
import { getHealth, getStats, getRateLimitCount } from "../lib/hub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export default async function StatusPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isAdmin(me)) notFound();

  const health = getHealth();
  const stats = getStats();
  const rateLimitWindows = getRateLimitCount();

  return (
    <>
      <h1>Status</h1>
      <p className="subtle">
        Operational overview (admin). Readiness, data, and request-pressure signals.
      </p>

      <div className="stat-grid">
        <Tile value={health.ok ? "OK" : "DOWN"} label={`DB (${health.db})`} />
        <Tile value={health.cards.toLocaleString()} label="Cards" />
        <Tile value={health.embeddingProvider} label="Embeddings" />
        <Tile value={`${health.uptimeSeconds}s`} label="Uptime" />
        <Tile value={rateLimitWindows} label="Active rate-limit windows" />
      </div>

      <h2>Configuration warnings</h2>
      <div className="panel">
        {health.warnings.length === 0 ? (
          <div className="chip good">✓ No warnings</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {health.warnings.map((w, i) => (
              <li key={i} className={w.level === "error" ? "" : "subtle"}>
                <strong>{w.level}:</strong> {w.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2>Hub</h2>
      <div className="panel">
        <table>
          <tbody>
            <tr><td>Published cards</td><td>{stats.cardsPublished}</td></tr>
            <tr><td>Drafts</td><td>{stats.cardsDraft}</td></tr>
            <tr><td>Stale</td><td>{stats.cardsStale}</td></tr>
            <tr><td>Verified fixes</td><td>{stats.verifiedFixCount}</td></tr>
            <tr><td>Reuse success rate</td><td>{pct(stats.reuseSuccessRate)}</td></tr>
            <tr><td>Tokens saved (realized)</td><td>{stats.totalEstimatedTokensSaved.toLocaleString()}</td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function Tile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="stat">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}
