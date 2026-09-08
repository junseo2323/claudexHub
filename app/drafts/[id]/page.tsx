import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import {
  getDraftForUser,
  scanCard,
  listTeamsForUser,
  getLatestReview,
  getLlmStatus,
  getSimilarCards,
} from "../../lib/claudexhub";
import { publishDraftAction, publishToTeamAction, reviewCardAction } from "../../lib/actions";
import { EnvChips, ReviewPanel } from "../../components";

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
  searchParams: Promise<{ error?: string; reviewed?: string; review_error?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const { id } = await params;
  const { error, reviewed, review_error: reviewError } = await searchParams;

  const card = getDraftForUser(id, me.id);
  if (!card) notFound();

  const scan = scanCard(card);
  const clean = scan.findingsCount === 0;
  const myTeams = listTeamsForUser(me.id);
  const review = getLatestReview(card.id);
  const llm = getLlmStatus();
  const similar = getSimilarCards(card.id, me.id, 3);
  const reviewFailed = review?.verdict === "fail";
  const canPublish = clean && !reviewFailed;
  const back = `/drafts/${card.id}`;

  return (
    <>
      <div className="banner" style={{ background: "rgba(110,168,254,0.12)", borderColor: "rgba(110,168,254,0.3)", color: "var(--accent)" }}>
        📝 Draft preview — private until you publish. Auto-extracted fields are shown below; review before publishing.
      </div>
      {error === "secrets" && (
        <div className="banner">Publish blocked: potential secrets were detected. Edit the card to remove them.</div>
      )}
      {error === "review" && (
        <div className="banner">
          Publish blocked: the review verdict is <strong>fail</strong>. Fix the flagged issues and re-run the review, or
          tick “publish anyway” below.
        </div>
      )}
      {error === "review_error" && (
        <div className="banner">The review could not run (judge unreachable). Try again, or run the automated checks only.</div>
      )}
      {reviewError && <div className="banner">Review failed: {reviewError}</div>}
      {reviewed === "1" && <div className="chip good" style={{ marginBottom: 12 }}>✓ Review updated</div>}

      <h1>{card.title}</h1>
      <div className="meta" style={{ marginTop: 10 }}>
        <EnvChips env={card.environment} />
      </div>

      {similar.length > 0 && (
        <div className="section panel" style={{ borderColor: "rgba(251,191,36,0.4)" }}>
          <h3 style={{ marginTop: 0 }}>Already solved? {similar.length} similar card{similar.length === 1 ? "" : "s"}</h3>
          <p className="subtle" style={{ marginTop: 0 }}>
            These existing cards look like the same problem. Prefer extending or linking them; if you publish anyway,
            this card is grouped with them so search shows one result.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {similar.map((s) => (
              <li key={s.id}>
                <Link href={`/cards/${s.id}`}>{s.title}</Link>{" "}
                <span className="subtle" style={{ fontSize: 12 }}>
                  similarity {Math.round(s.similarity * 100)}% · confidence {s.confidence}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="section">
        <h3>Problem</h3>
        <p style={{ margin: 0 }}>{card.problem}</p>
      </div>

      <List title="Symptoms (extracted)" items={card.symptoms} />
      <List title="Likely causes (extracted)" items={card.likelyCauses} />
      <List title="Failed attempts (extracted)" items={card.failedAttempts} />
      <List title="Verified fix" items={card.verifiedFix} />
      <List title="Verification" items={card.verification} />

      <div className="section">
        <h3>Secret scan</h3>
        {clean ? (
          <div className="chip good">✓ No secrets detected</div>
        ) : (
          <div className="banner">
            {scan.findingsCount} potential secret(s) detected in: {scan.redactedFields.join(", ")}
          </div>
        )}
      </div>

      <div className="section panel">
        <h3 style={{ marginTop: 0 }}>Independent review</h3>
        <p className="subtle" style={{ marginTop: 0 }}>
          Checks that the fix actually addresses the problem, is verifiable and safe, and leaks nothing.{" "}
          {llm.configured ? (
            <>
              Judge: <code>{llm.provider}</code>
              {llm.model ? <> · <code>{llm.model}</code></> : null} plus automated checks.
            </>
          ) : (
            <>
              No LLM judge is configured (set <code>ANTHROPIC_API_KEY</code> or <code>OPENAI_API_KEY</code>); only the
              automated checks run.
            </>
          )}
        </p>
        {review ? <ReviewPanel review={review} /> : <p className="subtle">Not reviewed yet — publishing runs a review automatically.</p>}
        <div className="feedback-buttons" style={{ marginTop: 12 }}>
          <form action={reviewCardAction}>
            <input type="hidden" name="cardId" value={card.id} />
            <input type="hidden" name="back" value={back} />
            <button type="submit" className="btn secondary">
              {review ? "Re-run review" : "Run review"}
            </button>
          </form>
          {llm.configured && (
            <form action={reviewCardAction}>
              <input type="hidden" name="cardId" value={card.id} />
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="mode" value="heuristic" />
              <button type="submit" className="btn secondary">
                Automated checks only
              </button>
            </form>
          )}
          <Link href={`/cards/${card.id}/edit`} className="btn secondary">
            Edit card
          </Link>
        </div>
      </div>

      <div className="section panel">
        <h3 style={{ marginTop: 0 }}>Publish</h3>
        <form action={publishDraftAction} style={{ marginBottom: myTeams.length ? 16 : 0 }}>
          <input type="hidden" name="cardId" value={card.id} />
          {reviewFailed && (
            <label className="subtle" style={{ display: "block", marginBottom: 10 }}>
              <input type="checkbox" name="overrideReview" value="1" /> Publish anyway (the review said fail — your call)
            </label>
          )}
          <button type="submit" className="btn" disabled={!clean}>
            Publish publicly
          </button>
        </form>

        {myTeams.length > 0 && (
          <form action={publishToTeamAction} className="stale-form">
            <input type="hidden" name="cardId" value={card.id} />
            {reviewFailed && <input type="hidden" name="overrideReview" value="1" />}
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
        {clean && !canPublish && (
          <p className="subtle">The latest review failed; publishing needs the override above.</p>
        )}
      </div>
    </>
  );
}
