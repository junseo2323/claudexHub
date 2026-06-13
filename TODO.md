# TODO / Deferred

Tracked follow-ups. Phases 1–5 are merged to `main` (CI green).

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

## Future phases

- [ ] **Phase 6** — richer collaboration (team card lists, member removal UI,
      org-level roles) and analytics over time.
