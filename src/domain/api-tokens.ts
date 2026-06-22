import crypto from "node:crypto";
import { nanoid } from "nanoid";
import type { DB } from "../db/connection.js";

export interface ApiToken {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
}

interface Row {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  created_at: string;
  last_used_at: string | null;
}

function rowTo(row: Row): ApiToken {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? undefined,
  };
}

/** SHA-256 of the plaintext token — only the hash is ever stored. */
function hashToken(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

export class ApiTokenRepository {
  constructor(private readonly db: DB) {}

  /** Create a token; the plaintext is returned ONCE and never stored. */
  create(userId: string, name: string): { token: ApiToken; plaintext: string } {
    const plaintext = `clx_${crypto.randomBytes(24).toString("hex")}`;
    const token: ApiToken = {
      id: `tok_${nanoid(12)}`,
      userId,
      name: name.trim().slice(0, 60) || "token",
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO api_tokens (id, user_id, name, token_hash, created_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      )
      .run(token.id, token.userId, token.name, hashToken(plaintext), token.createdAt);
    return { token, plaintext };
  }

  /** Resolve a plaintext token to its user id, stamping last_used_at. */
  verify(plaintext: string): string | undefined {
    if (!plaintext) return undefined;
    const row = this.db
      .prepare("SELECT * FROM api_tokens WHERE token_hash = ?")
      .get(hashToken(plaintext)) as Row | undefined;
    if (!row) return undefined;
    this.db
      .prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?")
      .run(new Date().toISOString(), row.id);
    return row.user_id;
  }

  listForUser(userId: string): ApiToken[] {
    const rows = this.db
      .prepare("SELECT * FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC, rowid DESC")
      .all(userId) as Row[];
    return rows.map(rowTo);
  }

  /** Revoke scoped to the owning user. */
  revoke(id: string, userId: string): void {
    this.db.prepare("DELETE FROM api_tokens WHERE id = ? AND user_id = ?").run(id, userId);
  }
}
