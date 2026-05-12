# Multi-stage Dockerfile for the edge service.
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/kafka-client/package.json packages/kafka-client/
COPY db/package.json db/
COPY apps/edge/package.json apps/edge/
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY packages/ packages/
COPY db/ db/
COPY apps/edge/ apps/edge/
RUN pnpm --filter @veda/shared-types build && \
    pnpm --filter @veda/kafka-client build && \
    pnpm --filter @veda/db build && \
    pnpm --filter @veda/edge build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/db ./db
COPY --from=build /repo/apps/edge/dist ./dist
COPY --from=build /repo/apps/edge/package.json ./package.json
EXPOSE 8080
CMD ["node", "dist/index.js"]
