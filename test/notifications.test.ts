import { describe, it, expect, afterEach } from "vitest";
import type { DB } from "../src/db/connection.js";
import { UserRepository } from "../src/domain/users.js";
import { NotificationsRepository } from "../src/domain/notifications.js";
import { freshDb } from "./helpers.js";

describe("NotificationsRepository", () => {
  let db: DB;
  afterEach(() => db?.close());

  it("creates, counts unread, lists newest-first, and marks read", () => {
    db = freshDb();
    const alice = new UserRepository(db).getOrCreateLocal("alice");
    const repo = new NotificationsRepository(db);

    repo.create({ userId: alice.id, type: "feedback", message: "first" });
    const second = repo.create({ userId: alice.id, type: "relation", message: "second" });

    expect(repo.unreadCount(alice.id)).toBe(2);
    const list = repo.listForUser(alice.id);
    expect(list[0].id).toBe(second.id);
    expect(list[0].read).toBe(false);

    repo.markAllRead(alice.id);
    expect(repo.unreadCount(alice.id)).toBe(0);
    expect(repo.listForUser(alice.id).every((n) => n.read)).toBe(true);
  });

  it("scopes unread counts per user", () => {
    db = freshDb();
    const users = new UserRepository(db);
    const alice = users.getOrCreateLocal("alice");
    const bob = users.getOrCreateLocal("bob");
    const repo = new NotificationsRepository(db);
    repo.create({ userId: alice.id, type: "system", message: "hi" });
    expect(repo.unreadCount(alice.id)).toBe(1);
    expect(repo.unreadCount(bob.id)).toBe(0);
  });
});
