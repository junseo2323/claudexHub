import { listPublicCards } from "../lib/hub";
import { CardRow } from "../components";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function CardsPage() {
  const cards = listPublicCards();
  return (
    <>
      <h1>Context Cards</h1>
      <p className="subtle">{cards.length} published cards.</p>
      <div className="card-list" style={{ marginTop: 18 }}>
        {cards.map((c) => (
          <CardRow key={c.id} card={c} />
        ))}
      </div>
    </>
  );
}
