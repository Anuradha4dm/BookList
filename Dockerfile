# ---- build: install everything, build the two SPAs and the server ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 is a native module; these are needed if no prebuilt binary matches
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY client/admin/package.json client/admin/
COPY client/storefront/package.json client/storefront/
COPY client/ui/package.json client/ui/
COPY server/package.json server/
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime: only what `node server/dist/web/index.js` needs ----
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/booklist.db

# findRepoRoot() looks for package.json + client/; migrations are read from server/db/migrations
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/db/migrations server/db/migrations
COPY --from=build /app/client/admin/dist client/admin/dist
COPY --from=build /app/client/storefront/dist client/storefront/dist

RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "server/dist/web/index.js"]
