# Issue #1 design (architect phase): apps/web scaffold

Upstream facts: `plans/1-web-bootstrap-research.md` (2026-10-27) plus the facts re-verified on 2026-10-29 in
section 0. The first version of this design, with its review rounds 1-4 (security, architecture,
operations), is commit 3fea0fe (`git show 3fea0fe:plans/1-web-bootstrap-design.md`). This file replaces it
as one consolidated design: every review lesson of rounds 1-4 is kept. Only the tester section reuses
unchanged calls and the helpers file of that commit by reference (section 15 names each one).

## Revision 3: what changed (judge_design round 1 on Revision 2, 0/3)

Each finding was swept across the whole design for the same class of defect; every command changed here
was run in a scratch copy (section 0.7), never in the main checkout.

1. **S1, unlisted errors are guarded.** New U1b: `migrate` rejects with an unlisted `Error` whose message
   carries `canary-pass-u1b`, with a bare string, and with an `Error` whose `name` is a URL; the line names
   `Error` / `unknown`, the canary is in no `logError` and no `logInfo` call. U1 and U3 now also check both
   sinks (U3 with a canary in `databaseUrl`). Sweep: `name` itself is untrusted, so 4.2 prints it only when it
   is an identifier. Mutations 8b (iv) message for every error -> U1b red, (v) URL in the success line -> U3
   red.
2. **S2, the leak grep reads the secret in use.** Check 7b counts the root `.env` passwords (`:<pw>@`) and the
   whole `DATABASE_URL` through the helper `secret_hits`, guarded against empty values. Not the bare
   password: with the default `academy` it matches the pnpm banner and the folder path 4 times on correct
   work (run, 0.7). New check 7c: a canary `DATABASE_URL` through `pnpm dev` (a shell value wins over
   `loadEnvFile`, verified).
3. **A1, the ADR-0006 item 3 guard matches imports only.** The `design/` grep is a pattern file of import
   forms (`from "..."`, `import "..."`, `import(...)`, `require(...)`, `@import`, `url(...)`) plus any
   `design/system/proto.` reference. Run against the verbatim token block and the prescribed `copy.ts`
   comments: empty; against 9 import forms: 9 hits. The judge's simpler pattern matched `copy.ts` comments
   such as "from design/flows/ia.md" (run). Sweep of the other "stays empty" greps (Cyrillic, raw colour,
   `next/font`) against the prescribed files: no false hit.
