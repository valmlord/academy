# Build context: the repository root (docker-compose.yml, service workspace).
# No syntax directive on purpose: the daemon's built-in frontend parses this file, and a directive would make
# every build fetch a frontend image from the registry (design 8.3).

FROM node:22.23.4-alpine AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# Builds @academy/lesson-schema first; the service imports its schema at runtime.
RUN pnpm turbo run build --filter=@academy/workspace...
# pnpm 10's deploy mode for a workspace without inject-workspace-packages; not a conflict bypass (16.5 H7).
RUN pnpm --filter @academy/workspace deploy --legacy --prod /out/workspace

FROM node:22.23.4-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# No --chown and no USER: the code stays root-owned, and the service runs as root without capabilities so it
# can open the root-owned Docker socket (ADR-0002 item 1). course/ is bind-mounted read-only, never copied.
COPY --from=build /out/workspace ./
CMD ["node", "dist/main.js"]
