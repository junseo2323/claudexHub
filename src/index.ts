import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getDb } from "./db/connection.js";
import { migrate } from "./db/migrate.js";
import { buildServer } from "./mcp/server.js";
import { config, logStderr } from "./config.js";

async function main(): Promise<void> {
  const db = getDb();
  migrate(db); // idempotent — ensure schema exists
  const server = buildServer(db);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for the MCP protocol; log to stderr only.
  logStderr(
    `MCP server ready (db=${config.dbPath}, embeddings=${config.embeddingProvider})`,
  );
}

main().catch((err) => {
  logStderr("Fatal:", err);
  process.exit(1);
});
