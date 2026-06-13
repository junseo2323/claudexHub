import Link from "next/link";
import type { ContextCard, CardBrief } from "./lib/hub";

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

/** A search brief result rendered as a list row. */
export function BriefRow({ brief }: { brief: CardBrief }) {
  return (
    <Link href={`/cards/${brief.id}`} className="card-row">
      <div className="title">{brief.title}</div>
      <div className="meta">
        <span className="conf">{brief.confidence}</span>
        <RiskBadge risk={brief.risk} />
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
