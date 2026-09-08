import Link from "next/link";
import type { ContextCard, CardBrief, CardReview, User, UserSummary } from "./lib/claudexhub";
import type { ReviewVerdict } from "../src/domain/types.js";

export function Avatar({ user, size = 28 }: { user: Pick<User, "login" | "avatarUrl">; size?: number }) {
  const dim = { width: size, height: size, borderRadius: "50%", verticalAlign: "middle" };
  if (user.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatarUrl} alt={user.login} style={dim} />;
  }
  const initial = user.login.charAt(0).toUpperCase();
  return (
    <span
      className="avatar-fallback"
      style={{ ...dim, fontSize: size * 0.5, lineHeight: `${size}px` }}
      aria-hidden
    >
      {initial}
    </span>
  );
}

export function LeaderboardRow({ rank, s }: { rank: number; s: UserSummary }) {
  return (
    <tr>
      <td style={{ width: 32, color: "var(--muted)" }}>{rank}</td>
      <td>
        <Link href={`/u/${s.user.login}`} className="nav-user">
          <Avatar user={s.user} size={22} /> {s.user.name ?? s.user.login}
        </Link>
      </td>
      <td>
        <strong>{s.reputationScore}</strong>
      </td>
      <td>{s.cardsPublished}</td>
      <td>{s.verifiedFixCount}</td>
      <td>{s.successfulReuse}</td>
      <td>{s.tokensSaved.toLocaleString()}</td>
    </tr>
  );
}

export function EnvChips({ env }: { env: ContextCard["environment"] }) {
  const values = Object.values(env).filter(Boolean) as string[];
  if (!values.length) return null;
  return (
    <>
      {values.map((v, i) => (
        <span key={i} className="chip">
          {v}
        </span>
      ))}
    </>
  );
}

export function riskFromConfidence(confidence: number): "low" | "medium" | "high" {
  if (confidence >= 75) return "low";
  if (confidence >= 50) return "medium";
  return "high";
}

export function RiskBadge({ risk }: { risk: "low" | "medium" | "high" }) {
  const label = risk === "low" ? "low risk" : risk === "medium" ? "medium risk" : "high risk";
  return <span className={`badge ${risk}`}>{label}</span>;
}

const REVIEW_LABEL: Record<ReviewVerdict, string> = {
  pass: "review: pass",
  needs_work: "review: needs work",
  fail: "review: fail",
};
const REVIEW_CLASS: Record<ReviewVerdict, "low" | "medium" | "high"> = {
  pass: "low",
  needs_work: "medium",
  fail: "high",
};

/** Verdict of the latest independent review (LLM judge or heuristic checks). */
export function ReviewBadge({ verdict, score }: { verdict: ReviewVerdict; score?: number }) {
  return (
    <span className={`badge ${REVIEW_CLASS[verdict]}`} title="Independent review of the fix itself">
      {REVIEW_LABEL[verdict]}
      {score != null ? ` · ${Math.round(score)}` : ""}
    </span>
  );
}

/** Full rendering of one review: verdict, who judged, issues, suggestions. */
export function ReviewPanel({ review }: { review: CardReview }) {
  const judged =
    review.provider === "heuristic"
      ? "automated checks only (no LLM judge configured)"
      : `${review.provider}${review.model ? ` · ${review.model}` : ""} + automated checks`;
  return (
    <div>
      <div className="meta" style={{ marginBottom: 10 }}>
        <ReviewBadge verdict={review.verdict} score={review.score} />
        <span className="subtle" style={{ fontSize: 12 }}>
          {judged} · {new Date(review.createdAt).toLocaleString()}
        </span>
      </div>
      <p style={{ margin: "0 0 10px" }}>{review.summary}</p>
      {review.issues.length > 0 && (
        <ul style={{ margin: "0 0 10px", paddingLeft: 18 }}>
          {review.issues.map((i, k) => (
            <li key={k}>
              <span className={`badge ${i.severity === "high" ? "high" : i.severity === "medium" ? "medium" : "low"}`}>
                {i.severity}
              </span>{" "}
              {i.field ? <code>{i.field}</code> : null} {i.message}
            </li>
          ))}
        </ul>
      )}
      {review.suggestions.length > 0 && (
        <details>
          <summary className="subtle" style={{ cursor: "pointer" }}>
            {review.suggestions.length} suggestion{review.suggestions.length === 1 ? "" : "s"}
          </summary>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {review.suggestions.map((s, k) => (
              <li key={k}>
                <code>{s.field}</code>
                <pre style={{ whiteSpace: "pre-wrap", margin: "4px 0 0", fontSize: 13 }}>{s.value}</pre>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** A full ContextCard rendered as a list row (dashboard / browse). */
export function CardRow({ card }: { card: ContextCard }) {
  return (
    <Link href={`/cards/${card.id}`} className="card-row">
      <div className="title">{card.title}</div>
      <div className="meta">
        <span className="conf">{card.confidenceScore}</span>
        <RiskBadge risk={riskFromConfidence(card.confidenceScore)} />
        <EnvChips env={card.environment} />
        {card.successfulReuseCount > 0 && (
          <span className="chip good">♻ {card.successfulReuseCount} reuse</span>
        )}
        {card.status !== "published" && <span className="chip">{card.status}</span>}
      </div>
    </Link>
  );
}

export function ProfileView({ summary, cards }: { summary: UserSummary; cards: ContextCard[] }) {
  const u = summary.user;
  return (
    <>
      <div className="profile-head">
        <Avatar user={u} size={56} />
        <div>
          <h1 style={{ margin: 0 }}>{u.name ?? u.login}</h1>
          <div className="subtle">
            @{u.login}
            {u.githubId ? " · GitHub" : " · demo account"}
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="value">{summary.reputationScore}</div>
          <div className="label">Reputation</div>
        </div>
        <div className="stat">
          <div className="value">{summary.cardsPublished}</div>
          <div className="label">Published cards</div>
        </div>
        <div className="stat">
          <div className="value">{summary.verifiedFixCount}</div>
          <div className="label">Verified fixes</div>
        </div>
        <div className="stat">
          <div className="value">{summary.successfulReuse}</div>
          <div className="label">Successful reuse</div>
        </div>
        <div className="stat">
          <div className="value">{summary.tokensSaved.toLocaleString()}</div>
          <div className="label">Tokens saved</div>
        </div>
      </div>

      <h2>Contributed cards</h2>
      {cards.length === 0 ? (
        <div className="empty">No published cards yet.</div>
      ) : (
        <div className="card-list">
          {cards.map((c) => (
            <CardRow key={c.id} card={c} />
          ))}
        </div>
      )}
    </>
  );
}

/** A search brief result rendered as a list row. */
export function BriefRow({ brief }: { brief: CardBrief }) {
  return (
    <Link href={`/cards/${brief.id}`} className="card-row">
      <div className="title">{brief.title}</div>
      <div className="meta">
        <span className="conf">{brief.confidence}</span>
        <RiskBadge risk={brief.risk} />
        {brief.review && <ReviewBadge verdict={brief.review} />}
        {brief.cluster && brief.cluster.size > 1 && (
          <span className="chip" title="Near-duplicate cards grouped as one problem">
            ⧉ {brief.cluster.size} cards, same problem
          </span>
        )}
        <span className="chip">{brief.match_reason}</span>
      </div>
      {brief.fix_summary.length > 0 && (
        <div className="subtle" style={{ marginTop: 8 }}>
          {brief.fix_summary[0]}
        </div>
      )}
    </Link>
  );
}
