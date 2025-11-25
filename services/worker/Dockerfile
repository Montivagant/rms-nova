# syntax=docker/dockerfile:1.6

FROM node:20-slim AS builder
WORKDIR /app

ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig*.json ./
COPY packages ./packages
COPY services ./services

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @nova/module-registry build \
    && pnpm --filter @nova/auth build \
    && pnpm --filter @nova/rbac build \
    && pnpm --filter @nova/billing build \
    && pnpm --filter @nova/worker build
RUN pnpm deploy --filter @nova/worker --prod --no-link-workspace-packages /app/output

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/output/ ./

CMD ["node", "dist/index.js"]
