import { listPublicCards, getStats } from "../lib/hub";
import { CardRow } from "../components";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STALE = new Set(["stale", "deprecated"]);

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ stack?: string; status?: string }>;
}) {
  const { stack = "", status = "all" } = await searchParams;
  const stackQ = stack.trim().toLowerCase();

  let cards = listPublicCards();
  if (status === "published") cards = cards.filter((c) => c.status === "published");
  else if (status === "stale") cards = cards.filter((c) => STALE.has(c.status));
  if (stackQ) {
    cards = cards.filter((c) =>
      Object.values(c.environment)
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(stackQ)),
    );
  }

  const stackSuggestions = getStats().topStacks.map((s) => s.stack);

  return (
    <>
      <h1>Context Cards</h1>

      <form className="filter-bar" method="get">
        <input
          type="text"
          name="stack"
          defaultValue={stack}
          placeholder="Filter by stack (e.g. Next.js)"
          list="stack-suggestions"
        />
        <datalist id="stack-suggestions">
          {stackSuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <select name="status" defaultValue={status}>
          <option value="all">All</option>
          <option value="published">Published</option>
          <option value="stale">Stale</option>
        </select>
        <button type="submit" className="btn">
          Filter
        </button>
      </form>

      <p className="subtle">
        {cards.length} card{cards.length === 1 ? "" : "s"}
        {stackQ ? ` · stack “${stack}”` : ""}
        {status !== "all" ? ` · ${status}` : ""}
      </p>

      {cards.length === 0 ? (
        <div className="empty">No cards match these filters.</div>
      ) : (
        <div className="card-list" style={{ marginTop: 8 }}>
          {cards.map((c) => (
            <CardRow key={c.id} card={c} />
          ))}
        </div>
      )}
    </>
  );
}
