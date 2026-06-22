import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildServer } from "../../../src/mcp/server.js";
import { getDb } from "../../../src/db/connection.js";
import { migrate } from "../../../src/db/migrate.js";
import { verifyApiToken } from "../../lib/claudexhub";
import { rateLimitApi } from "../../lib/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rpcError(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }),
    { status, headers: { "content-type": "application/json" } },
  );
}

/**
 * Hosted MCP endpoint (Streamable HTTP, stateless JSON mode). Lets a remote
 * agent use the same ClaudexHub tools over HTTP instead of stdio. Authenticate
 * with `Authorization: Bearer <token>` (created at /settings/tokens).
 *
 * Note: tool results currently surface published/approved cards and are not yet
 * scoped to the token owner's team-private visibility — see docs/SPEC-GAP.md.
 */
async function handle(req: Request): Promise<Response> {
  const rl = rateLimitApi(req.headers);
  if (!rl.allowed) return rpcError(429, "rate_limited");

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !verifyApiToken(token)) return rpcError(401, "unauthorized");

  const db = getDb();
  migrate(db);
  const server = buildServer(db);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless: each request is self-contained
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
