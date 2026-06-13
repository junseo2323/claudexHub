import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config, logStderr } from "../config.js";
import { type DB, getDb } from "./connection.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Locate schema.sql in both `tsx src/...` (dev) and bundled `dist/` layouts. */
function readSchemaSql(): string {
  const candidates = [
    join(__dirname, "schema.sql"), // dev: src/db/schema.sql
    join(__dirname, "..", "schema.sql"), // bundled: dist/schema.sql
  ];
  for (const path of candidates) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      // try next
    }
  }
  throw new Error(`schema.sql not found in: ${candidates.join(", ")}`);
}

/** Apply the schema idempotently. Safe to run repeatedly. */
export function migrate(db: DB = getDb(), embedDim: number = config.embedDim): void {
  const sql = readSchemaSql().replaceAll("__EMBED_DIM__", String(embedDim));
  db.exec(sql);
  migrateColumns(db);
}

function hasColumn(db: DB, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((row) => row.name === column);
}

function migrateColumns(db: DB): void {
  if (!hasColumn(db, "source_evidence", "url")) {
    db.exec("ALTER TABLE source_evidence ADD COLUMN url TEXT");
  }
}

// Allow `npm run migrate`.
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
  logStderr(`Migrated database at ${config.dbPath} (embed_dim=${config.embedDim})`);
}
