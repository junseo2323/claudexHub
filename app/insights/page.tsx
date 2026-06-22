import { getActivity, getCalibration, getStats, getReverificationCount } from "../lib/claudexhub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function pct(n: number | null) {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

export default function InsightsPage() {
  const buckets = getCalibration();
  const stats = getStats();
  const needsReverify = getReverificationCount();
  const activity = getActivity(8);
  const maxRate = Math.max(0.01, ...buckets.map((b) => b.successRate ?? 0));
  const maxActivity = Math.max(1, ...activity.map((w) => w.cardsCreated + w.reuseEvents));

  return (
    <>
      <h1>Insights</h1>
      <p className="subtle">
        Confidence calibration — how each confidence band's <em>observed</em> reuse success rate
        compares to its score. A well-calibrated ClaudexHub trends upward.
      </p>

      <div className="panel" style={{ marginTop: 18 }}>
        <table>
          <thead>
            <tr>
              <th>Confidence band</th>
              <th>Cards</th>
              <th>Reuse events</th>
              <th>Observed success</th>
              <th style={{ width: "30%" }}></th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.label}>
                <td>{b.label}</td>
                <td>{b.cards}</td>
                <td>{b.reuseEvents}</td>
                <td>{pct(b.successRate)}</td>
                <td>
                  <span className="bar-track">
                    <span
                      className="bar-fill"
                      style={{ width: `${((b.successRate ?? 0) / maxRate) * 100}%` }}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="subtle" style={{ marginTop: 14 }}>
        ClaudexHub-wide: {pct(stats.reuseSuccessRate)} reuse success across{" "}
        {stats.successfulReuseCount + stats.failedReuseCount} recorded reuses ·{" "}
        {stats.verifiedFixCount} verified fixes ·{" "}
        {needsReverify} card{needsReverify === 1 ? "" : "s"} may need re-verification.
      </p>

      <h2>Activity (last 8 weeks)</h2>
      <div className="panel">
        <div className="bars">
          {activity.map((w) => {
            const total = w.cardsCreated + w.reuseEvents;
            return (
              <div className="bar-row wide" key={w.weekStart}>
                <span>{w.weekStart}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${(total / maxActivity) * 100}%` }} />
                </span>
                <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {w.cardsCreated}c / {w.reuseEvents}r
                </span>
              </div>
            );
          })}
        </div>
        <p className="subtle" style={{ marginTop: 10, marginBottom: 0 }}>
          c = cards created · r = reuse events
        </p>
      </div>
    </>
  );
}