4. **A2, the focus-ring exception.** Base layer adds `[tabindex="-1"]:focus-visible { outline-offset: -2px; }`
   (the README's whole rule is quoted in 2.1; its other exceptions concern elements #1 does not build). E3
   also asserts `main` matches `:focus-visible` with `outline-offset` `-2px`. Verified in Chromium 1.64.1 on a
   static page: Tab, Enter on the skip link focuses `main`, which matches `:focus-visible`, offset `-2px`
   (`2px` without the rule). E3 fallback stated.
5. **O1, the recovery hint only where it is true.** The hint is appended for stage `connect` only and worded
   so it is true for every connect failure (refused, unknown host, wrong password): "check that the database
   is running and DATABASE_URL points at it (docker compose up -d --wait db)". `lock` and `apply` keep their
   own `@academy/db` messages. New U1c (stages apply and lock: no hint) and mutation 8b (vi). Check 9e
   asserts the stage `apply` line carries no hint.
6. **O2, mutations written against formatted code.** Check 8d uses the whole-statement awk; run on the biome
   output (the declaration wraps to 5 lines), it yields main's original line and the web build fails with
   "Can't resolve '../drizzle'" (rc 1, 1 hit); green after restore. Sweep: 8a (CSS, not formatted by biome),
   8c (one token), 9c (whole lines of `.dockerignore`), 9e (the COPY is now prescribed on one line with a
   comment that does not repeat the path, so exactly 1 line goes) and 13b (both mutations run on the
   biome-formatted layout: valid syntax, only the intended lines change) hold; 8b now requires each red run
   to fail on a named assertion, not on a parse error.
7. **O3, no destructive teardown of the owner's state.** Call 0a records whether `academy_db-data`,
   `academy-web:local`, a running `db` and dangling `academy` images existed (run in a scratch clone: on this
   machine the volume exists, the image does not). The helper `stack_down` runs `down -v` only when the run
   created the volume. Calls 14-16, 17 and 20 are written out here, no longer reused by reference; 20 also
   restarts `db` if it was running, removes `academy-web:local` only if the run created it, and removes only
   the dangling `academy` images the run created (the old `docker image prune -f` removed every dangling image
   on the machine). Sweep of every destructive command in section 15: listed in 15 "Destructive commands".
   Call order fixed: 13b (needs `db`) now runs before 14-16.
8. **Non-blocking, applied.** `.dockerignore` gains `**/.npmrc`, `**/*.pem`, `**/*.key` (no tracked file
   matches); e2e checkout `persist-credentials: false`; a `NEXT_PUBLIC_*` note next to `loadEnvFile`; turbo
   `@academy/web#test` inputs include `$TURBO_ROOT$/design/system/tokens.css` (verified: the task hash moves on
   a tokens.css edit only with it) and 5 names who re-copies the block; section 16 records Stepan's decisions
   of 2026-10-29; the PR-body wording; E3 fallback.

## Revision 2: what changed and why

The branch merged main (8bee0e7). Main now has ADR-0006 and the design deliverables of #50, ADR-0007
(accepted) with `packages/db`, a reworked root config and CI, and recreated issues. Changes:

1. **Design contract (ADR-0006).** `app/globals.css` now carries `design/system/tokens.css` verbatim between
   `/* design-tokens:start */` and `/* design-tokens:end */`, and a Vitest test fails on any drift (ADR-0006
   item 1 makes the first dev task that adopts tokens add that check). Dark mode follows
   `prefers-color-scheme` through `.dark` on `<html>`, set by a 6-line inline script (verified, 0.4).
   The interface is Russian: `lang="ru"`, every Russian string in `lib/copy.ts`, copy taken from the
   `design/flows/ia.md` register only. The root layout has the R4 skip link "К содержимому". #1 does not
   build the dashboard, top bar, notifications region or any other designed page (section 2.2).
2. **The home page is a placeholder.** `/` is the dashboard route in `ia.md` (title and h1 "Главная"), owned
   by #29. #1's stub keeps issue criterion 1 ("home page with a list of courses") with h1 "Главная" and a
   list of stub course titles. It is not a design implementation; the PR body says so. Was: English h1
   "Courses", an English empty state, a shadcn Card.
3. **Startup migration (ADR-0007 item 8).** `instrumentation.ts` calls `migrateDatabase` before the server
   handles requests and calls `process.exit(1)` when it rejects. Verified (0.1): a throwing `register()`
   alone does NOT stop the server, it keeps listening and answers 500.
4. **`packages/db` needs a one-line change.** Turbopack bundles `@academy/db` even when it is listed in
   `serverExternalPackages`, and `new URL("../drizzle", import.meta.url)` in `migrate.ts` fails the build
   ("Module not found: Can't resolve '../drizzle'"), whatever `migrationsFolder` the caller passes (0.2).
   Both remedies in the ADR-0007 Consequences sentence therefore fail. `MIGRATIONS_FOLDER` becomes
   `path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle")`, which builds and resolves to
   `<repo or image root>/packages/db/drizzle` in dev and in standalone output. The image copies
   `packages/db/drizzle` there. An ADR-0007 amendment records it (section 12).
5. **Compose web depends on db**, `DATABASE_URL` is built from the `POSTGRES_*` variables with host `db`.
   `pnpm dev` needs the database too and reads the repository-root `.env` from `next.config.ts` (0.3).
6. **In-image migration test** (ADR-0007 Consequences): `apps/web/scripts/check-image-migrations.sh`, run in
   CI after `docker compose up`: applied migrations equal the journal, and a container started with an
   unreachable database exits non-zero without leaking the password.
7. **Stale-attempt sweep deferred to #34** (argued in 4.4; decided by Stepan, section 16).
8. **shadcn on Radix, not Base UI** (decision 12.2; decided by Stepan, section 16). shadcn 4.22.1 -> 4.23.0. No component
   is added in #1 (`init` only).
9. **Stale facts fixed.** `allowBuilds: esbuild: false` is already on main (step removed). The lockfile is
   now in pnpm's native format (the "normalize lockfile" commit is gone). Issue numbers: "#4 loads course/"
   is now #30, "#2 adds the db" is obsolete (db is in compose since #28). `@types/node` follows the repo's
   `^26.6.5`. CI job list is checks, content, db, pipeline, pipeline-types, design, compose; #1 replaces
   `compose` with `e2e`.
10. **Old guard that is now wrong:** "build prints 0 `filesystem access` warnings" (old checks 5 and 19).
    `@academy/db` imports `@academy/lesson-schema`'s index, which re-exports `validate.js` (node:fs). The
    build prints the Turbopack warning 3 times on correct work (0.2). The guard is dropped; the image
    content checks (canary `.env`, no secret in the image) keep what it protected (section 11).

Issue metadata (CLAUDE.md section 2): #1 has milestone M0 Foundation, is blocked by #50 (closed), blocks #29
and #30. Its epic (#51, "M0 Foundation") is closed; CLAUDE.md asks for a parent epic only for cross-milestone
or process work, which #1 is not. Nothing to fix.

## 0. Facts verified for this revision (2026-10-29)

Scratch monorepo `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy/6d233eca-f88c-48bf-8ce7-8d231a07c5ec/scratchpad/mono`
(the research one, with `packages/db` copied from main and added to the web app), Next 16.4.3, Turbopack
build, Postgres 17.6-alpine in a throwaway container.

0.1 **instrumentation.** `register()` runs once at server start (dev and standalone), never during
`next build` (`NEXT_PHASE=phase-production-build` guard, Next source). It runs after the port is bound, but
requests wait for it: a request sent 0.5 s after start, while `register()` slept 1.5 s, got 200 after
1.18 s. A thrown error is logged ("Failed to prepare server ... instrumentation hook") and the server keeps
running, answering 500: the process does not exit. `process.exit(1)` inside `register()` exits the
standalone server with code 1 and `next dev` with code 1. The working shape is
`if (process.env.NEXT_RUNTIME === "nodejs") { const m = await import("./<node module>"); await m.run(); }`
with the Node-only code in its own module (no edge-runtime warning for `process.exit` then).

0.2 **@academy/db in a Turbopack build.** Importing `@academy/db` fails the build with the current
`MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url))`, with and without
`serverExternalPackages: ["@academy/db", "drizzle-orm", "pg"]`: the workspace package is bundled either way.
With `path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle")` the build passes with and
without the option; at runtime the folder is `<standalone root>/packages/db/drizzle` (standalone) and
`<repo>/packages/db/drizzle` (dev). Standalone output does NOT contain the SQL files: without a copy the
server logged `MigrationError: applying migrations from <root>/packages/db/drizzle failed (unknown)` and
exited 1; after copying the folder there it logged success and created the six ADR-0007 tables plus one
`drizzle.__drizzle_migrations` row. The build prints `Dynamic filesystem access causes tracing of the whole
project` 3 times (from `lesson-schema/dist/validate.js` via `db/dist/vocabulary.js`); the standalone then
also carries `apps/web` sources (43 MB total). This relies on how Turbopack rewrites `import.meta.url`, an
internal behaviour: the in-image test (I1) is the guard.

0.3 **Root `.env` in dev.** `next dev` reads env files from `apps/web` only. `process.loadEnvFile(<root>/.env)`
(guarded by `existsSync`) at the top of `next.config.ts` made `DATABASE_URL` visible to `register()` in
`next dev`; migrations ran against the scratch Postgres.

0.4 **Theme script.** A root layout (server component) with `<html lang="ru" suppressHydrationWarning>` and
`<head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>`, where the script toggles `dark`
on `document.documentElement` from `matchMedia("(prefers-color-scheme: dark)")` and listens to `change`:
on the production standalone server Playwright saw class `""` (light) / `"dark"` (dark), the class followed
`emulateMedia` flips, and the console had 0 messages (no hydration or script warning).

0.5 **Compose.** `docker compose up -d --wait --wait-timeout 60` with a service that exits 1 under
`restart: unless-stopped` fails in 4 s (`container ... is unhealthy`, rc 1). `docker compose run --rm
--no-deps -e DATABASE_URL=<x> <svc>` overrides the service's `environment:` value, does not restart, and
returns the container's exit code.

0.6 **Versions** (`npm view`, 2026-10-29): next / create-next-app 16.4.3, react / react-dom 19.3.1,
@types/react(-dom) 19.3.0, tailwindcss / @tailwindcss/turbopack 4.3.3, shadcn 4.23.0, vitest 5.0.5,
@vitejs/plugin-react 6.1.2, jsdom 30.1.3, @testing-library/react 16.3.3, dom 10.4.2, jest-dom 7.0.1,
@playwright/test 1.64.1, typescript 7.0.2, @types/node 26.6.6 (repo uses ^26.6.5). Node 22 latest is 22.23.4;
`node:22.23.4-alpine` exists. No `timeout` binary on this Mac (use perl `alarm`, section 15).

0.7 **Revision 3 runs** (scratch dir `.../scratchpad/r3`, the `mono` scratch monorepo, and a scratch clone of
this branch at 8bee0e7; nothing ran in the main checkout):
- *Leak grep (S2).* `pnpm --filter @academy/web dev` in `mono` with `DATABASE_URL=postgres://academy:canary-pass-7b@127.0.0.1:1/academy`
  in the shell: rc 1, `MigrationError ... (ECONNREFUSED)`, canary 0 hits, so the shell value beats
  `process.loadEnvFile` (also `X=shell node -e 'process.loadEnvFile(f)'` with `X=file` in `f` prints `shell`,
  Node 22.23.1). In the same log `grep -cF academy` (the default `POSTGRES_PASSWORD`) gives 4: the pnpm
  banner and the folder path. `secret_hits` (section 15) on that log: 0; on a copy with
  `postgres://academy:academy@localhost:5432/academy` appended: 1.
- *design/ import grep (A1).* The pattern file of section 15 Call 5-6 on a scratch `apps/` holding
  `globals.css` (imports + markers + `design/system/tokens.css` verbatim) and a `copy.ts` with comments "Copy
  comes from design/flows/ia.md", "Imported from design/flows/ia.md (R4)", "// from design/flows/ia.md":
  no hit. On 9 files with `import "...design/system/proto.css"`, `import x from`, `export ... from`,
  `import(...)`, `require(...)`, `@import "..."`, `@import url(...)`, `url(../../design/...)` and
  `href="/design/system/proto.css"`: 9 hits. `(import|from|@import|url\().*design/` matched all three
  `copy.ts` comment lines.
- *Focus ring (A2).* Playwright 1.64.1 Chromium headless shell, static page with the base-layer rules, a
  `sr-only` skip link and `main#main tabindex=-1`: Tab focuses the link "К содержимому"; Enter -> `main` is
  `document.activeElement`, matches `:focus-visible`, `outline-offset` `-2px`, style `solid`, width `2px`;
  overriding the exception back gives `2px`.
- *Mutation 8d (O2).* The path.join declaration formatted by biome 2.6.3 (lineWidth 100) spans lines 19-23.
  The whole-statement awk of Call 8d turns it into main's original one-liner (byte-identical file); on a
  one-line input it changes nothing. Then `pnpm --filter @academy/db build && pnpm --filter @academy/web build`:
  rc 1, `Can't resolve '../drizzle'` 1 hit; restored: rc 0.
- *Mutation 13b.* A layout written per 3.1 and formatted by biome: the `<script>` element and its import are
  one line each; `grep -v themeScript` removes exactly those 2 lines and leaves valid TSX (biome reports only
  `<head></head>` formatting); `sed 's/href="#main"/href="#nowhere"/'` changes one line.
- *Docker bookkeeping (O3).* Call 0a run in the scratch clone under zsh (scratch dir substituted): prints
  `db volume: pre-existing | db running: no | academy-web:local: absent | root .env: created`, fingerprint
  OK. The Call 20 teardown logic run on a throwaway compose project (`r3lab`, own volume and image): plain
  `down` keeps the named volume, `down -v` removes it; images built by compose carry
  `com.docker.compose.project=<name>`; with no pre-existing volume and image, the volume and image are
  removed and nothing labelled is left. Not run against the `academy` project (it would touch Stepan's
  state).
- *turbo inputs.* turbo 2.11.10 in `mono`, `turbo run test --filter=@academy/web --dry=json`: with
  `"@academy/web#test": { "dependsOn": ["^build"], "inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/design/system/tokens.css"] }`
  the inputs list `../../design/system/tokens.css` (27 inputs) and the hash changes after a tokens.css edit;
  without the entry (26 inputs) the hash stays the same.
- *Repository facts.* No tracked `.npmrc`, `*.pem` or `*.key`. The Cyrillic grep over `docker-compose.yml`,
  `ci.yml`, `README.md`, `.env.example` is empty today. `@academy/db` exports the four listed error classes;
  `MigrationError` stages are `connect`, `lock`, `apply`, and the `connect` stage also covers a wrong
  password and an unknown host (its message carries the code, e.g. `28P01`).

## 1. Solution

- `apps/web`: Next 16.4.3 App Router, TypeScript 7 (Next's default `useTypeScriptCli`), Tailwind 4 CSS-first via
  `@tailwindcss/turbopack`, shadcn/ui 4.23.0 initialised on Radix with no components, the ADR-0006 token block,
  system-driven dark mode, a Russian placeholder at `/`.
- Startup: `instrumentation.ts` -> `lib/startup.ts` applies migrations with `migrateDatabase` and exits 1 on
  any failure, before the first request is served.
- Production: `output: "standalone"`, `apps/web/Dockerfile` (3 stages, `node:22.23.4-alpine`, repo root as
  context, code root-owned, runs as `node`), ships `packages/db/drizzle`.
- Compose `web` on `127.0.0.1:${WEB_PORT:-3080}`, `depends_on: db: service_healthy`, node-fetch healthcheck.
- Tests: Vitest (startup, token block, one component), Playwright against the compose stack (smoke, theme,
  skip link), the in-image migration script; CI `compose` job becomes `e2e`, `checks` gains a dirty-tree step.

## 2. Scope

### 2.1 What #1 takes from the design deliverables

| From | #1 takes | Because |
|---|---|---|
| ADR-0006 item 1, `tokens.css` | the whole file verbatim in `app/globals.css` between the markers, right after the `@import` lines; drift test U4 | the first dev task that adopts tokens owns the drift check; #29/#30 then only consume classes |
| `system/README.md` dark-mode rules | `.dark` on `<html>` from `prefers-color-scheme`, following changes; no toggle | the product UI has no theme toggle (the toggle is prototype chrome, `.proto-chrome`) |
| `system/README.md` focus ring | base layer: `:focus-visible` 2px solid `ring` outline, offset 2px; `[tabindex="-1"]:focus-visible` offset `-2px` (inset); no shadcn `outline-ring/50` | shadcn's 50 % halo halves the measured 3:1 contrast; one global rule beats per-page fixes. The README rule in full: "`:focus-visible` draws a 2px solid `ring` outline with a 2px offset, outside the element", with exceptions (a) elements focused programmatically with `tabindex="-1"` (`main`, headings) draw it inset, (b) the terminal frame draws it on `:focus-within`, (c) invalid inputs draw it in `destructive`, (d) DropdownMenu items draw it inset. #1 builds only (a): `main#main` is the skip-link target and spans the viewport, so an outside ring would be clipped. (b)-(d) belong to the pages that build those elements (#30, #29) |
| `system/README.md` type scale | nothing: Tailwind's default `font-sans` (a system stack) | "the app's font is a dev decision"; no next/font, so the build needs no network |
| `ia.md` R4 | skip link "К содержимому" as the first focusable element of every page (root layout), target `main#main` with `tabIndex={-1}` | applies to every page including sign-in; one place |
| `ia.md` vocabulary / copy | `lang="ru"`; brand "Академия" as the default `<title>`; `/` title and h1 "Главная" | `ia.md` closes the copy set; no invented strings |
| ADR-0006 item 3 | nothing from `proto.css` / `proto.js` | prototype-only. The item forbids a runtime import ("`rg -n "design/" apps/` lists no runtime import"), not the substring: the verbatim token block and the `copy.ts` comments name `design/...` files by design. The guard is the import-form pattern file of section 15 Call 5-6, which is empty on the prescribed files (0.7) |

### 2.2 What #1 does NOT build

- The dashboard (F4, F18; #29, #35), sign-in (#29), catalog and lesson pages (#30), not-found page.
- Top bar, user menu, notifications region and its live containers (R2), the `F6` region cycle (R3): they
  need the session (#29) or belong to the pages.
- Any shadcn component (no Button, Card, ...): `shadcn init` only. #29/#30 add what their pages use.
- Reading `course/` (#30): the course list is stub data.
- Auth, `AUTH_SECRET`, `WORKSPACE_SERVICE_URL`, any database read or write beyond migrations.
- The stale-attempt sweep (4.4), any DB client pool (`createDb`).
- A theme toggle, next-themes, next/font, i18n machinery, a `/api/health` route, a `start` script.
- A `./schema` subpath export in lesson-schema (would remove the fs-tracing warning; a contract change, and
  #30 reads `course/` with fs anyway).
- CI action-major upgrades.

## 3. Files

### 3.1 apps/web (new)

- `package.json`: name `@academy/web`, private, `"type": "module"`. Scripts (each added in the coder step
  that makes it pass): `dev: next dev`, `build: next build`, `typecheck: next typegen && tsc --noEmit`,
  `test: vitest run` (step 5), `test:e2e: playwright test` (step 8). No `start`, no `packageManager`, no
  `engines`. dependencies: `@academy/db: workspace:*`, `@academy/lesson-schema: workspace:*` (type-only
  import), `next 16.4.3`, `react 19.3.1`, `react-dom 19.3.1` (exact), plus what `shadcn init` installs and
  `globals.css` / `lib/utils.ts` import. devDependencies: `typescript ^7.0.2`, `@types/node ^26.6.5`,
  `@types/react ^19.3.0`, `@types/react-dom ^19.3.0`, `tailwindcss ^4.3.3`, `@tailwindcss/turbopack ^4.3.3`;
  step 5: `vitest ^5.0.5`, `@vitejs/plugin-react ^6.1.2`, `jsdom ^30.1.3`, `@testing-library/react ^16.3.3`,
  `@testing-library/dom ^10.4.2`, `@testing-library/jest-dom ^7.0.1`; step 8: `@playwright/test 1.64.1`
  (exact: the browser revision follows the version).
- `tsconfig.json`: extends `../../tsconfig.base.json`; overrides lib `["DOM","DOM.Iterable","ES2023"]`, module
  ESNext, moduleResolution Bundler, jsx react-jsx, noEmit, declaration false, allowJs, incremental, plugins
  `[{ "name": "next" }]`, types `["node"]`, paths `{"@/*": ["./*"]}` (no baseUrl). include
  `["next-env.d.ts","**/*.ts","**/*.tsx",".next/types/**/*.ts",".next/dev/types/**/*.ts"]`, exclude
  `["node_modules",".next/standalone"]`. Every field `next build` would inject is preset (research 3), so
  the build leaves the file untouched (check 4).
- `next.config.ts`: `repositoryRoot = path.join(import.meta.dirname, "../../")`; at the top, if
  `existsSync(path.join(repositoryRoot, ".env"))`, `process.loadEnvFile(...)` with a why-comment (Next
  reads env files from `apps/web` only; the repo keeps one root `.env`; the Docker build context excludes
  it, so the image never sees it; a variable already set in the shell wins, verified 0.7). A second line of
  that comment: any `NEXT_PUBLIC_*` variable in the root `.env` is inlined into the client bundle of a local
  `next dev` / `next build`, so the root `.env` never holds a secret under that prefix. Config: `output: "standalone"`, `outputFileTracingRoot: repositoryRoot`,
  `turbopack: { root: repositoryRoot, rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } }`,
  `agentRules: false` (why: `next dev` rewrites `AGENTS.md` when it detects an agent), `poweredByHeader:
  false`. No `serverExternalPackages` (0.2: no effect on the workspace package, builds identically without),
  no `cacheComponents` / `partialPrefetching` (#29/#30 decide with their data loading).
- `instrumentation.ts`: `register()` does only the verified shape of 0.1: under `NEXT_RUNTIME === "nodejs"`
  dynamically imports `./lib/startup-node` and awaits its `runStartup()`.
- `lib/startup.ts` (pure, unit-tested): `migrateOnStartup(deps: StartupDeps): Promise<void>` where
  `StartupDeps = { databaseUrl: string | undefined; migrate: (url: string) => Promise<void>; exit: (code:
  number) => never; logError: (line: string) => void; logInfo: (line: string) => void }`. Behaviour in 4.2.
  The four listed error types are recognised with `instanceof` against the classes `@academy/db` exports,
  never by `name` (any value can claim a name). The connect hint is a named constant `connectHint`.
- `lib/startup-node.ts`: `runStartup()` wires `process.env.DATABASE_URL`, `migrateDatabase` (default
  folder), `process.exit`, `console.error`, `console.log`. No logic of its own.
- `lib/copy.ts`: every Russian UI string of #1 as named constants (`brandName = "Академия"`, `homeTitle =
  "Главная"`, `skipLinkLabel = "К содержимому"`), each with the `ia.md` table it comes from in a comment
  (written as plain text, e.g. `// design/flows/ia.md, table "Vocabulary"`, never inside `url(...)` or a
  quoted import-like string, so the design/ import guard stays exact).
  Rule (README of apps/web is not added; the rule sits in this file's header comment): Cyrillic in
  `apps/web` appears only here and in `lib/courses.ts`'s stub data; tests import the constants.
- `lib/courses.ts`: `import type { Course } from "@academy/lesson-schema"`; `export type CourseSummary =
  Pick<Course, "id" | "title">`; `export const stubCourses: readonly CourseSummary[] = [{ id:
  "ai-for-developers", title: "ИИ для разработчиков" }]` (values from `course/ai-for-developers/course.yaml`);
  comment: stub until #30 reads `course/`.
- `lib/utils.ts`: as `shadcn init` writes it (the `cn` helper every `shadcn add` component imports).
- `components.json`: from `shadcn init` (Radix, rsc, tsx, aliases `@/components`, `@/lib/utils`,
  `@/components/ui`).
- `components/course-list.tsx`: `CourseList({ courses }: { courses: readonly CourseSummary[] })` -> `<ul>` with
  one `<li>` per course title. No empty state (no register copy exists for it; #29 replaces the page).
- `components/course-list.test.tsx` (U5).
- `app/layout.tsx`: `metadata = { title: { default: brandName, template: "%s" } }`; `<html lang="ru"
  suppressHydrationWarning>` (the theme script changes `class` before hydration); `<head>` holds the theme
  script (0.4; constant `themeScript` in `lib/theme-script.ts` with a why-comment); `<body>` starts with the
  skip link `<a href="#main" className="sr-only focus:not-sr-only ...">{skipLinkLabel}</a>`, then
  `{children}`. `LayoutProps<"/">`. No next/font.
- `app/page.tsx`: `metadata.title = homeTitle`; `<main id="main" tabIndex={-1}>` with `<h1>{homeTitle}</h1>`
  and `<CourseList courses={stubCourses} />`. Classes from the token theme only (no raw colours).
- `app/globals.css`: `@import` lines as `shadcn init` writes them (`tailwindcss`, `tw-animate-css`, the shadcn
  base stylesheet if init adds one); then `/* design-tokens:start */`, the exact bytes of
  `design/system/tokens.css`, `/* design-tokens:end */`; then `@layer base { * { @apply border-border; } body
  { @apply bg-background text-foreground; } :focus-visible { outline: 2px solid var(--ring); outline-offset:
  2px; } [tabindex="-1"]:focus-visible { outline-offset: -2px; } }` (the second rule is the README exception
  for programmatically focused elements, 2.1; its specificity wins regardless of order). Everything `init` wrote into `:root`, `.dark`, `@theme inline`, `@custom-variant` is removed
  (the block replaces it).
- `app/globals.test.ts` (U4; reads `design/system/tokens.css` with `readFileSync` at test time, never an
  import), `lib/startup.test.ts` (U1, U1b, U1c, U2, U3), `test/setup.ts` (`import
  "@testing-library/jest-dom/vitest"`), `vitest.config.ts` (plugins `[react()]`, `resolve: { tsconfigPaths:
  true }`, environment jsdom, include `**/*.test.{ts,tsx}`, exclude node_modules / .next / e2e, setupFiles
  `./test/setup.ts`; node-only tests set `// @vitest-environment node` in their first line).
- `app/favicon.ico` from the template; `public/.gitkeep`.
- `playwright.config.ts`: `defaultBaseUrl = "http://127.0.0.1:3080"` (comment: compose `WEB_PORT` default);
  `baseURL = process.env.E2E_BASE_URL ?? defaultBaseUrl`; testDir `./e2e`; forbidOnly in CI; retries 0;
  reporter `[["github"], ["html", { open: "never" }]]` in CI, `"list"` locally; use baseURL, trace
  retain-on-failure, screenshot only-on-failure; one chromium project; no webServer.
- `e2e/home.spec.ts` (E1-E3), `scripts/check-image-migrations.sh` (I1, I2), `Dockerfile` (section 7).

Never added (delete if a generator writes them): nested `pnpm-workspace.yaml`, `biome.json`, `packageManager`,
`AGENTS.md`, `CLAUDE.md`, `README.md`, `apps/web/.gitignore`, ESLint config, `public/*.svg`,
`components/ui/*`.

### 3.2 packages/db (one line plus its comment)

`src/migrate.ts`: `MIGRATIONS_FOLDER = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle")`.
The doc comment is rewritten so it does not lie: plain Node resolves it from `src/` and `dist/` (same
depth); Turbopack bundles this package even when listed in `serverExternalPackages`, evaluates
`import.meta.url` to the module's path under the tracing root, and fails the build on a `new URL()` of a
directory; a bundled consumer therefore ships `packages/db/drizzle` at `<root>/packages/db/drizzle`
(ADR-0007 amendment). The existing unit tests (`test/unit/migrations.test.ts`: folder absolute, journal
readable, SQL files match) keep covering it under plain Node. `packages/db` is CODEOWNERS-owned by Stepan.

### 3.3 Root files

- `package.json`: `"dev": "turbo run dev"`.
- `turbo.json`: `"dev": { "cache": false, "persistent": true, "dependsOn": ["^build"] }`; `test:e2e` gains
  `"passThroughEnv": ["E2E_BASE_URL"]` (strict env drops it otherwise; verified in round 2); new
  `"@academy/web#test": { "dependsOn": ["^build"], "inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/design/system/tokens.css"] }`,
  because U4 reads a file outside the package: without the entry a local `pnpm test` replays a cached
  green U4 after a tokens.css change (0.7). CI has no turbo cache, so CI is right either way.
- `biome.json` `files.includes`: add `!**/next-env.d.ts`, `!**/playwright-report`, `!**/test-results`.
- `.gitignore`: `next-env.d.ts`.
- `.dockerignore` (new): `**/node_modules`, `**/.next`, `**/dist`, `**/.turbo`, `**/coverage`,
  `**/playwright-report`, `**/test-results`, `**/*.tsbuildinfo`, `**/next-env.d.ts`, `.git`, then `**/.env`
  and `**/.env.*` each alone on its own line (check 9c matches whole lines), then `**/.npmrc`, `**/*.pem`,
  `**/*.key` (a registry token or a key file must never reach the build context; no tracked file matches
  them today, 0.7, and pnpm's settings live in `pnpm-workspace.yaml`), then `.claude`, `backlog`,
  `plans`, `pipeline`, `learner`, `docs`, `design`, `scripts`, `tests`, `course` (comment: #30 removes
  `course` and copies it into the runner). Comment on the env lines: Docker anchors patterns at the context
  root, and standalone output copies `apps/web/.env*` into the image, so root-only patterns ship app-level
  env files. Never exclude `apps`, `packages`, `services` (the frozen install needs every importer), and
  never `packages/db/drizzle`.
- `docker-compose.yml`: header `# Start: docker compose up -d --build --wait (always --build: web is tagged
  academy-web:local and up without --build reuses a stale image)`; `web` service (section 8).
- `.env.example`: Web section: `WEB_PORT=3080`, `# E2E_BASE_URL=http://127.0.0.1:3080`; a comment above
  `POSTGRES_PASSWORD` that compose builds web's `DATABASE_URL` from it, so it must stay URL-safe (no `@ : / ?
  #`). `DATABASE_URL` stays localhost (dev and integration tests). `AUTH_SECRET` / `WORKSPACE_SERVICE_URL`
  stay commented (#29, #31).
- `.github/workflows/ci.yml`: section 9.
- `pnpm-lock.yaml`: regenerated by `pnpm install`.
- `docs/adr/0003-stack.md`, `docs/adr/0007-progress-data-model.md`: amendments (section 13).
- `README.md`: "Web app": `docker compose up -d --wait db` then `pnpm dev` (3000; the app exits if the
  database is down or a migration fails); `docker compose up -d --build --wait` (3080, `--build` after every
  change); one-time `pnpm --filter @academy/web exec playwright install chromium --only-shell`;
  `pnpm test:e2e`.

## 4. Startup migration

### 4.1 Where
`instrumentation.ts` `register()` (0.1): it runs in `next dev` and in the standalone server, not in
`next build`, and the server holds requests until it returns. The compose healthcheck therefore turns
green only after migrations, and `up --wait` fails when web exits.

### 4.2 Behaviour of `migrateOnStartup`
1. `databaseUrl` undefined or empty: `logError("web: DATABASE_URL is not set; start with the repository .env
   (pnpm dev) or the compose environment")`, `exit(1)`. `migrate` is not called.
2. `await migrate(databaseUrl)`; on success `logInfo("web: database migrations applied")` (a fixed string:
   never the URL).
3. On rejection: one `logError` line `web: database migration failed: <name>[ stage <stage>][: <message>][;
   <hint>]`, then `exit(1)`.
   - `<message>` only for `MigrationError`, `InvalidConnectionStringError`, `InvalidLockTimeoutError`,
     `InvalidMigrationsFolderError` (checked with `instanceof`), whose messages `@academy/db` guarantees
     free of the connection string (ADR-0007 item 9); `<stage>` only for `MigrationError`.
   - Any other value: `<name>` only, never `message`, `cause`, `stack` or the object. `<name>` is the
     value's `name` when it is an `Error` whose `name` matches `^[A-Za-z][A-Za-z0-9]{0,63}$`, else
     `unknown` (a `name` is as untrusted as a `message`). Never the URL, in any branch.
   - `<hint>` = `connectHint` = "check that the database is running and DATABASE_URL points at it (docker
     compose up -d --wait db)", only for `MigrationError` stage `connect`: true for every connect failure
     (refused, unknown host, wrong password `28P01`). Stage `lock` already says "another migrateDatabase may
     hold it" when that is true, stage `apply` says which folder failed and that nothing was applied; a
     database hint there would send the reader to the wrong layer (O1: seen live with a healthy db).
     The other error types name the bad value themselves; no hint.
4. `exit` is typed `never`; the function has no other side effect.

### 4.3 Failure at 3 AM
Database down when web (re)starts: exit 1, `restart: unless-stopped` retries with Docker's back-off until
db is back. Database dies while web runs: requests fail, web keeps running (no reconnect logic in #1; the
first reader, #29, owns pool errors via `createDb`'s `onPoolError`). Two web processes (a dev restart
overlapping): the advisory lock serialises them; the second waits up to 60 s (`MIGRATION_LOCK_TIMEOUT_MS`),
then exits 1 and is restarted. The db volume was initialised with another password than the current `.env`
(Postgres sets it only on first start; possible on Stepan's machine, where `academy_db-data` exists and the
root `.env` does not): stage `connect` with `28P01` plus the connect hint, which names the URL as the thing to
check; web restarts until the password matches. Nothing in #1 resets the volume.

### 4.4 Stale-attempt sweep: deferred to #34
ADR-0007 Consequences: "at startup marks every attempt still `running` as `error`". Not in #1, because:
(1) nothing in #1 or before #34 creates an attempt, so the statement always updates 0 rows and its only
test would hand-insert a user -> enrollment -> lesson_progress -> attempt chain for a feature that does not
exist; (2) ADR-0007's "Follow-ups for backlog 08" leave open whether the finish update may overwrite a swept
`error`, and the sweep and the finish writer must be decided and tested together; (3) the sweep needs a DB
client in `apps/web`, whose lifecycle and logging rule (ADR-0007: never the Drizzle error message) the first
writer owns. #1 leaves the seam: `runStartup()` is where #34 adds `sweepStaleAttempts()` after the migration.
Decided by Stepan on 2026-10-29: the sweep moves to #34, and the checkbox is already moved on GitHub
(section 16).

## 5. Design-system wiring

- Token block: section 3.1 `app/globals.css`. U4 enforces it. The tester's design-conformance step diffs it
  by hand too (ADR-0006 item 5; `.claude/agents/dev/tester.md` step 7).
- Who re-copies the block when a DESIGN PR changes `tokens.css` (ADR-0006 item 1: "dev picks the new file up
  by re-copying the block"): U4 turns that DESIGN PR's CI `checks` red, which is the signal. The design team
  cannot write `apps/`, so the orchestrator opens a dev HOTFIX issue "re-copy the token block", whose branch
  is cut from the DESIGN branch and whose PR targets it; the dev coder copies the file between the markers,
  nothing else. Once that PR is merged into the DESIGN branch, its CI is green and Stepan merges the DESIGN
  PR. `main` never carries a drifted block. This is a process note for the orchestrator, not a contract
  change (ADR-0006 already assigns the copy to dev).
- Dark mode: `lib/theme-script.ts` exports `themeScript`, an IIFE string: read `matchMedia("(prefers-color-
  scheme: dark)")`, `document.documentElement.classList.toggle("dark", query.matches)`, `addEventListener
  ("change", apply)`. Inline in `<head>` so it runs before first paint (no light flash in dark mode). It is
  the first inline script: a future Content-Security-Policy needs a nonce or hash for it (noted for whoever
  adds CSP).
- Design conformance (ADR-0006 item 5) is not applicable: #1 changes no page that has `design/pages/<slug>/`
  as a design implementation; `/` is a placeholder (Revision 2 item 2). The PR body says, under "Design
  deviations": "none. `/` is a scaffold placeholder, not an implementation of design/pages/dashboard; #29
  implements it." The raw colour grep of tester step 7 still runs and must be empty.

## 6. TypeScript

tsconfig per 3.1. `typecheck` = `next typegen && tsc --noEmit` (a clean checkout lacks the `LayoutProps`
globals). turbo `typecheck` keeps `dependsOn ^build` (lesson-schema and db types come from `dist/`). Never set
`useTypeScriptCli: false`. No `any`, no `as` (the baseURL narrowing in E1 uses a throw).

## 7. Dockerfile (`apps/web/Dockerfile`, context = repo root)

- `# syntax=docker/dockerfile:1`; `ARG NODE_IMAGE=node:22.23.4-alpine` (exact tag, no digest: no update bot;
  satisfies `@academy/db` engines `>=22.22`).
- base: `ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH`; `RUN corepack enable`.
- build: `WORKDIR /repo`; `COPY . .`; `RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install
  --frozen-lockfile`; `ENV NEXT_TELEMETRY_DISABLED=1`; `RUN pnpm turbo run build --filter=@academy/web...`
  (builds lesson-schema and db first).
- runner: `FROM ${NODE_IMAGE}`; `WORKDIR /app`; `ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
  HOSTNAME=0.0.0.0`; COPY without `--chown` (root-owned, world-readable): `/repo/apps/web/.next/standalone`
  -> `./`, `/repo/apps/web/.next/static` -> `./apps/web/.next/static`, `/repo/apps/web/public` ->
  `./apps/web/public`, and on one line `COPY --from=build /repo/packages/db/drizzle ./packages/db/drizzle`
  with the comment above it "migrateDatabase reads the SQL migrations at startup; standalone tracing does not
  include them (design 0.2)", which does not repeat the path, so check 9e removes exactly one line; `RUN mkdir -p apps/web/.next/cache &&
  chown node:node apps/web/.next/cache` (the only runtime write path); `USER node`; `EXPOSE 3000`; `CMD
  ["node", "apps/web/server.js"]`.
- No Dockerfile HEALTHCHECK (compose owns timings). Not done: `pnpm fetch`, `corepack prepare`, `pnpm deploy`.

## 8. Compose web

```yaml
web:
  build: { context: ., dockerfile: apps/web/Dockerfile }
  image: academy-web:local
  restart: unless-stopped
  depends_on:
    db: { condition: service_healthy }
  environment:
    DATABASE_URL: postgres://${POSTGRES_USER:-academy}:${POSTGRES_PASSWORD:-academy}@db:5432/${POSTGRES_DB:-academy}
  ports: ["127.0.0.1:${WEB_PORT:-3080}:3000"]
  healthcheck:
    test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
    interval: 5s
    timeout: 3s
    retries: 20
    start_period: 5s
```

Explicit `environment`, never `env_file: .env` (the root `.env`'s `DATABASE_URL` points at localhost, which
inside the container is web itself). Loopback only; 3080 so `pnpm dev` (3000) runs alongside; 127.0.0.1 not
localhost (alpine resolves ::1); the healthcheck probes `/` HTML only, independent of `.next/static` (check
13 relies on that).

## 9. CI (`.github/workflows/ci.yml`)

- Workflow-level `env: NEXT_TELEMETRY_DISABLED: 1`.
- `checks`: unchanged steps, plus a last step "fail if the build changed tracked files":
  `changes=$(git status --porcelain); if [ -n "$changes" ]; then echo "$changes"; git --no-pager diff; exit 1; fi`.
  U4 runs here through `pnpm test`, which is the ADR-0006 drift check in CI.
- `compose` replaced by `e2e` (name "compose stack and Playwright e2e", ubuntu-24.04, timeout 20; the trailing
  comment about adding an e2e job goes): checkout with `persist-credentials: false` (the job never pushes, and
  the token would otherwise sit in `.git/config` while third-party images build and run); `cp .env.example .env`; `docker compose config --quiet`;
  `docker compose up -d --build --wait --wait-timeout 180`; `docker compose ps`; pnpm/action-setup;
  setup-node (.nvmrc, cache pnpm); `pnpm install --frozen-lockfile`; `bash
  apps/web/scripts/check-image-migrations.sh` (name "migrations run inside the built image");
  `pnpm --filter @academy/web exec playwright install --with-deps --only-shell chromium`; `pnpm test:e2e`
  with `E2E_BASE_URL: http://127.0.0.1:3080`; on failure `docker compose ps -a > compose-ps.txt`, `docker
  compose logs --no-color > compose.log` and `actions/upload-artifact@v7` (apps/web/playwright-report,
  apps/web/test-results, compose.log, compose-ps.txt; retention 7); `if: always()` `docker compose down -v`
  (safe here: the runner is ephemeral and its volume was created by this job; never copied into local
  procedures, section 15).
- Other jobs' checkouts are left as they are (out of scope for #1; no job pushes).
- `db`, `content`, `pipeline`, `pipeline-types`, `design` unchanged. No branch protection exists (403 on the
  free plan), so renaming `compose` breaks no required check; Stepan checks `gh pr checks` before merging.

## 10. Tests (named, each with the run that proves it can fail)

| Id | Where | Behaviour | Negative run (section 15) |
|---|---|---|---|
| U1 | `lib/startup.test.ts` | "exits with 1 and logs the stage and the connect hint without the connection string when the connection fails": `databaseUrl` and the `cause` of a `MigrationError("connect", ...)` both hold password `canary-pass-u1`; `exit` called once with 1; the `logError` line contains `MigrationError stage connect` and `connectHint`; `canary-pass-u1` is in no argument of any `logError` or `logInfo` call | 8b (i) red at the exit assertion; (iii) red at the canary assertion |
| U1b | same | "logs only the name of an unlisted error, never its message" (`it.each`): migrate rejects with (a) `new Error("connect to postgres://academy:canary-pass-u1b@h/db failed")`, (b) the string `"postgres://academy:canary-pass-u1b@h/db"`, (c) an `Error` whose `name` is set to that URL; `exit` once with 1; the line contains `: Error` for (a) and `: unknown` for (b), (c); `canary-pass-u1b` in no `logError` / `logInfo` argument | 8b (iv): message printed for every error -> (a) red at the canary assertion |
| U1c | same | "adds the database hint only to connection failures" (`it.each` over `MigrationError("apply", "applying migrations from /x failed (unknown); no migration from this run was applied")` and `MigrationError("lock", "could not acquire the migration lock within 60000 ms (55P03): another migrateDatabase may hold it")`): the line contains `stage apply` / `stage lock` and the `@academy/db` message, and does not contain `connectHint` nor `docker compose` | 8b (vi): hint appended to every failure -> red at the "not contains" assertion |
| U2 | same | "exits with 1 without calling migrate when DATABASE_URL is missing" (undefined and `""`) | 8b (i) red at the exit assertion |
| U3 | same | "applies migrations and does not exit when the database is reachable": `databaseUrl` holds `canary-pass-u3`; migrate called once with it; exit never; `logInfo` called with the success line; `canary-pass-u3` in no `logError` / `logInfo` argument | 8b (ii) red at the migrate-call assertion; (v): URL in the success line -> red at the canary assertion |
| U4 | `app/globals.test.ts` | "carries design/system/tokens.css verbatim between the token markers": exactly one start and one end marker, start before end; bytes between them (minus the one newline after the start marker and before the end marker) equal `tokens.css`; only `@import` lines, blank lines and comments precede the start marker | check 8a: one token value edited in globals.css |
| U5 | `components/course-list.test.tsx` | "renders one list item per course with its title" (harness proof for jsdom + RTL + jest-dom) | check 8c: title rendered from `id` |
| E1 | `e2e/home.spec.ts` | "home page lists courses": `baseURL` narrowed by throw; listener on same-origin responses before `goto`; `goto("/")` ok; h1 `homeTitle` visible; one listitem with "ИИ для разработчиков" (from `stubCourses`); after `load`, at least one `/_next/static/` response; no same-origin response >= 400 | checks 12 (reachability), 13 (static assets) |
| E2 | same | "follows the system colour scheme": context `colorScheme: "dark"` -> `<html>` has class `dark`; `emulateMedia({ colorScheme: "light" })` -> class removed | check 13b: theme script removed |
| E3 | same | "skip link is the first stop and moves focus to main, which draws the inset ring": first Tab focuses a link named `skipLinkLabel`; Enter -> `main` is `document.activeElement`, `main.matches(":focus-visible")`, computed `outlineOffset` is `-2px` and `outlineStyle` `solid` (verified on a static page, 0.7). Fallback if Chromium under Next does not focus the fragment target: the coder turns the skip link into a small client component whose click handler calls `document.getElementById("main")?.focus()` (the `href` stays for no-JS) and E3 stays unchanged; the coder records which shape was needed | check 13b (skip link href changed -> red at activeElement); a mutation of the `[tabindex="-1"]` rule's `-2px` to `2px` in globals.css -> red at the offset assertion (Call 13b, third mutation) |
| I1 | `scripts/check-image-migrations.sh` | applied migrations in `drizzle.__drizzle_migrations` (via `docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc ...'`) equal `entries.length` of `packages/db/drizzle/meta/_journal.json` (read with node); prints `I1 OK applied=<n>` | check 9e: Dockerfile without the drizzle COPY -> `up --wait` red |
| I2 | same script | `docker compose run --rm --no-deps -e DATABASE_URL=postgres://academy:canary-pass-i2@db:1/academy web`, output captured: rc != 0, output contains `MigrationError stage connect` and `docker compose up -d --wait db` (the connect hint), output lacks `canary-pass-i2`; prints `I2 OK` | I2 is itself the image-level negative run of the startup exit; its own guard is U1's mutation (i), which makes the container exit 0 and I2 report `I2 FAIL rc=0` (run once in check 8b with an image rebuilt from the mutated file, optional) |
| G1 | CI dirty-tree step | build leaves the tree clean | check 18 |

The script exits 1 with `I1 FAIL ...` / `I2 FAIL ...` lines naming the expected and actual values; written
with `set -euo pipefail`, every captured command's status checked explicitly. Ids in output never start with
a bare PASS / FAIL token (judge vote parser).

## 11. Failure modes

| Failure | Mitigation | Caught by (seen red) |
|---|---|---|
| Migration fails, server serves 500 forever | `process.exit(1)` in startup (0.1) | U1; I2; 9e |
| `packages/db/drizzle` missing in image | explicit COPY | I1 via `up --wait`; check 9e |
| Bundler cannot resolve the migrations folder | path.dirname form (3.2) | web build; check 8d |
| Password in logs (allowed error's cause, unlisted error's message or name, success line) | 4.2 rule | U1, U1b, U3, I2 canaries; checks 7b (real secret), 7c (canary via `pnpm dev`); 8b (iii)-(v) |
| Recovery hint sends the reader to the wrong layer | hint only for stage `connect` | U1c; 8b (vi); check 9e line |
| Inset focus ring of `main` lost (clipped at the viewport edge) | `[tabindex="-1"]:focus-visible` rule | E3 offset assertion; Call 13b third mutation |
| `design/` file imported at runtime | import-form guard | Call 5-6 pattern file (positive control: 9 forms, 0.7) |
| Acceptance run deletes the owner's db volume or images | Call 0a records Docker state; `stack_down`; Call 20 removes only what the run created | 15 "Destructive commands" |
| Web starts before db | `depends_on: service_healthy`; restart on exit | up --wait |
| `pnpm dev` without DATABASE_URL / db down | root `.env` loaded; clear exit message | U2; check 7b |
| Token block drifts from tokens.css (edit, `shadcn add` rewrite, DESIGN PR) | U4 in `pnpm test`; turbo input on tokens.css; HOTFIX re-copy into the DESIGN branch (5) | check 8a; 0.7 turbo run |
| Light flash or wrong theme | head inline script | E2; check 13b |
| Build dirties tree | preset tsconfig, `agentRules: false`, gitignored next-env | CI step G1; check 4; check 18 |
| Missing Next types on a clean checkout | `next typegen` in typecheck | check 2-3 |
| App-level `.env*` shipped via standalone | `**/.env`, `**/.env.*` | check 9b canary; 9c red |
| Runtime user rewrites server code | root-owned, only `.next/cache` writable | check 9b |
| Missing static assets | explicit COPY; E1 assertion | check 13 |
| E1 listener late or filter never matching | listener before goto; URL.origin; non-vacuous assertion | check 13 |
| `E2E_BASE_URL` dropped by turbo | passThroughEnv | check 17 |
| Stale image | `--build` in header, README, CI | docs |
| Cyrillic outside UI copy | `lib/copy.ts` rule | check 5 |
| Negative run destroys pending work | backup -> mutate from backup -> restore with cmp, one call | `fp_check`; check 20 |
| Shell state lost between calls | helpers file sourced every call | preamble |
| Turbopack's `import.meta.url` rewrite changes in a Next upgrade | I1 in CI on every PR | I1 |

## 12. Key decisions (each with its because) and alternatives

1. **Migrations in `instrumentation.ts`**, because it is the one hook that runs in dev and standalone, before
   requests, and never at build (0.1). Rejected: a wrapper entrypoint (`node migrate.mjs && node server.js`):
   two processes to keep in sync and dev would not migrate; migrating in CI only: ADR-0007 item 8 says web.
2. **shadcn on Radix** (`shadcn@4.23.0 init -b radix`, `--no-monorepo --no-rtl`; the coder takes the preset
   name the CLI offers for Radix and records it), because the design system's inventory links
   `ui.shadcn.com/docs/components/radix/<name>` and its Button source is the Radix `new-york-v4` registry, so
   dev and design read the same component docs and ARIA. Rejected: Base UI (shadcn's default, the previous
   choice): every inventory reference would point at the other variant; switching later regenerates every
   component. Decided by Stepan on 2026-10-29, with the ADR-0003 amendment.
3. **Own 6-line theme script, not next-themes**, because the product has no toggle (only "follow the system"
   is needed), the script is verified warning-free (0.4), and a dependency for six lines fails the
   dependency rule. Rejected: CSS-only `prefers-color-scheme` (tokens.css is verbatim and keys dark on the
   `.dark` class).
4. **Drift check as a Vitest test in apps/web**, because it runs in `pnpm test` (CI `checks`) with no new
   tooling and lives with the file it guards. Rejected: a new `design_tokens.py` subcommand (changes the
   validator, part of the ADR-0006 contract); a shell step (no tests of its own).
5. **Root `.env` via `process.loadEnvFile` in next.config**, because the repo has one `.env` and Next reads
   only `apps/web/.env*`. Rejected: an `apps/web/.env` copy (two sources drift), dotenv-cli (dependency).
6. **No `serverExternalPackages`**, because it has no effect on the workspace package (0.2) and both builds
   ran identically; a no-op option misleads the next reader.
7. **Accept the fs-tracing warning**, because its cause is lesson-schema's index (a contract package) and #30
   reads `course/` with fs anyway; the canary checks cover the security side.
8. **Placeholder at `/` with register copy**, because issue criterion 1 asks for a home page with courses and
   `/` is #29's dashboard; register copy keeps the language rule. Rejected: building the dashboard (needs
   auth and progress, #29/#35); an English page (contradicts `lang="ru"` and the copy register).
9. **Connect hint only, name-or-unknown for unlisted errors** (4.2), because a log line is read at 3 AM by
   someone who acts on it: a hint must be true for the failure it is printed with, and a value from an
   unknown error (message or name) may carry the URL. Rejected: one hint for every failure (misinforms on
   `apply`, seen live); printing every `message` (U1b's canary shows what leaks).
10. **Tester teardown keyed on recorded state** (15), because since #28 the `db` volume is the owner's local
   database and the tester runs in the main checkout. Rejected: a separate compose project for the run
   (`academy-web:local` and port 5432 are shared with the owner's project anyway, and the dev server reads
   the root `.env` pointing at 5432).
11. Kept from the reviewed first version: standalone + 3-stage alpine image, root-owned code, loopback ports,
   compose-targeted e2e, workflow-level telemetry off, exact Playwright pin, no Docker HEALTHCHECK, no digest
   pin, no CI action-major upgrades.

## 13. ADR impact (Proposed text; Stepan accepts in the PR)

- **ADR-0003** amendment bullet: "shadcn/ui is initialised on Radix (`-b radix`), because the design system
  inventory (`design/system/README.md`) is written against shadcn's Radix docs; switching later means
  regenerating every component."
- **ADR-0007** amendment (Consequences, replaces the "Bundled consumers ..." sentence): "Next.js 16 with
  Turbopack bundles `@academy/db` even when it is listed in `serverExternalPackages`, and fails the build on
  `new URL("../drizzle", import.meta.url)`. `MIGRATIONS_FOLDER` is therefore computed with
  `path.dirname(fileURLToPath(import.meta.url))`, which Turbopack evaluates to the module's path under the
  tracing root; every image ships `packages/db/drizzle` at `<root>/packages/db/drizzle`; #1's
  `check-image-migrations.sh` runs in CI on every PR and guards it. The stale-attempt sweep ships with #34,
  the first issue that creates attempts." Item 9's "A bundled consumer passes an absolute `migrationsFolder`"
  stays true but is no longer sufficient; the amendment says so. Per item 10 this needs Stepan's approval:
  given on 2026-10-29 together with the `packages/db` change (section 16); he accepts the text in the PR.

## 14. Coder steps (each leaves the repo green)

1. Root prep: `.gitignore` next-env, biome excludes. Check `pnpm install`, `pnpm lint`.
2. packages/db: 3.2 change and comment. Check `pnpm --filter @academy/db test`, `pnpm --filter @academy/db
   build`.
3. Skeleton: `create-next-app@16.4.3` into the scratchpad only (`--ts --tailwind --app --no-src-dir
   --import-alias "@/*" --use-pnpm --skip-install --disable-git`, flags checked with `--help`); copy only
   `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `app/favicon.ico`; write package.json (dev, build,
   typecheck), tsconfig, next.config, placeholder page, `public/.gitkeep`; `pnpm install`. Check web
   typecheck, web build, `git status`.
4. shadcn: in apps/web `pnpm dlx shadcn@4.23.0 init -b radix --no-monorepo --no-rtl` (preset per decision 2);
   `pnpm format`; replace the theme part of `globals.css` with the token block and base layer (3.1); remove
   every component and dependency nothing imports (dependency rule: imported in code or CSS, a script
   binary, a required peer or `@types/*`, or the `cn` helper's packages). Check lint, build.
5. Shell and content: `lib/copy.ts`, `lib/theme-script.ts`, layout (lang, theme script, skip link),
   `lib/courses.ts`, `components/course-list.tsx`, page. Check `pnpm dev` (with db up) shows "Главная".
6. Startup: `lib/startup.ts`, `lib/startup-node.ts`, `instrumentation.ts`, root `.env` loading in
   next.config. Check: dev with db up logs "database migrations applied"; with db stopped exits 1.
7. Unit tests: `test` script, vitest devDeps, config, setup, U1, U1b, U1c, U2-U5. Check `pnpm test` and one
   red run each.
8. turbo `dev`, `test:e2e` passThroughEnv, `@academy/web#test` inputs, root `dev`. Check root `pnpm dev`;
   `pnpm turbo run test --filter=@academy/web --dry=json` lists `../../design/system/tokens.css` among the inputs.
9. Container: Dockerfile, `.dockerignore`, compose web + header, `.env.example`. Check `docker compose up -d
   --build --wait`.
10. e2e and image script: `test:e2e` + `@playwright/test`, config, E1-E3, `scripts/check-image-migrations.sh`.
    Check both against compose.
11. CI: workflow env, dirty-tree step, `e2e` replaces `compose`.
12. Docs: ADR-0003 and ADR-0007 amendments, README "Web app".

Commits (each with `Refs #1` in the body; the last also in the PR as `Closes #1`):
`fix(db): compute the migrations folder without a bundler-resolved url` (2);
`feat(web): scaffold apps/web with next.js, tailwind, shadcn/ui and design tokens` (1, 3-5, 7-8 without the startup tests);
`feat(web): apply database migrations at startup` (6, U1, U1b, U1c, U2, U3);
`build(web): add multi-stage dockerfile and compose web service` (9);
`test(web): add playwright smoke, image migration check and ci e2e job` (10-11);
`docs: record radix choice, bundler finding and web run commands` (12).

## 15. Tester acceptance checks

### Execution model (unchanged from the reviewed version; read first)
- Each Bash tool call is a NEW zsh: only files persist. Every fenced block below is ONE call; never split it.
- Fixed scratch dir `SCRATCH=/private/tmp/academy-tester-1` (outside the repo). If the sandbox refuses it,
  use the session scratchpad path, changed in exactly two places: the literal in Call 0a and the `SCRATCH=`
  line of helpers.sh.
- Every call after 0a starts with the preamble:
  ```sh
  . /private/tmp/academy-tester-1/helpers.sh || exit 1
  : "${SCRATCH:?}"
  restore_pending
  ```
- Mutation rules: `backup <file> || { echo "backup failed, nothing mutated"; exit 1; }` first; the mutation
  writes from `$SCRATCH/bak/<file>`, never in place; the red run's status is captured with `; echo "rc=$?"`;
  `restore <file>` later in the SAME call. Pending-diff files are never restored with git
  checkout/restore/stash/clean, and restoration is never "proved" with git status.
- Job control only inside `dev_start` (`bash -c 'set -m; ...'`). No `timeout` binary on macOS: bounded
  foreground runs use `perl -e 'alarm shift; exec @ARGV' <seconds> <command...>`.
- Calls running `docker compose up --build` or a full build pass `timeout: 600000`.
- For any `grep -c`, read the number and keep `|| true`.
- Run by the architect (0.7, in scratch copies): Call 0a in full, `secret_hits`, the Call 5-6 pattern file,
  the 8d awk with both builds, both 13b mutations on a formatted layout, the Call 20 Docker teardown logic on a
  throwaway compose project. Not run: everything that needs the written app. A command that fails for a
  reason other than the guarded defect: stop and report it as a design defect, do not improvise.
- Every mutation is written against the file as committed (biome-formatted) and replaces a whole statement
  or a single token; the call prints its diff, and the red run must fail at the named assertion or message,
  never on a parse, syntax or type error (`grep -nE 'SyntaxError|Transform failed|Failed to load|Failed to parse'`
  on the red output stays empty; read it).

### Destructive commands (swept for Revision 3)

The run happens in the main checkout on Stepan's machine, where `academy_db-data` (his local database since
#28) exists. Every destructive command and what bounds it:

| Command | Calls | Bound |
|---|---|---|
| `docker compose down` / `down -v` | 14-16, 17, 20 via `stack_down` | `-v` only when Call 0a found no `academy_db-data` |
| `docker compose stop db` | 7b | `up -d --wait db` in the same call |
| `docker compose stop web`, `exec -u root web rm -rf .../.next/static` | 12, 13 | containers of this run; recreated in the same call |
| `docker compose up --build` (retags `academy-web:local`) | 9a, 9c, 9d, 9e, 17 | 0a records the previous image id; 20 keeps a pre-existing tag, removes one this run created |
| `docker image rm` of dangling images | 20 | only `academy`-labelled dangling ids absent from 0a's list and not the pre-existing image id (replaces `docker image prune -f`, which removed every dangling image on the machine) |
| `rm -rf apps/web/.next ... packages/db/dist ... .turbo` | 2-4 | build outputs, regenerated by the same call |
| `rm .env` | 20 | only if 0a created it |
| `rm apps/web/.env` | 9d | the canary 9a wrote; 9a refuses if the file pre-existed |
| `git worktree remove --force "$SCRATCH/wt"`, `git -C "$wt" checkout` | 18, 20 | the throwaway worktree only |
| `rm -rf "$SCRATCH"` | 20 | exact path, clean fingerprint, no backup left |
| migrations applied to the db volume | 1, 7, 9a | forward-only, the migrations already on `main` (the same `migrateDatabase` Stepan's own `pnpm dev` runs); no `DROP`, no reset. If the pre-existing volume rejects the `.env` password (`28P01`), stop and report; never reset the volume |

### 0. Setup and fingerprint (after the coder; port 3000 free)

Call 0a (run in a scratch clone, 0.7; the helpers are 3fea0fe's verbatim plus `stack_down` and `secret_hits`):
```sh
[ ! -e /private/tmp/academy-tester-1 ] || { echo "stale /private/tmp/academy-tester-1: compare its bak/ files with the repo, report, do not delete blindly"; exit 1; }
mkdir -p /private/tmp/academy-tester-1 && git rev-parse --show-toplevel > /private/tmp/academy-tester-1/repo-path || exit 1
cat > /private/tmp/academy-tester-1/helpers.sh <<'EOF'
# Tester helpers for issue #1. Every Bash tool call is a fresh zsh: source this first, every call.
SCRATCH=/private/tmp/academy-tester-1
# next dev binds 3000 by default; dev_start refuses to run while anything already listens there.
DEV_PORT=3000
cd "$(cat "$SCRATCH/repo-path")" || return 1

fp() {
  {
    git diff HEAD --binary -- . ':(exclude)plans' ':(exclude).claude/feedback' ':(exclude)pipeline'
    git ls-files -o --exclude-standard -z -- . ':(exclude)plans' ':(exclude).claude/feedback' ':(exclude)pipeline' | sort -z | xargs -0 shasum
  } | shasum | cut -d ' ' -f 1
}
fp_check() {
  if [ "$(fp)" = "$(cat "$SCRATCH/fp0")" ]; then echo "fingerprint OK"; else echo "PENDING DIFF CHANGED"; return 1; fi
}

# A backup lives at $SCRATCH/bak/<repo-relative path> until restore() has copied it back and
# cmp has proved the copy; a file still under bak/ therefore means "mutated, not yet restored".
backup() {
  mkdir -p "$SCRATCH/bak/$(dirname "$1")" && cp "$1" "$SCRATCH/bak/$1" && cmp -s "$1" "$SCRATCH/bak/$1"
}
restore() {
  cp "$SCRATCH/bak/$1" "$1" && cmp "$1" "$SCRATCH/bak/$1" && rm "$SCRATCH/bak/$1" && echo "restored $1 (cmp OK)"
}
# Repairs whatever an earlier call left mutated, e.g. a call killed by its timeout mid-run.
restore_pending() {
  [ -d "$SCRATCH/bak" ] || return 0
  (cd "$SCRATCH/bak" && find . -type f) | while read -r leftover; do restore "${leftover#./}"; done
}

port_pids() { lsof -t -iTCP:"$DEV_PORT" -sTCP:LISTEN 2>/dev/null; }
# zsh rejects `set -m`; job control runs under bash so pnpm dev gets its own process group.
dev_start() {
  [ -z "$(port_pids)" ] || { echo "port $DEV_PORT busy before start: $(port_pids)"; return 1; }
  : > "$SCRATCH/dev.started"
  bash -c 'set -m; pnpm dev > "$1/dev.log" 2>&1 & echo $! > "$1/dev.pid"' _ "$SCRATCH"
}
dev_wait() {
  curl -fsS -o /dev/null --retry 90 --retry-delay 1 --retry-connrefused "http://localhost:$DEV_PORT/" \
    || { echo "dev server did not answer"; tail -n 40 "$SCRATCH/dev.log"; return 1; }
}
# Kills only a server this run started (dev.started): dev_start refused a busy port, so whatever
# listens on it while dev.started exists is ours.
dev_stop() {
  if [ ! -e "$SCRATCH/dev.started" ]; then
    [ -z "$(port_pids)" ] && { echo "port $DEV_PORT free"; return 0; }
    echo "port $DEV_PORT held by a process this run did not start: $(port_pids) (not killed)"; return 1
  fi
  [ -s "$SCRATCH/dev.pid" ] && kill -- -"$(cat "$SCRATCH/dev.pid")" 2>/dev/null
  rm -f "$SCRATCH/dev.pid"
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    pids=$(port_pids)
    [ -z "$pids" ] && { rm -f "$SCRATCH/dev.started"; echo "port $DEV_PORT free"; return 0; }
    # Fallback for children that left the process group (turbo/next may re-group them).
    [ "$attempt" -gt 3 ] && printf '%s\n' "$pids" | xargs kill 2>/dev/null
    sleep 1
  done
  echo "port $DEV_PORT STILL BUSY: $(port_pids)"; return 1
}

# The db volume holds the owner's local database since #28: delete it only if this run created it
# (Call 0a wrote dbvol-existed when it was already there).
stack_down() {
  if [ -e "$SCRATCH/dbvol-existed" ]; then docker compose down; else docker compose down -v; fi
}

# Counts the database secrets of the root .env in a log: both passwords in URL form and the whole
# DATABASE_URL. A bare password is not searched: the default "academy" is also the repo and package name.
secret_hits() {
  local pw url urlpw
  pw=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
  url=$(sed -n 's/^DATABASE_URL=//p' .env)
  urlpw=$(printf '%s\n' "$url" | sed -n 's#^[a-z]*://[^:/@]*:\([^@]*\)@.*#\1#p')
  [ -n "$pw" ] && [ -n "$url" ] && [ -n "$urlpw" ] \
    || { echo "LEAK CHECK NOT RUN: POSTGRES_PASSWORD, DATABASE_URL or its password empty in .env"; return 1; }
  echo "secret hits in $1: $(grep -cF -e ":$pw@" -e ":$urlpw@" -e "$url" "$1" || true) (expect 0)"
}
EOF
. /private/tmp/academy-tester-1/helpers.sh || exit 1
: "${SCRATCH:?}"
if [ -e .env ]; then :; else cp .env.example .env && echo created > "$SCRATCH/rootenv-created"; fi
# Docker state before the run, so later calls tear down only what this run created.
[ "$(docker compose config --volumes)" = db-data ] || { echo "compose volumes are not exactly db-data: update Call 0a and stack_down, stop"; exit 1; }
docker volume inspect academy_db-data >/dev/null 2>&1 && echo existed > "$SCRATCH/dbvol-existed"
docker image inspect academy-web:local --format '{{.Id}}' > "$SCRATCH/webimg0" 2>/dev/null || : > "$SCRATCH/webimg0"
docker compose ps --status running --services 2>/dev/null | grep -qx db && echo running > "$SCRATCH/db-was-running"
docker image ls -q --no-trunc --filter dangling=true --filter label=com.docker.compose.project=academy | sort > "$SCRATCH/dangling0"
echo "db volume: $([ -e "$SCRATCH/dbvol-existed" ] && echo pre-existing || echo absent) | db running: $([ -e "$SCRATCH/db-was-running" ] && echo yes || echo no) | academy-web:local: $([ -s "$SCRATCH/webimg0" ] && cat "$SCRATCH/webimg0" || echo absent) | root .env: $([ -e "$SCRATCH/rootenv-created" ] && echo created || echo pre-existing)"
port_pids && echo "3000 BUSY at start: stop and report" || echo "3000 free at start"
fp > "$SCRATCH/fp0" && echo "fp0=$(cat "$SCRATCH/fp0")" && fp_check
```
Expected on Stepan's machine today: `db volume: pre-existing`. The `.env` and Docker state are recorded
here, so Call 20 restores them even if a check in between failed.

Call 0b: as in 3fea0fe (README fingerprint red run; no destructive command).

Call order: 0a, 0b, 1, 2-4, 5-6, 7, 7b, 7c, 8a, 8b, 8c, 8d, 9a, 9b, 9c, 9d, 9e, 10, 11, 12, 13, 13b, 14-16, 17,
18, 20. 13b runs before 14-16 because `pnpm dev` needs `db`, which 14-16 takes down.

### Checks

Call 1:
```sh
# preamble
pnpm --version   # 10.28.0
pnpm install --frozen-lockfile; echo "install rc=$?"
docker compose up -d --wait db; echo "db rc=$?"
```

Call 2-4 (timeout 600000):
```sh
# preamble
rm -rf apps/web/.next apps/web/next-env.d.ts packages/lesson-schema/dist packages/db/dist .turbo apps/web/.turbo packages/lesson-schema/.turbo packages/db/.turbo
pnpm lint && TURBO_FORCE=true pnpm typecheck && TURBO_FORCE=true pnpm test && TURBO_FORCE=true pnpm build; echo "check3 rc=$?"
git status --porcelain
fp_check
```

Call 5-6:
```sh
# preamble
rg -n 'next/font' apps/web || echo "no next/font"
rg -n '[а-яА-ЯёЁ]' apps/web .dockerignore docker-compose.yml .github/workflows/ci.yml README.md -g '!apps/web/lib/copy.ts' -g '!apps/web/lib/courses.ts' || echo "Cyrillic only in copy.ts and courses.ts"
rg -n '[а-яА-ЯёЁ]' apps/web/lib/copy.ts apps/web/lib/courses.ts   # read: string literals only, no comment
# ADR-0006 item 3: no runtime import of design/ (import forms only; comments and the token block may name files)
cat > "$SCRATCH/design-import.pat" <<'EOF'
(\bfrom\s+|\bimport\s*\(?\s*|@import\s+(url\(\s*)?|\brequire\s*\(\s*)["'][^"']*design/
url\(\s*["']?[^)"']*design/
design/system/proto\.
EOF
rg -n -f "$SCRATCH/design-import.pat" apps/ -g '!**/*.test.ts' -g '!**/*.test.tsx' || echo "no runtime import of design/"
printf 'import "../../design/system/proto.css";\n' | rg -c -f "$SCRATCH/design-import.pat" || echo "PATTERN DEAD"   # 1
rg -n '#[0-9a-fA-F]{3,8}\b|oklch\(|rgb\(|hsl\(' apps/web --glob '!**/globals.css' -g '!**/node_modules/**' -g '!**/.next/**' || echo "no raw colour"
rg -n ' as |!\.|baseURL!|<string>baseURL' apps/web/e2e apps/web/playwright.config.ts apps/web/lib || echo "no assertion candidates"
rg -n -A2 'baseURL === undefined' apps/web/e2e/home.spec.ts
TURBO_FORCE=true pnpm typecheck; echo "check6 rc=$?"
```
Any `as`, `!` or `<string>` on `baseURL` fails; other matches are read and justified in the report. The
design/ guard must print "no runtime import of design/" and the positive control `1`; a hit is read: a
comment that names a file is a design defect of this pattern (report it), an import is a code defect.

Call 7 (dev smoke, db up):
```sh
# preamble
dev_start || exit 1
dev_wait && echo "home=$(curl -s http://localhost:3000/ | grep -c '>Главная<' || true)"   # >= 1
grep -F 'database migrations applied' "$SCRATCH/dev.log" || echo "MISSING migration log line"
dev_stop
git status --porcelain | grep -F AGENTS.md || echo "no AGENTS.md"
fp_check
```

Call 7b (dev without database exits 1):
```sh
# preamble
docker compose stop db
perl -e 'alarm shift; exec @ARGV' 120 pnpm --filter @academy/web dev > "$SCRATCH/dev-nodb.log" 2>&1; echo "rc=$? (expect != 0, not 142 = alarm)"
grep -n 'database migration failed' "$SCRATCH/dev-nodb.log"   # MigrationError stage connect ... (ECONNREFUSED); check that the database is running ...
secret_hits "$SCRATCH/dev-nodb.log"   # "secret hits ...: 0"; "LEAK CHECK NOT RUN" is a failed check
docker compose up -d --wait db; echo "db back rc=$?"
port_pids && echo "3000 STILL BUSY" || echo "port 3000 free"
```

Call 7c (canary through the dev path; db state irrelevant, the URL points at a closed port):
```sh
# preamble
DATABASE_URL=postgres://academy:canary-pass-7c@127.0.0.1:1/academy perl -e 'alarm shift; exec @ARGV' 120 pnpm --filter @academy/web dev > "$SCRATCH/dev-canary.log" 2>&1; echo "rc=$? (expect != 0, not 142 = alarm)"
grep -n 'MigrationError stage connect' "$SCRATCH/dev-canary.log"   # 1 line, with the connect hint
echo "canary=$(grep -cF canary-pass-7c "$SCRATCH/dev-canary.log" || true) (expect 0)"
port_pids && echo "3000 STILL BUSY" || echo "port 3000 free"
```
The shell `DATABASE_URL` wins over the root `.env` (0.7); the line must show `ECONNREFUSED`, proving the
canary URL was the one used.

Call 8a (U4 guard):
```sh
# preamble
f=apps/web/app/globals.css
backup "$f" || { echo "backup failed, nothing mutated"; exit 1; }
sed 's/--radius: 0.625rem;/--radius: 0.5rem;/' "$SCRATCH/bak/$f" > "$f"
cmp -s "$f" "$SCRATCH/bak/$f" && echo "MUTATION DID NOT APPLY"
pnpm --filter @academy/web test; echo "red rc=$? (expect != 0, only U4 failing)"
restore "$f"
pnpm --filter @academy/web test; echo "green rc=$?"
fp_check
```

Call 8b (U1, U1b, U1c, U2, U3 guard): same shape on `apps/web/lib/startup.ts`, six mutations one after another, each
written from the backup (never from the previous mutation), with its diff printed, a "MUTATION DID NOT
APPLY" guard, its own red run and the parse-error grep of the execution model. Each is applied alone; the
expected red set is exact, every other test stays green:

| Mutation | Red (assertion) | Green |
|---|---|---|
| (i) exit code `1` -> `0` in the failure branches | U1, U1b, U1c, U2 (exit called with 1) | U3-U5 |
| (ii) `await migrate(...)` removed, success log kept | U3 (migrate called once); U1, U1b, U1c (exit called with 1: nothing rejects) | U2, U4, U5 |
| (iii) the `MigrationError`'s `cause` appended to its line | U1 (canary absent) | the rest |
| (iv) `message` printed for every `Error`, not only the four listed types | U1b case (a) (canary absent) | the rest, incl. U1b (b), (c) |
| (v) `databaseUrl` appended to the success line | U3 (canary absent) | the rest |
| (vi) `connectHint` appended for every failure | U1c (hint absent) | the rest |

The tester writes each `sed`/`awk` from the formatted code (a whole statement, or one token), prints the
diff, and reports which tests went red; a red set that differs from the table is reported, not explained
away. Restore and green run at the end.

Call 8c (U5 guard): `components/course-list.tsx`, `sed 's/{course\.title}/{course.id}/'` from the backup
(one token, independent of formatting), MUTATION DID NOT APPLY guard; U5 red; restore; green.

Call 8d (bundler guard, timeout 600000; the awk replaces the whole statement, which biome wraps to 5 lines,
and would replace only that line if it were one line, 0.7):
```sh
# preamble
f=packages/db/src/migrate.ts
backup "$f" || { echo "backup failed, nothing mutated"; exit 1; }
awk 'skip { if (/;[[:space:]]*$/) skip = 0; next } /^export const MIGRATIONS_FOLDER/ { print "export const MIGRATIONS_FOLDER: string = fileURLToPath(new URL(\"../drizzle\", import.meta.url));"; if (!/;[[:space:]]*$/) skip = 1; next } { print }' "$SCRATCH/bak/$f" > "$f"
diff "$SCRATCH/bak/$f" "$f"   # the whole path.join statement -> the one-line new URL form, nothing else
cmp -s "$f" "$SCRATCH/bak/$f" && echo "MUTATION DID NOT APPLY"
(pnpm --filter @academy/db build && pnpm --filter @academy/web build) > "$SCRATCH/build-8d.log" 2>&1; echo "red rc=$? (expect != 0)"
grep -c "Can't resolve '../drizzle'" "$SCRATCH/build-8d.log" || true   # >= 1; a TS error instead is a failed check
restore "$f"
(pnpm --filter @academy/db build && pnpm --filter @academy/web build) > /dev/null 2>&1; echo "green rc=$?"
fp_check
```

Call 9a (canary + stack, timeout 600000): as in 3fea0fe Call 9a, without the `.env` line (0a handles it).

Call 9b (inspections): as in 3fea0fe Call 9b, with the `>Courses<` grep replaced by `>Главная<`, plus:
```sh
docker compose exec web ls /app/packages/db/drizzle/meta/_journal.json   # exists
docker compose logs web | grep -F 'database migrations applied'
bash apps/web/scripts/check-image-migrations.sh; echo "I1/I2 rc=$? (expect 0, prints I1 OK and I2 OK)"
docker compose restart web && docker compose up -d --wait web; echo "restart rc=$?"
bash apps/web/scripts/check-image-migrations.sh; echo "idempotent rc=$? (same applied count)"
```

Call 9c, 9d (env-pattern red run and clean rebuild with the canary): as in 3fea0fe.

Call 9e (drizzle COPY guard, timeout 600000):
```sh
# preamble
f=apps/web/Dockerfile
backup "$f" || { echo "backup failed, nothing mutated"; exit 1; }
grep -v 'packages/db/drizzle' "$SCRATCH/bak/$f" > "$f"
echo "removed lines: $(diff "$SCRATCH/bak/$f" "$f" | grep -c '^<' || true) (expect 1)"
docker compose up -d --build --wait --wait-timeout 120 web; echo "red rc=$? (expect != 0)"
line=$(docker compose logs web | grep -F 'database migration failed' | tail -1); echo "$line"   # stage apply, /app/packages/db/drizzle
echo "hint on apply line: $(printf '%s\n' "$line" | grep -cF 'docker compose up' || true) (expect 0)"
restore "$f"
docker compose up -d --build --force-recreate --wait web; echo "green rc=$?"
fp_check
```
The COPY is one line and its comment does not repeat the path (section 7), so exactly 1 line goes; any
other count is a failed check (read the diff).

Call 10 (compose and dev together), 11 (e2e), 12 (reachability), 13 (static guard): as in 3fea0fe (swept:
their only destructive commands act on this run's containers, see "Destructive commands"); check 13's
expected failure is E1's ">= 400" assertion. Call 18 (dirty-tree guard in a throwaway worktree): as in
3fea0fe, except the expected worktree listing: the first line after the preamble is
`git worktree list > "$SCRATCH/worktrees0"`, and the last listing must equal it (`git worktree list | diff
"$SCRATCH/worktrees0" - && echo "worktrees as before"`), instead of a hard-coded list of names.

Call 13b (E2 and E3 guards, against `pnpm dev`):
```sh
# preamble
f=apps/web/app/layout.tsx
backup "$f" || { echo "backup failed, nothing mutated"; exit 1; }
grep -v 'themeScript' "$SCRATCH/bak/$f" > "$f"
diff "$SCRATCH/bak/$f" "$f"
dev_start || { restore "$f"; exit 1; }
dev_wait
E2E_BASE_URL=http://localhost:3000 pnpm --filter @academy/web exec playwright test -g "colour scheme"; echo "red rc=$? (expect != 0, class dark missing)"
dev_stop
restore "$f"
fp_check
```
The `grep -v` removes exactly the import and the `<script>` element (2 lines, verified on a biome-formatted
layout, 0.7); any other diff is a failed check. The same call shape, run twice more, each from its own
backup with its own red run against `-g "skip link"`:
- `layout.tsx`: `sed 's/href="#main"/href="#nowhere"/'` -> E3 red at the `activeElement` assertion;
- `app/globals.css`: `sed 's/outline-offset: -2px;/outline-offset: 2px;/'` (one token; `tokens.css` has no
  `outline-offset`, so only the exception rule changes, on one line or several, run 0.7) -> E3 red at the
  `outlineOffset` assertion only. U4 is not affected: the rule sits outside the token markers.

Call 19: removed (the filesystem-access guard is gone, Revision 2 item 10).

Call 14-16 (stack down without the owner's volume; static checks):
```sh
# preamble
stack_down; docker compose ps -a   # no rows
if [ -e "$SCRATCH/dbvol-existed" ]; then docker volume inspect academy_db-data >/dev/null && echo "db volume kept (pre-existed)"; fi
command -v actionlint >/dev/null && actionlint .github/workflows/ci.yml || echo "actionlint not installed: parse YAML another way"
fp_check
```
Check 15 deps audit and check 16 without actionlint: as in 3fea0fe.

Call 17 (port override, timeout 600000):
```sh
# preamble
WEB_PORT=3081 docker compose up -d --build --wait web; echo "rc=$?"
E2E_BASE_URL=http://127.0.0.1:3081 pnpm test:e2e; echo "e2e rc=$? (expect 0)"
stack_down
docker compose ps -a   # no rows
fp_check
```

Call 20 (final state; always run, even after a failed check):
```sh
# preamble
dev_stop                                   # ends with "port 3000 free"
stack_down; docker compose ps -a           # no rows
if [ -e "$SCRATCH/dbvol-existed" ]; then docker volume inspect academy_db-data >/dev/null && echo "db volume kept (pre-existed)"; else docker volume inspect academy_db-data >/dev/null 2>&1 && echo "DB VOLUME LEFT BEHIND" || echo "db volume created by this run: removed"; fi
if [ -e "$SCRATCH/db-was-running" ]; then docker compose up -d --wait db; echo "db running again, as found: rc=$?"; fi
if [ -s "$SCRATCH/webimg0" ]; then echo "academy-web:local pre-existed ($(cat "$SCRATCH/webimg0")): tag kept, now $(docker image inspect academy-web:local --format '{{.Id}}')"; else docker image rm academy-web:local >/dev/null && echo "academy-web:local created by this run: removed"; fi
docker image ls -q --no-trunc --filter dangling=true --filter label=com.docker.compose.project=academy | sort | comm -13 "$SCRATCH/dangling0" - | grep -vxF -f "$SCRATCH/webimg0" | while read -r id; do docker image rm "$id" >/dev/null && echo "removed dangling image of this run: $id"; done
git worktree list | grep -qF "$SCRATCH/wt" && git worktree remove --force "$SCRATCH/wt"
test ! -e apps/web/.env && echo "no canary"
if [ -e "$SCRATCH/rootenv-created" ]; then rm -f .env && echo "root .env created by this run: removed"; else echo "root .env pre-existed: kept"; fi
leftover=$(find "$SCRATCH/bak" -type f 2>/dev/null)
[ -z "$leftover" ] && echo "no unrestored backups" || echo "UNRESTORED: $leftover"
echo "fp0=$(cat "$SCRATCH/fp0")"; fp_check; fp_rc=$?
if [ "$fp_rc" = 0 ] && [ -z "$leftover" ] && [ "$SCRATCH" = /private/tmp/academy-tester-1 ]; then rm -rf "$SCRATCH" && echo "scratch removed"; else echo "scratch KEPT for inspection: $SCRATCH"; fi
```
The old image id of a pre-existing `academy-web:local`, untagged by the rebuilds, is left in place (it is
Stepan's); only dangling `academy` images that appeared during the run are removed.

Report: fp0, the Call 0a state line, every `restored ... (cmp OK)`, every `rc=`, `I1 OK` / `I2 OK`, both
`secret hits ...: 0` / `canary=0` lines, the 8b red sets against the table, `port 3000 free`, the Call 20
Docker lines, and "Design conformance: n/a, `/` is a placeholder (design section 5)" with the raw-colour grep
result.

## 16. Decisions by Stepan (2026-10-29)

The four open questions of Revision 2 were decided by Stepan on 2026-10-29:
1. **Stale-attempt sweep moves to #34** (4.4). Done on GitHub: the checkbox is on #34.
2. **Radix instead of Base UI** (decision 12.2), recorded by the ADR-0003 amendment (section 13).
3. **Placeholder at `/`** with h1 "Главная" and stub course titles (Revision 2 item 2); #1's criterion 1
   stays as written. PR-body wording in section 5.
4. **The `packages/db` change and the ADR-0007 Consequences amendment** (3.2, section 13): approved.

No open question remains for the design.

## 17. Unverified (the tester confirms)

- `shadcn@4.23.0 init -b radix` output: preset name, which files and dependencies it writes, whether it adds
  a `shadcn/tailwind.css` import (step 4).
- The skip link moving focus to `main` through the fragment in Chromium under Next (E3): verified on a
  static page with the same markup and CSS (0.7), not yet in the Next app; fallback in E3.
- Calls 14-16, 17, 20 against the real `academy` project (their Docker logic ran on a throwaway project, 0.7).
- `.next/standalone` tsconfig exclude survives the build (check 4).
- The whole thing on GitHub Actions (PR CI `checks`, `db`, `design`, `e2e` green).
- Turbopack's `import.meta.url` rewrite (0.2) is internal behaviour; I1 guards it on every PR.
