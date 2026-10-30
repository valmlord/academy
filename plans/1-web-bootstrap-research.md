# Issue #1 research findings (researcher phase)

Verbatim researcher output, kept so architect, judges and coder work from the same facts.
Scratch monorepo used for experiments: `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy/6d233eca-f88c-48bf-8ce7-8d231a07c5ec/scratchpad/mono` (install, typecheck, vitest, next build, docker build + healthcheck, playwright all run there; no repo product files written).

## 1. Repo state
- package.json: `packageManager pnpm@10.28.0`, `engines.node >=22`; root devDeps biome ^2.6.3, turbo ^2.11.10, typescript ^7.0.2 (7.0.2 installed). Scripts: `lint`=`biome check .`; typecheck/test/test:e2e/build via turbo; `content:validate`=`pnpm --filter @academy/lesson-schema run validate ../../course`.
- .nvmrc `22`; local node 22.23.1; global pnpm 12.15.0 self-switches to 10.28.0 via packageManager.
- pnpm-workspace.yaml: apps/*, services/*, packages/*; no allowBuilds/onlyBuiltDependencies.
- turbo.json: build outputs `["dist/**", ".next/**", "!.next/cache/**"]`; typecheck/test/test:e2e dependsOn `^build`; test:e2e and test:integration cache:false; no env/passThroughEnv.
- tsconfig.base.json: ES2023, module/moduleResolution NodeNext, strict, noUncheckedIndexedAccess, verbatimModuleSyntax, declaration, isolatedModules; lib ES2023 only (no DOM).
- biome.json (2.6.3): includes only ts/tsx/js/mjs/cjs/json (CSS NOT included); excludes **/.next, **/dist, **/.turbo, **/node_modules; `linter.rules.preset: "none"`; formatter double quotes, semicolons, width 100.
- docker-compose.yml: project `academy`, only `db` (postgres:17.6-alpine), port `127.0.0.1:5432`, healthcheck pg_isready interval 5s timeout 3s retries 20, volume db-data; header says web is added by its issue.
- .env.example: web section commented (`AUTH_SECRET`, `WORKSPACE_SERVICE_URL=http://localhost:4100`); `DATABASE_URL` uses localhost:5432 (inside compose web would need host `db`).
- ci.yml (ubuntu-24.04): `checks` (install --frozen-lockfile, lint, typecheck, test, build), `content`, `pipeline`, `compose` (cp .env.example .env; compose config --quiet; up -d --build --wait; ps; down -v under if: always()). Line 70 comment: e2e job added with apps/web. Actions in use: checkout@v4, pnpm/action-setup@v4, setup-node@v4 (latest: checkout v7.0.1, setup-node v7.1.0, pnpm/action-setup v6.1.0, upload-artifact v7.0.2). Upgrade optional.
- .gitignore covers .next/, .turbo/, coverage/, playwright-report/, test-results/, *.tsbuildinfo, .env*. `next-env.d.ts` not ignored (Next template ignores it).
- No `.dockerignore`; needed for a root build context.
- ADR-0003: Next App Router, Tailwind, shadcn/ui, Biome, Vitest, Playwright, Node 22, pnpm+turbo. docs/architecture.md: apps/web reads the course only via `@academy/lesson-schema`, never talks to Docker.
- packages/lesson-schema: ESM, exports `.` -> `./dist/index.js` + d.ts (compiled; web needs `^build` first; transpilePackages not needed, build verified). Scripts build=`tsc -p tsconfig.build.json`, typecheck=`tsc --noEmit`, test=`vitest run` (vitest ^5.0.5), validate=`tsx src/cli.ts`. Deps zod ^4.6.7, yaml ^2.9.1. index.ts re-exports BOTH schema.js (pure zod) and validate.js (node:fs). No loader API: only `validateCourses(root)` returning counts/issues.
- course/: `course/ai-for-developers/course.yaml` (id, title, description, modules[6]) + 6 module.yaml (status planned, lessons []). Enough for a later course list; the stub does not need it.
- pnpm-lock.yaml is in a non-standard double-quoted format (lockfileVersion "9.0"); the first dep-changing install rewrites the whole file into pnpm's own format. Large but harmless diff.

## 2. Versions (npm view, 2026-10-27)
next/create-next-app 16.4.3 (node >=20.9; peers react ^19, optional @playwright/test ^1.51.1); react/react-dom 19.3.1; @types/react(-dom) 19.3.0; tailwindcss, @tailwindcss/postcss, @tailwindcss/turbopack 4.3.3; shadcn 4.22.1; vitest 5.0.5 (node ^22.12); vite 8.3.5; @vitejs/plugin-react 6.1.2; jsdom 30.1.3 / happy-dom 21.0.4; @testing-library/react 16.3.3, dom 10.4.2, jest-dom 7.0.1; @playwright/test 1.64.1 (chromium rev 1248); image `mcr.microsoft.com/playwright:v1.64.1-noble` exists; typescript 7.0.2 (7.1.0-beta); pnpm latest 12.15.0 (latest-10 = 10.34.9).

