import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseClientSelection,
  registerAntigravityConfig,
  registerCursorConfig,
} from "../src/cli/agent-connect.js";

function tempHome(): string {
  return mkdtempSync(path.join(os.tmpdir(), "context-hub-connect-"));
}

describe("agent connection config", () => {
  it("adds Cursor without replacing existing MCP servers", () => {
    const home = tempHome();
    const dir = path.join(home, ".cursor");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "mcp.json"),
      JSON.stringify({ mcpServers: { existing: { url: "https://example.test/mcp" } } }),
    );

    const file = registerCursorConfig("https://hub.test/api/mcp", "cxh_test", home);
    const config = JSON.parse(readFileSync(file, "utf8"));

    expect(config.mcpServers.existing.url).toBe("https://example.test/mcp");
    expect(config.mcpServers["context-hub"]).toEqual({
      url: "https://hub.test/api/mcp",
      headers: { Authorization: "Bearer cxh_test" },
    });
    if (process.platform !== "win32") {
      expect(statSync(file).mode & 0o777).toBe(0o600);
    }
  });

  it("writes the Antigravity remote-server schema", () => {
    const home = tempHome();
    const file = registerAntigravityConfig(
      "https://hub.test/api/mcp",
      "cxh_test",
      home,
    );
    const config = JSON.parse(readFileSync(file, "utf8"));

    expect(config.mcpServers["context-hub"]).toEqual({
      serverUrl: "https://hub.test/api/mcp",
      headers: { Authorization: "Bearer cxh_test" },
    });
  });

  it("parses one client or every supported client", () => {
    expect(parseClientSelection("codex")).toEqual(["codex"]);
    expect(parseClientSelection("all")).toEqual([
      "claude",
      "codex",
      "cursor",
      "antigravity",
    ]);
    expect(() => parseClientSelection("unknown")).toThrow("Unknown client");
  });
});
