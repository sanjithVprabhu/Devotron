FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json ./
COPY tsconfig.base.json ./
COPY packages/shared-types/ packages/shared-types/
COPY apps/dashboard/ apps/dashboard/
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @veda/shared-types build && \
    pnpm --filter @veda/dashboard build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/dashboard/.next/standalone ./
COPY --from=build /repo/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=build /repo/apps/dashboard/public ./apps/dashboard/public
EXPOSE 3001
WORKDIR /app/apps/dashboard
CMD ["node", "server.js"]
