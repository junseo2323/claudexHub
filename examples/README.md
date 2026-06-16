# Example agent configs

Drop-in MCP server configs for connecting an agent to the Context Hub.

## Quickstart

```bash
# 1. Create the local DB (schema + seed cards)
npx -y ai-agent-context-hub context-hub-cli init

# 2. Point your agent at the server (see the JSON files here)
```

- **`claude-code.mcp.json`** — Claude Code (project `.mcp.json`, or `claude mcp add`).
- **`cursor.mcp.json`** — Cursor (`~/.cursor/mcp.json` or project `.cursor/mcp.json`).

Both launch the published server via `npx -y ai-agent-context-hub`. Set
`HUB_DB_PATH` to a shared absolute path if multiple agents should read the same
hub, and `EMBEDDING_PROVIDER=openai` (with `OPENAI_API_KEY`) for hosted embeddings.

Once connected, the agent has the `search_context`, `get_context_card`,
`draft_context_card`, `publish_context_card`, `record_feedback`, and `mark_stale`
tools.
