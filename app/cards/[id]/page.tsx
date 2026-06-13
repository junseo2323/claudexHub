import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicCard, getAuthorId, getUser } from "../../lib/hub";
import { getCurrentUser } from "../../lib/auth";
import { markStaleAction } from "../../lib/actions";
import { Avatar, EnvChips, RiskBadge, riskFromConfidence } from "../../components";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export default async function CardDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = getPublicCard(id);
  if (!card) notFound();

  const authorId = getAuthorId(card.id);
  const author = authorId ? getUser(authorId) : undefined;
  const me = await getCurrentUser();
  const isOwner = !!me && me.id === authorId;
  const stale = card.status === "stale" || card.status === "deprecated";

  return (
    <>
      {stale && (
        <div className="banner">
          ⚠ This card is marked <strong>{card.status}</strong> — its fix may be outdated. Verify before reuse.
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
      <div className="meta" style={{ marginTop: 10 }}>
        <span className="conf">confidence {card.confidenceScore}</span>
        <RiskBadge risk={riskFromConfidence(card.confidenceScore)} />
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

      <div className="section subtle">
        Est. tokens saved per reuse: {card.estimatedTokensSaved.toLocaleString()} · Updated{" "}
        {new Date(card.updatedAt).toLocaleDateString()}
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
