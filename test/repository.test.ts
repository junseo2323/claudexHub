import { describe, it, expect, afterEach } from "vitest";
import type { DB } from "../src/db/connection.js";
import { Repository } from "../src/domain/repository.js";
import { cardInputSchema } from "../src/domain/card-schema.js";
import { freshDb } from "./helpers.js";

function sampleInput(overrides: Record<string, unknown> = {}) {
  return cardInputSchema.parse({
    title: "Set-Cookie not stored",
    problem: "Cookie set but not sent cross-site",
    verifiedFix: ["SameSite=None; Secure"],
    verification: ["cookie present"],
    status: "published",
    ...overrides,
  });
}

describe("Repository", () => {
  let db: DB;
  afterEach(() => db?.close());

  it("inserts a card and populates FTS + vector tables", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const card = await repo.createCard(sampleInput());

    expect(repo.getCard(card.id)).toBeTruthy();
    const fts = db.prepare("SELECT count(*) c FROM context_cards_fts WHERE id = ?").get(card.id) as { c: number };
    const vec = db.prepare("SELECT count(*) c FROM context_cards_vec WHERE card_id = ?").get(card.id) as { c: number };
    expect(fts.c).toBe(1);
    expect(vec.c).toBe(1);
  });

  it("keeps indexes in sync on update", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const card = await repo.createCard(sampleInput());
    await repo.updateCard(card.id, { title: "Updated title" });

    const fts = db.prepare("SELECT count(*) c FROM context_cards_fts WHERE id = ?").get(card.id) as { c: number };
    const vec = db.prepare("SELECT count(*) c FROM context_cards_vec WHERE card_id = ?").get(card.id) as { c: number };
    expect(fts.c).toBe(1); // not duplicated
    expect(vec.c).toBe(1);
    expect(repo.getCard(card.id)?.title).toBe("Updated title");
  });

  it("cascades evidence and clears indexes on delete", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const card = await repo.createCard(sampleInput());
    repo.addEvidence(card.id, { source: "manual", content: "redacted evidence" });

    repo.deleteCard(card.id);
    expect(repo.getCard(card.id)).toBeUndefined();
    const ev = db.prepare("SELECT count(*) c FROM source_evidence WHERE card_id = ?").get(card.id) as { c: number };
    const fts = db.prepare("SELECT count(*) c FROM context_cards_fts WHERE id = ?").get(card.id) as { c: number };
    expect(ev.c).toBe(0);
    expect(fts.c).toBe(0);
  });

  it("listCards excludes drafts by default", async () => {
    db = freshDb();
    const repo = new Repository(db);
    await repo.createCard(sampleInput({ status: "draft", title: "A draft" }));
    await repo.createCard(sampleInput({ title: "Published one" }));
    expect(repo.listCards().length).toBe(1);
    expect(repo.listCards({ includeDrafts: true }).length).toBe(2);
  });
});
