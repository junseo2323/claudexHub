import { nanoid } from "nanoid";
import type { DB } from "../db/connection.js";

export interface User {
  id: string;
  githubId?: string;
  login: string;
  name?: string;
  avatarUrl?: string;
  createdAt: string;
}

interface UserRow {
  id: string;
  github_id: string | null;
  login: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    githubId: row.github_id ?? undefined,
    login: row.login,
    name: row.name ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    createdAt: row.created_at,
  };
}

export class UserRepository {
  constructor(private readonly db: DB) {}

  getById(id: string): User | undefined {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
    return row ? rowToUser(row) : undefined;
  }

  getByLogin(login: string): User | undefined {
    const row = this.db.prepare("SELECT * FROM users WHERE login = ?").get(login) as
      | UserRow
      | undefined;
    return row ? rowToUser(row) : undefined;
  }

  getByGithubId(githubId: string): User | undefined {
    const row = this.db.prepare("SELECT * FROM users WHERE github_id = ?").get(githubId) as
      | UserRow
      | undefined;
    return row ? rowToUser(row) : undefined;
  }

  listAll(): User[] {
    const rows = this.db.prepare("SELECT * FROM users ORDER BY created_at ASC").all() as UserRow[];
    return rows.map(rowToUser);
  }

  /** Insert or update a user keyed by GitHub id; returns the stored user. */
  upsertByGithub(input: {
    githubId: string;
    login: string;
    name?: string;
    avatarUrl?: string;
  }): User {
    const existing = this.getByGithubId(input.githubId);
    if (existing) {
      this.db
        .prepare("UPDATE users SET login=?, name=?, avatar_url=? WHERE id=?")
        .run(input.login, input.name ?? null, input.avatarUrl ?? null, existing.id);
      return this.getById(existing.id)!;
    }
    return this.create({ ...input });
  }

  /** Get an existing user by login, or create a local (non-GitHub) one. */
  getOrCreateLocal(login: string, name?: string): User {
    return this.getByLogin(login) ?? this.create({ login, name });
  }

  private create(input: {
    githubId?: string;
    login: string;
    name?: string;
    avatarUrl?: string;
  }): User {
    const user: User = {
      id: `user_${nanoid(12)}`,
      githubId: input.githubId,
      login: input.login,
      name: input.name,
      avatarUrl: input.avatarUrl,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO users (id, github_id, login, name, avatar_url, created_at)
         VALUES (@id, @githubId, @login, @name, @avatarUrl, @createdAt)`,
      )
      .run({
        id: user.id,
        githubId: user.githubId ?? null,
        login: user.login,
        name: user.name ?? null,
        avatarUrl: user.avatarUrl ?? null,
        createdAt: user.createdAt,
      });
    return user;
  }

  /** Attribute a card to a user (idempotent). */
  setCardAuthor(cardId: string, userId: string): void {
    this.db
      .prepare(
        `INSERT INTO card_authors (card_id, user_id, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(card_id) DO UPDATE SET user_id = excluded.user_id`,
      )
      .run(cardId, userId, new Date().toISOString());
  }

  getCardAuthorId(cardId: string): string | undefined {
    const row = this.db.prepare("SELECT user_id FROM card_authors WHERE card_id = ?").get(cardId) as
      | { user_id: string }
      | undefined;
    return row?.user_id;
  }
}
