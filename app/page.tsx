import { getStats, listPublicCards } from "./lib/hub";
import { CardRow } from "./components";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export default function Dashboard() {
  const stats = getStats();
  const recent = listPublicCards().slice(0, 6);
  const maxStack = Math.max(1, ...stats.topStacks.map((s) => s.count));

  return (
    <>
      <h1>Dashboard</h1>
      <p className="subtle">A shared, reusable memory of solved engineering problems.</p>

      <div className="stat-grid">
        <Stat value={stats.cardsPublished} label="Published cards" />
        <Stat value={stats.verifiedFixCount} label="Verified fixes" />
        <Stat value={stats.totalEstimatedTokensSaved.toLocaleString()} label="Tokens saved (realized)" />
        <Stat value={pct(stats.reuseSuccessRate)} label="Reuse success rate" />
        <Stat value={stats.reputationScore} label="Reputation score" />
      </div>

      <h2>Top stacks</h2>
      <div className="panel">
        {stats.topStacks.length === 0 ? (
          <div className="subtle">No stacks yet.</div>
        ) : (
          <div className="bars">
            {stats.topStacks.map((s) => (
              <div className="bar-row" key={s.stack}>
                <span>{s.stack}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${(s.count / maxStack) * 100}%` }} />
                </span>
                <span style={{ textAlign: "right" }}>{s.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <h2>Agent activity</h2>
      <div className="panel">
        {stats.agentBreakdown.length === 0 ? (
          <div className="subtle">No agent reuse recorded yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Uses</th>
                <th>Success rate</th>
                <th>Failed</th>
                <th>Tokens saved</th>
                <th>Avg saved</th>
              </tr>
            </thead>
            <tbody>
              {stats.agentBreakdown.map((a) => (
                <tr key={a.agent}>
                  <td>{a.agent}</td>
                  <td>{a.uses}</td>
                  <td>{pct(a.successRate)} ({a.successes})</td>
                  <td>{a.failures}</td>
                  <td>{a.tokensSaved.toLocaleString()}</td>
                  <td>{a.avgTokensSaved.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2>Recent cards</h2>
      <div className="card-list">
        {recent.map((c) => (
          <CardRow key={c.id} card={c} />
        ))}
      </div>
    </>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="stat">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}
