# syntax=docker/dockerfile:1.7

# ---------- base: shared foundation ----------
FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable pnpm
ENV PNPM_HOME="/pnpm" \
    PATH="$PNPM_HOME:$PATH"

# ---------- deps: all dependencies (incl. dev) ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- dev: hot-reload development image ----------
FROM deps AS dev
COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests
ENV NODE_ENV=development
EXPOSE 8000
CMD ["pnpm", "dev"]

# ---------- build: tsc produces dist/ ----------
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# ---------- prod-deps: production-only dependencies ----------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

# ---------- runtime: final production image ----------
FROM node:22-slim AS runtime
WORKDIR /app
RUN groupadd -g 1001 app && useradd -u 1001 -g app -m -s /bin/bash app
COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=build     --chown=app:app /app/dist         ./dist
COPY --chown=app:app package.json ./
ENV NODE_ENV=production \
    PORT=8000
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:8000/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"
CMD ["node", "dist/node/index.js"]
