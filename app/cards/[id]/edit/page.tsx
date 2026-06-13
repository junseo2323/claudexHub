import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth";
import { getEditableCardForUser } from "../../../lib/hub";
import { editCardAction } from "../../../lib/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function EditCardPage({
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

  const card = getEditableCardForUser(id, me.id);
  if (!card) notFound();

  const env = card.environment;
  const ta = (items: string[]) => items.join("\n");

  return (
    <>
      <h1>Edit card</h1>
      <p className="subtle">Changes are re-scanned for secrets and re-scored on save.</p>
      {error === "missing" && <div className="banner">Title and problem are required.</div>}

      <form action={editCardAction} className="cardform">
        <input type="hidden" name="cardId" value={card.id} />
        <label>
          Title
          <input type="text" name="title" required defaultValue={card.title} />
        </label>
        <label>
          Problem
          <textarea name="problem" required rows={3} defaultValue={card.problem} />
        </label>

        <div className="form-grid">
          <label>
            Frontend
            <input type="text" name="frontend" defaultValue={env.frontend ?? ""} />
          </label>
          <label>
            Backend
            <input type="text" name="backend" defaultValue={env.backend ?? ""} />
          </label>
          <label>
            Deploy
            <input type="text" name="deploy" defaultValue={env.deploy ?? ""} />
          </label>
          <label>
            Browser
            <input type="text" name="browser" defaultValue={env.browser ?? ""} />
          </label>
        </div>

        <label>
          Symptoms (one per line)
          <textarea name="symptoms" rows={3} defaultValue={ta(card.symptoms)} />
        </label>
        <label>
          Likely causes (one per line)
          <textarea name="likelyCauses" rows={3} defaultValue={ta(card.likelyCauses)} />
        </label>
        <label>
          Failed attempts (one per line)
          <textarea name="failedAttempts" rows={3} defaultValue={ta(card.failedAttempts)} />
        </label>
        <label>
          Verified fix (one per line)
          <textarea name="verifiedFix" rows={3} defaultValue={ta(card.verifiedFix)} />
        </label>
        <label>
          Verification (one per line)
          <textarea name="verification" rows={2} defaultValue={ta(card.verification)} />
        </label>
        <label>
          Agent hint
          <textarea name="agentHint" rows={2} defaultValue={card.agentHint} />
        </label>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" className="btn">
            Save changes
          </button>
          <a href={`/cards/${card.id}`} className="btn secondary">
            Cancel
          </a>
        </div>
      </form>
    </>
  );
}
