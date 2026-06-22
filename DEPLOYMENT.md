# Deployment (Phase 5)

The web app is a standard Next.js (App Router) server that talks to a local
SQLite file via the reused domain layer. It needs a **Node runtime** (not edge)
because of the native `better-sqlite3` / `sqlite-vec` modules and the local
embedding model.

## Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `AUTH_SECRET` | **prod** | HMAC key for session cookies. Set a long random value. |
| `CLAUDEXHUB_DB_PATH` | no | SQLite path. Default `./data/claudexhub.db`; use a mounted volume in prod. |
| `EMBEDDING_PROVIDER` | no | `local` (default), `openai`, or `noop`. Avoid `noop` in prod. |
| `HF_CACHE_DIR` | no | Cache directory for local embedding models. Set it on persistent storage in prod. |
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
docker build -t claudexhub .
docker run -p 3000:3000 \
  -e AUTH_SECRET="$(openssl rand -hex 32)" \
  -e EMBEDDING_PROVIDER=local \
  -v claudexhub-data:/data \
  claudexhub
```

The image runs `npm run migrate` on boot and serves on port 3000. The `/data`
volume persists the SQLite store (and, for the local provider, the model cache).

## Hosted demo (docker compose)

```bash
AUTH_SECRET=$(openssl rand -hex 32) docker compose up --build
```

Brings up the web app on port 3000 with a persistent `claudexhub-data` volume. Set
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

After step 7, agents can connect with `npx -y claudexhub` (stdio) or
the hosted `/api/mcp` URL — see [`examples/`](./examples).

## Fly.io

The checked-in [`fly.toml`](./fly.toml) runs one 1 GB shared-CPU Machine in
Tokyo (`nrt`), mounts `hub_data` at `/data`, and keeps both SQLite
(`/data/hub.db`) and the local embedding model cache (`/data/models`) on that
volume. The service forces HTTPS and uses `/api/health` as its Fly readiness
check.

Fly app names are globally unique. Before creating the app, edit `app` in
`fly.toml` if `claudexhub-junseo2323` is unavailable. The final name
becomes both the default hostname and the GitHub OAuth origin.

### 1. Create the app and volume

Install and authenticate `flyctl`, then run from the repository root:

```bash
fly launch --no-deploy
fly volumes create hub_data --region nrt --size 1
```

Keep the volume in the same region as `primary_region`. One GB is sufficient
for the initial SQLite database and approximately 90 MB local model, but monitor
usage as data grows.

### 2. Configure GitHub OAuth and secrets

After the Fly app name is final, create a GitHub OAuth app under **Settings →
Developer settings → OAuth Apps → New OAuth App**:

- Homepage URL: `https://<app-name>.fly.dev`
- Authorization callback URL:
  `https://<app-name>.fly.dev/api/auth/github/callback`

The callback routes derive their origin from the incoming request, so the OAuth
app name and Fly hostname must match. Fly terminates TLS and forwards the HTTPS
request metadata; `force_https = true` redirects plain HTTP before authentication.

Store secrets in Fly's encrypted secret store, never in `fly.toml`:

```bash
fly secrets set \
  AUTH_SECRET="$(openssl rand -hex 32)" \
  GITHUB_CLIENT_ID="<github-client-id>" \
  GITHUB_CLIENT_SECRET="<github-client-secret>" \
  ADMIN_LOGINS="junseo2323"
```

Do not set `AUTH_ALLOW_DEV` in production. Without `ADMIN_LOGINS`, every
authenticated user is treated as an administrator. Without `AUTH_SECRET`,
`/api/health` returns `503` and the deployment cannot become ready.

### 3. Deploy

```bash
fly config validate
fly deploy
fly scale count 1
fly status
fly volumes list
```

This deployment must stay at exactly one Machine. A Fly Volume attaches to one
Machine, and the app writes a single SQLite database. Do not scale above one
until the database and rate limiter have moved to network services.

The container runs migrations before starting Next.js. If seed data is needed:

```bash
fly ssh console -C "npm run seed"
```

### 4. Verify

```bash
# Readiness must return HTTP 200.
curl -i https://<app-name>.fly.dev/api/health

# Open the web app and complete one GitHub login round trip.
fly apps open

# After issuing a token in /settings/tokens, verify hosted MCP.
curl -X POST https://<app-name>.fly.dev/api/mcp \
  -H "Authorization: Bearer clx_…" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Verify the authenticated HTTP search API.
curl -H "Authorization: Bearer clx_…" \
  "https://<app-name>.fly.dev/api/v1/search?q=kakao%20cookie&limit=5"
```

Finally, restart the Machine and inspect logs to confirm the model is reused
from `/data/models` rather than downloaded again:

```bash
fly machines list
fly machine restart <machine-id>
fly logs
```

The first local embedding request can briefly spike memory while ONNX loads the
model. Start with the configured 1 GB; if Fly logs show an out-of-memory exit,
change `memory` in `fly.toml` to `"2gb"` and redeploy.
