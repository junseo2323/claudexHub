import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { getDraftForUser, scanCard, listTeamsForUser } from "../../lib/hub";
import { publishDraftAction, publishToTeamAction } from "../../lib/actions";
import { EnvChips } from "../../components";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function List({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="section">
      <h3>{title}</h3>
      <ul>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

export default async function DraftReview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const { id } = await params;
  const { error } = await searchParams;

  const card = getDraftForUser(id, me.id);
  if (!card) notFound();

  const scan = scanCard(card);
  const clean = scan.findingsCount === 0;
  const myTeams = listTeamsForUser(me.id);

  return (
    <>
      <div className="banner" style={{ background: "rgba(110,168,254,0.12)", borderColor: "rgba(110,168,254,0.3)", color: "var(--accent)" }}>
        📝 Draft preview — private until you publish. Auto-extracted fields are shown below; review before publishing.
      </div>
      {error === "secrets" && (
        <div className="banner">Publish blocked: potential secrets were detected. Edit the card to remove them.</div>
      )}

      <h1>{card.title}</h1>
      <div className="meta" style={{ marginTop: 10 }}>
        <EnvChips env={card.environment} />
      </div>

      <div className="section">
        <h3>Problem</h3>
        <p style={{ margin: 0 }}>{card.problem}</p>
      </div>

      <List title="Symptoms (extracted)" items={card.symptoms} />
      <List title="Likely causes (extracted)" items={card.likelyCauses} />
      <List title="Failed attempts (extracted)" items={card.failedAttempts} />
      <List title="Verified fix" items={card.verifiedFix} />

      <div className="section">
        <h3>Secret scan</h3>
        {clean ? (
          <div className="chip good">✓ No secrets detected — safe to publish</div>
        ) : (
          <div className="banner">
            {scan.findingsCount} potential secret(s) detected in: {scan.redactedFields.join(", ")}
          </div>
        )}
      </div>

      <div className="section panel">
        <h3 style={{ marginTop: 0 }}>Publish</h3>
        <form action={publishDraftAction} style={{ marginBottom: myTeams.length ? 16 : 0 }}>
          <input type="hidden" name="cardId" value={card.id} />
          <button type="submit" className="btn" disabled={!clean}>
            Publish publicly
          </button>
        </form>

        {myTeams.length > 0 && (
          <form action={publishToTeamAction} className="stale-form">
            <input type="hidden" name="cardId" value={card.id} />
            <select name="teamId" defaultValue={myTeams[0].id}>
              {myTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn secondary" disabled={!clean}>
              🔒 Publish to team
            </button>
          </form>
        )}

        {!clean && <p className="subtle">Resolve detected secrets before publishing.</p>}
      </div>
    </>
  );
}
