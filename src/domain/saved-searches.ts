import { nanoid } from "nanoid";
import type { DB } from "../db/connection.js";

export interface SavedSearch {
  id: string;
  userId: string;
  label: string;
  query: string;
  stack?: string;
  minConfidence?: number;
  createdAt: string;
}

interface Row {
  id: string;
  user_id: string;
  label: string;
  query: string;
  stack: string | null;
  min_confidence: number | null;
  created_at: string;
}

function rowTo(row: Row): SavedSearch {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    query: row.query,
    stack: row.stack ?? undefined,
    minConfidence: row.min_confidence ?? undefined,
    createdAt: row.created_at,
  };
}

export class SavedSearchRepository {
  constructor(private readonly db: DB) {}

  create(
    userId: string,
    input: { label?: string; query: string; stack?: string; minConfidence?: number },
  ): SavedSearch {
    const search: SavedSearch = {
      id: `search_${nanoid(12)}`,
      userId,
      label: (input.label?.trim() || input.query).slice(0, 80),
      query: input.query,
      stack: input.stack || undefined,
      minConfidence: input.minConfidence,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO saved_searches (id, user_id, label, query, stack, min_confidence, created_at)
         VALUES (@id, @userId, @label, @query, @stack, @minConfidence, @createdAt)`,
      )
      .run({
        id: search.id,
        userId: search.userId,
        label: search.label,
        query: search.query,
        stack: search.stack ?? null,
        minConfidence: search.minConfidence ?? null,
        createdAt: search.createdAt,
      });
    return search;
  }

  listForUser(userId: string): SavedSearch[] {
    const rows = this.db
      .prepare("SELECT * FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC, rowid DESC")
      .all(userId) as Row[];
    return rows.map(rowTo);
  }

  /** Delete scoped to the owning user (no-op if not theirs). */
  delete(id: string, userId: string): void {
    this.db.prepare("DELETE FROM saved_searches WHERE id = ? AND user_id = ?").run(id, userId);
  }
}
