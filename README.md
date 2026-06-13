# AI Agent Context Hub — Phase 1 (Local MCP Prototype)

An **agent-first developer knowledge platform**. AI coding agents (Claude Code,
Codex, Cursor) read and write **Context Cards** — structured problem-solving
units — through an MCP server, so a fix solved once can be searched and reused
later instead of re-derived from scratch.

This repository is **Phase 1**: a local-first prototype. No web app, no OAuth, no
hosted endpoint yet — just a local SQLite store and a stdio MCP server you can
plug into Claude Code.

## What's here

- **MCP server** (`src/index.ts`) exposing 4 tools over stdio.
- **Local SQLite** store with **hybrid search**: FTS5 keyword + sqlite-vec
  embedding similarity, fused into a confidence score.
- **Brief-first retrieval**: `search_context` returns compact briefs; full card
  bodies are only fetched on demand to save tokens.
- **Redaction**: secrets (keys, JWTs, DB URLs, emails, …) are stripped before a
  card is stored or published.
- **Human approval**: agents create *drafts*; publishing requires an explicit
  approval step.
- A **dev CLI** and **seed data** (10 example cards).

## MCP tools

| Tool | Purpose |
| --- | --- |
| `search_context` | Hybrid search → **brief** results only (id, title, confidence, tokens_estimate, match_reason, fix_summary, risk). |
| `get_context_card` | Fetch one card; `mode` = `brief` \| `full` \| `agent_json` (compact, agent-optimized). |
| `draft_context_card` | Create a redacted **draft** from a solved problem (worklog/diff/conversation). |
| `publish_context_card` | Publish a draft after `approve=true`; re-scans for secrets and blocks if any remain. |

## Setup

```bash
npm install
cp .env.example .env          # adjust EMBEDDING_PROVIDER / HUB_DB_PATH if needed
npm run migrate               # create the SQLite schema
npm run seed                  # load 10 example cards
```

### Embedding providers

Set `EMBEDDING_PROVIDER` in `.env`:

- `local` (default) — transformers.js MiniLM-L6-v2 (384d). No API key; downloads
  ~90MB on first run.
- `openai` — requires `OPENAI_API_KEY` (`text-embedding-3-small`, sliced to `EMBED_DIM`).
- `noop` — deterministic hash embedding for tests/CI (no network).

Changing the provider or `EMBED_DIM` requires `npm run reindex`.

## Dev CLI

```bash
npm run cli -- list
npm run cli -- search "kakao oauth cookie not stored" --stack "Next.js,NestJS"
npm run cli -- get <card_id> --mode agent_json
npm run cli -- create --json ./card.json
npm run cli -- publish <card_id> --visibility public
npm run cli -- reindex
```

## Register in Claude Code

This repo ships a project-scoped `.mcp.json`:

```json
{
  "mcpServers": {
    "context-hub": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "env": { "EMBEDDING_PROVIDER": "local", "HUB_DB_PATH": "./data/hub.db" }
    }
  }
}
```

Or register it globally with absolute paths:

```bash
claude mcp add context-hub --env EMBEDDING_PROVIDER=local -- npx tsx /abs/path/to/src/index.ts
```

Then in Claude Code: confirm the tools appear, and try
`search_context("kakao oauth cookie not stored")`.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Run the MCP server from source (stdio). |
| `npm run build` | Bundle to `dist/`. |
| `npm run migrate` | Create/upgrade the SQLite schema. |
| `npm run seed` | Load example cards. |
| `npm run cli -- <cmd>` | Dev CLI (create/list/get/search/publish/delete/reindex). |
| `npm test` | Run the test suite (vitest, in-memory DB, noop embeddings). |
| `npm run typecheck` | `tsc --noEmit`. |

## Architecture

Core domain logic (storage, search, redaction, scoring, embeddings) lives in
`src/domain/` and `src/embeddings/` with **no MCP/SDK dependency**, so it's
reused by the MCP server, the CLI, the seed script, and tests. `src/mcp/` is a
thin adapter.

SQLite coordinates three tables, kept in sync inside a single transaction on
every write (no triggers — embeddings are computed in app code):

- `context_cards` — canonical rows (arrays/objects as JSON).
- `context_cards_fts` — FTS5 keyword index.
- `context_cards_vec` — sqlite-vec `vec0` cosine vector index.

> **Note on Phase 1 heuristics:** confidence scoring, the `estimatedTokensSaved`
> multiplier, and search fusion weights are provisional placeholders pending
> real reuse/verification telemetry (Phase 4 in the product plan).

## Security model

- Context cards are **reference material, not instructions** — tool descriptions
  state this to mitigate prompt injection.
- Drafts are private and unsearchable until a human publishes them.
- Redaction runs on draft creation **and** again as a publish-time gate.
