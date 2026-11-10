# Build context: the repository root (docker-compose.yml, service workspace).
# No syntax directive on purpose: the daemon's built-in frontend parses this file, its RUN --mount line included,
# and a directive would make every build fetch a frontend image from the registry (design 8.3).

FROM node:22.23.4-alpine AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
# Only what the install reads, so a change to sources alone reuses the install layer: the root package.json
# (corepack takes the pnpm version from packageManager), the lockfile, pnpm-workspace.yaml and every workspace
# package's manifest. A file the install starts to read (patches, a pnpmfile) goes here too.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/lesson-schema/package.json packages/lesson-schema/
COPY services/workspace/package.json services/workspace/
# One store for both Dockerfiles. compose builds web and workspace at once, and pnpm 10's docs say nothing about two
# installs sharing a store; locked makes the second RUN wait until the first releases the mount.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store,sharing=locked pnpm install --frozen-lockfile \
  && pnpm ls -r --depth -1 --parseable > /tmp/projects.txt && sort /tmp/projects.txt > /tmp/projects-installed
COPY . .
# A workspace package whose package.json is missing from the COPY lines above was not installed: stop here.
RUN pnpm ls -r --depth -1 --parseable > /tmp/projects.txt && sort /tmp/projects.txt > /tmp/projects-context \
  && { diff /tmp/projects-installed /tmp/projects-context \
    || { echo "workspace projects differ between the install and COPY . . (diff above): copy every package.json before the install"; exit 1; }; }
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
