import { search } from "../lib/hub";
import { BriefRow } from "../components";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; min?: string; stack?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const min = sp.min ? Number(sp.min) : undefined;
  const stack = (sp.stack ?? "").trim();
  const stackList = stack ? stack.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

  const results = q
    ? await search({ query: q, stack: stackList, minConfidence: min, limit: 10 })
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
        </p>
      )}

      <div className="card-list">
        {results.map((b) => (
          <BriefRow key={b.id} brief={b} />
        ))}
      </div>

      {q && results.length === 0 && <div className="empty">No matching cards.</div>}
      {!q && <div className="empty">Enter a query to search the hub.</div>}
    </>
  );
}
