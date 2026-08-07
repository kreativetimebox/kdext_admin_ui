# syntax=docker/dockerfile:1
# Stage 1: dependencies
FROM node:20-slim AS deps

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
# Cache the npm download store across builds so repeat `npm ci` runs are fast.
RUN --mount=type=cache,target=/root/.npm npm ci

# Stage 2: builder
FROM node:20-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Persist Next's build cache across builds -> incremental rebuilds are much faster.
RUN --mount=type=cache,target=/app/.next/cache npm run build

# Stage 3: runner — Next standalone output (minimal, self-contained)
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3004
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

# standalone/ carries server.js + only the node_modules actually traced at build,
# so there's no full node_modules copy and no `npm prune` step.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3004

CMD ["node", "server.js"]
