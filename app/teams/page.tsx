import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/auth";
import { listTeamsForUser } from "../lib/hub";
import { createTeamAction } from "../lib/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const { error } = await searchParams;
  const teams = listTeamsForUser(me.id);

  return (
    <>
      <h1>Teams</h1>
      <p className="subtle">Group contributors and see your team's combined knowledge & reputation.</p>

      {error === "missing" && <div className="banner">Team name is required.</div>}

      <form action={createTeamAction} className="filter-bar" style={{ marginTop: 16 }}>
        <input type="text" name="name" placeholder="New team name (e.g. Platform)" />
        <button type="submit" className="btn">
          Create team
        </button>
      </form>

      {teams.length === 0 ? (
        <div className="empty">You're not in any teams yet. Create one above.</div>
      ) : (
        <div className="card-list" style={{ marginTop: 8 }}>
          {teams.map((t) => (
            <Link key={t.id} href={`/teams/${t.slug}`} className="card-row">
              <div className="title">{t.name}</div>
              <div className="meta">
                <span className="chip">@{t.slug}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