## 3. TypeScript 7 (tested)
- TS 7.0.2 has no classic compiler API (exports only lib/version.cjs; ./unstable/* only).
- Next 16.4.3 defaults `experimental.useTypeScriptCli: true` (config-shared.js:263): runs tsc as child process with explicit TS7 handling. With `useTypeScriptCli: false` Next throws asking for TS 6.
- `next build` with TS 7.0.2 works; injected type error -> TS2322, exit 1 (type check really runs).
- `tsc --noEmit` on apps/web passes, incl. `paths {"@/*":["./*"]}` without baseUrl, when apps/web tsconfig extends ../../tsconfig.base.json with overrides: lib DOM+DOM.Iterable+ES2023, module ESNext, moduleResolution Bundler, jsx react-jsx, noEmit, declaration false, allowJs, incremental, plugin next, includes next-env.d.ts, .next/types, .next/dev/types. verbatimModuleSyntax and noUncheckedIndexedAccess fine with shadcn output.
- GOTCHA: `next build` rewrites tsconfig.json if required fields missing (allowJs, incremental, esModuleInterop, resolveJsonModule, .next/dev/types include). Preset them or CI dirties the tree. With the overrides above it was left untouched.
- GOTCHA: typecheck on a clean checkout fails `TS2304 Cannot find name 'LayoutProps'` (global from .next/types + next-env.d.ts). `next typegen` generates them; after it `tsc --noEmit` passes. CI runs typecheck BEFORE build, so web `typecheck` must be `next typegen && tsc --noEmit` or avoid those globals.
- Vitest (oxc) and Playwright do not use the TS compiler API; both fine with TS 7.

## 4. Next 16.4.3 scaffold + standalone (tested)
- create-next-app generates its own pnpm-workspace.yaml (allowBuilds sharp/unrs-resolver false), its own biome.json (2.4.2), `"packageManager":"pnpm@12.15.0"` -> all three must be removed/overridden. Also @types/node ^20 and typescript ^5 -> align to ^22 / ^7.0.2. `.gitignore` with next-env.d.ts. `AGENTS.md` with a managed block.
- next.config.ts has `cacheComponents: true`, `partialPrefetching: true`; Tailwind wired as Turbopack loader (`turbopack.rules["*.css"].loaders: ["@tailwindcss/turbopack"]`), no postcss config. Layout loads Geist via next/font/google (network at build time; worked in Docker with network).
- `next dev` writes/re-adds a managed block in apps/web/AGENTS.md when it detects an AI agent; disable with `agentRules: false` in next.config (start-server.js:406). Matters for hooks / clean tree.
- Monorepo config that worked: `output: "standalone"`, `outputFileTracingRoot: path.join(import.meta.dirname, "../../")`, `turbopack.root` same. Standalone: `.next/standalone/apps/web/server.js` + pruned node_modules (~41 MB); lesson-schema bundled. Must copy `.next/static` -> `standalone/apps/web/.next/static` and `public` -> `standalone/apps/web/public`. server.js reads PORT, HOSTNAME (default 0.0.0.0).
- `next start` with standalone warns "does not work with output: standalone, use node .next/standalone/server.js" (still served in test). Playwright webServer should use standalone server.js, or target compose via baseURL.
- FINDING: importing `@academy/lesson-schema` from a page -> Turbopack warning "Dynamic filesystem access causes tracing of the whole project" (index re-exports validate.js with fs). Build still succeeds. Options: subpath export `./schema` in lesson-schema, `/*turbopackIgnore: true*/`, or don't import it in the stub. Changing lesson-schema exports touches the contract package (maybe ADR per CLAUDE.md).
- Docker build worked: node:22-alpine, `corepack enable` (corepack 0.36.0 bundled), `pnpm install --frozen-lockfile` with BuildKit cache mount, `pnpm turbo run build --filter=@academy/web...`, runner copies standalone+static+public as user `node` (uid 1000). Container healthy, page rendered, image 317 MB. Matches official examples/with-docker (3 stages, node:24.13.0-slim there, non-root, HOSTNAME=0.0.0.0).
- pnpm 10 `pnpm deploy` needs injectWorkspacePackages or --legacy; standalone makes deploy unnecessary.

## 5. Healthcheck tooling (tested)
- node:22-alpine has busybox wget, no curl. node:22-slim has neither.
- `node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"` works on both and made the container healthy. `/` is fine for the stub; dedicated health route optional.

## 6. Tailwind v4 + shadcn (tested)
- Tailwind 4.3.3 CSS-first (`@import "tailwindcss"`, `@theme inline`, `@custom-variant dark`), no tailwind.config. Next template uses @tailwindcss/turbopack; @tailwindcss/postcss path not tested.
- `shadcn@4.22.1 init -d --no-monorepo --no-rtl` in apps/web: components.json style "base-nova", tailwind.config "", baseColor neutral, cssVariables, iconLibrary lucide, aliases @/components, @/lib/utils, @/components/ui; writes components/ui/button.tsx, lib/utils.ts, rewrites app/globals.css. Deps: @base-ui/react ^1.9.0 (default base is Base UI, not Radix; `-b radix|base|aria`), class-variance-authority, lucide-react, cn ^0.5.0 (replaces clsx+tailwind-merge; lib/utils.ts = `export { cn } from "cn"`), shadcn ^4.22.1, tw-animate-css (globals.css imports shadcn/tailwind.css and tw-animate-css). `shadcn init --monorepo` untested.
- shadcn output has no semicolons -> root `pnpm lint` fails on generated files; run `biome format --write` after `shadcn add` or exclude components/ui.
- Biome 2.6.3 on Tailwind CSS needs `css.parser.tailwindDirectives: true`; only relevant if CSS is added to biome includes (today excluded).

## 7. Vitest (tested)
vitest 5.0.5 + @vitejs/plugin-react 6.1.2 + jsdom 30.1.3 + @testing-library/react 16.3.3 + dom 10.4.2 + jest-dom 7.0.1 (`import "@testing-library/jest-dom/vitest"` in setup). Vite 8 native `resolve: { tsconfigPaths: true }` resolves @/* (no vite-tsconfig-paths). Button component test passed; tsc typechecks tests. Without `"type": "module"` Vite warns about configLoader native default; with it next build, vitest, tsc all pass. Vitest must exclude e2e/ and .next. happy-dom not compared.

## 8. Playwright (tested locally)
@playwright/test 1.64.1, chromium rev 1248; `playwright install chromium --only-shell` enough for headless; `--with-deps` exists. Smoke spec (getByRole heading "Courses") with webServer+baseURL passed against next start (with the standalone warning). Playwright CI docs: install --with-deps, upload test-results/ and report as artifacts; caching browsers discouraged. Alternative: job `container: mcr.microsoft.com/playwright:v1.64.1-noble`. Against compose: `docker compose up -d --build --wait`, then Playwright with baseURL `http://127.0.0.1:<port>`.

## 9. pnpm 10.28 build scripts
`allowBuilds` (pnpm 10.26+) replaces onlyBuiltDependencies/ignoredBuiltDependencies (removed in pnpm 11; strictDepBuilds default true there). With 10.28 only warning "Ignored build scripts: esbuild@0.28.2" (via tsx/vite). sharp 0.35.5 from prebuilt @img/* without script warning; build/tests worked. Declaring `allowBuilds: { esbuild: false }` silences it and is pnpm-11-safe.

## Constraints
- CI order lint -> typecheck -> test -> build: web typecheck must generate Next types first (`next typegen`); turbo `^build` must build lesson-schema dist before web typecheck/build.
- Scaffold's nested pnpm-workspace.yaml, biome.json, packageManager must not land in apps/web.
- Docker build context = repo root -> root .dockerignore needed.
- web has no hard need for db in the stub; if depends_on db, use `condition: service_healthy`; DATABASE_URL inside compose uses host `db`.
- Port publishing follows db pattern (127.0.0.1 binding).
- next/font/google needs network during build (Docker and CI).
- next dev mutates apps/web/AGENTS.md unless `agentRules: false`.

## Open questions
1. shadcn base: default base-nova (Base UI) or Radix?
2. lesson-schema pure `./schema` subpath export (touches contract package) or stub does not import it yet?
3. e2e in CI: against compose stack (baseURL) or separate job with standalone server? Runner `--with-deps` or Playwright container?
4. Base image: node:22-alpine (wget, 317 MB, tested) or node:22-slim (glibc, no wget/curl)?
5. Keep cacheComponents / partialPrefetching from template?
6. Upgrade CI action majors?
7. Commit next-env.d.ts or gitignore it? Either way typecheck needs next typegen.

## Could not verify
@tailwindcss/postcss path with Next 16.4.3; happy-dom; `shadcn init --monorepo` on this repo; the full GitHub Actions run (all tests local macOS + Linux containers via Docker Desktop).
