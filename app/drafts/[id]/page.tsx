import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { getDraftForUser, scanCard } from "../../lib/hub";
import { publishDraftAction } from "../../lib/actions";
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

      <form action={publishDraftAction} className="section">
        <input type="hidden" name="cardId" value={card.id} />
        <button type="submit" className="btn" disabled={!clean}>
          Publish publicly
        </button>
        {!clean && <p className="subtle">Resolve detected secrets before publishing.</p>}
      </form>
    </>
  );
}
