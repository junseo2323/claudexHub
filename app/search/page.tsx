import { search } from "../lib/hub";
import { BriefRow } from "../components";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; min?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const min = sp.min ? Number(sp.min) : undefined;
  const results = q ? await search({ query: q, minConfidence: min, limit: 10 }) : [];

  return (
    <>
      <h1>Search</h1>
      <p className="subtle">Hybrid keyword + semantic search over the Context Hub.</p>

      <form className="search-form" method="get">
        <input type="text" name="q" defaultValue={q} placeholder="Describe the problem, error, or symptom…" />
        <button type="submit">Search</button>
      </form>

      {q && (
        <p className="subtle">
          {results.length} result{results.length === 1 ? "" : "s"} for “{q}”
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
