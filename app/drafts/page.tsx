import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/auth";
import { listDraftsForUser } from "../lib/claudexhub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function DraftsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const drafts = listDraftsForUser(me.id);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1>My drafts</h1>
        <Link href="/new" className="btn">
          New card
        </Link>
      </div>

      {drafts.length === 0 ? (
        <div className="empty">No drafts yet. Create one to get started.</div>
      ) : (
        <div className="card-list" style={{ marginTop: 18 }}>
          {drafts.map((c) => (
            <Link key={c.id} href={`/drafts/${c.id}`} className="card-row">
              <div className="title">{c.title}</div>
              <div className="meta">
                <span className="chip">{c.status}</span>
                <span className="subtle">{new Date(c.updatedAt).toLocaleString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
