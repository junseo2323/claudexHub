import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

export const HOSTED_ORIGIN = "https://claudexhub.fly.dev";
export const MCP_SERVER_NAME = "claudexhub";
export const CODEX_TOKEN_ENV = "CLAUDEXHUB_TOKEN";
const LEGACY_MCP_SERVER_NAME = "context-hub";

export type AgentClient = "claude" | "codex" | "cursor" | "antigravity";

type JsonObject = Record<string, unknown>;

function readJsonObject(file: string): JsonObject {
  if (!existsSync(file)) return {};
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${file} must contain a JSON object`);
  }
  return parsed as JsonObject;
}

/**
 * Add or replace one MCP server without disturbing other user configuration.
 * Config files contain credentials, so newly written files are owner-only.
 */
export function writeMcpJsonConfig(
  file: string,
  server: JsonObject,
): string {
  const root = readJsonObject(file);
  const existing = root.mcpServers;
  const mcpServers =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as JsonObject)
      : {};

  root.mcpServers = {
    ...mcpServers,
    [MCP_SERVER_NAME]: server,
  };
  delete (root.mcpServers as JsonObject)[LEGACY_MCP_SERVER_NAME];

  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(root, null, 2)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

export function registerCursorConfig(
  mcpUrl: string,
  token: string,
  home = os.homedir(),
): string {
  return writeMcpJsonConfig(path.join(home, ".cursor", "mcp.json"), {
    url: mcpUrl,
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function registerAntigravityConfig(
  mcpUrl: string,
  token: string,
  home = os.homedir(),
): string {
  return writeMcpJsonConfig(
    path.join(home, ".gemini", "config", "mcp_config.json"),
    {
      serverUrl: mcpUrl,
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

export function parseClientSelection(value: string): AgentClient[] {
  const normalized = value.trim().toLowerCase();
  if (normalized === "all" || normalized === "both") {
    return ["claude", "codex", "cursor", "antigravity"];
  }
  if (
    normalized === "claude" ||
    normalized === "codex" ||
    normalized === "cursor" ||
    normalized === "antigravity"
  ) {
    return [normalized];
  }
  if (normalized === "none" || normalized === "auto") return [];
  throw new Error(
    `Unknown client "${value}". Use claude, codex, cursor, antigravity, all, or none.`,
  );
}
