# ── Build stage ──────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Outils nécessaires à la compilation de better-sqlite3 (node-gyp) au besoin.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build

# Retire les dépendances de dev (conserve better-sqlite3 déjà compilé).
RUN npm prune --omit=dev

# ── Runtime stage ────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/youtube.db

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Volume pour la base SQLite (persistance).
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000
CMD ["node", "dist/server.js"]
