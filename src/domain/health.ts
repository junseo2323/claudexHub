import type { DB } from "../db/connection.js";
import { config } from "../config.js";

export interface HealthStatus {
  ok: boolean;
  db: "ok" | "error";
  cards: number;
  embeddingProvider: string;
  uptimeSeconds: number;
}

const startedAt = Date.now();

/** Liveness/readiness snapshot: verifies the DB is reachable and reports basics. */
export function healthCheck(db: DB, now: number = Date.now()): HealthStatus {
  let dbStatus: "ok" | "error" = "ok";
  let cards = 0;
  try {
    const row = db.prepare("SELECT count(*) AS c FROM context_cards").get() as { c: number };
    cards = row.c;
  } catch {
    dbStatus = "error";
  }
  return {
    ok: dbStatus === "ok",
    db: dbStatus,
    cards,
    embeddingProvider: config.embeddingProvider,
    uptimeSeconds: Math.max(0, Math.floor((now - startedAt) / 1000)),
  };
}
