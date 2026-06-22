import { getLeaderboard } from "../lib/claudexhub";
import { LeaderboardRow } from "../components";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function LeaderboardPage() {
  const board = getLeaderboard();
  return (
    <>
      <h1>Leaderboard</h1>
      <p className="subtle">
        Contributors ranked by reputation — verified fixes, successful reuse, and tokens saved.
      </p>

      <div className="panel" style={{ marginTop: 18 }}>
        {board.length === 0 ? (
          <div className="subtle">No contributors yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Contributor</th>
                <th>Reputation</th>
                <th>Published</th>
                <th>Verified</th>
                <th>Reuse ✓</th>
                <th>Tokens saved</th>
              </tr>
            </thead>
            <tbody>
              {board.map((s, i) => (
                <LeaderboardRow key={s.user.id} rank={i + 1} s={s} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
