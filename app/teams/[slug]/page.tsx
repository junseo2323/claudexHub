import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { getTeamBySlug, getTeamStatsById, isTeamMember, isTeamOwner } from "../../lib/hub";
import { addTeamMemberAction } from "../../lib/actions";
import { Avatar } from "../../components";

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
  const t = stats.totals;

  return (
    <>
      <h1>{team.name}</h1>
      <p className="subtle">@{team.slug} · {stats.members.length} member{stats.members.length === 1 ? "" : "s"}</p>

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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
