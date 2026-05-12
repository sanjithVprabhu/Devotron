FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json ./
COPY apps/onboarding-web/ apps/onboarding-web/
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @veda/onboarding-web build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /repo/apps/onboarding-web/.next ./.next
COPY --from=build /repo/apps/onboarding-web/package.json ./package.json
COPY --from=build /repo/apps/onboarding-web/node_modules ./node_modules
EXPOSE 3002
CMD ["pnpm", "start"]
