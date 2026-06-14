import { nanoid } from "nanoid";
import type { DB } from "../db/connection.js";

export type NotificationType = "feedback" | "relation" | "system";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  message: string;
  cardId?: string;
  read: boolean;
  createdAt: string;
}

interface Row {
  id: string;
  user_id: string;
  type: string;
  message: string;
  card_id: string | null;
  read: number;
  created_at: string;
}

function rowTo(row: Row): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as NotificationType,
    message: row.message,
    cardId: row.card_id ?? undefined,
    read: row.read === 1,
    createdAt: row.created_at,
  };
}

export class NotificationsRepository {
  constructor(private readonly db: DB) {}

  create(input: {
    userId: string;
    type: NotificationType;
    message: string;
    cardId?: string;
  }): Notification {
    const n: Notification = {
      id: `notif_${nanoid(12)}`,
      userId: input.userId,
      type: input.type,
      message: input.message,
      cardId: input.cardId,
      read: false,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO notifications (id, user_id, type, message, card_id, read, created_at)
         VALUES (@id, @userId, @type, @message, @cardId, 0, @createdAt)`,
      )
      .run({
        id: n.id,
        userId: n.userId,
        type: n.type,
        message: n.message,
        cardId: n.cardId ?? null,
        createdAt: n.createdAt,
      });
    return n;
  }

  listForUser(userId: string, limit = 50): Notification[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
      )
      .all(userId, limit) as Row[];
    return rows.map(rowTo);
  }

  unreadCount(userId: string): number {
    const row = this.db
      .prepare("SELECT count(*) AS c FROM notifications WHERE user_id = ? AND read = 0")
      .get(userId) as { c: number };
    return row.c;
  }

  markAllRead(userId: string): void {
    this.db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0").run(userId);
  }
}
