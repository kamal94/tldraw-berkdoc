# NestJS API for Cloudflare Containers (and any container runtime).
#
# In the cloud this image runs in "cloud mode" via env: D1 over the HTTP driver,
# R2 for blobs, Cloudflare Queues for events, Workers AI for embeddings, and
# Weaviate Cloud for vectors. Locally it runs against bun:sqlite by default.
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["bun", "run", "src/main.ts"]
