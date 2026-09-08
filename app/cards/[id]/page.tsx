import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getViewableCard,
  getAuthorId,
  getUser,
  relatedCards,
  cardFreshness,
  getCardRelations,
  getLatestReview,
  getCardGroup,
  type RelationType,
} from "../../lib/claudexhub";
import { getCurrentUser } from "../../lib/auth";
import {
  markStaleAction,
  recordFeedbackAction,
  addRelationAction,
  removeRelationAction,
  reviewCardAction,
  setGroupCanonicalAction,
  leaveGroupAction,
} from "../../lib/actions";
import { Avatar, EnvChips, RiskBadge, riskFromConfidence, BriefRow, ReviewBadge, ReviewPanel } from "../../components";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function relationLabel(type: RelationType, direction: "outgoing" | "incoming"): string {
  if (type === "supersedes") return direction === "outgoing" ? "Supersedes" : "Superseded by";
  if (type === "duplicate") return direction === "outgoing" ? "Duplicate of" : "Has duplicate";
  return "Related to";
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;
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

export default async function CardDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ feedback?: string; relerror?: string; reviewed?: string; review_error?: string }>;
}) {
  const { id } = await params;
  const { feedback, relerror, reviewed, review_error: reviewError } = await searchParams;
  const me = await getCurrentUser();
  const card = getViewableCard(id, me?.id);
  if (!card) notFound();

  const authorId = getAuthorId(card.id);
  const author = authorId ? getUser(authorId) : undefined;
  const isOwner = !!me && me.id === authorId;
  const stale = card.status === "stale" || card.status === "deprecated";
  const fresh = cardFreshness(card);
  const relations = getCardRelations(card.id, me?.id);
  const review = getLatestReview(card.id);
  const group = getCardGroup(card.id, me?.id);
  const groupIds = new Set(group?.members.map((m) => m.card.id) ?? []);
  const related = (await relatedCards(card.id, me?.id, 6)).filter((b) => !groupIds.has(b.id)).slice(0, 3);

  return (
    <>
      {stale && (
        <div className="banner">
          ⚠ This card is marked <strong>{card.status}</strong> — its fix may be outdated. Verify before reuse.
        </div>
      )}
      {!stale && fresh.needsReverify && (
        <div className="banner">
          🕒 Last verified {fresh.days} days ago — consider re-verifying that this fix still works.
        </div>
      )}

      <h1>{card.title}</h1>
      {author && (
        <div className="meta" style={{ marginTop: 6 }}>
          <Link href={`/u/${author.login}`} className="nav-user subtle">
            <Avatar user={author} size={20} /> by {author.name ?? author.login}
          </Link>
        </div>
      )}
      {review?.verdict === "fail" && (
        <div className="banner">
          ⚠ The latest independent review <strong>failed</strong> this card — read the issues below before applying it.
        </div>
      )}
      {reviewed === "1" && <div className="chip good" style={{ marginBottom: 12 }}>✓ Review updated</div>}
      {reviewError && <div className="banner">Review failed: {reviewError}</div>}
      <div className="meta" style={{ marginTop: 10 }}>
        <span className="conf">confidence {card.confidenceScore}</span>
        <RiskBadge risk={riskFromConfidence(card.confidenceScore)} />
        {card.reviewVerdict && <ReviewBadge verdict={card.reviewVerdict} score={card.reviewScore} />}
        {group && group.members.length > 1 && (
          <Link href="/clusters" className="chip" title="Near-duplicate cards grouped as one problem">
            ⧉ {group.members.length} cards, same problem
          </Link>
        )}
        {card.visibility === "team" && <span className="chip">🔒 team</span>}
        <EnvChips env={card.environment} />
        {card.successfulReuseCount + card.failedReuseCount > 0 && (
          <span className="chip good">
            ♻ {card.successfulReuseCount}/{card.successfulReuseCount + card.failedReuseCount} reuse ok
          </span>
        )}
      </div>

      <div className="section">
        <h3>Problem</h3>
        <p style={{ margin: 0 }}>{card.problem}</p>
      </div>

      <List title="Symptoms" items={card.symptoms} />
      <List title="Likely causes" items={card.likelyCauses} />
      <List title="Failed attempts" items={card.failedAttempts} />

      {card.verifiedFix.length > 0 && (
        <div className="section">
          <h3>Verified fix</h3>
          <div className="fix">
            <ul style={{ margin: 0 }}>
              {card.verifiedFix.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <List title="Verification" items={card.verification} />

      {card.agentHint && (
        <div className="section">
          <h3>Agent hint</h3>
          <p style={{ margin: 0 }}>{card.agentHint}</p>
        </div>
      )}

      {card.sourceLinks.length > 0 && (
        <div className="section">
          <h3>Sources</h3>
          <ul>
            {card.sourceLinks.map((l, i) => (
              <li key={i}>
                <a href={l} target="_blank" rel="noreferrer">
                  {l}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="section panel">
        <h3 style={{ marginTop: 0 }}>Independent review</h3>
        {review ? (
          <ReviewPanel review={review} />
        ) : (
          <p className="subtle" style={{ margin: 0 }}>
            This card has not been reviewed yet.
          </p>
        )}
        {isOwner && (
          <form action={reviewCardAction} style={{ marginTop: 12 }}>
            <input type="hidden" name="cardId" value={card.id} />
            <input type="hidden" name="back" value={`/cards/${card.id}`} />
            <button type="submit" className="btn secondary">
              {review ? "Re-run review" : "Run review"}
            </button>
          </form>
        )}
      </div>

      {group && group.members.length > 1 && (
        <div className="section panel">
          <h3 style={{ marginTop: 0 }}>Same problem, {group.members.length} cards</h3>
          <p className="subtle" style={{ marginTop: 0 }}>
            These cards were grouped as near-duplicates. Search shows the group once; the ★ card is the representative.
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {group.members.map((m) => (
              <li key={m.card.id} className="relation-row">
                <span className="chip">{m.canonical ? "★ representative" : `${Math.round(m.similarity * 100)}% similar`}</span>
                {m.card.id === card.id ? (
                  <strong>{m.card.title} (this card)</strong>
                ) : (
                  <Link href={`/cards/${m.card.id}`}>{m.card.title}</Link>
                )}
                <span className="subtle" style={{ fontSize: 12 }}>
                  confidence {m.card.confidenceScore}
                  {m.card.status !== "published" ? ` · ${m.card.status}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {isOwner && (
            <div className="feedback-buttons" style={{ marginTop: 12 }}>
              {group.cluster.canonicalCardId !== card.id && (
                <form action={setGroupCanonicalAction}>
                  <input type="hidden" name="cardId" value={card.id} />
                  <button type="submit" className="btn secondary">
                    Make this the representative
                  </button>
                </form>
              )}
              <form action={leaveGroupAction}>
                <input type="hidden" name="cardId" value={card.id} />
                <button type="submit" className="btn secondary">
                  Not the same problem — leave group
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      <div className="section panel">
        <h3 style={{ marginTop: 0 }}>Did this card help?</h3>
        {feedback === "1" && <div className="chip good" style={{ marginBottom: 10 }}>✓ Thanks — feedback recorded</div>}
        {me ? (
          <div className="feedback-buttons">
            {(["success", "partial", "failed"] as const).map((outcome) => (
              <form key={outcome} action={recordFeedbackAction}>
                <input type="hidden" name="cardId" value={card.id} />
                <input type="hidden" name="outcome" value={outcome} />
                <button type="submit" className={`btn ${outcome === "failed" ? "secondary" : ""}`}>
                  {outcome === "success" ? "👍 Worked" : outcome === "partial" ? "🤏 Partly" : "👎 Didn’t work"}
                </button>
              </form>
            ))}
          </div>
        ) : (
          <p className="subtle">
            <a href="/login">Sign in</a> to record whether this fix worked for you.
          </p>
        )}
        <p className="subtle" style={{ marginBottom: 0, marginTop: 10 }}>
          Reused {card.successfulReuseCount + card.failedReuseCount}× · {card.successfulReuseCount} ok /{" "}
          {card.failedReuseCount} failed
        </p>
      </div>

      {(relations.length > 0 || isOwner) && (
        <div className="section">
          <h3>Linked cards</h3>
          {relerror === "no_such_card" && <div className="banner">Target card not found or not visible to you.</div>}
          {relations.length === 0 ? (
            <p className="subtle" style={{ marginTop: 0 }}>No linked cards yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {relations.map((r) => (
                <li key={`${r.direction}-${r.type}-${r.card.id}`} className="relation-row">
                  <span className="chip">{relationLabel(r.type, r.direction)}</span>
                  <Link href={`/cards/${r.card.id}`}>{r.card.title}</Link>
                  {isOwner && r.direction === "outgoing" && (
                    <form action={removeRelationAction} style={{ marginLeft: "auto" }}>
                      <input type="hidden" name="cardId" value={card.id} />
                      <input type="hidden" name="toCardId" value={r.card.id} />
                      <input type="hidden" name="type" value={r.type} />
                      <button type="submit" className="link-danger">
                        unlink
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          {isOwner && (
            <form action={addRelationAction} className="stale-form" style={{ marginTop: 12 }}>
              <input type="hidden" name="cardId" value={card.id} />
              <select name="type" defaultValue="supersedes">
                <option value="supersedes">Supersedes</option>
                <option value="duplicate">Duplicate of</option>
                <option value="related">Related to</option>
              </select>
              <input type="text" name="toCardId" placeholder="Target card id (card_…)" />
              <button type="submit" className="btn secondary">
                Link
              </button>
            </form>
          )}
        </div>
      )}

      {related.length > 0 && (
        <div className="section">
          <h3>Related cards (semantic)</h3>
          <div className="card-list">
            {related.map((b) => (
              <BriefRow key={b.id} brief={b} />
            ))}
          </div>
        </div>
      )}

      <div className="section subtle">
        Est. tokens saved per reuse: {card.estimatedTokensSaved.toLocaleString()} · Updated{" "}
        {new Date(card.updatedAt).toLocaleDateString()}
        {fresh.days != null && ` · verified ${fresh.days}d ago`}
      </div>

      {isOwner && (
        <div className="section panel">
          <h3 style={{ marginTop: 0 }}>Author actions</h3>
          <div className="meta" style={{ marginBottom: stale ? 0 : 14 }}>
            <Link href={`/cards/${card.id}/edit`} className="btn secondary">
              Edit card
            </Link>
          </div>
          {!stale && (
            <form action={markStaleAction} className="stale-form">
              <input type="hidden" name="cardId" value={card.id} />
              <input type="text" name="reason" placeholder="Why is this stale? (e.g. Next.js 16 changed defaults)" />
              <button type="submit" className="btn secondary">
                Mark stale
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
