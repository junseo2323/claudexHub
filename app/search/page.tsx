import Link from "next/link";
import { search, listSavedSearches } from "../lib/hub";
import { getCurrentUser } from "../lib/auth";
import { saveSearchAction, deleteSavedSearchAction } from "../lib/actions";
import { BriefRow } from "../components";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function savedHref(s: { query: string; stack?: string; minConfidence?: number }): string {
  const params = new URLSearchParams({ q: s.query });
  if (s.stack) params.set("stack", s.stack);
  if (s.minConfidence != null) params.set("min", String(s.minConfidence));
  return `/search?${params.toString()}`;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; min?: string; stack?: string; version?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const min = sp.min ? Number(sp.min) : undefined;
  const stack = (sp.stack ?? "").trim();
  const stackList = stack ? stack.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const version = (sp.version ?? "").trim();
  const versionList = version ? version.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const me = await getCurrentUser();
  const saved = me ? listSavedSearches(me.id) : [];

  const results = q
    ? await search({ query: q, stack: stackList, version: versionList, minConfidence: min, limit: 10 }, me?.id)
    : [];

  return (
    <>
      <h1>Search</h1>
      <p className="subtle">Hybrid keyword + semantic search over the Context Hub.</p>

      <form className="search-form" method="get">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Describe the problem, error, or symptom…"
        />
        <button type="submit">Search</button>
        <div className="search-filters">
          <input type="text" name="stack" defaultValue={stack} placeholder="stack filter (comma-separated)" />
          <input type="text" name="version" defaultValue={version} placeholder="version filter (e.g. Next.js 15)" />
          <label className="min-filter">
            min confidence
            <input type="number" name="min" min={0} max={100} defaultValue={sp.min ?? ""} placeholder="0" />
          </label>
        </div>
      </form>

      {q && (
        <p className="subtle">
          {results.length} result{results.length === 1 ? "" : "s"} for “{q}”
          {stackList ? ` · stack ${stackList.join(", ")}` : ""}
          {min != null ? ` · ≥ ${min}` : ""}
          {me && (
            <>
              {" · "}
              <form action={saveSearchAction} style={{ display: "inline" }}>
                <input type="hidden" name="q" value={q} />
                <input type="hidden" name="stack" value={stack} />
                <input type="hidden" name="min" value={sp.min ?? ""} />
                <button type="submit" className="link-accent">
                  Save this search
                </button>
              </form>
            </>
          )}
        </p>
      )}

      <div className="card-list">
        {results.map((b) => (
          <BriefRow key={b.id} brief={b} />
        ))}
      </div>

      {q && results.length === 0 && <div className="empty">No matching cards.</div>}
      {!q && <div className="empty">Enter a query to search the hub.</div>}

      {saved.length > 0 && (
        <div className="section">
          <h3>Saved searches</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {saved.map((s) => (
              <li key={s.id} className="relation-row">
                <Link href={savedHref(s)}>{s.label}</Link>
                <span className="subtle" style={{ fontSize: 12 }}>
                  {s.stack ? `stack: ${s.stack}` : ""}
                  {s.minConfidence != null ? ` · ≥${s.minConfidence}` : ""}
                </span>
                <form action={deleteSavedSearchAction} style={{ marginLeft: "auto" }}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="link-danger">
                    delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
