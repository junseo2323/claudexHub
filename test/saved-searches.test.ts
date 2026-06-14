import { describe, it, expect, afterEach } from "vitest";
import type { DB } from "../src/db/connection.js";
import { UserRepository } from "../src/domain/users.js";
import { SavedSearchRepository } from "../src/domain/saved-searches.js";
import { freshDb } from "./helpers.js";

describe("SavedSearchRepository", () => {
  let db: DB;
  afterEach(() => db?.close());

  it("creates, lists (newest first), and scopes delete to the owner", () => {
    db = freshDb();
    const users = new UserRepository(db);
    const repo = new SavedSearchRepository(db);
    const alice = users.getOrCreateLocal("alice");
    const bob = users.getOrCreateLocal("bob");

    const s1 = repo.create(alice.id, { query: "kafka rebalance", stack: "NestJS", minConfidence: 60 });
    const s2 = repo.create(alice.id, { label: "CORS notes", query: "cors preflight" });

    const list = repo.listForUser(alice.id);
    expect(list.map((s) => s.id)).toEqual([s2.id, s1.id]);
    expect(list[1].stack).toBe("NestJS");
    expect(list[1].minConfidence).toBe(60);
    expect(list[0].label).toBe("CORS notes");

    // bob can't delete alice's search.
    repo.delete(s1.id, bob.id);
    expect(repo.listForUser(alice.id)).toHaveLength(2);
    repo.delete(s1.id, alice.id);
    expect(repo.listForUser(alice.id).map((s) => s.id)).toEqual([s2.id]);
  });

  it("defaults the label to the query", () => {
    db = freshDb();
    const alice = new UserRepository(db).getOrCreateLocal("alice");
    const s = new SavedSearchRepository(db).create(alice.id, { query: "docker layer cache" });
    expect(s.label).toBe("docker layer cache");
  });
});
