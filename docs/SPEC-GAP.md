# Spec ↔ Implementation gap analysis

Compares [`PLANNING.md`](./PLANNING.md) (the product spec) against what's in
`main`. Use this as the source of truth for "what's left to ship the MVP".

Status legend: ✅ done · 🟡 partial · ❌ missing · ➕ beyond-spec extra.

## MVP P0 (spec §11.2) — ✅ complete

| Spec item | Status | Where |
| --- | --- | --- |
| GitHub OAuth login | ✅ (env-gated; demo login fallback) | `app/api/auth/github/*`, `app/lib/auth.ts` |
| public/private context card authoring | ✅ | `/new`, `/drafts`, draft → publish |
| MCP `search_context` | ✅ | `src/mcp/tools/search-context.ts` |
| MCP `get_context_card` | ✅ | `src/mcp/tools/get-context-card.ts` |
| MCP `draft_context_card` | ✅ | `src/mcp/tools/draft-context-card.ts` |
| publish after approval | ✅ (`publish_context_card` approve gate + secret re-scan) | — |
| basic redaction | ✅ | `src/domain/redaction.ts` |
| user profile | ✅ | `/profile`, `/u/[login]` |
| estimated tokens saved | ✅ | `src/domain/scoring.ts`, `agent_usage` |
| context card detail page | ✅ | `/cards/[id]` |

## MVP P1 (spec §11.2) — 🟡 mostly done

| Spec item | Status | Note |
| --- | --- | --- |
| GitHub repo/commit/PR linking | ✅ | extraction GitHub refs + `source_links` + evidence `url`/`commit_sha` |
| Claude/Codex conversation log import | ✅ | `draft_context_card` `content`, CLI `draft --file` |
| agent feedback | ✅ | `record_feedback` + web feedback |
| leaderboards | ✅ | `/leaderboard` |
| stale marking | ✅ | `mark_stale` |
| **stack/version search filter** | 🟡 | stack ✅, **version filter ❌** |
| card confidence score | ✅ (simplified weights, not the §9 point system) | `computeConfidence` |

## MCP tools (spec §6.2) — 🟡 6 of 7

`search_context`, `get_context_card`, `draft_context_card`, `publish_context_card`,
`record_feedback`, `mark_stale` ✅. **`submit_for_approval` (Tool 4) ❌** — currently
folded into the draft→publish flow (publish requires `approve=true`).

## Dev order (spec §19)

- Phase 1 Local prototype ✅
- Phase 2 Web MVP ✅ **except "hosted MCP endpoint"** — only stdio transport
  today; no HTTP/SSE/Streamable HTTP MCP. ❌
- Phase 3 Git integration (repo/commit/PR evidence, diff draft, redaction, approval) ✅
- Phase 4 Agent feedback loop ✅
- Phase 5 Team/Pro — team workspace + visibility + member mgmt ✅; billing/SSO ➖ (out of MVP)

## Data model (spec §8)

Matches for User / ContextCard / SourceEvidence / AgentUsage. The **`Approval`**
entity (§8.5) is not a persisted table — approval is enforced via the publish
gate + redaction report. Acceptable for MVP; revisit if an audit trail of
approvals is needed.

## Security (spec §10) — ✅

Redaction (create + publish gate), human approval, prompt-injection framing
(cards are reference-not-instructions in tool descriptions), tool minimization.

## ➕ Beyond-spec (already built)

Deployment hardening (`/api/health`, Docker, security headers, config checks),
per-IP shared rate limiting, programmatic API tokens + `/api/v1/search`,
OpenAPI spec, search-quality eval harness + ranking-regression CI gate,
confidence calibration / activity insights, card relationships, saved searches,
in-app notifications, observability (structured logs + request id) + admin
`/status`, multi-instance support, publishable npm package + quickstart.

---

## Remaining to be "deployment-ready" (배포 직전)

Codeable here:

- [ ] **Hosted MCP endpoint** — Streamable HTTP transport so remote agents can
      connect (spec §6.2 / §12.4 / Phase 2).
- [ ] **`submit_for_approval` MCP tool** — spec tool parity (draft → submit → publish).
- [ ] **Search `version` filter** — finish P1 "stack/version 기반 검색 필터".
- [ ] **CI Docker build job** — build the `Dockerfile` in CI.
- [ ] **Release workflow** — tag → build → (publish) via GitHub Actions.

Requires external credentials / infra (do at deploy time, not codeable in CI):

- [ ] Register a real GitHub OAuth app; set `GITHUB_CLIENT_ID/SECRET` + `AUTH_SECRET`.
- [ ] `npm publish` the package.
- [ ] Deploy `docker compose` (or Fly/Render) to a public host.

Out of MVP scope (spec P2 / future): VS Code & browser extensions, billing/SSO,
networked datastore (Postgres + pgvector / Redis), notification email/webhook.
