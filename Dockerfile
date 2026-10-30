# syntax=docker/dockerfile:1.7
# Imágenes de ETT Eventos: `--target web` y `--target worker` (el worker también corre migraciones).

ARG NODE_IMAGE=node:22.22.0-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.18.3 --activate
WORKDIR /repo

# Dependencias (capa cacheable: solo cambia con el lockfile o los package.json)
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/ghl/package.json packages/ghl/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile

# Compilación de la web (salida standalone)
FROM deps AS build-web
COPY . .
RUN pnpm --filter @ett/web build

# Web: solo la salida standalone, usuario sin privilegios
FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build-web --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build-web --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

# Worker y migraciones: TypeScript ejecutado con tsx
FROM deps AS worker
ENV NODE_ENV=production
COPY --chown=node:node . .
USER node
WORKDIR /repo/apps/worker
CMD ["node_modules/.bin/tsx", "src/index.ts"]
