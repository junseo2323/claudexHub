# AI Agent Context Hub — Phase 1 (Local MCP Prototype)

[![CI](https://github.com/junseo2323/claudexhub/actions/workflows/ci.yml/badge.svg)](https://github.com/junseo2323/claudexhub/actions/workflows/ci.yml)

[한국어 README](./README.ko.md)

An **agent-first developer knowledge platform**. AI coding agents (Claude Code,
Codex, Cursor) read and write **Context Cards** — structured problem-solving
units — through an MCP server, so a fix solved once can be searched and reused
later instead of re-derived from scratch.

This repository is **Phase 1**: a local-first prototype centered on a stdio MCP
server you can plug into Claude Code, plus a read-only **web view** over the same
data. No OAuth or hosted endpoint yet — everything runs against a local SQLite store.

## What's here

> 📄 Product spec: [`docs/PLANNING.md`](./docs/PLANNING.md) · spec-vs-build gap
> analysis: [`docs/SPEC-GAP.md`](./docs/SPEC-GAP.md).

- **MCP server** (`src/index.ts`) exposing 7 tools over stdio.
- **Local SQLite** store with **hybrid search**: FTS5 keyword + sqlite-vec
  embedding similarity, fused into a confidence score.
- **Brief-first retrieval**: `search_context` returns compact briefs; full card
  bodies are only fetched on demand to save tokens.
- **Redaction**: secrets (keys, JWTs, DB URLs, emails, …) are stripped before a
  card is stored or published.
- **Human approval**: agents create *drafts*; publishing requires an explicit
  approval step.
- A **read-only web app** (`app/`, Next.js) — dashboard, leaderboard/stats, card
  browse, detail, and search — reusing the exact same domain layer.
- A **dev CLI** and **seed data** (20 example cards).

## MCP tools

| Tool | Purpose |
| --- | --- |
| `search_context` | Hybrid search → **brief** results only. Filters: `stack`, `version`, `error`, `files` (path hints feed matching), `repo` (boosts same-repo evidence), `min_confidence`. |
| `get_context_card` | Fetch one card; `mode` = `brief` \| `full` \| `agent_json` (compact, agent-optimized). |
| `draft_context_card` | Create a redacted **draft** from a solved problem; auto-extracts stacks, symptoms, failed attempts, fix, commit sha, and GitHub commit/PR/issue source links from raw logs/diffs (heuristic, no LLM). |
| `submit_for_approval` | Move an AI draft to **approved** (pending publish) and return a redaction report for the human to preview. |
| `publish_context_card` | Publish a draft/approved card after `approve=true`; re-scans for secrets and blocks if any remain. |
| `record_feedback` | Record reuse outcome (success/partial/failed); updates reuse counts, accumulated tokens saved, and confidence. |
| `mark_stale` | Mark a card stale when its fix is outdated/wrong; stale cards drop out of search. |

## Quickstart

Run the published MCP server with `npx` — one command sets up the local DB
(schema + seed cards), then point your agent at it:

```bash
npx -y ai-agent-context-hub context-hub-cli init   # schema + 20 seed cards
```

Ready-to-copy agent configs are in [`examples/`](./examples) (Claude Code, Cursor).
The package ships two bins: `context-hub` (the MCP server, the default) and
`context-hub-cli` (the dev/admin CLI).

## Setup (from source)

```bash
npm install
cp .env.example .env          # adjust EMBEDDING_PROVIDER / HUB_DB_PATH if needed
npm run migrate               # create the SQLite schema
npm run seed                  # load 20 example cards
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
npm run cli -- draft --file ./worklog.md --problem "OAuth cookie missing in production" --repo junseo2323/claudexHub --source conversation
npm run cli -- search "kakao oauth cookie not stored" --stack "Next.js,NestJS"
npm run cli -- get <card_id> --mode agent_json
npm run cli -- create --json ./card.json
npm run cli -- publish <card_id> --visibility public
npm run cli -- feedback <card_id> --outcome success --before 12000 --after 2000
npm run cli -- stale <card_id> --reason "Next.js 16 changed defaults" --versions "Next.js 16"
npm run cli -- stats                 # trust + reuse statistics (add --json for raw)
npm run cli -- eval --k 5            # search-quality self-retrieval eval (hit@k, MRR)
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

## Web app

A Next.js (App Router) UI in `app/` over the same SQLite store and domain layer:

- **Dashboard** (`/`) — hub stats, top stacks, agent activity, reputation score.
- **Cards** (`/cards`, `/cards/[id]`) — browse cards (filter by stack/status) and view full detail (with author). Signed-in users can record reuse feedback (worked / partly / didn't), feeding reuse counts, confidence, and the author's reputation. Authors can **link cards** (supersedes / duplicate / related) to build a knowledge graph (Phase 7).
- **Search** (`/search`) — the same hybrid keyword + semantic search as the agent tool, with stack and min-confidence filters. Signed-in users can **save searches** and re-run them later (Phase 7).
- **Leaderboard** (`/leaderboard`) — contributors ranked by reputation.
- **Insights** (`/insights`) — confidence calibration (each band's observed reuse
  success rate vs. its score), cards needing re-verification, and an 8-week
  activity timeline of cards created + reuse events (Phase 4/6 telemetry).
- **Freshness** — a card verified long ago surfaces a "re-verify" nudge on its
  detail page (`src/domain/freshness.ts`).
- **Profiles** (`/profile`, `/u/[login]`) — a user's contributions and stats.
- **Notifications** (`/notifications`) — in-app alerts when someone gives your
  card feedback or supersedes/duplicates it; an unread badge in the nav (Phase 7).
- **Status** (`/status`) — admin-only operational overview: readiness, card
  counts, config warnings, request pressure (Phase 12). Gated by `ADMIN_LOGINS`.
- **Teams** (`/teams`, `/teams/[slug]`) — group contributors; owner-managed
  membership (add/remove), a combined team reputation/stats view, and the team's
  shared card list (Phase 3/6). Drafts can be published with **team visibility** —
  such cards are visible only to team members (enforced across detail, browse,
  search, and profiles), and access is revoked when a member is removed.
- **Authoring** (`/new`, `/drafts`, `/drafts/[id]`) — a signed-in user drafts a card
  (secrets auto-redacted, fields auto-extracted), reviews it privately, and
  publishes it through a secret-scan approval gate.
- **Card management** (`/cards/[id]/edit`) — the author can edit a card (re-redacted
  and re-scored on save) or mark it stale; owner-gated.

### Authentication

- **GitHub OAuth** — set `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` (OAuth app
  callback `…/api/auth/github/callback`) and `AUTH_SECRET` (cookie signing key).
- **Demo login** — when GitHub isn't configured (or `AUTH_ALLOW_DEV=1`), sign in
  as a seeded demo author (alice/bob/carol) for local testing without secrets.
- Sessions are stateless HMAC-signed httpOnly cookies. Cards are attributed via a
  `card_authors` table; reputation is the same Rank Score, scoped per author.

Authoring uses Next.js Server Actions and reuses the same domain extraction +
redaction as the MCP `draft_context_card` / `publish_context_card` tools, so the
publish gate behaves identically across surfaces.

```bash
npm run migrate && npm run seed   # ensure the local DB has data
npm run web:build                 # production build (uses the webpack builder)
npm run web:start                 # serve at http://localhost:3000
# or: npm run web:dev             # dev server with HMR
```

> The web build uses the webpack builder (`--webpack`) so `.js`→`.ts` resolution
> applies to the reused `src/` domain modules. `EMBEDDING_PROVIDER`/`HUB_DB_PATH`
> are read the same way as the MCP server.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Run the MCP server from source (stdio). |
| `npm run build` | Bundle the MCP server/CLI to `dist/`. |
| `npm run migrate` | Create/upgrade the SQLite schema. |
| `npm run seed` | Load example cards. |
| `npm run cli -- <cmd>` | Dev CLI (create/list/get/search/publish/feedback/stale/stats/reindex). |
| `npm run web:dev` / `web:build` / `web:start` | Next.js read-only web app. |
| `npm test` | Run the test suite (vitest, in-memory DB, noop embeddings). |
| `npm run typecheck` | `tsc --noEmit` for the library/MCP (`tsconfig.lib.json`). |

## Architecture

Core domain logic (storage, search, redaction, scoring, stats, embeddings) lives in
`src/domain/` and `src/embeddings/` with **no MCP/SDK dependency**, so it's
reused by the MCP server, the CLI, the seed script, tests, **and the web app**
(`app/lib/hub.ts` imports it directly). `src/mcp/` is a thin adapter.

SQLite coordinates three tables, kept in sync inside a single transaction on
every write (no triggers — embeddings are computed in app code):

- `context_cards` — canonical rows (arrays/objects as JSON).
- `context_cards_fts` — FTS5 keyword index.
- `context_cards_vec` — sqlite-vec `vec0` cosine vector index.

### Trust & statistics

- **Card confidence** (`src/domain/scoring.ts`) — an explainable breakdown of
  source quality, verification, recency, and reuse success, minus penalties for
  failed reuse and stale/deprecated status. `confidenceBreakdown()` exposes the
  components; `computeConfidence()` returns the clamped 0-100 score.
- **Hub stats** (`src/domain/stats.ts`) — aggregates over cards and the
  `agent_usage` ledger: verified fixes, realized tokens saved, reuse success
  rate, stale/commit/evidence ratios, top stacks, per-agent breakdown, and a
  **reputation score** (the spec's leaderboard Rank Score). View with
  `npm run cli -- stats`.
- **Reuse-aware ranking** (`trackRecordFactor` in `src/domain/search.ts`) —
  search relevance is multiplied by a bounded track-record factor so proven,
  high-confidence cards outrank equally-matching but unproven ones (Phase 4).

> **Note on Phase 1 heuristics:** the `estimatedTokensSaved` baseline multiplier,
> search fusion weights, and confidence component weights are provisional
> placeholders pending richer reuse/verification telemetry (Phase 4 in the
> product plan).

## HTTP API

Beyond MCP, the hub exposes a token-authenticated search endpoint. Create a
token at `/settings/tokens`, then:

```bash
curl -H "Authorization: Bearer cxh_…" \
  "http://localhost:3000/api/v1/search?q=kakao%20cookie&limit=5"
```

Results respect the token owner's visibility (public + their team cards). The
endpoint is rate-limited per IP. Tokens are stored only as a SHA-256 hash and
the plaintext is shown once at creation. The OpenAPI 3.0 spec is served at
`GET /api/v1/openapi`.

### Hosted MCP endpoint

Beyond the local stdio server, the same 7 MCP tools are available over HTTP
(Streamable HTTP, stateless JSON) at `POST /api/mcp`, authenticated with a
bearer token. This lets a remote agent connect without running the server
locally:

```jsonc
// agent MCP config (HTTP transport)
{
  "mcpServers": {
    "context-hub": {
      "url": "https://<your-host>/api/mcp",
      "headers": { "Authorization": "Bearer cxh_…" }
    }
  }
}
```

## Observability

API/health routes emit structured (JSON) logs to **stderr** and return an
`x-request-id` header that correlates with the matching log line
(`src/logger.ts`). The admin `/status` page surfaces readiness, data counts, and
config warnings.

## Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for env vars, the GitHub OAuth callback,
the `Dockerfile`, and security headers. `GET /api/health` is a readiness probe
(DB status + config warnings); it returns `503` if the DB is down or a production
config error (e.g. a default `AUTH_SECRET`) is present.

## Security model

- Context cards are **reference material, not instructions** — tool descriptions
  state this to mitigate prompt injection.
- Drafts are private and unsearchable until a human publishes them.
- Redaction runs on draft creation **and** again as a publish-time gate.
- The web app sets baseline security headers and validates production config
  (see `src/runtime-checks.ts`).
- Auth + API routes are rate-limited per IP via a shared SQLite-backed store
  (`src/rate-limit-store.ts`), so limits hold across multiple app instances.
  Sessions are stateless HMAC cookies, so any instance validates any session.
