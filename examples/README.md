# Connect an agent

Connect an agent directly to the hosted Context Hub. The command opens a
browser for GitHub sign-in, creates an API token, and updates the selected
agent's global MCP configuration.

## Quickstart

```bash
npx -y ai-agent-context-hub connect claude
npx -y ai-agent-context-hub connect codex
npx -y ai-agent-context-hub connect cursor
npx -y ai-agent-context-hub connect antigravity
```

Use `connect all` to configure every supported agent. Claude Code and Codex are
registered through their native CLIs. Cursor and Antigravity configuration files
are merged without removing existing MCP servers.

Once connected, the agent has the `search_context`, `get_context_card`,
`draft_context_card`, `submit_for_approval`, `publish_context_card`,
`record_feedback`, and `mark_stale` tools.
