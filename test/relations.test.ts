import { describe, it, expect, afterEach } from "vitest";
import type { DB } from "../src/db/connection.js";
import { Repository } from "../src/domain/repository.js";
import { RelationsRepository } from "../src/domain/relations.js";
import { cardInputSchema } from "../src/domain/card-schema.js";
import { freshDb } from "./helpers.js";

async function card(repo: Repository, title: string) {
  return repo.createCard(
    cardInputSchema.parse({ title, problem: `${title} problem`, status: "published", visibility: "public" }),
  );
}

describe("RelationsRepository", () => {
  let db: DB;
  afterEach(() => db?.close());

  it("adds, lists (both directions), and removes relations", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const rel = new RelationsRepository(db);
    const a = await card(repo, "New fix");
    const b = await card(repo, "Old fix");

    rel.add(a.id, b.id, "supersedes");
    expect(rel.outgoing(a.id).map((r) => r.toCardId)).toEqual([b.id]);
    expect(rel.incoming(b.id).map((r) => r.fromCardId)).toEqual([a.id]);
    expect(rel.incoming(b.id)[0].type).toBe("supersedes");

    rel.remove(a.id, b.id, "supersedes");
    expect(rel.outgoing(a.id)).toHaveLength(0);
  });

  it("is idempotent and ignores self-relations", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const rel = new RelationsRepository(db);
    const a = await card(repo, "A");
    const b = await card(repo, "B");

    rel.add(a.id, b.id, "duplicate");
    rel.add(a.id, b.id, "duplicate"); // dup
    rel.add(a.id, a.id, "related"); // self -> ignored
    expect(rel.outgoing(a.id)).toHaveLength(1);
  });

  it("cascades when a card is deleted", async () => {
    db = freshDb();
    const repo = new Repository(db);
    const rel = new RelationsRepository(db);
    const a = await card(repo, "A");
    const b = await card(repo, "B");
    rel.add(a.id, b.id, "related");
    repo.deleteCard(b.id);
    expect(rel.outgoing(a.id)).toHaveLength(0);
  });
});
