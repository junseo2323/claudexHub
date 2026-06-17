# Deployment (Phase 5)

The web app is a standard Next.js (App Router) server that talks to a local
SQLite file via the reused domain layer. It needs a **Node runtime** (not edge)
because of the native `better-sqlite3` / `sqlite-vec` modules and the local
embedding model.

## Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `AUTH_SECRET` | **prod** | HMAC key for session cookies. Set a long random value. |
| `HUB_DB_PATH` | no | SQLite path. Default `./data/hub.db`; use a mounted volume in prod. |
| `EMBEDDING_PROVIDER` | no | `local` (default), `openai`, or `noop`. Avoid `noop` in prod. |
| `OPENAI_API_KEY` | if openai | Required when `EMBEDDING_PROVIDER=openai`. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | optional | Enables GitHub OAuth; otherwise the demo login is used. |
| `AUTH_ALLOW_DEV` | optional | `1` to keep demo login enabled alongside GitHub OAuth. |

`GET /api/health` returns a readiness snapshot (DB status, card count, embedding
provider, uptime) and any config warnings. It responds `503` when the DB is
unreachable or a production config **error** (e.g. default `AUTH_SECRET`) is present.

## GitHub OAuth app

Create an OAuth app and set the **Authorization callback URL** to:

```
https://<your-host>/api/auth/github/callback
```

Then set `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` and a strong `AUTH_SECRET`.

## Docker

```bash
docker build -t context-hub .
docker run -p 3000:3000 \
  -e AUTH_SECRET="$(openssl rand -hex 32)" \
  -e EMBEDDING_PROVIDER=local \
  -v context-hub-data:/data \
  context-hub
```

The image runs `npm run migrate` on boot and serves on port 3000. The `/data`
volume persists the SQLite store (and, for the local provider, the model cache).

## Hosted demo (docker compose)

```bash
AUTH_SECRET=$(openssl rand -hex 32) docker compose up --build
```

Brings up the web app on port 3000 with a persistent `hub-data` volume. Set
`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` to enable GitHub OAuth (otherwise the
demo login is used).

## Multi-instance

- **Sessions** are stateless — an HMAC-signed cookie verified with `AUTH_SECRET`,
  so any instance validates any session (no shared session store needed). Use the
  same `AUTH_SECRET` on every instance.
- **Rate limits** live in the shared `rate_limits` table (`SqliteRateLimiter`), so
  per-IP limits hold across instances that share the database.
- Instances must therefore share the **same database**. A single shared SQLite
  file (one volume) works for a small deployment; for true horizontal scale across
  hosts, move to a networked DB and a Redis-backed limiter (see TODO).

## Without Docker

```bash
npm ci
npm run web:build
AUTH_SECRET=... NODE_ENV=production npm run web:start
```

## Security headers

`next.config.mjs` sets baseline headers (`X-Content-Type-Options`,
`X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`). Terminate TLS
at your load balancer / reverse proxy; session cookies are `Secure` in production.

## Go-live checklist

The codebase is deployment-ready; these are the operational steps to actually
ship (each needs a credential or a host — none are code changes):

1. **Secrets** — generate `AUTH_SECRET` (`openssl rand -hex 32`) and set it on
   every instance. `GET /api/health` returns `503` until this is set in
   production, so it doubles as a readiness gate.
2. **GitHub OAuth** — register an OAuth app, set the callback to
   `https://<host>/api/auth/github/callback`, and set `GITHUB_CLIENT_ID` /
   `GITHUB_CLIENT_SECRET`. (Without these, only the demo login is available.)
3. **Admins** — set `ADMIN_LOGINS` so `/status` isn't open to every user.
4. **Embeddings** — keep `EMBEDDING_PROVIDER=local` (no key, downloads the model)
   or set `openai` + `OPENAI_API_KEY`. Never `noop` in production.
5. **Deploy** — `AUTH_SECRET=… docker compose up --build`, or push the image to
   your host (Fly/Render/ECS). Mount a persistent volume at `/data`.
6. **Verify** — `curl https://<host>/api/health` returns `200`; the web app
   loads; `POST /api/mcp` answers with a token (hosted MCP).
7. **Publish the MCP package** (optional) — add an `NPM_TOKEN` repo secret, then
   `git tag vX.Y.Z && git push --tags` to trigger `.github/workflows/release.yml`
   (build → `npm publish` → GitHub release).

After step 7, agents can connect with `npx -y ai-agent-context-hub` (stdio) or
the hosted `/api/mcp` URL — see [`examples/`](./examples).

