import Link from "next/link";
import { getCurrentUser } from "../lib/auth";
import { listGroups } from "../lib/claudexhub";
import { ReviewBadge } from "../components";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Same-problem groups: near-duplicate cards that search collapses into one. */
export default async function ClustersPage() {
  const me = await getCurrentUser();
  const groups = listGroups(me?.id);

  return (
    <>
      <h1>Same-problem groups</h1>
      <p className="subtle">
        Cards that describe the same underlying problem are grouped automatically (embedding similarity, confirmed by
        the LLM judge for borderline pairs). Search shows each group once, represented by its ★ card. Authors can change
        the representative or leave a group from the card page.
      </p>

      {groups.length === 0 ? (
        <div className="empty">
          No groups yet. Groups form when a newly published card matches an existing one; run{" "}
          <code>npm run cli -- recluster</code> to build them from existing cards.
        </div>
      ) : (
        groups.map(({ cluster, members }) => {
          const rep = members.find((m) => m.canonical) ?? members[0];
          return (
            <div key={cluster.id} className="section panel">
              <div className="meta" style={{ marginBottom: 8 }}>
                <span className="chip">⧉ {members.length} cards</span>
                {rep.card.reviewVerdict && <ReviewBadge verdict={rep.card.reviewVerdict} />}
                <span className="subtle" style={{ fontSize: 12 }}>
                  updated {new Date(cluster.updatedAt).toLocaleDateString()}
                </span>
              </div>
              <h3 style={{ margin: "0 0 8px" }}>
                ★ <Link href={`/cards/${rep.card.id}`}>{rep.card.title}</Link>
              </h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {members
                  .filter((m) => m.card.id !== rep.card.id)
                  .map((m) => (
                    <li key={m.card.id} className="relation-row">
                      <span className="chip">{Math.round(m.similarity * 100)}% similar</span>
                      <Link href={`/cards/${m.card.id}`}>{m.card.title}</Link>
                      <span className="subtle" style={{ fontSize: 12 }}>
                        confidence {m.card.confidenceScore}
                        {m.card.status !== "published" ? ` · ${m.card.status}` : ""}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          );
        })
      )}
    </>
  );
}
