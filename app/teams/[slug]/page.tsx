import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import {
  getTeamBySlug,
  getTeamStatsById,
  isTeamMember,
  isTeamOwner,
  listTeamCards,
} from "../../lib/claudexhub";
import { addTeamMemberAction, removeTeamMemberAction } from "../../lib/actions";
import { Avatar, CardRow } from "../../components";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const { slug } = await params;
  const { error } = await searchParams;

  const team = getTeamBySlug(slug);
  if (!team) notFound();
  if (!isTeamMember(team.id, me.id)) notFound();

  const stats = getTeamStatsById(team.id)!;
  const owner = isTeamOwner(team.id, me.id);
  const teamCards = listTeamCards(team.id, me.id);
  const t = stats.totals;

  return (
    <>
      <h1>{team.name}</h1>
      <p className="subtle">@{team.slug} · {stats.members.length} member{stats.members.length === 1 ? "" : "s"}</p>
      {error === "cannot_remove_owner" && <div className="banner">The team owner can't be removed.</div>}

      <div className="stat-grid">
        <Tile value={t.reputationScore} label="Team reputation" />
        <Tile value={t.cardsPublished} label="Published cards" />
        <Tile value={t.verifiedFixCount} label="Verified fixes" />
        <Tile value={t.successfulReuse} label="Successful reuse" />
        <Tile value={t.tokensSaved.toLocaleString()} label="Tokens saved" />
      </div>

      <h2>Members</h2>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Reputation</th>
              <th>Published</th>
              <th>Reuse ✓</th>
              {owner && <th></th>}
            </tr>
          </thead>
          <tbody>
            {stats.members.map((m) => (
              <tr key={m.user.id}>
                <td>
                  <a href={`/u/${m.user.login}`} className="nav-user">
                    <Avatar user={m.user} size={22} /> {m.user.name ?? m.user.login}
                  </a>
                </td>
                <td>{m.role}</td>
                <td>
                  <strong>{m.reputationScore}</strong>
                </td>
                <td>{m.cardsPublished}</td>
                <td>{m.successfulReuse}</td>
                {owner && (
                  <td style={{ textAlign: "right" }}>
                    {m.role !== "owner" && (
                      <form action={removeTeamMemberAction}>
                        <input type="hidden" name="slug" value={team.slug} />
                        <input type="hidden" name="memberId" value={m.user.id} />
                        <button type="submit" className="link-danger" title="Remove member">
                          Remove
                        </button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Team cards</h2>
      {teamCards.length === 0 ? (
        <div className="empty">
          No team-only cards yet. Publish a draft “to team” to share it here.
        </div>
      ) : (
        <div className="card-list">
          {teamCards.map((c) => (
            <CardRow key={c.id} card={c} />
          ))}
        </div>
      )}

      {owner && (
        <div className="section panel">
          <h3 style={{ marginTop: 0 }}>Add member</h3>
          {error === "no_such_user" && <div className="banner">No user with that login.</div>}
          {error === "forbidden" && <div className="banner">Only the team owner can add members.</div>}
          <form action={addTeamMemberAction} className="stale-form">
            <input type="hidden" name="slug" value={team.slug} />
            <input type="text" name="login" placeholder="GitHub/login of the user to add" />
            <button type="submit" className="btn secondary">
              Add
            </button>
          </form>
        </div>
      )}
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
