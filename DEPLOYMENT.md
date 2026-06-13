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
