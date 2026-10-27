# Issue #1 design (architect phase)

Architect's design, verbatim in substance. Upstream facts: `plans/1-web-bootstrap-research.md`.

## 1. Solution
- `apps/web`: Next 16.4.3 App Router, TypeScript 7 (Next's default `useTypeScriptCli`), Tailwind 4 CSS-first via `@tailwindcss/turbopack` (tested path), shadcn/ui on Base UI (base-nova).
- Production: `output: "standalone"`, `apps/web/Dockerfile`, 3 stages, node:22-alpine, repo root as context, non-root runtime.
- Compose `web` on `127.0.0.1:${WEB_PORT:-3080}`, node-fetch healthcheck, no `depends_on` db (stub does not touch DB).
- Home page: heading + `CourseList` of stub data typed `Pick<Course, "id"|"title"|"description">`, `Course` via type-only import from `@academy/lesson-schema` (ADR-0001: no own course types; no contract change; import erased, so no Turbopack fs-tracing warning).
- Vitest+jsdom test of `CourseList`; Playwright smoke against the compose stack locally and in CI. CI `compose` job becomes `e2e`; `checks` gains a dirty-tree guard after build.

NOT built: DB access/Drizzle/`DATABASE_URL` in web; auth/`AUTH_SECRET`; loading `course/` (#4); `./schema` subpath export; health API route; i18n; dark-mode toggle; shadcn components beyond `card`; `start` script; CI action-major upgrades.

## 2. Files

### apps/web (new)
- `package.json`: `name @academy/web`, private, `"type": "module"`. Scripts: `dev: next dev`, `build: next build`, `typecheck: next typegen && tsc --noEmit`, `test: vitest run`, `test:e2e: playwright test`. No `start` (wrong with standalone; prod runs only in Docker). deps: `@academy/lesson-schema: workspace:*` (type-only now), `next 16.4.3`, `react 19.3.1`, `react-dom 19.3.1` (exact), plus shadcn deps actually imported. devDeps: `typescript ^7.0.2`, `@types/node ^22`, `@types/react`/`@types/react-dom ^19.3.0`, `tailwindcss ^4.3.3`, `@tailwindcss/turbopack ^4.3.3`, `vitest ^5.0.5`, `@vitejs/plugin-react ^6.1.2`, `jsdom ^30.1.3`, `@testing-library/react ^16.3.3`, `@testing-library/dom ^10.4.2`, `@testing-library/jest-dom ^7.0.1`, `@playwright/test 1.64.1` (exact: browser revision follows version). No packageManager/engines (inherited).
- `tsconfig.json`: extends `../../tsconfig.base.json`; overrides lib `["DOM","DOM.Iterable","ES2023"]`, module ESNext, moduleResolution Bundler, jsx react-jsx, noEmit, declaration false, allowJs, incremental, plugins `[{name:"next"}]`, paths `{"@/*":["./*"]}` (no baseUrl). Inherited from base: esModuleInterop, resolveJsonModule, isolatedModules, strict, noUncheckedIndexedAccess, verbatimModuleSyntax, skipLibCheck, target. include `["next-env.d.ts","**/*.ts","**/*.tsx",".next/types/**/*.ts",".next/dev/types/**/*.ts"]`, exclude `["node_modules",".next/standalone"]` (standalone exclude unverified: tester checks next build leaves tsconfig untouched).
- `next.config.ts`: `repositoryRoot = path.join(import.meta.dirname, "../../")`; `output: "standalone"`, `outputFileTracingRoot: repositoryRoot`, `turbopack: { root: repositoryRoot, rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } }`, `agentRules: false` with a why-comment. No cacheComponents/partialPrefetching.
- `app/layout.tsx`: metadata title "Academy", `html lang="en"`, Tailwind body classes, `LayoutProps<"/">`. No `next/font/google` (build-time network dependency); system `--font-sans`.
- `app/globals.css`: from shadcn init; remove `--font-sans: var(--font-sans)` / `--font-mono: var(--font-geist-mono)` / `--font-heading` lines in `@theme inline`.
- `app/page.tsx`: server component, `<main>`, `<h1>Courses</h1>`, `<CourseList courses={stubCourses} />`.
- `app/favicon.ico`: from template.
- `lib/courses.ts`: `import type { Course } from "@academy/lesson-schema"`; `export type CourseSummary = Pick<Course,"id"|"title"|"description">`; `export const stubCourses: readonly CourseSummary[]` with one English entry `id: "ai-for-developers"`; comment: stub until #4 loads `course/`.
- `lib/utils.ts`: shadcn (`export { cn } from "cn"`).
- `components/ui/card.tsx`: `shadcn add card`, biome-formatted.
- `components/course-list.tsx`: `CourseList({ courses }: { courses: readonly CourseSummary[] })`; `<ul>` with one `<li>` per course (Card with title + description); empty list -> "No courses yet" paragraph (seam for #4).
- `components/course-list.test.tsx`: "renders one list item per course with its title"; "renders the empty state instead of a list when there are no courses".
- `components.json`: shadcn init (base-nova, rsc, tsx, aliases @/...).
- `vitest.config.ts`: plugins [react()], `resolve { tsconfigPaths: true }`, test env jsdom, include `**/*.test.{ts,tsx}`, exclude node_modules/.next/e2e, setupFiles `./test/setup.ts`.
- `test/setup.ts`: `import "@testing-library/jest-dom/vitest"`.
- `playwright.config.ts`: `defaultBaseUrl = "http://127.0.0.1:3080"` (comment: compose WEB_PORT default); `baseURL = process.env.E2E_BASE_URL ?? defaultBaseUrl`; testDir ./e2e; forbidOnly in CI; retries 0; reporter `[["github"],["html",{open:"never"}]]` in CI, "list" locally; use baseURL, trace retain-on-failure, screenshot only-on-failure; one chromium project; no webServer.
- `e2e/home.spec.ts`: "home page lists courses": record same-origin responses with status >= 400 during goto("/"); assert response ok, h1 "Courses" visible, >= 1 listitem visible, failed-response list empty (catches missing /_next/static).
- `public/.gitkeep`: template SVGs deleted; keeps COPY of public working.
- `Dockerfile`: section 5.

Removed / never added: nested pnpm-workspace.yaml, biome.json, packageManager, AGENTS.md (and CLAUDE.md if generated), README.md, apps/web/.gitignore, ESLint config, public/*.svg, components/ui/button.tsx if unused.

### Root files
- `package.json`: add `"dev": "turbo run dev"` (acceptance 1 is root `pnpm dev`).
- `pnpm-workspace.yaml`: `allowBuilds:` `esbuild: false`.
- `turbo.json`: `"dev": { "cache": false, "persistent": true, "dependsOn": ["^build"] }`; `test:e2e` gets `"passThroughEnv": ["E2E_BASE_URL", "CI"]`. build outputs unchanged.
- `biome.json`: excludes `!**/next-env.d.ts`, `!**/playwright-report`, `!**/test-results`. CSS stays out of includes.
- `.gitignore`: add `next-env.d.ts`.
- `.dockerignore` (new): `**/node_modules`, `**/.next`, `**/dist`, `**/.turbo`, `**/coverage`, `**/playwright-report`, `**/test-results`, `**/*.tsbuildinfo`, `**/next-env.d.ts`, `.git`, `.env`, `.env.*`, `.claude`, `backlog`, `plans`, `pipeline`, `learner`, `docs`, `tests`, `course` (comment: #4 removes this line and copies course/ into the runner). Never exclude apps/packages/services (frozen lockfile needs all importers).
- `docker-compose.yml`: header comment updated; `web` service (section 6).
- `.env.example`: Web section adds `WEB_PORT=3080` and commented `# E2E_BASE_URL=http://127.0.0.1:3080`. AUTH_SECRET/WORKSPACE_SERVICE_URL stay commented.
- `.github/workflows/ci.yml`: section 7.
- `pnpm-lock.yaml`: regenerated.
- `docs/adr/0003-stack.md`: one amendment bullet (section 10).
- `README.md`: short "Web app" section: `pnpm dev` (3000), `docker compose up -d --build --wait` (3080), one-time browser install, `pnpm test:e2e`.

## 3. Scaffolding
Generate `create-next-app@16.4.3` into the scratchpad (`--ts --tailwind --app --no-src-dir --import-alias "@/*" --use-pnpm --skip-install --disable-git`; check flags with --help), never into apps/web. Copy only `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `app/favicon.ico`; write configs per section 2. Then in apps/web: `pnpm dlx shadcn@4.22.1 init -d -b base --no-monorepo --no-rtl`; `pnpm dlx shadcn@4.22.1 add card`; `pnpm format`.
Dependency rule: every apps/web dependency is imported in code/CSS or is a script binary; remove the rest (likely button.tsx, @base-ui/react, lucide-react, class-variance-authority if card does not import them).

## 4. TypeScript
tsconfig per section 2, all fields next build injects are preset. `typecheck` = `next typegen && tsc --noEmit`. turbo typecheck keeps `dependsOn ^build` (lesson-schema types from dist). Never set `useTypeScriptCli: false`.

## 5. Dockerfile (apps/web/Dockerfile, context = repo root)
- `# syntax=docker/dockerfile:1`, `ARG NODE_IMAGE=node:22.<minor>.<patch>-alpine` pinned exact (coder confirms with docker pull).
- base: `ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH`, `RUN corepack enable`.
- build: `WORKDIR /repo`, `COPY . .`, `RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile`, `ENV NEXT_TELEMETRY_DISABLED=1`, `RUN pnpm turbo run build --filter=@academy/web...`.
- runner: `FROM ${NODE_IMAGE}`, `WORKDIR /app`, `ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0`; COPY --chown=node:node standalone -> `./`, `.next/static` -> `./apps/web/.next/static`, `public` -> `./apps/web/public`; `USER node`; `EXPOSE 3000`; `CMD ["node","apps/web/server.js"]`.
- No HEALTHCHECK in Dockerfile (compose owns timings). Alpine: tested, node-based healthcheck, same libc for builder and runner. Standalone bundles pruned node_modules (no pnpm deploy). No `pnpm fetch` optimisation (untested).

## 6. Compose web
```
web:
  build: { context: ., dockerfile: apps/web/Dockerfile }
  image: academy-web:local
  restart: unless-stopped
  ports: ["127.0.0.1:${WEB_PORT:-3080}:3000"]
  healthcheck:
    test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
    interval: 5s
    timeout: 3s
    retries: 20
    start_period: 5s
```
Loopback only; 3080 avoids conflict with pnpm dev on 3000; 127.0.0.1 not localhost (::1 on alpine); no depends_on/environment until #2.

## 7. CI
- `checks`: unchanged steps + final "fail if the build changed tracked files": `git status --porcelain` empty, else print status and diff.
- `compose` replaced by `e2e` ("compose stack and Playwright e2e", timeout 20): checkout; `cp .env.example .env`; `docker compose config --quiet`; `docker compose up -d --build --wait`; `docker compose ps`; pnpm/action-setup; setup-node (.nvmrc, cache pnpm); `pnpm install --frozen-lockfile`; `pnpm --filter @academy/web exec playwright install --with-deps --only-shell chromium`; `pnpm test:e2e` with `E2E_BASE_URL: http://127.0.0.1:3080`; on failure `docker compose logs --no-color > compose.log` and `actions/upload-artifact@v7` (apps/web/playwright-report, apps/web/test-results, compose.log, retention 7); always `docker compose down -v`.
- Why compose target: tests the shipped artifact, builds image once, matches tester role. Why runner install: job needs Docker; browser caching discouraged. Unverified: `--with-deps` + `--only-shell` together (fallback `--with-deps chromium`).

## 8. Open questions answered
1. Base UI (base-nova default); recorded in ADR-0003.
2. Type-only import; `./schema` export is #4's contract decision.
3. e2e against compose, runner browser install.
4. node:22-alpine pinned exact patch.
5. Drop cacheComponents and partialPrefetching (#4 decides with its design).
6. No action-major upgrades in #1; upload-artifact uses v7.
7. Gitignore next-env.d.ts; typecheck regenerates via next typegen.

## 9. Failure modes
| Failure | Mitigation | Caught by |
|---|---|---|
| Build dirties tree | preset tsconfig, agentRules false, gitignore next-env | CI porcelain step; tester after pnpm dev |
| Missing Next types (TS2304) | next typegen before tsc | CI typecheck on clean checkout; tester deletes .next first |
| Lockfile drift | commit regenerated lockfile; no --force | --frozen-lockfile in checks, e2e, Docker |
| Font fetch at build | no next/font/google | tester grep |
| Port conflict with pnpm dev | 3000 vs 3080 | tester runs both |
| Bind/::1 issue | HOSTNAME=0.0.0.0, healthcheck 127.0.0.1 | up --wait unhealthy; compose.log artifact |
| Missing static/public | explicit COPY, public/.gitkeep | e2e asserts no >= 400 |
| .env in image | .dockerignore | tester `ls -a /app` |
| lesson-schema runtime import traces repo | type-only import | tester greps build log |
| musl/glibc sharp mismatch | same base image | container healthy |
| Biome fails on shadcn output | pnpm format after shadcn add | pnpm lint |
| turbo strict env drops E2E_BASE_URL | passThroughEnv | fallback default 3080 |
| Tests that cannot fail | break each guard once | tester checks 8, 12 |

## 10. Coder steps (each leaves the repo green)
1. Root prep: allowBuilds, .gitignore next-env, biome excludes. Check `pnpm install` (no build-script warning), `pnpm lint`.
2. Skeleton: scratch scaffold; apps/web package.json, tsconfig, next.config, app/* (no Google fonts, placeholder page), public/.gitkeep; `pnpm install`. Check web typecheck, web build, git status.
3. shadcn init + add card (4.22.1), `pnpm format`, fix globals.css font lines, remove unused components/deps. Check lint, build.
4. Domain stub: lib/courses.ts, components/course-list.tsx, app/page.tsx. Check pnpm dev + curl "Courses".
5. Vitest config, setup, course-list.test.tsx. Check pnpm test + one red run.
6. turbo.json dev + test:e2e passThroughEnv, root dev script. Check root pnpm dev.
7. Dockerfile, .dockerignore, compose web, .env.example. Check compose up --wait.
8. Playwright config + e2e/home.spec.ts. Check e2e against compose.
9. CI: dirty-tree step; e2e job replaces compose.
10. Docs: ADR-0003 amendment, README Web app section.

Suggested commits (each refs #1): optional `chore(deps): normalize pnpm-lock.yaml format` (only if `pnpm install --lockfile-only` on the pre-change tree reproduces the rewrite alone); `feat(web): scaffold apps/web with next.js, tailwind and shadcn/ui` (1-6); `build(web): add multi-stage dockerfile and compose web service` (7); `test(web): add playwright smoke test and ci e2e job` (8-9); `docs: record base ui choice and web run commands` (10).

## 11. Tester acceptance checks (from repo root)
1. `pnpm --version` = 10.28.0; `pnpm install --frozen-lockfile`.
2. `rm -rf apps/web/.next apps/web/next-env.d.ts packages/lesson-schema/dist .turbo apps/web/.turbo packages/lesson-schema/.turbo`
3. `pnpm lint && TURBO_FORCE=true pnpm typecheck && TURBO_FORCE=true pnpm test && TURBO_FORCE=true pnpm build`
4. `git status --porcelain`: nothing beyond the pending diff (tsconfig unchanged by build).
5. `TURBO_FORCE=true pnpm build 2>&1 | grep -ci "filesystem access"` = 0; no `next/font/google` in apps/web; `rg '[а-яА-ЯёЁ]' apps/web .dockerignore docker-compose.yml .github/workflows/ci.yml` empty.
6. `TURBO_FORCE=true pnpm typecheck` again after build passes.
7. `pnpm dev`; `curl -s http://localhost:3000/ | grep -c ">Courses<"` >= 1; stop; `git status --porcelain` shows no AGENTS.md.
8. Break empty state -> web test red; revert -> green.
9. `cp -n .env.example .env; docker compose config --quiet; docker compose up -d --build --wait; docker compose ps` (both healthy); `docker compose exec web id -u` = 1000; `docker compose exec web ls -a /app` no .env; `curl -fsS http://127.0.0.1:3080/ | grep -c ">Courses<"` >= 1.
10. compose up + `pnpm dev` together: 3000 and 3080 both answer.
11. `pnpm --filter @academy/web exec playwright install chromium --only-shell`; `E2E_BASE_URL=http://127.0.0.1:3080 pnpm test:e2e` passes.
12. `docker compose stop web` -> e2e fails; `docker compose start web`, wait healthy.
13. `docker compose down -v`.
14. Deps audit: every apps/web dependency referenced in sources/CSS or a script.
15. `actionlint .github/workflows/ci.yml` if installed, else YAML parse. Real proof: PR CI `checks` and `e2e` green.

## 12. Rejected alternatives
create-next-app into apps/web; `./schema` export now; Playwright webServer with next start; standalone server in checks job; depends_on db now; /api/health route (deferred); @tailwindcss/postcss (untested); node:22-slim (untested); action-major upgrades.

## 13. ADR
No new ADR. Amend ADR-0003 (Proposed; Stepan accepts in PR): shadcn/ui uses Base UI (base-nova) rather than Radix, because it is shadcn's default; switching later means regenerating every component.

## Unverified (tester confirms)
`.next/standalone` tsconfig exclude survives next build; turbo strict-env for CI/E2E_BASE_URL/NEXT_TELEMETRY_DISABLED; `--with-deps` + `--only-shell`; which deps base-nova card imports; whether `--lockfile-only` alone reproduces the lockfile reformat; the whole thing on GitHub Actions.

## Orchestrator note
Unrelated uncommitted `.github/CODEOWNERS` change in the working tree must get its own commit or be stashed before `pr` (clean tree required).

---

# Revision 2 (after design review round 1: security FAIL, architecture FAIL, operations PASS)

Architect's revision, verbatim in substance. These sections REPLACE the same-numbered sections above: 2, 3, 5, 6, 7, 9, 10, 11, "Unverified". Sections 1, 4, 8, 12, 13 unchanged.

## 2. Files (replacement)

### apps/web (new)
- `package.json`: name `@academy/web`, private, `"type": "module"`. Final scripts: `dev: next dev`, `build: next build`, `typecheck: next typegen && tsc --noEmit`, `test: vitest run`, `test:e2e: playwright test`; each script added in the coder step that makes it pass (`test` step 5, `test:e2e` step 8). No `start`. deps: `@academy/lesson-schema: workspace:*` (type-only), `next 16.4.3`, `react 19.3.1`, `react-dom 19.3.1` (exact), plus shadcn deps actually imported. devDeps: `typescript ^7.0.2`, `@types/node ^22`, `@types/react`/`@types/react-dom ^19.3.0`, `tailwindcss ^4.3.3`, `@tailwindcss/turbopack ^4.3.3`; step 5 adds `vitest ^5.0.5`, `@vitejs/plugin-react ^6.1.2`, `jsdom ^30.1.3`, `@testing-library/react ^16.3.3`, `@testing-library/dom ^10.4.2`, `@testing-library/jest-dom ^7.0.1`; step 8 adds `@playwright/test 1.64.1` (exact). No packageManager/engines.
- `tsconfig.json`: as before (extends base; lib DOM/DOM.Iterable/ES2023, module ESNext, moduleResolution Bundler, jsx react-jsx, noEmit, declaration false, allowJs, incremental, plugin next, paths `@/*`, no baseUrl; include next-env.d.ts, **/*.ts, **/*.tsx, .next/types/**/*.ts, .next/dev/types/**/*.ts; exclude node_modules, .next/standalone). Tester check 4 confirms build leaves it untouched.
- `next.config.ts`: `repositoryRoot = path.join(import.meta.dirname, "../../")`; `output: "standalone"`, `outputFileTracingRoot: repositoryRoot`, `turbopack: { root: repositoryRoot, rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } }`, `agentRules: false` (why-comment), `poweredByHeader: false` (the header only advertises the framework to probes). No cacheComponents/partialPrefetching.
- `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `app/favicon.ico`, `lib/courses.ts`, `lib/utils.ts`, `components/ui/card.tsx`, `components/course-list.tsx`, `components/course-list.test.tsx` (step 5), `components.json`, `vitest.config.ts` (step 5), `test/setup.ts` (step 5), `playwright.config.ts` (step 8): as in the original section 2.
- `e2e/home.spec.ts` (step 8), test "home page lists courses", fixtures `page`, `baseURL`:
  1. `appOrigin = new URL(baseURL).origin` (URL.origin normalises trailing slash, default port, case).
  2. BEFORE `page.goto`, `page.on("response", ...)` pushes `{ url, status }` into `sameOriginResponses` when `new URL(response.url()).origin === appOrigin`.
  3. `const response = await page.goto("/")`; assert `response?.ok()`.
  4. h1 "Courses" visible; at least one listitem visible.
  5. Wait for `load`.
  6. Non-vacuous: `sameOriginResponses` contains at least one URL whose pathname starts with `/_next/static/`.
  7. `sameOriginResponses.filter(r => r.status >= 400)` deep-equals `[]` (failure message lists offending URLs/statuses).
- `public/.gitkeep`; `Dockerfile` (section 5).

Removed / never added: nested pnpm-workspace.yaml, biome.json, packageManager, AGENTS.md (and CLAUDE.md if generated), README.md, apps/web/.gitignore, ESLint config, public/*.svg, components/ui/button.tsx if unused.

### Root files
- `package.json`: `"dev": "turbo run dev"`.
- `pnpm-workspace.yaml`: `allowBuilds:` `esbuild: false`.
- `turbo.json`: `"dev": { "cache": false, "persistent": true, "dependsOn": ["^build"] }`; `test:e2e` gets `"passThroughEnv": ["E2E_BASE_URL"]` (required: strict env drops it, verified; CI and NEXT_TELEMETRY_DISABLED already pass, verified; no globalPassThroughEnv). Build outputs unchanged.
- `biome.json`: excludes `!**/next-env.d.ts`, `!**/playwright-report`, `!**/test-results`.
- `.gitignore`: `next-env.d.ts`.
- `.dockerignore` (new): `**/node_modules`, `**/.next`, `**/dist`, `**/.turbo`, `**/coverage`, `**/playwright-report`, `**/test-results`, `**/*.tsbuildinfo`, `**/next-env.d.ts`; `.git`, `**/.env`, `**/.env.*`; `.claude`, `backlog`, `plans`, `pipeline`, `learner`, `docs`, `tests`, `course` (comment: #4 removes this line and copies course/ into the runner). Comment on env patterns: Docker anchors patterns at the context root and `next build` with standalone copies `apps/web/.env*` into `.next/standalone`, so root-only patterns ship app-level env files. `**/.env.*` also excludes `.env.example` (not needed in the image). Never exclude apps/packages/services.
- `docker-compose.yml`: header "Start: docker compose up -d --build --wait (always --build: the web image is tagged academy-web:local and `up` without --build reuses a stale image)"; `web` service (section 6).
- `.env.example`: Web section adds `WEB_PORT=3080` and `# E2E_BASE_URL=http://127.0.0.1:3080`.
- `.github/workflows/ci.yml`: section 7. `pnpm-lock.yaml`: regenerated. `docs/adr/0003-stack.md`: amendment (section 13).
- `README.md`: "Web app": `pnpm dev` (3000); `docker compose up -d --build --wait` (3080) with a line that `--build` is required after every code change; one-time browser install; `pnpm test:e2e`.

## 3. Scaffolding (replacement)
1. `create-next-app@16.4.3` into the scratchpad only (`--ts --tailwind --app --no-src-dir --import-alias "@/*" --use-pnpm --skip-install --disable-git`, check with --help).
2. Copy only `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `app/favicon.ico`; write configs per section 2.
3. In apps/web: `pnpm dlx shadcn@4.22.1 init -d -b base --no-monorepo --no-rtl`; `pnpm dlx shadcn@4.22.1 add card`; `pnpm format`.
Dependency rule: every apps/web dependency is imported in code/CSS, or a script binary, or a required peer/type package of one that is (react-dom for next, @testing-library/dom for @testing-library/react, @types/*). Remove the rest.

## 5. Dockerfile (replacement)
- `# syntax=docker/dockerfile:1`; `ARG NODE_IMAGE=node:22.23.4-alpine` (verified: node 22.23.4, corepack 0.36.0, Alpine 3.24.3; comment: exact tag, no digest).
- base: `ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH`; `RUN corepack enable`.
- build: `WORKDIR /repo`; `COPY . .`; `RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile`; `ENV NEXT_TELEMETRY_DISABLED=1`; `RUN pnpm turbo run build --filter=@academy/web...`.
- runner: `FROM ${NODE_IMAGE}`; `WORKDIR /app`; `ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0`; COPY WITHOUT `--chown` (root-owned, world-readable): standalone -> `./`, `.next/static` -> `./apps/web/.next/static`, `public` -> `./apps/web/public`; `RUN mkdir -p apps/web/.next/cache && chown node:node apps/web/.next/cache` (comment: the only runtime write path; code stays root-owned so a compromised process cannot rewrite server.js or node_modules); `USER node`; `EXPOSE 3000`; `CMD ["node","apps/web/server.js"]`.
- No Dockerfile HEALTHCHECK (compose owns timings); alpine tested; standalone bundles pruned node_modules. Not done: `pnpm fetch`, `corepack prepare`.

## 6. Compose web (replacement)
Same YAML as before (build context ., dockerfile apps/web/Dockerfile, image academy-web:local, restart unless-stopped, ports `127.0.0.1:${WEB_PORT:-3080}:3000`, node fetch healthcheck on 127.0.0.1:3000, interval 5s, timeout 3s, retries 20, start_period 5s). Notes: loopback only; 3080 vs pnpm dev 3000; 127.0.0.1 not localhost; no depends_on/environment until #2; header requires `--build`; healthcheck probes only `/` HTML, independent of `.next/static` (deliberate: check 13 relies on it staying healthy).

## 7. CI (replacement)
- Workflow-level env `NEXT_TELEMETRY_DISABLED: 1`.
- `checks`: unchanged + final step "fail if the build changed tracked files": `changes=$(git status --porcelain); if [ -n "$changes" ]; then echo "$changes"; git --no-pager diff; exit 1; fi`.
- `compose` replaced by `e2e` ("compose stack and Playwright e2e", timeout 20; renaming blocks nothing, no branch protection, verified): checkout; `cp .env.example .env`; `docker compose config --quiet`; `docker compose up -d --build --wait` (fails fast when unhealthy, verified); `docker compose ps`; pnpm/action-setup; setup-node (.nvmrc, cache pnpm); `pnpm install --frozen-lockfile`; `pnpm --filter @academy/web exec playwright install --with-deps --only-shell chromium` (verified for 1.64.1); `pnpm test:e2e` with `E2E_BASE_URL: http://127.0.0.1:3080`; on failure `docker compose ps -a > compose-ps.txt`, `docker compose logs --no-color > compose.log`, `actions/upload-artifact@v7` (apps/web/playwright-report, apps/web/test-results, compose.log, compose-ps.txt, retention 7); always `docker compose down -v`.

## 9. Failure modes (replacement)
| Failure | Mitigation | Caught by (seen red) |
|---|---|---|
| Build dirties tree | preset tsconfig, agentRules false, gitignore next-env | CI porcelain step; check 4; check 18 |
| Missing Next types | next typegen before tsc | CI typecheck on clean checkout; check 2 |
| Lockfile drift | commit lockfile; no --force | --frozen-lockfile everywhere |
| Font fetch | no next/font/google | check 5 |
| Port conflict | 3000 vs 3080 | check 10 |
| Bind / ::1 | HOSTNAME=0.0.0.0, healthcheck 127.0.0.1 | up --wait; compose.log |
| Missing static/public | explicit COPY, public/.gitkeep | e2e ">= 400" + "at least one /_next/static"; check 13 |
| Late listener / never-matching filter | listener before goto; URL.origin; non-vacuous assertion | check 13 |
| App-level .env* shipped via standalone | `**/.env`, `**/.env.*` | check 9 canary; check 9b red |
| Runtime user rewrites server code | root-owned; only .next/cache owned by node | check 9 touch tests |
| Future ISR writes outside .next/cache | none now | EACCES in logs; #4 revisits |
| Fingerprint header | poweredByHeader false | check 9 |
| lesson-schema runtime import traces repo | type-only import | check 5 = 0; check 19 >= 1 with value import |
| musl/glibc mismatch | same base image | healthy |
| Biome on shadcn output | pnpm format | pnpm lint |
| turbo drops E2E_BASE_URL | passThroughEnv | check 17 |
| Stale image | --build in compose header, README, CI | docs; CI always builds |
| Tests that cannot fail | each guard broken once in isolation | checks 8, 9b, 12, 13, 18, 19 |

## 10. Coder steps (replacement)
1. Root prep: allowBuilds, .gitignore next-env, biome excludes. Check `pnpm install` (no build-script warning), `pnpm lint`.
2. Skeleton: scratch scaffold; apps/web package.json with dev/build/typecheck only; tsconfig; next.config (incl. poweredByHeader false); app/* (no Google fonts, placeholder page); public/.gitkeep; `pnpm install`. Check web typecheck, web build, git status.
3. shadcn init + add card (4.22.1), `pnpm format`, fix globals.css font lines, remove unused per dependency rule. Check lint, build.
4. Domain stub: lib/courses.ts, components/course-list.tsx, app/page.tsx. Check pnpm dev + curl "Courses".
5. Unit tests: `test` script + vitest devDeps, vitest config, setup, course-list.test.tsx. Check `pnpm test` + one red run.
6. turbo: `dev` + `test:e2e` passThroughEnv, root dev script. Check root `pnpm dev`.
7. Container: Dockerfile (root-owned COPY, cache dir chown), .dockerignore with `**/.env*`, compose web + header, .env.example. Check `docker compose up -d --build --wait`.
8. e2e: `test:e2e` script + `@playwright/test`, Playwright config, e2e/home.spec.ts. Check e2e against compose.
9. CI: workflow env NEXT_TELEMETRY_DISABLED, dirty-tree step, e2e job replaces compose (with `ps -a`).
10. Docs: ADR-0003 amendment, README Web app section (with --build).
Commits (each refs #1): optional `chore(deps): normalize pnpm-lock.yaml format`; `feat(web): scaffold apps/web with next.js, tailwind and shadcn/ui` (1-6); `build(web): add multi-stage dockerfile and compose web service` (7); `test(web): add playwright smoke test and ci e2e job` (8-9); `docs: record base ui choice and web run commands` (10).

## 11. Tester acceptance checks (replacement; repo root; for any `grep -c` read the number, append `|| true`)
1. `pnpm --version` = 10.28.0; `pnpm install --frozen-lockfile`.
2. `rm -rf apps/web/.next apps/web/next-env.d.ts packages/lesson-schema/dist .turbo apps/web/.turbo packages/lesson-schema/.turbo`.
3. `pnpm lint && TURBO_FORCE=true pnpm typecheck && TURBO_FORCE=true pnpm test && TURBO_FORCE=true pnpm build`.
4. `git status --porcelain`: nothing beyond pending diff; tsconfig unchanged by build.
5. `TURBO_FORCE=true pnpm build 2>&1 | grep -ci "filesystem access" || true` prints 0; no `next/font/google` in apps/web; `rg '[а-яА-ЯёЁ]' apps/web .dockerignore docker-compose.yml .github/workflows/ci.yml` empty.
6. `TURBO_FORCE=true pnpm typecheck` passes again after build.
7. `pnpm dev`; `curl -s http://localhost:3000/ | grep -c ">Courses<" || true` >= 1; stop; `git status --porcelain` shows no AGENTS.md.
8. Break empty state -> web test red; revert -> green.
9. Compose + canary + ownership + header:
   1. `printf 'CANARY_SECRET=canary-dummy-value\n' > apps/web/.env`
   2. `cp -n .env.example .env; docker compose config --quiet; docker compose up -d --build --wait; docker compose ps` (both healthy)
   3. `docker compose exec web find / -xdev -name '.env*'` empty
   4. `docker compose exec web grep -rl canary-dummy-value /app || true` empty
   5. `docker compose exec web id -u` = 1000
   6. `docker compose exec web sh -c 'touch apps/web/server.js'` permission denied
   7. `docker compose exec web sh -c 'touch apps/web/.next/cache/probe && rm apps/web/.next/cache/probe'` succeeds
   8. `curl -fsS http://127.0.0.1:3080/ | grep -c ">Courses<" || true` >= 1
   9. `curl -sI http://127.0.0.1:3080/ | grep -ci '^x-powered-by' || true` = 0
   10. keep canary for 9b.
   9b. Comment out `**/.env` and `**/.env.*` in .dockerignore; `docker compose up -d --build --wait web`; find must list `/app/apps/web/.env`; restore .dockerignore; `rm apps/web/.env`; `docker compose up -d --build --force-recreate --wait web`; find empty again; `git status` shows no .dockerignore change.
10. compose up + `pnpm dev`: 3000 and 3080 both answer.
11. `pnpm --filter @academy/web exec playwright install chromium --only-shell`; `E2E_BASE_URL=http://127.0.0.1:3080 pnpm test:e2e` passes.
12. `docker compose stop web` -> e2e fails at goto; `docker compose start web`, wait healthy.
13. Static guard in isolation: `docker compose exec -u root web rm -rf /app/apps/web/.next/static`; `docker compose ps` web still healthy; e2e must fail on the ">= 400" assertion listing `/_next/static/...` 404s (not at goto, not h1, not the "at least one /_next/static" assertion); `docker compose up -d --build --force-recreate --wait web`; e2e green.
14. `docker compose down -v`.
15. Deps audit per section 3 rule.
16. `actionlint .github/workflows/ci.yml` if installed, else YAML parse; real proof = PR CI `checks` and `e2e` green.
17. `WEB_PORT=3081 docker compose up -d --build --wait web`; `E2E_BASE_URL=http://127.0.0.1:3081 pnpm test:e2e` passes; `docker compose down -v`.
18. `echo >> README.md`; run the CI dirty-tree script locally -> exit 1 with diff; `git checkout README.md`; with pending work, check exit 1 lists README.md, otherwise exit 0 on clean tree.
19. Optional: value import in lib/courses.ts -> filesystem-access count >= 1; revert. If still 0, report check 5 as a dead guard.

## Unverified (replacement)
`.next/standalone` exclude survives build (check 4); deps base-nova card imports (check 15); whether `--lockfile-only` alone reproduces the lockfile reformat; Next writes nothing outside `.next/cache` for this page (checks 9, 11); the whole thing on GitHub Actions. Now verified by operations: node:22.23.4-alpine tag; turbo strict env; `--with-deps` + `--only-shell`; `up --wait` fails fast.

## Changelog (findings -> changes)
1. Security blocking (env leak): `**/.env`, `**/.env.*` + comment; check 9 canary + find + grep; check 9b red run.
2. Architecture blocking (static guard): check 13 (`rm -rf .next/static` with `-u root`, healthy container, red on >= 400 only); listener before goto, URL.origin vs baseURL fixture, non-vacuous /_next/static assertion; check 12 kept as reachability only.
3. Dependency rule: accepted (peer/type packages).
4. Scripts per step: accepted.
5. Optional negative runs: accepted (checks 18, 19).
6. --chown: accepted tighter option (root-owned, only .next/cache node-owned; check 9). Residual: #4 revisits for ISR.
7. poweredByHeader false: accepted (check 9).
8. Digest pin: declined (no update bot; digest would freeze Alpine patches; exact tag is enough). Revisit with an update bot.
9. NEXT_TELEMETRY_DISABLED: workflow-level env; globalPassThroughEnv declined (already passes).
10. node:22.23.4-alpine pinned.
11. passThroughEnv reduced to E2E_BASE_URL; check 17 proves it.
12. --with-deps/--only-shell and up --wait moved out of Unverified.
13. No branch protection noted.
14. --build in compose header and README.
15. grep -c handled with `|| true`.
16. `docker compose ps -a` in CI failure artifact.
17. corepack prepare: declined (pnpm version drift risk or untested corepack install; saves seconds).

---

# Revision 3 (after design review round 2: security PASS, architecture PASS, operations FAIL)

Architect's revision, verbatim in substance. These sections REPLACE the same-numbered sections of Revision 2: 2 (only the e2e spec bullet and the `.dockerignore` line-format note change), 9, 11. Sections 3, 5, 6, 7, 10, "Unverified" from Revision 2 and 1, 4, 8, 12, 13 from the original are unchanged. Verified in `.gitignore`: `.env` / `.env.*` have no slash, so the `apps/web/.env` canary and root `.env` are ignored and outside the pending diff.

## 2. Files (replacement: deltas against Revision 2)
Everything in Revision 2 section 2 stands, with these changes:
- `e2e/home.spec.ts` gains step 0: the `baseURL` fixture is `string | undefined`; narrow with `if (baseURL === undefined) throw new Error("baseURL is not set: playwright.config.ts use.baseURL must be configured")`. No `as`, no non-null `!`. Steps 1-7 as in Revision 2.
- `.dockerignore`: the two env patterns each stand alone on their own line, exactly `**/.env` and `**/.env.*` (check 9b matches them as whole lines).
- `README.md` "Web app" section as in Revision 2.

## 9. Failure modes (replacement)
Revision 2 table, plus these rows:
| Failure | Mitigation | Caught by (seen red) |
|---|---|---|
| baseURL undefined at runtime | explicit narrowing throw (no as/!) | typecheck; check 5b |
| A negative run destroys or alters pending work (git restore of an edited or untracked file) | mutate only from a backup in `$SCRATCH`, restore by `cp`, prove with `cmp`; check 18 in a throwaway worktree; pending-diff fingerprint | `cmp` in each check; `fp_check` after each negative run (check 0 proves it can go red) |
| Left-over dev server holds 3000 | stop by process group, verify port free | checks 7, 10 |

## 11. Tester acceptance checks (replacement)
Repo root. For any `grep -c`, read the number and append `|| true`.

### Rules for every negative run (8, 9b, 12, 13, 17, 18, 19)
- A file that is part of the pending diff (modified or untracked: everything under apps/web, `.dockerignore`, README.md, ci.yml, ...) is NEVER restored with `git checkout`, `git restore`, `git stash` or `git clean`, and restoration is never "proved" with `git status`.
- Before mutating a file: copy to a backup in `$SCRATCH`; after the red run restore with `cp`; prove with `cmp`.
- Container-only or shell-env-only checks touch no repo file, but still run `fp_check` afterwards.
- `SCRATCH` is a fresh `mktemp -d` outside the repo.

### 0. Pending-diff fingerprint (setup + proof it can fail)
```sh
SCRATCH=$(mktemp -d)
fp() { { git diff HEAD --binary -- . ':(exclude)plans' ':(exclude).claude/feedback' ':(exclude)pipeline';
         git ls-files -o --exclude-standard -z -- . ':(exclude)plans' ':(exclude).claude/feedback' ':(exclude)pipeline' | sort -z | xargs -0 shasum; } | shasum; }
fp > "$SCRATCH/fp0"
fp_check() { fp | cmp -s - "$SCRATCH/fp0" && echo "fingerprint OK" || { echo "PENDING DIFF CHANGED"; return 1; }; }
```
Prove red: `cp README.md "$SCRATCH/readme.bak"; printf '\n' >> README.md; fp_check` prints PENDING DIFF CHANGED; then `cp "$SCRATCH/readme.bak" README.md; cmp README.md "$SCRATCH/readme.bak"; fp_check` prints OK. Baseline taken after the coder is done, before check 1.

### Checks
1. `pnpm --version` = 10.28.0; `pnpm install --frozen-lockfile`.
2. `rm -rf apps/web/.next apps/web/next-env.d.ts packages/lesson-schema/dist .turbo apps/web/.turbo packages/lesson-schema/.turbo`.
3. `pnpm lint && TURBO_FORCE=true pnpm typecheck && TURBO_FORCE=true pnpm test && TURBO_FORCE=true pnpm build`.
4. `git status --porcelain` nothing beyond pending diff; `fp_check` OK.
5. `TURBO_FORCE=true pnpm build 2>&1 | grep -ci "filesystem access" || true` = 0; no `next/font/google` in apps/web; `rg '[а-яА-ЯёЁ]' apps/web .dockerignore docker-compose.yml .github/workflows/ci.yml README.md` empty.
   5b. `rg -n ' as |!\.|baseURL!' apps/web/e2e` no assertion/non-null on baseURL; `rg -n 'baseURL === undefined' apps/web/e2e/home.spec.ts` one match followed by a throw.
6. `TURBO_FORCE=true pnpm typecheck` passes again after build.
7. Dev smoke: `(set -m; pnpm dev > "$SCRATCH/dev.log" 2>&1 & echo $! > "$SCRATCH/dev.pid")`; poll `curl -s http://localhost:3000/ | grep -c ">Courses<" || true` >= 1; `kill -- -$(cat "$SCRATCH/dev.pid")`; `lsof -nP -iTCP:3000 -sTCP:LISTEN` empty and curl to 3000 fails; `git status --porcelain` no AGENTS.md; `fp_check` OK.
8. Unit-test guard: `cp apps/web/components/course-list.tsx "$SCRATCH/course-list.bak"`; break the empty state; web test red on "renders the empty state instead of a list when there are no courses" only; `cp` back; `cmp` exits 0; web test green; `fp_check` OK.
9. Compose + canary + ownership + header:
   1. If `apps/web/.env` exists, stop and report. Else `printf 'CANARY_SECRET=canary-dummy-value\n' > apps/web/.env`.
   2. `[ -e .env ] && echo existed > "$SCRATCH/rootenv"`; `cp -n .env.example .env; docker compose config --quiet; docker compose up -d --build --wait; docker compose ps` (both healthy).
   3. `docker compose exec -u root web find / -xdev -name '.env*' 2>/dev/null || true` stdout empty.
   4. `docker compose exec -u root web grep -rl canary-dummy-value /app 2>/dev/null || true` stdout empty.
   5. `docker compose exec web id -u` = 1000.
   6. `docker compose exec web sh -c 'touch apps/web/server.js'` permission denied.
   7. `docker compose exec web sh -c 'touch apps/web/.next/cache/probe && rm apps/web/.next/cache/probe'` succeeds.
   8. `curl -fsS http://127.0.0.1:3080/ | grep -c ">Courses<" || true` >= 1.
   9. `curl -sI http://127.0.0.1:3080/ | grep -ci '^x-powered-by' || true` = 0.
   10. Keep canary for 9b.
   9b. `cp .dockerignore "$SCRATCH/dockerignore.bak"`; `awk '$0=="**/.env" || $0=="**/.env.*" { print "# " $0; next } { print }' "$SCRATCH/dockerignore.bak" > .dockerignore`; prove exactly two lines changed (`diff ... | grep -c '^<' || true` = 2, `'^>'` = 2) and `grep -cxF '**/next-env.d.ts' .dockerignore || true` = 1 (if 0: design deviation, stop); `docker compose up -d --build --wait web`; root find lists `/app/apps/web/.env` (red); `cp "$SCRATCH/dockerignore.bak" .dockerignore`; `cmp` exits 0; with canary still present `docker compose up -d --build --force-recreate --wait web`; find empty; `rm apps/web/.env`; `test ! -e apps/web/.env`; `fp_check` OK.
10. With compose up, start `pnpm dev` as in check 7; both `curl -fsS http://localhost:3000/` and `curl -fsS http://127.0.0.1:3080/` answer; `kill -- -$(cat "$SCRATCH/dev.pid")`; `lsof` on 3000 empty; 3080 still answers.
11. `pnpm --filter @academy/web exec playwright install chromium --only-shell`; `E2E_BASE_URL=http://127.0.0.1:3080 pnpm test:e2e` passes.
12. `docker compose stop web`; e2e fails at goto; `docker compose start web`; `docker compose up -d --wait web` = 0; `docker compose ps web` healthy; `fp_check` OK.
13. `docker compose exec -u root web rm -rf /app/apps/web/.next/static`; `docker compose ps web` healthy; e2e fails on the ">= 400" assertion listing `/_next/static/...` with any status >= 400 (not at goto, h1, or the "at least one /_next/static" assertion); `docker compose up -d --force-recreate --wait web`; `docker compose exec web sh -c 'ls apps/web/.next/static | head -1'` non-empty; e2e green; `fp_check` OK.
14. `docker compose down -v`.
15. Deps audit per section 3 rule.
16. `actionlint .github/workflows/ci.yml` if installed, else YAML parse; real proof = PR CI `checks` and `e2e` green.
17. `WEB_PORT=3081 docker compose up -d --build --wait web`; `E2E_BASE_URL=http://127.0.0.1:3081 pnpm test:e2e` passes; `docker compose down -v`; `docker compose ps -a` empty; `fp_check` OK.
18. Dirty-tree guard in a throwaway worktree: copy the exact `run:` body of the CI step into `"$SCRATCH/dirty-tree.sh"`; `wt="$SCRATCH/wt"; git worktree add --detach "$wt" HEAD`; `(cd "$wt" && sh "$SCRATCH/dirty-tree.sh")` exits 0; `printf '\n' >> "$wt/.nvmrc"` -> exits 1 printing ` M .nvmrc` + diff; `git -C "$wt" checkout -- .nvmrc`; `: > "$wt/stray.txt"` -> exits 1 listing `?? stray.txt`; `git worktree remove --force "$wt"`; `git worktree list` shows only main tree (plus pre-existing worktrees such as `.claude/worktrees/15-module-introduction-7cf70d`); `fp_check` OK.
19. Optional: `cp apps/web/lib/courses.ts "$SCRATCH/courses.bak"`; value import of a runtime export of `@academy/lesson-schema` and reference it; filesystem-access count >= 1; `cp` back; `cmp` 0; rebuild; count 0; `fp_check` OK. If still 0 with the value import, report check 5 as a dead guard.
20. Final state: `fp_check` OK; `test ! -e apps/web/.env`; root `.env` removed only if `$SCRATCH/rootenv` is absent; `docker compose ps -a` empty; port 3000 free; report includes fp0 value and every `cmp` result.

## Changelog (round 2 -> Revision 3)
1. Ops blocking, check 18: runs in a `git worktree add --detach HEAD` throwaway checkout; shows green on clean, red on tracked edit and on untracked file; worktree removed; `fp_check`.
2. Ops blocking, check 9b: backup + exact whole-line awk on the two env lines + diff count 2/2 + next-env line intact + `cp` restore + `cmp` + rebuild with canary to prove effectiveness; section 2 requires standalone env lines.
3. Minor 9.3/9.4/9b: find/grep as root, `2>/dev/null || true`, judged by stdout.
4. Minor check 10 (and 7): dev stopped by process group; `lsof` proves 3000 free.
5. Arch note baseURL: explicit throw narrowing; check 5b; section 9 row.
6. Arch note check 13: any status >= 400; restore by force-recreate from unchanged image + non-empty static check.
7. General audit of 8, 9b, 12, 13, 17, 18, 19: backups + `cmp` for diff files, `fp_check` after each, check 0 fingerprint proven red, canary refuses to overwrite an existing `apps/web/.env`, root `.env` cleaned only if created by this run.
8. Section 9 rows added. No ADR impact; coder steps unchanged except e2e step 0 and standalone env lines.

---

# Revision 4 (after design review round 3: security PASS, architecture PASS, operations FAIL)

Architect's revision, verbatim in substance. Replaces section 11 of Revision 3 completely and amends section 9 (rows below replace/add). All other sections as before (section 2 deltas from Revision 3; 3, 5, 6, 7, 10, "Unverified" from Revision 2; 1, 4, 8, 12, 13 from the original). Shell parts were exercised by the architect in fresh zsh 5.9 calls against a throwaway repo (port 3997 + python http.server in place of pnpm dev). Found: macOS `cp -n` exits 1 when the target exists, so 9a no longer uses it.

## 9. Failure modes (rows replacing/adding to Revision 3)
| Failure | Mitigation | Caught by (seen red) |
|---|---|---|
| A negative run destroys or alters pending work | backup into `$SCRATCH/bak/<path>` before mutating; mutate only FROM that backup; restore with `cp` + `cmp` in the SAME call; check 18 in a throwaway worktree | `cmp` in each check; `fp_check` after each negative run (0b proves red) |
| Shell state lost between tool calls (fresh zsh per call) | fixed SCRATCH path; helpers sourced every call; `: "${SCRATCH:?}"`; backup && mutation; no reliance on earlier-call variables | preamble exits 1 if helpers or SCRATCH missing |
| Call killed mid-mutation (timeout) | backup stays under `$SCRATCH/bak` until restore+cmp; `restore_pending` in every preamble | preamble prints `restored <file> (cmp OK)`; check 20 asserts bak/ empty |
| Leftover dev server holds 3000 | `dev_start` refuses busy 3000 and records `dev.started`; `dev_stop` kills the process group then falls back to lsof pids, only for a server this run started | checks 7, 10, 20 print `port 3000 free` |

## 11. Tester acceptance checks (replacement)

### Execution model (read first)
- Each Bash tool call is a NEW zsh: variables, functions, `cd`, jobs do not persist; only files do. Every fenced block below is exactly ONE Bash tool call (`Call N`); paste it whole, never split it.
- Fixed scratch dir `SCRATCH=/private/tmp/academy-tester-1` (outside the repo; not mktemp, a random name cannot be found again). If the sandbox refuses writes there, use the session scratchpad path, changed in exactly two places: the literal path in Call 0a and the `SCRATCH=` line of helpers.sh.
- Helpers written once in Call 0a to `$SCRATCH/helpers.sh`. Every later call starts with the preamble:
  ```sh
  . /private/tmp/academy-tester-1/helpers.sh || exit 1
  : "${SCRATCH:?}"
  restore_pending
  ```
  Sourcing sets SCRATCH and DEV_PORT, cds to the repo root, defines fp, fp_check, backup, restore, restore_pending, port_pids, dev_start, dev_wait, dev_stop.
- Mutation rules: (1) `backup <file> || { echo "backup failed, nothing mutated"; exit 1; }` first; (2) the mutation writes from the backup copy (`... "$SCRATCH/bak/$f" > "$f"`), never in place; (3) the red run's status is captured with `; echo "rc=$?"`, never chained with `&&`; (4) `restore <file>` later in the SAME call regardless. No repo file is left mutated at the end of a call. Pending-diff files are never restored with git checkout/restore/stash/clean, and restoration is never "proved" with git status.
- Job control only inside `dev_start` (`bash -c 'set -m; ...'`), zsh rejects `set -m`.
- Waiting uses `curl --retry --retry-connrefused` or the loop in `dev_stop`; no bare sleep at call start.
- Calls running `docker compose up --build` or a full `pnpm build` pass `timeout: 600000`. If one is killed anyway, the next preamble's `restore_pending` repairs files; report that it happened.
- For any `grep -c`, read the number and keep `|| true`.

### 0. Setup and pending-diff fingerprint (after the coder, before check 1; 3000 must be free)

Call 0a:
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
EOF
. /private/tmp/academy-tester-1/helpers.sh || exit 1
: "${SCRATCH:?}"
if [ -e .env ]; then echo existed > "$SCRATCH/rootenv"; fi
port_pids && echo "3000 BUSY at start: stop and report" || echo "3000 free at start"
fp > "$SCRATCH/fp0" && echo "fp0=$(cat "$SCRATCH/fp0")" && fp_check
```
Root `.env` state is recorded here, so check 20 deletes `.env` only if this run created it, even if check 9 never ran.

Call 0b (prove the fingerprint can go red):
```sh
. /private/tmp/academy-tester-1/helpers.sh || exit 1
: "${SCRATCH:?}"
restore_pending
backup README.md || { echo "backup failed, nothing mutated"; exit 1; }
{ cat "$SCRATCH/bak/README.md"; printf '\n'; } > README.md
fp_check; echo "red rc=$? (expect 1, PENDING DIFF CHANGED)"
restore README.md
fp_check
```

### Checks (one block = one call; `# preamble` = the 3 lines above)

Call 1:
```sh
# preamble
pnpm --version   # 10.28.0
pnpm install --frozen-lockfile; echo "install rc=$?"
```

Call 2-4 (timeout 600000):
```sh
# preamble
rm -rf apps/web/.next apps/web/next-env.d.ts packages/lesson-schema/dist .turbo apps/web/.turbo packages/lesson-schema/.turbo
pnpm lint && TURBO_FORCE=true pnpm typecheck && TURBO_FORCE=true pnpm test && TURBO_FORCE=true pnpm build; echo "check3 rc=$?"
git status --porcelain   # check 4: nothing beyond the pending diff
fp_check                 # check 4: tsconfig and everything else unchanged by build
```

Call 5-6 (timeout 600000):
```sh
# preamble
echo "filesystem-access=$(TURBO_FORCE=true pnpm build 2>&1 | grep -ci 'filesystem access' || true)"   # 0
rg -n 'next/font/google' apps/web || echo "no next/font/google"
rg -n '[а-яА-ЯёЁ]' apps/web .dockerignore docker-compose.yml .github/workflows/ci.yml README.md || echo "no Cyrillic"
# 5b: every match is printed and READ, never just counted.
rg -n ' as |!\.|baseURL!|<string>baseURL' apps/web/e2e apps/web/playwright.config.ts || echo "no assertion/non-null candidates"
rg -n -A2 'baseURL === undefined' apps/web/e2e/home.spec.ts
TURBO_FORCE=true pnpm typecheck; echo "check6 rc=$?"
```
5b: any `as`, `!` or `<string>` applied to `baseURL` FAILS; other matches (e.g. `import ... as`) are read and justified in the report; `baseURL === undefined` exactly once, followed by a `throw`.

Call 7 (dev smoke):
```sh
# preamble
dev_start || exit 1
dev_wait && echo "courses=$(curl -s http://localhost:3000/ | grep -c '>Courses<' || true)"   # >= 1
dev_stop
curl -s -o /dev/null --max-time 2 http://localhost:3000/ && echo "3000 STILL ANSWERS" || echo "3000 refused"
git status --porcelain | grep -F AGENTS.md || echo "no AGENTS.md"
fp_check
```

Call 8 (unit-test guard):
```sh
# preamble
f=apps/web/components/course-list.tsx
backup "$f" || { echo "backup failed, nothing mutated"; exit 1; }
sed 's/No courses yet/No courses/' "$SCRATCH/bak/$f" > "$f"
cmp -s "$f" "$SCRATCH/bak/$f" && echo "MUTATION DID NOT APPLY: string not in component, red run below is meaningless"
pnpm --filter @academy/web test; echo "red rc=$? (expect != 0, only the empty-state test failing)"
restore "$f"
pnpm --filter @academy/web test; echo "green rc=$?"
fp_check
```
If the string is not in the component, choose another one-token edit of the empty-state branch, written from the backup; never in place.

Call 9a (canary + compose up, timeout 600000):
```sh
# preamble
[ ! -e apps/web/.env ] || { echo "apps/web/.env already exists: stop and report"; exit 1; }
printf 'CANARY_SECRET=canary-dummy-value\n' > apps/web/.env || exit 1
[ -e .env ] || cp .env.example .env || exit 1
docker compose config --quiet && docker compose up -d --build --wait; echo "up rc=$?"
docker compose ps   # both healthy
```

Call 9b (inspections, no mutation):
```sh
# preamble
docker compose exec -u root web find / -xdev -name '.env*' 2>/dev/null || true          # stdout empty
docker compose exec -u root web grep -rl canary-dummy-value /app 2>/dev/null || true     # stdout empty
docker compose exec web id -u                                                            # 1000
docker compose exec web sh -c 'touch apps/web/server.js'; echo "rc=$? (expect != 0, permission denied)"
docker compose exec web sh -c 'touch apps/web/.next/cache/probe && rm apps/web/.next/cache/probe'; echo "rc=$? (expect 0)"
echo "courses=$(curl -fsS http://127.0.0.1:3080/ | grep -c '>Courses<' || true)"         # >= 1
echo "x-powered-by=$(curl -sI http://127.0.0.1:3080/ | grep -ci '^x-powered-by' || true)" # 0
```

Call 9c (env-pattern red run, restore in the same call, timeout 600000):
```sh
# preamble
backup .dockerignore || { echo "backup failed, nothing mutated"; exit 1; }
awk '$0=="**/.env" || $0=="**/.env.*" { print "# " $0; next } { print }' "$SCRATCH/bak/.dockerignore" > .dockerignore
removed=$(diff "$SCRATCH/bak/.dockerignore" .dockerignore | grep -c '^<' || true)
added=$(diff "$SCRATCH/bak/.dockerignore" .dockerignore | grep -c '^>' || true)
nextenv=$(grep -cxF '**/next-env.d.ts' .dockerignore || true)
echo "removed=$removed added=$added next-env=$nextenv (expect 2 2 1)"
if [ "$removed" = 2 ] && [ "$added" = 2 ] && [ "$nextenv" = 1 ]; then
  docker compose up -d --build --wait web; echo "red build rc=$?"
  docker compose exec -u root web find / -xdev -name '.env*' 2>/dev/null || true   # must list /app/apps/web/.env
else
  echo "MUTATION NOT AS DESIGNED: red run skipped, design deviation, report"
fi
restore .dockerignore
```

Call 9d (restored image clean with canary still present, timeout 600000):
```sh
# preamble
test -e apps/web/.env && echo "canary present (expected)"
docker compose up -d --build --force-recreate --wait web; echo "rc=$?"
docker compose exec -u root web find / -xdev -name '.env*' 2>/dev/null || true   # stdout empty
rm apps/web/.env && test ! -e apps/web/.env && echo "canary removed"
fp_check
```

Call 10 (compose and dev together):
```sh
# preamble
curl -fsS -o /dev/null http://127.0.0.1:3080/ && echo "3080 up"
dev_start || exit 1
dev_wait && echo "3000 up"
curl -fsS -o /dev/null http://127.0.0.1:3080/ && echo "3080 up alongside 3000"
dev_stop
curl -fsS -o /dev/null http://127.0.0.1:3080/ && echo "3080 still up"
fp_check
```

Call 11:
```sh
# preamble
pnpm --filter @academy/web exec playwright install chromium --only-shell; echo "install rc=$?"
E2E_BASE_URL=http://127.0.0.1:3080 pnpm test:e2e; echo "e2e rc=$? (expect 0)"
```

Call 12 (reachability):
```sh
# preamble
docker compose stop web
E2E_BASE_URL=http://127.0.0.1:3080 pnpm test:e2e; echo "red rc=$? (expect != 0, failing at goto)"
docker compose start web; docker compose up -d --wait web; echo "rc=$?"
docker compose ps web   # healthy
fp_check
```

Call 13 (static guard in isolation):
```sh
# preamble
docker compose exec -u root web rm -rf /app/apps/web/.next/static
docker compose ps web   # still healthy
E2E_BASE_URL=http://127.0.0.1:3080 pnpm test:e2e; echo "red rc=$? (expect != 0 on the '>= 400' assertion listing /_next/static/... URLs; not goto, not h1, not 'at least one /_next/static')"
docker compose up -d --force-recreate --wait web; echo "rc=$?"
docker compose exec web sh -c 'ls apps/web/.next/static | head -1'   # non-empty
E2E_BASE_URL=http://127.0.0.1:3080 pnpm test:e2e; echo "green rc=$?"
fp_check
```

Call 14-16:
```sh
# preamble
docker compose down -v
command -v actionlint >/dev/null && actionlint .github/workflows/ci.yml || echo "actionlint not installed: parse YAML another way"
```
Check 15 deps audit (section 3 rule): read apps/web/package.json against `rg` hits in apps/web sources, CSS and scripts. Check 16 without actionlint: parse YAML with any parser; real proof is PR CI `checks` and `e2e` green.

Call 17 (port override, timeout 600000):
```sh
# preamble
WEB_PORT=3081 docker compose up -d --build --wait web; echo "rc=$?"
E2E_BASE_URL=http://127.0.0.1:3081 pnpm test:e2e; echo "e2e rc=$? (expect 0)"
docker compose down -v
docker compose ps -a   # no rows
fp_check
```

Call 18 (dirty-tree guard in a throwaway worktree):
```sh
# preamble
cat > "$SCRATCH/dirty-tree.sh" <<'EOF'
<paste the run: body of the CI step "fail if the build changed tracked files" verbatim>
EOF
grep -nF 'git status --porcelain' .github/workflows/ci.yml   # show the source lines next to the copy
wt="$SCRATCH/wt"
git worktree add --detach "$wt" HEAD || exit 1
(cd "$wt" && bash -e "$SCRATCH/dirty-tree.sh"); echo "clean rc=$? (expect 0)"
printf '\n' >> "$wt/.nvmrc"
(cd "$wt" && bash -e "$SCRATCH/dirty-tree.sh"); echo "tracked-edit rc=$? (expect 1, ' M .nvmrc' + diff)"
git -C "$wt" checkout -- .nvmrc
[ -z "$(git -C "$wt" status --porcelain)" ] && echo "worktree clean after revert"
: > "$wt/stray.txt"
st=$(git -C "$wt" status --porcelain)
[ "$st" = "?? stray.txt" ] && echo "porcelain is exactly '?? stray.txt'" || echo "UNEXPECTED porcelain: [$st]"
(cd "$wt" && bash -e "$SCRATCH/dirty-tree.sh"); echo "untracked rc=$? (expect 1, lists ?? stray.txt)"
git worktree remove --force "$wt"
git worktree list   # main tree + pre-existing ones (e.g. .claude/worktrees/15-module-introduction-7cf70d) only
fp_check
```
Quoted heredoc copies the CI body as-is; `bash -e` matches the GitHub Actions default shell; `.nvmrc` is reverted with git only inside the throwaway worktree.

Call 19 (optional, timeout 600000):
```sh
# preamble
f=apps/web/lib/courses.ts
backup "$f" || { echo "backup failed, nothing mutated"; exit 1; }
<write the value-import variant FROM "$SCRATCH/bak/$f" into "$f", e.g. a heredoc or sed that adds a runtime import of a lesson-schema export and references it>
echo "with value import: $(TURBO_FORCE=true pnpm build 2>&1 | grep -ci 'filesystem access' || true)"   # >= 1
restore "$f"
echo "restored: $(TURBO_FORCE=true pnpm build 2>&1 | grep -ci 'filesystem access' || true)"           # 0
fp_check
```
If still 0 with the value import, report check 5 as a dead guard.

Call 20 (final state; always run, even after a failed check):
```sh
# preamble
dev_stop                                   # ends with "port 3000 free"
docker compose down -v; docker compose ps -a   # no rows
git worktree list | grep -qF "$SCRATCH/wt" && git worktree remove --force "$SCRATCH/wt"
test ! -e apps/web/.env && echo "no canary"
if [ -e "$SCRATCH/rootenv" ]; then echo "root .env pre-existed: kept"; else rm -f .env && echo "root .env created by this run: removed"; fi
leftover=$(find "$SCRATCH/bak" -type f 2>/dev/null)
[ -z "$leftover" ] && echo "no unrestored backups" || echo "UNRESTORED: $leftover"
echo "fp0=$(cat "$SCRATCH/fp0")"; fp_check; fp_rc=$?
docker image prune -f   # dangling (untagged) images only; academy-web:local stays tagged
if [ "$fp_rc" = 0 ] && [ -z "$leftover" ] && [ "$SCRATCH" = /private/tmp/academy-tester-1 ]; then rm -rf "$SCRATCH" && echo "scratch removed"; else echo "scratch KEPT for inspection: $SCRATCH"; fi
```
Report includes fp0, every `restored ... (cmp OK)` line, every `rc=` line, final `port 3000 free`. Scratch deleted only on matching fingerprint and no leftover backup.

## Changelog (round 3 -> Revision 4)
1. Ops blocking 1 (shell state): fixed scratch `/private/tmp/academy-tester-1` (0a refuses a stale one); helpers in `$SCRATCH/helpers.sh` sourced by a 3-line preamble every call with `: "${SCRATCH:?}"`; each negative run (0b, 8, 9c, 19) does backup -> mutate-from-backup -> red -> restore (cp+cmp) in ONE call; `restore_pending` repairs killed calls; check 20 asserts no backup left; execution model stated; every block = one call.
2. Ops blocking 2 (dev server): `dev_start` via `bash -c 'set -m; ...'`, refuses busy 3000; `dev_wait` with curl retry; `dev_stop` kills process group then lsof fallback (printf | xargs since zsh does not word-split), only for a server this run started; check 20 must print `port 3000 free`.
3. Arch 5b: matches read, `<string>baseURL` forbidden, `baseURL === undefined` exactly once + throw.
4. Arch 18: worktree empty after revert, porcelain exactly `?? stray.txt`; script runs with `bash -e`.
5. Security 20: `docker image prune -f` (dangling only), `rm -rf "$SCRATCH"` only on clean result and exact path.
6. macOS `cp -n` exits 1 on existing target: 9a uses `[ -e .env ] || cp .env.example .env`.
7. Root `.env` state recorded in 0a.
8. Check 9 split into 9a-9d, each build-heavy call with its own 600000 ms timeout.
9. Section 9 rows updated. No impact on ADR, coder steps or product files.
