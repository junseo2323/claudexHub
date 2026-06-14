import type { DB } from "../db/connection.js";

export type RelationType = "supersedes" | "duplicate" | "related";
export const RELATION_TYPES: RelationType[] = ["supersedes", "duplicate", "related"];

export interface CardRelation {
  fromCardId: string;
  toCardId: string;
  type: RelationType;
  createdAt: string;
}

interface RelationRow {
  from_card_id: string;
  to_card_id: string;
  type: string;
  created_at: string;
}

function rowTo(row: RelationRow): CardRelation {
  return {
    fromCardId: row.from_card_id,
    toCardId: row.to_card_id,
    type: row.type as RelationType,
    createdAt: row.created_at,
  };
}

export class RelationsRepository {
  constructor(private readonly db: DB) {}

  /** Add a relation (idempotent). Self-relations are ignored. */
  add(fromCardId: string, toCardId: string, type: RelationType): void {
    if (fromCardId === toCardId) return;
    this.db
      .prepare(
        `INSERT INTO card_relations (from_card_id, to_card_id, type, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(from_card_id, to_card_id, type) DO NOTHING`,
      )
      .run(fromCardId, toCardId, type, new Date().toISOString());
  }

  remove(fromCardId: string, toCardId: string, type: RelationType): void {
    this.db
      .prepare("DELETE FROM card_relations WHERE from_card_id = ? AND to_card_id = ? AND type = ?")
      .run(fromCardId, toCardId, type);
  }

  /** Relations where this card is the source. */
  outgoing(cardId: string): CardRelation[] {
    const rows = this.db
      .prepare("SELECT * FROM card_relations WHERE from_card_id = ? ORDER BY created_at DESC")
      .all(cardId) as RelationRow[];
    return rows.map(rowTo);
  }

  /** Relations where this card is the target. */
  incoming(cardId: string): CardRelation[] {
    const rows = this.db
      .prepare("SELECT * FROM card_relations WHERE to_card_id = ? ORDER BY created_at DESC")
      .all(cardId) as RelationRow[];
    return rows.map(rowTo);
  }
}
