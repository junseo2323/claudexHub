import { describe, it, expect, afterEach } from "vitest";
import type { DB } from "../src/db/connection.js";
import { UserRepository } from "../src/domain/users.js";
import { ApiTokenRepository } from "../src/domain/api-tokens.js";
import { freshDb } from "./helpers.js";

describe("ApiTokenRepository", () => {
  let db: DB;
  afterEach(() => db?.close());

  it("creates a token, returns plaintext once, and stores only a hash", () => {
    db = freshDb();
    const alice = new UserRepository(db).getOrCreateLocal("alice");
    const repo = new ApiTokenRepository(db);
    const { token, plaintext } = repo.create(alice.id, "ci-bot");

    expect(plaintext.startsWith("clx_")).toBe(true);
    expect(token.name).toBe("ci-bot");

    // The plaintext is never stored.
    const row = db.prepare("SELECT token_hash FROM api_tokens WHERE id = ?").get(token.id) as {
      token_hash: string;
    };
    expect(row.token_hash).not.toContain(plaintext);
  });

  it("verifies a valid token, rejects an invalid one, and stamps last_used_at", () => {
    db = freshDb();
    const alice = new UserRepository(db).getOrCreateLocal("alice");
    const repo = new ApiTokenRepository(db);
    const { token, plaintext } = repo.create(alice.id, "t");

    expect(repo.verify(plaintext)).toBe(alice.id);
    expect(repo.verify("clx_wrong")).toBeUndefined();
    expect(repo.verify("")).toBeUndefined();
    expect(repo.listForUser(alice.id)[0].lastUsedAt).toBeDefined();
    expect(repo.listForUser(alice.id)[0].id).toBe(token.id);
  });

  it("revokes scoped to the owner", () => {
    db = freshDb();
    const users = new UserRepository(db);
    const alice = users.getOrCreateLocal("alice");
    const bob = users.getOrCreateLocal("bob");
    const repo = new ApiTokenRepository(db);
    const { token, plaintext } = repo.create(alice.id, "t");

    repo.revoke(token.id, bob.id); // not bob's -> no-op
    expect(repo.verify(plaintext)).toBe(alice.id);
    repo.revoke(token.id, alice.id);
    expect(repo.verify(plaintext)).toBeUndefined();
    expect(repo.listForUser(alice.id)).toHaveLength(0);
  });
});
