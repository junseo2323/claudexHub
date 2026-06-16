# TODO / Deferred

Tracked follow-ups. Phases 1–11 are merged to `main` (CI green).

## Phase 4 polish (optional, low priority)

- [ ] **CLI `insights` command** — mirror the web `/insights` confidence-calibration
      view (`confidenceCalibration` in `src/domain/stats.ts`) on the dev CLI.
- [ ] **Search recency decay** — down-weight very old, unverified cards in
      `trackRecordFactor` (`src/domain/search.ts`). Careful: intrinsic confidence
      already encodes recency, so avoid double-counting.
- [ ] **Realized vs. estimated token savings** — on the card detail page, split
      measured savings (from `agent_usage`) from the heuristic baseline.

## Housekeeping

- [ ] Delete merged feature branches once no longer referenced:
      `phase-1-mcp-prototype`, `development-planning-50wu3q`, `card-editing`,
      `browse-filters`, `web-feedback`, `card-extras`, `phase-3-teams`,
      `phase-4-ranking`, `phase-4-insights`, `phase-4-freshness`.
      (Deferred to avoid disrupting parallel work in flight.)

## Phase 5 — deployment & hardening

Done: `/api/health` readiness probe + production config checks
(`src/runtime-checks.ts`), security headers, `Dockerfile` + `DEPLOYMENT.md`,
per-IP auth rate limiting (`src/rate-limit.ts`).

Remaining:

- [ ] **Real GitHub OAuth E2E** — verify the live `/api/auth/github` round trip
      against a registered OAuth app (needs real `GITHUB_CLIENT_ID`/`SECRET`;
      can't be exercised in CI).
- [ ] **Observability** — structured request logging + a request id.
- [ ] **CI Docker build** — add a workflow job that builds the `Dockerfile`.
- [ ] **Multi-instance** — move sessions + rate-limit state to a shared store
      (e.g. Redis) so more than one replica can run.

## Phase 6 — collaboration & analytics

Done: team card lists + owner member removal (access revoked on removal),
8-week activity timeline on `/insights`.

Remaining:

- [ ] **Org-level roles** — beyond owner/member (e.g. admin who can manage
      members but not delete the team).
- [ ] **Per-member / per-team trends** — extend `activityTimeline` to scope by
      team or author.

## Phase 7 — graph, search bookmarks & notifications

Done: card relationships (supersedes / duplicate / related), saved searches,
in-app notifications (feedback + supersede/duplicate events) with an unread badge.

Remaining:

- [ ] **Notification delivery** — email/webhook out, and a "mark single read".
- [ ] **Relationship graph view** — visualize supersedes chains across cards.

## Phase 8 — search eval & programmatic API

Done: search-quality eval harness (`eval` CLI: hit@1/hit@k/MRR/precision@k) and
token-authenticated `/api/v1/search` with `/settings/tokens` management.

Remaining:

- [ ] **Curated eval set** — hand-labelled query→card cases beyond self-retrieval,
      to catch ranking regressions on paraphrased / multi-relevant queries.
- [ ] **API surface** — add `/api/v1/cards/:id` (read) and write endpoints
      (draft/publish) behind tokens; per-token scopes.

## Phase 9 — quality gate & API spec

Done: ranking-regression gate (fixed corpus + labelled queries, runs in CI via
`npm test`) and an OpenAPI 3.0 doc at `GET /api/v1/openapi`.

Remaining:

- [ ] **Swagger UI** — render the OpenAPI doc as interactive HTML at `/api/docs`.
- [ ] **Broaden the gate** — add paraphrase/multi-relevant cases and a per-case
      report artifact when the gate fails.

## Phase 10 — packaging & DX

Done: publish-ready package (MIT, metadata, `files`, `context-hub` +
`context-hub-cli` bins, shebangs, `prepublishOnly`), one-command `init`
(schema + seed), example Claude Code / Cursor MCP configs, and an npx quickstart.

Remaining:

- [ ] **Actually publish to npm** — needs registry credentials + a real package
      name check (run `npm publish` from a release workflow).
- [ ] **Release workflow** — tag → build → publish via GitHub Actions + changelog.

## Phase 11 — multi-instance hardening

Done: shared SQLite-backed rate limiter (`SqliteRateLimiter`, `rate_limits`
table) so per-IP limits hold across instances; documented that sessions are
already stateless (HMAC) and multi-instance-ready; `docker-compose.yml` +
hosted-demo / multi-instance docs.

Remaining:

- [ ] **Networked datastore** — for horizontal scale across hosts, move off a
      single shared SQLite file (Postgres + pgvector, Redis-backed limiter).
- [ ] **Live hosted demo** — actually deploy `docker compose` somewhere public.

## Future phases

- [ ] **Phase 12** — observability (structured request logs + request id, basic
      metrics) and a status/admin page.
