# Web app (Next.js) container. Bundles the reused domain layer + MCP code.
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Build tools for the native modules (better-sqlite3, sqlite-vec).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Pages are server-rendered (force-dynamic), so the build does not touch the DB.
RUN npm run web:build

ENV NODE_ENV=production
ENV CLAUDEXHUB_DB_PATH=/data/hub.db
# Persist the SQLite store + model cache across restarts.
VOLUME ["/data"]
EXPOSE 3000

# Basic container healthcheck against the app's readiness endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply schema on boot, then serve.
CMD ["sh", "-c", "npm run migrate && npm run web:start"]
