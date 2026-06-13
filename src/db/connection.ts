import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { config } from "../config.js";

export type DB = Database.Database;

let singleton: DB | undefined;

/**
 * Open a SQLite database, load the sqlite-vec extension, and apply pragmas.
 * Pass an explicit path (e.g. ":memory:") for tests; otherwise uses config.
 */
export function openDb(path: string = config.dbPath): DB {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  // sqlite-vec ships a loadable extension and exposes load() for better-sqlite3.
  sqliteVec.load(db);
  return db;
}

/** Process-wide shared connection for the MCP server / CLI. */
export function getDb(): DB {
  if (!singleton) {
    singleton = openDb();
  }
  return singleton;
}

export function closeDb(): void {
  if (singleton) {
    singleton.close();
    singleton = undefined;
  }
}
