# syntax=docker/dockerfile:1
# Build context: the repository root (docker-compose.yml, service web).

# An exact tag satisfies @academy/db's engines (>=22.22); no digest pin, as nothing would update it.
ARG NODE_IMAGE=node:22.23.4-alpine

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable

FROM base AS build
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
ENV NEXT_TELEMETRY_DISABLED=1
# Builds @academy/lesson-schema and @academy/db first; the export below imports the schema.
RUN pnpm turbo run build --filter=@academy/web^...
# ADR-0009: copy exactly the learner-visible course files, then delete course/ before next build, so
# output tracing can ship nothing from it (checks/, quiz.yaml, starter/ never reach the runner).
RUN pnpm --filter @academy/web exec tsx scripts/export-course.ts export /repo/course /out/course \
  && rm -rf /repo/course
RUN pnpm turbo run build --filter=@academy/web

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# No --chown: the code stays root-owned, so the runtime user cannot rewrite the server.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
# The custom server (#32, ADR-0011 item 2), compiled by the build script; it wraps the standalone Next server.
COPY --from=build /repo/apps/web/dist/server ./apps/web/server
# migrateDatabase reads the SQL migrations at startup; standalone tracing does not include them (design 0.2).
COPY --from=build /repo/packages/db/drizzle ./packages/db/drizzle
# The pages read the course at request time (ADR-0009 item 1); root-owned like the code.
COPY --from=build /out/course ./course
ENV COURSE_ROOT=/app/course
# The only path the server writes at runtime.
RUN mkdir -p apps/web/.next/cache && chown node:node apps/web/.next/cache
USER node
EXPOSE 3000
# Next's generated apps/web/server.js stays in the image, unused: it cannot relay the terminal's WebSocket.
CMD ["node", "apps/web/server/main.js"]
