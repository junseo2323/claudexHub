# TODO / Deferred

Tracked follow-ups. Phases 1–4 are merged to `main` (CI green).

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

## Future phases

- [ ] **Phase 5** — hosted deployment, real GitHub OAuth app wiring
      (`GITHUB_CLIENT_ID`/`SECRET` are already supported, just unconfigured),
      and multi-tenant hardening.
