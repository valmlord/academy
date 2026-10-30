# #29 design review, round 2: architecture

Reviewer: judge-architecture. Phase: judge_design, round 2. Inputs read: `plans/29-sign-in-dashboard-design.md`
(revision 2, in full), `docs/adr/0008-authentication.md`, `git diff docs/adr/0007-progress-data-model.md`, my
round-1 review, `.claude/feedback/architect_mistakes.md`, `judge_mistakes.md`; repo state: `.github/workflows/ci.yml`,
`docker-compose.yml`, `turbo.json`, root `package.json`, `.env.example`, `biome.json`, `apps/web` (`package.json`,
`tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `next.config.ts`, `instrumentation.ts`, `Dockerfile`,
`app/layout.tsx`, `app/page.tsx`, `lib/copy.ts`, `lib/courses.ts`, `lib/startup*.ts`, `e2e/home.spec.ts`,
`scripts/check-image-migrations.sh`), `packages/db` exports and integration harness; issues #29, #30, #35, #79
(`gh issue view`); `design/pages/dashboard/prototype.html:25-37`, acceptance tab order (line 83).

## Round-1 findings

### 1. Step order and CI ("supply before require"): fixed

I walked all 50 steps against what each CI job runs on that commit (`checks`: lint, typecheck incl. `e2e/**`,
unit, `next build` without env; `db`: append-only, drift, `pnpm test:integration`; `e2e`: `cp .env.example`,
compose config, `up --wait` + healthcheck, image checks I1/I2(/I3*), seed, Playwright).

- Secret: compose `:?`, `.env.example`, turbo `dev.passThroughEnv` and the CI generate step land in step 8, the
  startup check in step 9, both in commit 4. I2 after step 9: `docker compose run -e DATABASE_URL=...@db:1 web`
  still gets the valid secret from `.env` interpolation, passes the secret check and fails at connect, so
  `MigrationError stage connect` holds. I3/I3b/I3c (step 10) override with `-e`; `readAuthSecret` checks
  `BETTER_AUTH_SECRETS` first, so I3c's message does not depend on the other value.
- Proxy: sign-in page (step 34), seeded user (step 25, CI seed step), Playwright `setup` + storage state +
  `test:e2e.passThroughEnv += SEED_*` (step 35) all precede the proxy (step 36). Healthcheck: Node `fetch` on
  `/` -> 307 -> `/sign-in` 200. I checked the Location under the standalone server's `HOSTNAME=0.0.0.0`
  (`Dockerfile:21`): Next builds `initURL` from `opts.hostname` (`router-utils/resolve-routes.js:118`), but the
  proxy adapter relativizes a same-origin redirect (`server/web/adapter.js:426`, `getRelativeURL`), so the
  Location is `/sign-in?next=%2F`, the follow-up `Host` is `127.0.0.1:3000` and passes `allowedHosts`.
  `home.spec.ts`'s three tests run signed in from step 35 on, so they stay green after step 36.
- `lib/courses.ts` is deleted in step 47, the same step that drops `home.spec.ts`'s import (the only importer
  besides `app/page.tsx` and `components/course-list.tsx`, both deleted there); typecheck stays green.
- Seed in CI (step 25): `^build` builds `@academy/db`/`lesson-schema` on a runner with no `dist/`;
  `process.loadEnvFile` does not override the inline `DATABASE_URL`; the secret comes from `.env`;
  `grep -qF 'seed: created'` still matches through turbo's line prefix.
- U-guard (step 37): at that point the real tree has one page (`app/page.tsx`, guarded since step 36), one
  route, one `"use server"` module, so the "at least one of each" assertion holds; `app/(app)/actions.ts`
  joins the allowlist in the step that creates it (42), so no stale entry.
- Count: header says 50; section 14 has 50.
- Step sizes: most are now plausible at <= 60. Two estimates are still low (condition C3).

### 2. Dashboard deviations, owners, waiver: fixed

- `gh issue view 30` / `35`: both bodies carry the 9.2 texts verbatim; #35 is blocked by #30. The owner split
  matches the round-1 fix (data ACs to #30 / #35, AC7 conditional in #30, Skeleton in #30).
- "Выйти": the prototype draws `a.dropdown-item[role=menuitem]` to the signed-out sign-in state
  (`prototype.html:33`); 4.15 keeps exactly that element and intercepts activation into a POST server action,
  so there is no deviation and no GET sign-out. E-out-1's M-menu (plain navigation) goes red at the URL
  assertion because a signed-in visitor on `/sign-in` is redirected to `/` (4.10).
- "Курс": #79 exists (M0, `team:design`, `tier:design`) with the body of 9.2; the PR's "Design deviations"
  row carries its number. The waiver for the data rows is dated, scoped to #29, repeated verbatim in the PR
  body, and confirmed by Stepan at merge (16.2). That satisfies ADR-0006 item 5 as applied.

### 3. ADR-0007 amendment: fixed

`git diff`: item 6 now says #78 owns the flow (dated), item 8 states that one-shot operator commands of the
`apps/web` package count as `apps/web` and that anything else is a second client needing this item changed, a
dated amendment note in Consequences cites item 10 (Stepan approves in the PR), status stays Accepted (the
#1 precedent). Design 3.3 lists the file; ADR-0008 items 10 and 12 point back at it consistently.

### 4. `server-only` under Vitest/tsx: fixed

`npm view server-only@0.0.1 exports`: `{"react-server": "./empty.js", "default": "./index.js"}`, single
version (V18 confirmed). Route handlers, RSC and actions resolve `react-server`; Vitest (jsdom and node) and
tsx resolve `default`, which throws, so a test or the seed importing a wiring file fails at load. All tested
logic sits in marker-free modules with injected deps; the seed's import list (4.5) excludes both wiring files.
No alias, so a real client import of a wiring file still fails the Next build. Step order backs this up for
U-form: `sign-in-form.tsx` (steps 30-33) exists before `app/sign-in/actions.ts` (step 34), so it must receive
`needsSeedHint` as a prop.

## New in revision 2: checked

- `globalThis` memo (A1 adopted), React `cache()` read, `needsSeedHint` as stated DAL exception in ADR-0008
  item 8 and the U-guard allowlist: consistent.
- Rollback note (A4) in section 11: correct (an identical `0001` keeps its journal `when`, so the migrator treats it as applied).
- I-dal precondition: `next-js.mjs` before-hook returns at `_flag === "router"` and on a `headers()` throw
  (unpacked 1.7.14, lines 48-54), as V15 says, so (d) can go red under M14 and (e) is a real positive control.
- 13.5 isolation: compose interpolation of `DB_PORT`/`WEB_IMAGE_TAG` lands in step 1 before any role runs the
  wrapper.

## Conditions for the plan (not blocking; the orchestrator writes them into `plans/29-*.md` in the planner phase)

- **C1 U-guard scans its own fixtures.** The real-tree scan covers every file under `lib/` containing a
  `"use server"` directive, and comments are stripped but strings are not. `lib/entry-guard.test.ts` holds
  in-memory sources with `"use server"` (including the inline case), so the real-tree run lists it as an
  inline directive and fails "outright" at step 37, before any product file is wrong. State the rule: the real
  tree skips `*.test.ts(x)` files (they are never entry points), and `lib/entry-guard.ts` keeps its directive
  pattern free of the literal text (or is skipped with a stated reason).
- **C2 rg globs are anchored to the cwd.** Run from the repository root (as every other command), `rg ...
  apps/web --glob 'test/**' --glob 'scripts/**' --glob 'lib/seed*.ts'` matches none of those paths (tested:
  `rg -l connectHint apps/web --glob 'lib/startup*.ts'` exits 1; with `**/lib/startup*.ts` it finds the file).
  So [G] only checks `*.test.*` and silently skips the seed script and the integration helpers. Step 29's
  Cyrillic check has the same flaw: `--glob '!lib/copy.ts'` does not exclude `apps/web/lib/copy.ts`, and it
  also lists `lib/courses.ts` until step 47. Use `apps/web/...` or `**/...` globs, expect `lib/courses.ts`
  until step 47, and update `lib/copy.ts`'s header comment ("or in the stub data of lib/courses.ts") in step 47.
  The runtime throw (V18) remains the primary guard, so this is not a hole, but the grep must be able to fail.
- **C3 split two steps.** Step 37 (scanner with comment stripping, directive position, export counting,
  allowlist validation, nine in-memory cases, a real-tree walk) is well over 60 LOC: split scanner + in-memory
  cases / real-tree test + allowlist. Step 13 copies a 35-line global setup plus config, db helper and smoke
  test (~80): split harness / per-test db helper + smoke.
- **C4 section 8 sketch.** `<SignInForm next signedOut />` omits the `needsSeedHint` prop; write
  `needsSeedHint={needsSeedHint}` (a server action passed from the page) so the form never imports
  `app/sign-in/actions.ts` (which reaches `server-only` and would make U-form throw at load).
- **C5 Playwright storage state and Biome.** `biome.json` does not use the VCS ignore file and excludes
  `playwright-report`/`test-results` by hand; add `!**/playwright/.auth` in step 35, or a local `pnpm lint`
  after an e2e run checks the generated cookie file.
- **C6 wording.** "Every step leaves all of them green" is true per commit, not per step (step 2 leaves the
  drift check red until step 3; same commit). Say "every commit".

PASS
