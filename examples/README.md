# Connect an agent

Connect an agent directly to the hosted ClaudexHub. The command opens a
browser for GitHub sign-in, creates an API token, and updates the selected
agent's global MCP configuration.

## Quickstart

```bash
npx -y --package https://github.com/junseo2323/claudexHub/releases/download/v0.3.0/claudexhub-0.3.0.tgz claudexhub connect claude
npx -y --package https://github.com/junseo2323/claudexHub/releases/download/v0.3.0/claudexhub-0.3.0.tgz claudexhub connect codex
npx -y --package https://github.com/junseo2323/claudexHub/releases/download/v0.3.0/claudexhub-0.3.0.tgz claudexhub connect cursor
npx -y --package https://github.com/junseo2323/claudexHub/releases/download/v0.3.0/claudexhub-0.3.0.tgz claudexhub connect antigravity
```

Use `connect all` to configure every supported agent. Claude Code and Codex are
registered through their native CLIs. Cursor and Antigravity configuration files
are merged without removing existing MCP servers.

Once connected, the agent has the `search_context`, `get_context_card`,
`draft_context_card`, `submit_for_approval`, `publish_context_card`,
`record_feedback`, and `mark_stale` tools.
