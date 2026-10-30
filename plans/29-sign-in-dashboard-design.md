# Issue #29 design (architect phase, revision 3): sign-in and dashboard (Better Auth)

## Revision 3 (2026-10-30): changes after judge_design round 2 (operations PASS, architecture PASS with C1-C6, security FAIL)

Reviews: `plans/29-sign-in-dashboard-design-review-2-{architecture,operations,security}.md`. Narrow fixes
only; nothing else changed. New Better Auth fact V19 (sign-out error handling) read in the unpacked
`better-auth@1.7.14` tarball.

| Finding | Fix | Where |
|---|---|---|
| S2-1 sign-out revocation untested; wrong failure-mode row | V19: `signOut` catches the DB delete failure itself and always deletes the cookie (`api/routes/sign-out.mjs:42-54`). E-out-1 saves the session cookie before "Выйти", proves it valid (positive control), and after the redirect asserts `GET /api/auth/get-session` with it returns JSON `null`; mutation M-revoke-out (headers without the cookie passed to `auth.api.signOut`). Sign-out flow, decision 2 and the failure rows corrected; the swallowed DB failure is a stated residual | 0 V19, 4.2, 8 "Sign-out", 10, 13.3 E-out-1; ADR-0008 item 5 and residuals |
| S2-2 guard exempts whole files, counts only recognised exports, scans three folders | allowlist entries name the export (`file#name`); file entries only for a `page.tsx` or `route.ts`; every `export` of a `route.ts` / `"use server"` module must match a recognised function form (route segment config and type exports excepted) or the file is listed; each non-allowlisted export's own segment needs a DAL call; the walk covers all of `apps/web` except `node_modules`, `.next`, `e2e`, `test`; mutations M-guard-export, M-guard-unrec, M-guard-root | 4.8, 13.1 U-guard, 14 steps 37a-37c, 42; ADR-0008 item 8 |
| N2-1 `host` header in direct reader calls | I-dal and I-redact pass `host: 127.0.0.1:3080` with the cookie | 13.2 |
| N2-2 one wording for `needsSeedHint` | "one existence query, `SELECT 1 FROM users LIMIT 1` through `getDb()`" in both | 4.8, 8; ADR-0008 item 8 |
| C1 U-guard scans its own fixtures | the walk skips `*.test.ts(x)`; `lib/entry-guard.ts` matches the directive without containing it as a quoted literal | 4.8, 13.1 U-guard |
| C2 rg globs not anchored | [G] and step 29 use `apps/web/...` / `**/...` globs (rehearsed: `rg -l connectHint apps/web --glob 'apps/web/lib/startup*.ts'` finds the file); step 29 expects `apps/web/lib/courses.ts` until step 47; [G] proven red once; step 47 updates the `lib/copy.ts` header comment | 14 [G], 29, 12, 47 |
| C3 steps 13 and 37 over 60 LOC | 13 -> 13a, 13b; 37 -> 37a, 37b, 37c; 53 steps | 14 |
| C4 `needsSeedHint` prop missing in the sketch | `<SignInForm next signedOut needsSeedHint={needsSeedHint} />` | 8 |
| C5 storage state linted | `biome.json` gains `!**/playwright/.auth` in step 35 | 3.3, 14 step 35 |
| C6 "every step" | "every commit leaves all of them green" | 14 |
| ops: bare `config` | read-only `docker compose config` (steps 1, 8) is the one stated exception to "only through `t29`"; step 1's no-env check runs without the sourced file | 13.5, 14 steps 1, 8 |
| ops: node trace after a failed `config` | the wrapper silences node's stderr and prints `t29 REFUSED: compose config failed` (re-rehearsed in bash 3.2 and zsh) | 13.5 |
| ops: Stepan's own stack during the task | no `docker compose up --build` of project `academy` from this checkout until merge; `0001_auth` frozen after step 3 | 16 |

## Revision 2 (2026-10-30): changes after judge_design round 1 (0/3)

Reviews: `plans/29-sign-in-dashboard-design-review-1-{architecture,operations,security}.md`. Every finding
id maps to where it is fixed. New Better Auth facts are V12-V18 in section 0, read in the unpacked
`better-auth@1.7.14` / `@better-auth/core@1.7.14` tarballs.

| Finding | Fix | Where |
|---|---|---|
| A1 step order breaks CI; count wrong; oversized steps | steps re-ordered by commit; "supply before require" (compose/CI/secret before the startup check, sign-in page and e2e auth before the proxy, `home.spec.ts` edited in the step that deletes `lib/courses.ts`); every step names the CI jobs it keeps green; 50 steps, none over 60 LOC; header count fixed | 14, 15 |
| A2 dashboard deviations, owners, ADR-0006 item 5 | dated waiver (2026-10-30, Stepan) for the data ACs; owners split #30 / #35 with the exact text each issue body must gain; "Выйти" deviation eliminated (prototype markup, POST-backed); "Курс" omission kept with a DESIGN follow-up issue (title and body written out) | 9.2, 9.4, 16 |
| A3 ADR-0007 not amended | ADR-0007 items 6 and 8 edited in place plus a dated amendment note in Consequences (status stays Accepted) | `docs/adr/0007-progress-data-model.md`, 3.3 |
| A4 `server-only` untestable | `server-only@0.0.1` exact dependency; the marker only on two wiring files; all logic in marker-free modules with injected deps; tests and the seed never import the wiring files (an import throws at load under Vitest and tsx, V18) | 4.16, 3.2 |
| O1 seed cannot build its imports | turbo task `seed` with `dependsOn: ["^build"]`, `cache: false`, `passThroughEnv`; root `seed` runs it; CI seed step proves it on a runner without `dist/` | 4.5, 6.7, 6.4 |
| O2 isolation incomplete (scripts, image tag, coder, `down -v`) | `DB_PORT` and `WEB_IMAGE_TAG` in compose (step 1); one sourced env file with `COMPOSE_PROJECT_NAME=academy-t29` and a hard-coded `t29` wrapper that refuses `-p`/`-f` and a foreign project; volume `CreatedAt` and root `.env` checked before/after; applies to coder and tester; nobody creates the root `.env` | 13.5 |
| O3 seed not restart-safe; pool not closed | create / link-missing-account / update, each rerun converges; I-seed case 7 starts from the half-written state; `close()` in `finally` (U-seedcli); CI step timeout | 4.5, 13.1, 13.2 |
| O4 env docs | `DB_PORT`, `WEB_IMAGE_TAG` in `.env.example`; `AUTH_ALLOWED_HOSTS` fallback names `.env.example` and `dev.passThroughEnv`; README order after merge, and "`up -d --wait db` needs the secret" | 6.2, 6.3, 11 |
| S-F1 I-dal M14 cannot go red | precondition `expires_at = now + 5 d` (Better Auth refreshes when `expires_at <= now + 6 d`, V14) plus a positive control through the handler | 13.2 I-dal |
| S-F2 U-log canary on line 2; naive assertion | canary on line 1 of the Drizzle case; a non-Drizzle multi-line case; every argument of every sink and spied `console.*` call serialised with `util.inspect(arg, { depth: 10 })` | 13.1 U-log, 13.2 I-redact |
| S-F3 I-host expects a response | asserts the rejection message from `utils/url.mjs:214` and no new `sessions` row; the browser sees 500 -> AC6 | 13.2 I-host, 8 |
| S-F4 `BETTER_AUTH_SECRETS` | refused when set and non-empty, in `readAuthSecret`, with U-secret cases, a mutation and image check I3c | 4.4, 6.5, 13.1, 13.4 |
| S-F5 re-key keeps sessions | `deleteUserSessions(userId)` (V16; not `deleteSessions`, which takes tokens) after update and after link; I-seed (3) and (7) | 4.5, 13.2 |
| S-F6 guard covers pages only | U-guard scans pages, `route.ts`, `"use server"` modules, rejects inline `"use server"`, explicit allowlist with reasons, comments stripped | 4.8, 13.1 U-guard |
| S-F7 control-char exploit spelling; M2 claim | `/\t/evil.example`, `/\n/...`, `/\r/...` cases with M-ctrl; M2 split into M2 / M2b with correct red cases; E-in-5 gains `%2F%09%2Fevil.example` | 13.1 U-next, 13.3 |
| S-F8 password on the command line | README and 11 document only the `.env` route or `read -rs`; no inline form anywhere | 11 |
| adopted non-blocking | CI `::add-mask::` for secret and password (6.4); React `cache()` for the session read (4.17); `globalThis` memo against the dev HMR pool leak (4.7); `needsSeedHint` as the explicit DAL exception (4.8, ADR-0008 item 8); seed connect hint on the connect class only (7 L5); pool close in `finally` (O3); rollback note on re-landing the identical `0001` (11); T-xff fallback spelled out (13.3); residuals N1, N2, unused endpoints, local traces in ADR-0008; I-redact under M10 reported as evidence if it stays green (13.2) | as listed |

Tier: **PROJECT**. The issue carries `tier:task`; the orchestrator runs PROJECT because auth plus the
dashboard is well over 3 files and 100 LOC (section 14 has 53 steps). Suggest relabelling #29
`tier:project` (the label exists in `.github/labels.yml`).

Upstream facts: `plans/29-sign-in-dashboard-research.md` (cited "R§n"). Binding decisions by Stepan
(2026-10-30): the dashboard ships an EMPTY state, nothing reads `course/` (real data later); account
deletion moved to #78 (blocked by #29 and #38), the `ON DELETE CASCADE` of the new FKs stays here.

## 0. Facts re-verified for this design (2026-10-30)

Paths are relative to `better-auth/dist/` unless they name `@better-auth/core` or `next`.

| # | Fact | Source |
|---|---|---|
| V1 | The rate limiter runs only in the HTTP router's `onRequest`; a direct `auth.api.signInEmail(...)` call is never rate limited. | `api/index.mjs:173`, `api/rate-limiter/index.mjs:292` |
| V2 | `rateLimit.enabled` defaults to `isProduction`. | `context/create-context.mjs:172` |
| V3 | `skipOriginCheck` defaults to `true` when `NODE_ENV=test` unless `advanced.disableOriginCheck` is set. | `create-context.mjs:211` |
| V4 | `validateOrigin` runs for POSTs with a `Cookie` header (or forced); otherwise the Fetch-Metadata path decides. | `api/middlewares/origin-check.mjs:96-118` |
| V5 | Dynamic `baseURL: { allowedHosts, protocol }` resolves per request from `Host`, supports `*` wildcards, ignores `BETTER_AUTH_URL`, adds `http://<host>` to trusted origins for `protocol: "http"`. | `utils/url.mjs:151-214`, `context/helpers.mjs:60-145`, `create-context.mjs:59-65` |
| V6 | `advanced.useSecureCookies` wins when set; else `protocol: "http"` gives no prefix, `secure: false`. | `cookies/index.mjs:21-40` |
| V7 | Client IP from `x-forwarded-for`; one valid IP is trusted, two or more give `null`. Next 16.4.3 sets `x-forwarded-for ??= socket.remoteAddress`. | `@better-auth/core/dist/utils/ip.mjs:174-219`; `next/dist/server/base-server.js:601` |
| V8 | Router `onError` logs `ctx.logger.error(e.name, e)`, or `ctx.logger.error(e.message)` for messages naming "table", "relation", "column", "does not exist". | `api/index.mjs:196-220` |
| V9 | `nextCookies()` after-hook swallows a failing `cookies().set`; `getSession({ query: { disableRefresh: true } })` returns before any refresh. | `integrations/next-js.mjs:72-98`; `api/routes/session.mjs:170` |
| V10 | `internalAdapter` exposes `findUserByEmail`, `createUser`, `linkAccount`, `findCredentialAccount`, `updatePassword`, `countTotalUsers`, `deleteUserSessions`; `$context.password.hash` is the scrypt hash. | `db/internal-adapter.mjs:141-667` |
| V11 | `toNextJsHandler(x)` accepts a plain function. | `integrations/next-js.mjs:7-18` |
| V12 | `secretsArray = options.secrets ?? parseSecretsEnv(env.BETTER_AUTH_SECRETS)`; when present, `secret = secretsArray[0].value` replaces `options.secret` (warnings only). `parseSecretsEnv` returns `null` for `""`, and throws `Invalid BETTER_AUTH_SECRETS entry: "<entry>"` (the value echoed) for a malformed entry. | `create-context.mjs:70-76`; `context/secret-utils.mjs:13-22` |
| V13 | For a dynamic base URL, `handler` calls `resolveRequestContext` before the router (`auth/base.mjs:33`) -> `resolveBaseURL` (`utils/url.mjs:227-229`) -> `resolveDynamicBaseURL` throws `BetterAuthError('Host "<host>" is not in the allowed hosts list. ...')` with no `fallback` (`utils/url.mjs:214`). The handler promise rejects; no `Response`. | as cited |
| V14 | Refresh condition: `shouldBeUpdated = expiresAt - expiresIn*1000 + updateAge*1000 <= now` (`api/routes/session.mjs:180`), then `updateSession` (`:198`). With the defaults 7 d / 1 d a row refreshes only once `expires_at <= now + 6 d`; a fresh row (`now + 7 d`) never does, whatever `updated_at` says. | as cited |
| V15 | `nextCookies()` before-hook (only for `/get-session`): returns at once for router calls (`_flag === "router"`, `integrations/next-js.mjs:48`); for direct calls outside a Next request `headers()` throws and the hook returns without setting "skip refresh" (`:50-54`). Under Vitest both the handler path and a direct `auth.api.getSession` therefore refresh unless `disableRefresh` is passed. | as cited |
| V16 | `deleteUserSessions(userId)` deletes a user's sessions (`db/internal-adapter.mjs:518`); `deleteSessions` (`:538`) takes session **tokens**. `updatePassword(userId, hash)` updates where `userId`, `providerId = "credential"`, `accountId = userId` (`:642-655`): 0 rows, no error, when the account is missing. | as cited |
| V17 | `disabledPaths` is checked in the router's `onRequest` and answers 404 (`api/index.mjs:167-169`). Not used in #29 (ADR-0008 residual). | as cited |
| V18 | `server-only@0.0.1` (the only version) exports `{"react-server": "./empty.js", "default": "./index.js"}`; `index.js` throws `This module cannot be imported from a Client Component module...` on load. Next's server layers (RSC, actions, route handlers) resolve `react-server`; Vitest and tsx resolve `default`, so an import there throws at load. | `npm pack server-only@0.0.1`, run in the session scratchpad |
| V19 | `signOut` reads the signed session cookie from the headers it is given (`api/routes/sign-out.mjs:42`); `findSession` and `deleteSession` each run in their own `try/catch` that only calls `logger.error("Failed to delete session from database", e)` (`:44-53`); then it always calls `deleteSessionCookie` (`:54`) and resolves with success. A DB failure therefore never reaches the caller and the row survives until `expires_at`. Without the cookie in the headers it deletes nothing and still deletes the cookie. A direct call still throws for an unresolvable base URL (`api/to-auth-endpoints.mjs:20-24`). | as cited |

Not verifiable without a live run (each has a named check):
- U-1: Chromium sends a Playwright-set `X-Forwarded-For` (`route.continue({ headers })`) and Docker's
  userland proxy keeps it (T-xff, 13.3; fallback spelled out there).
- U-2: `matchesOriginPattern("http://127.0.0.1:3080", "http://127.0.0.1:*")` is true (I-origin; fallback 6.3).
- U-3: a module-level `betterAuth()` breaks `next build` (M23).
- U-4: BA's default logger prints the error object passed as an argument (I-redact under M10).

## 1. Solution

- **Auth core** in `apps/web/lib/auth/`: one options factory (`createAuthOptions`) and lazy, memoised
  `getAuth()` / `getDb()`; nothing reads env or opens a pool at import time, so `next build` needs no
  secret and no database. Better Auth 1.7.14 (exact pin), email and password only, sign-up disabled, rate
  limiter **always on**, origin check always on, dynamic base URL restricted to loopback hosts over
  `http`, no `Secure` cookies, a redacting logger.
- **Schema**: `sessions`, `accounts`, `verifications` in `packages/db/src/schema.ts` (`usePlural: true`),
  ADR-0007 style, FKs to `users` `ON DELETE CASCADE`; migration `0001_auth.sql` generated.
- **Two-layer protection**: `proxy.ts` (optimistic, cookie presence only) redirects every non-public path
  to `/sign-in?next=<path+query>`; the real check is the data access layer (`requireSession()` /
  `getSession()`) in every protected page, server action and route handler, enforced by a scanning unit
  test with an explicit allowlist.
- **Sign-in** posts from the browser to `POST /api/auth/sign-in/email` (limiter, origin and
  Fetch-Metadata apply); `next` is validated on the server. **Sign-out** is a server action invoked from
  the prototype's own link item, then `/sign-in?signed-out=1`.
- **Dashboard** `/`: top bar, user menu, "Уведомления" with both live containers, `F6` cycle, the designed
  "no ready lessons" Empty state (Stepan: empty state, real data in #30 / #35 under a dated waiver).
- **Seed** `pnpm seed` (turbo task, builds its workspace imports first) creates, repairs or re-keys the
  single user and revokes its sessions on re-key.

## 2. Scope

### 2.1 What #29 builds, from which source

| From | #29 builds | Because |
|---|---|---|
| issue AC1 "a lesson cannot be opened without signing in" | default-deny `proxy.ts` + DAL; e2e lesson URL redirects to sign-in (E-prot-2) | the lesson route arrives in #30; default deny covers it the day it exists; U-guard forces #30's page to call the DAL |
| issue AC2 "e2e: sign-in, sign-out, redirect" | `e2e/sign-in.spec.ts`, `sign-out.spec.ts`, `protection.spec.ts` | |
| issue AC3 "secrets only in env, `.env.example` updated" | `BETTER_AUTH_SECRET`, `SEED_*`, `DB_PORT`, `WEB_IMAGE_TAG`; compose `:?`; CI generates and masks | 6 |
| `design/pages/sign-in` (ready) | every AC1-AC12 | 9.1 |
| `design/pages/dashboard` (ready) | shell (top bar, user menu, "Уведомления", `F6`), Empty state; AC7 (unconditional), AC10-AC13 | Stepan; 9.2 waiver for the rest |
| ADR-0007 item 2 checks | ADR-0008 item 3 | 5.3 |
| ADR-0007 item 6 | `sessions_user_id_fk`, `accounts_user_id_fk` `ON DELETE CASCADE`; ADR-0007 amended (deletion flow -> #78) | 5.1 |
| ADR-0007 item 8 | the seed as an `apps/web` operator command; ADR-0007 amended | 4.5 |
| ADR-0007 Consequences (DB error logging) | L1-L5 (7) | |
| #1 leftovers | `onPoolError` owner, focus-ring exceptions (c), (d); `F6`; notifications region | R§11 |

### 2.2 What #29 does NOT build

- **Account deletion** (#78). Only the DB cascade.
- Course and progress data on the dashboard (9.2 waiver: #30, #35); the top bar link "Курс" (9.2, DESIGN
  follow-up); catalog, lesson and not-found pages.
- Sign-up, password reset, email verification, OAuth, "remember me", session list, admin, any plugin but
  `nextCookies()`; `disabledPaths` (ADR-0008 residual).
- The Better Auth browser client; cookie cache; secondary storage; DB rate-limit storage.
- A `lower(email)` constraint or index (5.3).
- `BETTER_AUTH_URL`, `BETTER_AUTH_SECRETS` (refused), `trustedOrigins`, TLS, a reverse proxy.
- `cacheComponents` / `partialPrefetching`.
- A visually hidden `role="status"` echo for "Входим..." (needs an `ia.md` R2 change first).
- A seed in the image, a seed that migrates, a seed that deletes users.
- Committing `npx auth generate` output.
- CI action-major upgrades, new CI jobs (`db` and `e2e` gain steps).

## 3. Files

### 3.1 packages/db
- `src/schema.ts`: `sessions`, `accounts`, `verifications` (5.1); the stale comments on `users` (5.4).
- `drizzle/0001_auth.sql`, `drizzle/meta/0001_snapshot.json`, `_journal.json` entry: generated only.
- `test/integration/schema.int.test.ts`: I-db-1..I-db-3.

### 3.2 apps/web (new unless marked)
- `package.json` (edit): deps `better-auth` `1.7.14` exact, `drizzle-orm` `^0.45.4` (same range as
  `@academy/db`), `server-only` `0.0.1` exact; devDeps `tsx` (exact), `@testcontainers/postgresql`
  `^12.2.1`; scripts `seed`, `test:integration`.
- Marker-free (importable by Vitest and tsx):
  - `lib/auth/env.ts`: `readAuthSecret(env)`, `InvalidAuthSecretError`.
  - `lib/auth/options.ts`: `createAuthOptions({ db, secret, log })`, `LOOPBACK_HOST_PATTERNS`.
  - `lib/auth/logger.ts`: `createAuthLog(sink)` (L2).
  - `lib/db-error.ts`: `describeDbError(error)` (L1).
  - `lib/session-reader.ts`: `createSessionReader({ getSession })`, `SessionReadError`.
  - `lib/next-path.ts`: `safeNextPath`, `signInPath`, `isPublicPath`.
  - `lib/sign-out.ts`: `createSignOut({ signOut, deleteCookie, redirect, log })`.
  - `lib/seed.ts`: `seedUser(ctx, input)`, `SeedConflictError`, `InvalidSeedInputError`.
  - `lib/seed-cli.ts`: `runSeed(deps)` (env read, hints, exit code, `close()` in `finally`).
  - `lib/entry-guard.ts`: `findUnguardedEntryPoints(files, allowlist)` (U-guard's scanner).
- Wiring, `import "server-only"` first (never imported by a test, the seed or a client component):
  - `lib/auth/index.ts`: `getAuth()`, `getDb()`.
  - `lib/session.ts`: `getSession()` (React `cache()`), `requireSession(returnPath)`.
- `scripts/seed.ts` (CLI: loads the root `.env` if present, calls `runSeed`).
- `proxy.ts`; `app/api/auth/[...all]/route.ts`.
- `app/sign-in/page.tsx`, `app/sign-in/actions.ts` (`needsSeedHint`).
- `app/(app)/layout.tsx`, `app/(app)/page.tsx` (replaces `app/page.tsx`), `app/(app)/actions.ts`
  (`signOutAction`).
- `components/sign-in-form.tsx`, `top-bar.tsx`, `user-menu.tsx`, `notifications.tsx`,
  `region-cycle.tsx`; `components/ui/*` from `shadcn add`.
- Deleted: `app/page.tsx`, `components/course-list.tsx`, `components/course-list.test.tsx`,
  `lib/courses.ts`, `e2e/home.spec.ts` (renamed to `e2e/dashboard.spec.ts` in step 48).
- Edited: `lib/copy.ts` (9.3), `app/globals.css` (focus-ring exceptions (c), (d), outside the token
  block), `lib/startup.ts`, `lib/startup-node.ts` (6.5), `vitest.config.ts` (exclude
  `**/*.int.test.ts`), `playwright.config.ts`, `scripts/check-image-migrations.sh` (I3, I3b, I3c).
- New tests: unit tests next to their modules (13.1); `vitest.integration.config.ts`,
  `test/integration/global-setup.ts`, `test/integration/db.ts` (db-per-test helper),
  `test/integration/*.int.test.ts`; `e2e/auth.setup.ts`, `e2e/fixtures.ts`, `e2e/protection.spec.ts`,
  `e2e/sign-in.spec.ts`, `e2e/sign-out.spec.ts`, `e2e/dashboard.spec.ts`.

### 3.3 Root and docs
- `.env.example`, `docker-compose.yml`, `turbo.json`, `package.json` (`seed`), `.gitignore`
  (`apps/web/playwright/.auth/`), `.dockerignore` (`**/playwright/.auth`), `biome.json`
  (`!**/playwright/.auth`: Biome does not read the VCS ignore file here), `.github/workflows/ci.yml`
  (e2e job steps), `README.md` ("Web app": secret, seed, sign-in, order after merge).
- `docs/adr/0008-authentication.md` (Proposed, written in this phase).
- `docs/adr/0007-progress-data-model.md` (amended in this phase: items 6 and 8, dated note in
  Consequences; status stays Accepted).

## 4. Key decisions (each with its because)

1. **Plural table names with `usePlural: true`**, because every ADR-0007 table is plural and the adapter
   resolves `schema[modelName]` (R§3). Rejected: singular names plus `user.modelName = "users"` (two
   conventions forever; ADR-0007 item 9 forbids renames). Costly to change: yes (ADR-0008 item 2).
2. **Sign-in from the browser to `POST /api/auth/sign-in/email`; sign-out as a server action**, because
   the limiter exists only on the HTTP path (V1) and a hand-written limiter is security-shaped code
   (code-style 7). On the HTTP path Better Auth also runs its origin / Fetch-Metadata checks (V4). The
   researcher's origin coupling (R§9) is removed by a dynamic base URL with `allowedHosts`
   `localhost:*`, `127.0.0.1:*`, `[::1]:*` and `protocol: "http"` (V5). A non-loopback `Host` makes the
   handler throw before the router (V13): no credential is checked, Next answers 500. Sign-out needs no
   limiter, Next's action origin check guards its CSRF, and only the server can clear the httpOnly cookie
   (Better Auth clears it even when its DB delete fails, V19; the action clears it when the call itself
   throws). Rejected: server-action sign-in plus own limiter; a fabricated `Request` for
   `auth.handler`; static `BETTER_AUTH_URL` (R7); the BA browser client.
3. **Rate limiter always on** (`rateLimit.enabled: true`, memory, defaults), because AC7 must hold in every
   run mode (V2). e2e isolates buckets with a unique `X-Forwarded-For` per credential-posting test (V7),
   a deliberate use of the documented residual; fallback in 13.3. Rejected: a test-only rule, sleeps,
   limiter off in e2e.
4. **Secret: generated per environment, validated everywhere.** `.env.example` documents a commented
   `# BETTER_AUTH_SECRET=` with the generation command; compose requires it (`:?`); CI generates and masks
   it. `readAuthSecret(env)` raises `InvalidAuthSecretError` for: missing or empty
   `BETTER_AUTH_SECRET`; Better Auth's default `better-auth-secret-12345678901234567890`; fewer than 32
   characters; **`BETTER_AUTH_SECRETS` set to anything but `""`** (V12: it would silently replace the
   validated secret, and Better Auth's own parse error echoes the value). The `BETTER_AUTH_SECRETS` check
   runs first, so its message never depends on the other value. Messages name the variable and the rule,
   never a value. Rejected: a committed dev value; supporting rotation (ADR-0008 alternatives).
5. **Seed: host-side, idempotent and convergent, revokes sessions on re-key.**
   - Invocation: root `pnpm seed` = `turbo run seed --filter=@academy/web`; turbo task `seed`:
     `{ "dependsOn": ["^build"], "cache": false, "passThroughEnv": ["DATABASE_URL", "BETTER_AUTH_SECRET",
     "SEED_*"] }`; `apps/web` script `seed` = `tsx scripts/seed.ts`. Because `@academy/db` and
     `@academy/lesson-schema` export only `dist/`, which is git-ignored (O1): `^build` builds both on a
     clean runner and rebuilds a stale local `dist/` (turbo hashes the sources). `passThroughEnv` because
     turbo's strict mode drops shell variables (CI's `SEED_*` live only in `$GITHUB_ENV`; the tester
     exports everything). The script also loads the root `.env` when it exists (shell wins, verified by
     the operations judge with `process.loadEnvFile`).
   - Algorithm (`seedUser`), each branch a single write or a converging sequence:
     1. validate input (`InvalidSeedInputError`, nothing written);
     2. `user = findUserByEmail(email)` (BA lowercases);
     3. no user: if `countTotalUsers() > 0` -> `SeedConflictError` (nothing written); else
        `createUser`, then `linkAccount({ providerId: "credential", accountId: user.id, password: hash })`
        -> `created`;
     4. user, `findCredentialAccount(user.id)` is null (a crash between the two writes of 3) ->
        `linkAccount(...)`, then `deleteUserSessions(user.id)` -> `repaired`;
     5. user with account -> `updatePassword(user.id, hash)`, then `deleteUserSessions(user.id)` ->
        `updated`.
     Crash windows: after `createUser` -> rerun takes 4; after `linkAccount`/`updatePassword` but before
     `deleteUserSessions` -> rerun takes 5 and deletes. Two concurrent seeds: one `createUser` fails with
     `23505 users_email_unique`, printed as one error line; a rerun converges. Not one transaction, because
     the internal adapter's writes are not composable into our transaction without reaching further into
     semi-internal API; convergence is tested instead (I-seed 7).
   - `deleteUserSessions` (V16), because re-keying is the only recovery path and must end the sessions of
     whoever had the old password (security F5; OWASP session management).
   - It uses `createAuthOptions` + `betterAuth` + `$context` (V10); `better-auth` is pinned exactly and
     I-seed covers the API (RK1). It imports `lib/auth/env.ts`, `lib/auth/options.ts`,
     `lib/auth/logger.ts`, `lib/db-error.ts`, `lib/seed.ts`, `lib/seed-cli.ts`, `lib/startup.ts`
     (`connectHint` only) and `@academy/db`; **never `lib/auth/index.ts` or `lib/session.ts`** (they
     import `server-only`, which throws under tsx, V18, so a violation fails at the first run).
   - It never migrates; it requires `BETTER_AUTH_SECRET` like the app (the options factory takes only a
     validated secret).
   - ADR-0007 item 8 is amended (not re-read): one-shot operator commands of the `apps/web` package count
     as `apps/web`.
   Rejected: a seed-only BA instance with sign-up (cannot re-key); raw SQL with a copied hash format; a
   seed in the image (ships a user-creation entry point).
6. **"Вы вышли" via `/sign-in?signed-out=1`**, because a forged link only shows a note on a public page;
   a flash cookie needs set + consume and RSC cannot delete cookies. Rendered only for the exact value `1`.
7. **Lazy auth and pool, memoised on `globalThis`.** `getDb()` and `getAuth()` create their instance on
   first call and keep it under `Symbol.for("academy.web.db")` / `Symbol.for("academy.web.auth")` on
   `globalThis`, because `betterAuth()` builds eagerly and `createDb(undefined)` throws (a module-level
   instance would run in `next build` without env), and because `next dev` re-evaluates an edited module:
   a module-scope memo would orphan the old `pg.Pool` on every edit under `lib/auth/` (architecture A1).
   In production the module evaluates once, so the global changes nothing. Route handler:
   `toNextJsHandler((request) => getAuth().handler(request))` (V11).
8. **Route protection.**
   - `proxy.ts`: matcher excludes `_next/static`, `_next/image`, `favicon.ico`; `isPublicPath` allows
     exactly `/sign-in` and the prefix `/api/auth/`; no session cookie (`getSessionCookie`) -> 307 to
     `signInPath(pathname + search)`. Optimistic only. Coder (2026-10-30): the `Location` is absolute and
     keeps the request's own `Host` (Next's middleware adapter parses it with `new URL`, a relative one
     answered 500 `Invalid URL`; `NextRequest` rewrites `127.0.0.1` to `localhost`); a `Host` that is not
     a plain host and port falls back to `nextUrl`'s origin. U-proxy asserts both.
   - DAL: `requireSession(returnPath)` in every protected page; `getSession()` + explicit 401 in every
     route handler; `requireSession` or `getSession` in every server action. Reads go through
     `auth.api.getSession({ headers, query: { disableRefresh: true } })` (V9, V14).
   - The session is extended on use by a client `GET /api/auth/get-session` on each protected page load
     (a route handler: DB row and cookie move together); the same call powers AC10.
   - **Enforcement (security F6, S2-2; architecture C1):**
     - *What is scanned.* The real-tree walk reads every `.ts`/`.tsx` file (and, per round-3 condition
       S3-1, `.js`, `.jsx`, `.mjs`, `.cjs`) under `apps/web` except the directories `node_modules`,
       `.next` at any depth and `e2e`, `test` at the package root only (S3-2), and except test files
       (never entry points; skipping them also keeps U-guard's own in-memory fixtures out of the scan).
       Entry points: every `app/**/page.tsx`, every `app/**/route.ts`, and every scanned file anywhere in
       `apps/web` containing a `"use server"` / `'use server'` directive. `lib/entry-guard.ts` matches the
       directive by a pattern that does not contain the quoted literal (for example the space written as
       `\x20`), so the scanner's own source is never an entry point.
     - Comments are stripped first. A directive that is not the file's first statement (an inline server
       action) fails the test outright ("move it to an actions module"), because a per-function check is
       out of reach for a regex scan and inline actions are the easiest place to forget the check.
     - *Exports.* Recognised function forms: `export (default )?(async )?function [<name>]` and
       `export const <name> = (async )?(` / `= (async )?function`. In a `route.ts` or `"use server"`
       module **every** `export` statement must be a recognised form, except `export type` /
       `export interface` (erased, no runtime entry point) and, in a `route.ts`, Next's route segment
       config `export const (dynamic|revalidate|runtime|preferredRegion|maxDuration|fetchCache|dynamicParams) =`.
       Any other export (`export { b }`, `export * from`, `export const POST = wrap(...)`,
       `export const { GET } = ...`, `export default x`) lists the file ("unrecognised export: <line>"),
       whatever else it exports, so an unusual export style can never make the check vacuous.
     - *DAL calls* (`requireSession(` or `getSession(`): a `page.tsx` needs at least one in the file.
       In a `route.ts` / `"use server"` module each recognised export owns the source from its statement
       to the next `export` statement (or the end of the file); every export that is not allowlisted
       needs a DAL call in its own segment. A non-exported helper placed between two exports belongs to
       the earlier one: a known regex limit, caught by code review, not by this test.
     - *Allowlist*, in `app/entry-points.test.ts`, each entry with a non-empty reason. An entry names the
       export, `<file>#<exportName>`, so another export added to the same file is checked like any other;
       a file entry (no `#`) is accepted only for a `page.tsx` or a `route.ts` and exempts that file. A
       stale entry (file or export missing), an empty reason, or a file entry for a `"use server"`
       module fails the test. #29's allowlist:
       - `app/sign-in/page.tsx`: the sign-in page itself is public.
       - `app/sign-in/actions.ts#needsSeedHint`: reveals only whether any user exists (AC5) by one
         existence query, `SELECT 1 FROM users LIMIT 1` through `getDb()`; it is the one DB read outside
         the DAL, stated in ADR-0008 item 8 (architecture A2).
       - `app/api/auth/[...all]/route.ts`: Better Auth authenticates its own endpoints (its
         `export const { GET, POST } = toNextJsHandler(...)` is not a recognised form, hence a file entry).
       - `app/(app)/actions.ts#signOutAction`: sign-out needs no session; without one it only deletes
         cookies.
   Rejected: proxy-only (cookie forgery passes); layout check (not re-run on client navigation);
   `getSession` with refresh in RSC (DB/cookie drift).
9. **`next` is same-origin by construction**: `safeNextPath(value)` accepts only a string of at most 2048
   characters that starts with exactly one `/`, whose second character is not `/` or `\`, with no control
   character (`\u0000-\u001f`, `\u007f`) and no backslash anywhere; anything else yields `/`. The control
   character rule exists because browsers strip tab, CR and LF from URLs: `/\t/evil.example` would become
   `//evil.example`. Computed server-side; the client receives only the result. Rejected:
   `new URL(next, origin).origin === origin` (depends on the claimed Host).
10. **Signed-in visitor on `/sign-in`** is redirected to `safeNextPath(next)` (a second sign-in would make
    a second session). Not in the design files; for judges, no visible deviation.
11. **`drizzle-orm` declared in `apps/web`** at `^0.45.4` (peer of the adapter; one copy, `pnpm why`).
    The auth instance stays in `apps/web`: `@academy/db` reads no env by contract.
12. **No `Secure`, no `__Secure-` prefix** (`useSecureCookies: false`) on the loopback HTTP stack (V6).
13. **Default id generator and case-sensitive `users_email_unique`** (5.3).
14. **Dashboard empty state = the designed "no ready lessons" state**, shown unconditionally until #30
    (Stepan's decision; 9.2).
15. **"Выйти" keeps the prototype's markup and is POST-backed.** The item is
    `a.dropdown-item[role="menuitem"]` with `href="/sign-in?signed-out=1"` (the prototype links the
    signed-out sign-in state, `design/pages/dashboard/prototype.html:33`), inside the labelled group, as
    in `components.html`. Its click handler (Radix fires a click for Enter and Space) calls
    `event.preventDefault()` and then the server action `signOutAction()`, which signs out and redirects
    to the same URL; `onAuxClick` also prevents the default. Because: the element, role, name, tab order
    and focus behaviour equal the prototype, so there is no deviation, while no GET ever signs out (no
    CSRF by link, no prefetch sign-out). Edge case: "open in new tab" from the context menu loads
    `/sign-in?signed-out=1` while signed in, which redirects to `/` (decision 10): no state change.
    Without JavaScript the menu cannot open at all (Radix), so the link's plain navigation is unreachable.
    Rejected: `button` in a `form` (a visible deviation from the link item, round 1); a GET `/sign-out`
    route (logout CSRF).
16. **`server-only`, mechanism (architecture A4).** `server-only@0.0.1` is an exact dependency. Only
    `lib/auth/index.ts` and `lib/session.ts` import it, and they contain wiring only (create the instance,
    call `headers()`, `cache()`, `redirect()`). All logic that tests exercise sits in the marker-free
    modules of 3.2 and receives its dependencies. Tests build their own auth with `createAuthOptions` +
    `betterAuth`. Because Vitest and tsx resolve the throwing `default` export (V18), any test or seed that
    imports a wiring file fails at load: the rule enforces itself, with no Vitest alias that could hide a
    real client-side import. Step checks also grep for it (14).
17. **One session read per render**: `lib/session.ts` wraps the reader in React `cache()`, because the
    `(app)` layout (email in the top bar) and the page (`requireSession`) both read the session; without
    `cache()` every render does two DB reads (architecture A1). Outside a render (actions, route handlers)
    `cache()` calls through.

## 5. Schema and migration (costly to change: DB schema)

### 5.1 New tables (`packages/db/src/schema.ts`, after `users`)

Property keys are Better Auth's field names, SQL names snake_case, timestamps `timestamptz`, ids `text`
with no DB default, every constraint and index named.

| Table | Columns (key -> SQL, type, null) | Constraints and indexes |
|---|---|---|
| `sessions` | `id` text PK; `expiresAt` -> `expires_at` tz NN; `token` text NN; `createdAt` NN default now; `updatedAt` NN default now; `ipAddress` -> `ip_address` text; `userAgent` -> `user_agent` text; `userId` -> `user_id` text NN | PK `sessions_pkey`; unique `sessions_token_unique (token)`; FK `sessions_user_id_fk (user_id) -> users(id) ON DELETE CASCADE`; index `sessions_user_id_idx (user_id)` |
| `accounts` | `id` PK; `accountId` -> `account_id` NN; `providerId` -> `provider_id` NN; `userId` -> `user_id` NN; `accessToken`, `refreshToken`, `idToken` text; `accessTokenExpiresAt`, `refreshTokenExpiresAt` tz; `scope` text; `password` text; `createdAt`, `updatedAt` NN default now | PK `accounts_pkey`; FK `accounts_user_id_fk ... ON DELETE CASCADE`; index `accounts_user_id_idx (user_id)`; unique `accounts_provider_account_unique (provider_id, account_id)` |
| `verifications` | `id` PK; `identifier` NN; `value` NN; `expiresAt` -> `expires_at` NN; `createdAt`, `updatedAt` NN default now | PK `verifications_pkey`; index `verifications_identifier_idx (identifier)` |

- `accounts_provider_account_unique`: BA looks accounts up by `(providerId, accountId)` and assumes one
  row; it also makes a duplicate `linkAccount` from two concurrent seeds fail loudly. Not generated by
  `auth generate` (stated deviation).
- `verifications` is unused by #29 but expected by the adapter and the schema check.
- PK names `<table>_pkey` from column-level `.primaryKey()`; I-db-2 asserts them.
- No `$onUpdate` on `updatedAt` (BA sets it); I-map proves the schema check accepts this.

### 5.2 Migration
`pnpm --filter @academy/db db:generate --name auth` -> `0001_auth.sql` (additive). `0000_init.sql`
untouched. `db:check` and `check-drift.sh` must print `No schema changes, nothing to migrate`. Rollback
and re-landing: section 11.

### 5.3 ADR-0007 item 2 answers (ADR-0008 item 3)
- Mapping: property keys equal BA field names. Evidence: the coder runs `pnpm dlx auth@1.7.14 generate`
  once into the scratchpad and summarises the diff in the PR; I-map runs BA's own schema check.
- Id generator: default; no DB default.
- Email case: BA lowercases on every write and lookup; the seed writes through the internal adapter;
  I-seed (1) checks a mixed-case `SEED_EMAIL` is stored lowercase.

#### 5.3.1 `auth generate` result (coder, judge_code round 1 fix, 2026-10-30; for the PR body)

Run: `pnpm dlx auth@1.7.14 generate --config <scratchpad>/auth.ts --output <scratchpad>/auth-schema.ts --yes`.
The scratch config builds `betterAuth(createAuthOptions(...))` from `apps/web/lib/auth/options.ts` with a
dummy, never-contacted DB URL; nothing in the repository was written (`git status` unchanged). Output
compared with `packages/db/src/schema.ts` table by table.

Identical: the four plural table names (`users`, `sessions`, `accounts`, `verifications`); every property
key, SQL column name, type family and nullability; `text` ids with `.primaryKey()` and no DB default;
`emailVerified` default `false`; unique `email` and `token`; `user_id` FKs to `users.id` with
`ON DELETE CASCADE`; an index on `sessions.user_id`, `accounts.user_id` and `verifications.identifier`.

Differences, all intended:
1. Timestamps: generated `timestamp` (without time zone); ours `timestamptz` (`withTimezone: true`), the
   repository's convention since ADR-0007.
2. Names: generated leaves the unique constraints and FKs unnamed and names two indexes in camel case
   (`sessions_userId_idx`, `accounts_userId_idx`); ours names every constraint and index in snake case
   (`users_email_unique`, `sessions_token_unique`, `sessions_user_id_fk`, `accounts_user_id_fk`,
   `sessions_user_id_idx`, `accounts_user_id_idx`), asserted by I-db-2/3.
3. Extra constraints in ours: `accounts_provider_account_unique (provider_id, account_id)` (5.1, not
   generated) and the pre-existing `users_id_check`.
4. `updatedAt`: generated adds `$onUpdate(() => new Date())` on all four tables and no `defaultNow()` on
   `sessions` / `accounts`; ours has `defaultNow()` on all and no `$onUpdate` (Better Auth sets the value
   itself; I-map runs Better Auth's own schema check against this schema).
5. Generated `relations()` (`usersRelations`, `sessionsRelations`, `accountsRelations`): not in ours; the
   adapter works without them (I-map, I-signin and the e2e suite run against the real handler).

### 5.4 Stale comments in `schema.ts`
`users` doc comment: "Better Auth's core `user` model (#29 wires it under this key, `usePlural: true`).
The id is generated by the application, as Better Auth does by default, so it has no DB default." The
unique line: "Case-sensitive on purpose: Better Auth lowercases every email it writes or looks up
(ADR-0008)."

## 6. Configuration and environment

### 6.1 `createAuthOptions({ db, secret, log })`
- `database: drizzleAdapter(db, { provider: "pg", schema: { users, sessions, accounts, verifications },
  usePlural: true })`.
- `secret` (already validated); `baseURL: { allowedHosts: LOOPBACK_HOST_PATTERNS, protocol: "http" }`
  (or the 6.3 list).
- `emailAndPassword: { enabled: true, disableSignUp: true }`; password lengths 8/128.
- `session`: defaults (7 d, update age 1 d); no cookie cache.
- `rateLimit: { enabled: true }`.
- `advanced: { useSecureCookies: false, disableOriginCheck: false }`.
- `logger: { level: "warn", log }` (L2); `telemetry: { enabled: false }`.
- `plugins: [nextCookies()]`.
- `LOOPBACK_HOST_PATTERNS` with a comment: the stack publishes ports on 127.0.0.1 only; refusing other
  hosts blocks DNS rebinding.

### 6.2 Env variables

| Variable | Read by | Where set |
|---|---|---|
| `BETTER_AUTH_SECRET` | startup, `getAuth()`, the seed, via `readAuthSecret` | root `.env` (dev and seed load it); compose `web.environment: ${BETTER_AUTH_SECRET:?set BETTER_AUTH_SECRET in .env, see .env.example}`; turbo `dev.passThroughEnv`, `seed.passThroughEnv` |
| `BETTER_AUTH_SECRETS` | `readAuthSecret` (refuses it) | nowhere; never passed by compose |
| `SEED_EMAIL`, `SEED_PASSWORD`, optional `SEED_NAME` | the seed; e2e (`auth.setup.ts`, sign-in and sign-out specs) | root `.env` locally; CI `$GITHUB_ENV`; turbo `seed.passThroughEnv` and `test:e2e.passThroughEnv` (`SEED_*`) |
| `DB_PORT` (default 5432) | compose `db.ports: "127.0.0.1:${DB_PORT:-5432}:5432"` | lets an isolated project run next to Stepan's (13.5); `DATABASE_URL`'s port must match |
| `WEB_IMAGE_TAG` (default `local`) | compose `web.image: academy-web:${WEB_IMAGE_TAG:-local}` | a separate image tag for isolated runs (13.5) |
| `AUTH_ALLOWED_HOSTS` | only if 6.3 is applied | 6.3 |

`.env.example`, Postgres part gains (after `DATABASE_URL`):
```
# Host port of the db service (docker compose). DATABASE_URL above must use the same port: the seed and
# pnpm dev connect through DATABASE_URL, not through DB_PORT.
# DB_PORT=5432
```
Web app part (replaces `# AUTH_SECRET=change-me`):
```
# Image tag of the web service; only isolated test runs change it.
# WEB_IMAGE_TAG=local
# Auth (#29). Required by docker compose (every command, also "up -d --wait db") and pnpm dev; at least
# 32 characters. Append a generated one without printing it:
#   printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
# BETTER_AUTH_SECRET=
# BETTER_AUTH_SECRETS is refused: use BETTER_AUTH_SECRET only.
# The seed creates the only user (pnpm seed, see README); the e2e tests sign in with the same values.
# Put them here, never on a command line.
# SEED_EMAIL=learner@example.com
# SEED_PASSWORD=
```
`AUTH_SECRET` is removed (BA reads it only as a fallback name, and we pass `secret` explicitly). `SEED_*`
are never in compose's `web` env and never `NEXT_PUBLIC_*`.

### 6.3 Base URL fallback (if U-2 fails)
The coder replaces the wildcard patterns with a list from `AUTH_ALLOWED_HOSTS` (comma list; default
`localhost:3000,127.0.0.1:3000,localhost:3080,127.0.0.1:3080`), each validated against
`^[A-Za-z0-9.\[\]:-]+:[0-9]{1,5}$` at startup (`InvalidAllowedHostError` naming the position, never other
values). In the same step: compose `web.environment.AUTH_ALLOWED_HOSTS:
127.0.0.1:${WEB_PORT:-3080},localhost:${WEB_PORT:-3080}`; `.env.example` gains a commented
`# AUTH_ALLOWED_HOSTS=` with the default; turbo `dev.passThroughEnv` gains `AUTH_ALLOWED_HOSTS` (checked
through root `pnpm dev`, the #1 lesson); the tester's env file sets it for port 3180; PR and ADR-0008
item 6 record the switch.

### 6.4 CI (`e2e` job, final order)
1. `cp .env.example .env`; then (step 8) one step "generate the auth secret":
   `secret=$(openssl rand -hex 32); echo "::add-mask::$secret"; printf 'BETTER_AUTH_SECRET=%s\n' "$secret" >> .env`.
   (`.env.example` ends with `\n`, verified by the operations judge.)
2. `docker compose config --quiet`; `up -d --build --wait --wait-timeout 180`; `ps`.
3. pnpm setup, node, `pnpm install --frozen-lockfile`; `bash apps/web/scripts/check-image-migrations.sh`
   (I1, I2, I3, I3b, I3c).
4. (step 25) "seed the e2e user", `timeout-minutes: 3`:
   `pw=$(openssl rand -hex 24); echo "::add-mask::$pw"; { echo "SEED_EMAIL=learner@example.com"; echo "SEED_PASSWORD=$pw"; } >> "$GITHUB_ENV"; DATABASE_URL=postgres://academy:academy@127.0.0.1:5432/academy SEED_EMAIL=learner@example.com SEED_PASSWORD="$pw" pnpm seed | tee seed.log; grep -qF 'seed: created' seed.log`.
   `127.0.0.1`, not `.env`'s `localhost`, because compose publishes on 127.0.0.1 only and Node may try
   `::1` first. No host `dist/` exists at this point, so a green step proves `^build` (O1).
5. Playwright install; `pnpm test:e2e` with `E2E_BASE_URL` (`SEED_*` via `passThroughEnv`).
6. Failure artifacts unchanged; `apps/web/playwright/.auth/` is not uploaded.

The `checks` job (`pnpm build`, no env) is the build-without-secrets guard (M23). The `db` job's
`pnpm test:integration` also runs `@academy/web#test:integration`.

### 6.5 Startup order (`lib/startup.ts`)
`StartupDeps` gains `authEnv: { BETTER_AUTH_SECRET: string | undefined; BETTER_AUTH_SECRETS: string |
undefined }` (`startup-node.ts` passes `process.env` values). Order: `DATABASE_URL` present ->
`readAuthSecret(authEnv)` (on `InvalidAuthSecretError`: `web: InvalidAuthSecretError: <message>`, exit 1,
migrate not called) -> migrate. Messages: "BETTER_AUTH_SECRET is missing", "BETTER_AUTH_SECRET is Better
Auth's public default", "BETTER_AUTH_SECRET must be at least 32 characters, got N", "BETTER_AUTH_SECRETS
is not supported; set BETTER_AUTH_SECRET only". `getAuth()` and the seed call `readAuthSecret` too.

### 6.6 Packaging / deploy awareness
- `better-auth`, `server-only` reach the image through standalone tracing; no Dockerfile change.
  `drizzle-orm` resolves to one store entry (`pnpm why drizzle-orm -r`). Checked 2026-10-30 (coder):
  `pnpm-lock.yaml` has one snapshot, `drizzle-orm@0.45.4(@types/pg@8.23.1)(kysely@0.29.7)(pg@8.23.1)`,
  linked by `apps/web`, `packages/db` and `@better-auth/drizzle-adapter`; the second directory under
  `node_modules/.pnpm` (without `kysely`) is a leftover of `main`'s install that nothing links.
- `0001_auth.sql` ships through the existing COPY; I1 reads the journal (2 entries).
- `tsx`, `@testcontainers/postgresql`: dev deps, host and CI only.
- `proxy.ts` at `apps/web/proxy.ts` (Next 16, Node runtime).
- `.dockerignore` adds `**/playwright/.auth`.

### 6.7 turbo.json changes (all in the steps named)
- `dev.passThroughEnv` += `BETTER_AUTH_SECRET` (step 8).
- `seed` task (step 25): `{ "dependsOn": ["^build"], "cache": false, "passThroughEnv": ["DATABASE_URL",
  "BETTER_AUTH_SECRET", "SEED_*"] }`.
- `test:e2e.passThroughEnv` += `SEED_*` (step 35).

## 7. Logging rules (in force before the credential tables exist)

- **L1** `describeDbError(error: unknown): string` -> `<Name> (<code>[, constraint <name>])`. Name only
  if it matches `^[A-Za-z][A-Za-z0-9]{0,63}$`; code = the first string `code` in the cause chain (depth
  10): a SQLSTATE or a Node code such as `ECONNREFUSED`; constraint from the same pg error. Never
  `message`, `params`, `query`, `stack`, `cause` or the object.
- **L2** `createAuthLog(sink)`: `log(level, message, ...args)` -> one line `better-auth <level>: <first
  line of message>`; `args` dropped; a message containing `Failed query` or `params:` anywhere becomes
  `database error (details withheld)`.
- **L3** `SessionReadError` message `session read failed: <describeDbError>`, no `cause`.
- **L4** `getDb()` passes `onPoolError: (e) => console.error(\`web: idle database connection failed
  (${code})\`)`.
- **L5** Seed output: exactly one of `seed: created`, `seed: repaired`, `seed: updated`, or one error line
  `seed: <ErrorName>: <message>` for `SeedConflictError` / `InvalidSeedInputError` /
  `InvalidAuthSecretError` (messages name variables and rules only), or `seed: <describeDbError>` plus
  a hint chosen by code: connect class (`ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`, `ETIMEDOUT`, `28P01`,
  `3D000`, `57P03`) -> `; ` + `connectHint` from `lib/startup.ts`; `42P01` -> `; the tables are missing:
  start the stack first (docker compose up -d --build --wait), web applies the migrations`; any other code
  -> no hint (the #1 lesson). Never the email, the password or the URL. Sign-out action:
  `web: sign-out failed: <describeDbError>`.
Canary tests: U-dberr, U-log, U-dal, U-signout, U-seedcli; I-redact, I-seed.

## 8. Request flows

- **Unauthenticated `GET /courses/x/lessons/y?tab=checks`**: proxy -> 307
  `/sign-in?next=%2Fcourses%2Fx%2Flessons%2Fy%3Ftab%3Dchecks`.
- **Sign-in page** (server): `next = safeNextPath(searchParams.next)`, `signedOut =
  searchParams["signed-out"] === "1"`; `getSession()` (no DB read without a cookie); a session ->
  `redirect(next)`; else `<SignInForm next={next} signedOut={signedOut} needsSeedHint={needsSeedHint} />`,
  where `needsSeedHint` is the server action imported by the page from `app/sign-in/actions.ts` and passed
  as a prop, so the client form never imports that module (it reaches `server-only`, which would make
  U-form throw at load). Healthcheck `/` -> 307 -> `/sign-in` -> 200,
  DB-free.
- **Submit**: AC2 validation -> `fetch("/api/auth/sign-in/email", { method: "POST", headers: {
  "content-type": "application/json" }, body })`. `2xx` -> `window.location.assign(next)`; `400`/`401` ->
  AC4, then `await needsSeedHint()` (one existence query, `SELECT 1 FROM users LIMIT 1` through
  `getDb()`) adds the AC5 line when no user exists; `429` -> AC7; any other status
  (`403` refused origin, `500` from a refused `Host`, V13) or a network rejection -> AC6.
- **Dashboard** `GET /`: proxy -> `(app)/layout.tsx` (top bar with the email from `getSession()`,
  notifications, region cycle) and `(app)/page.tsx` (`requireSession("/")`, h1, Empty); one DB read per
  render (4.17). On mount the notifications component calls `GET /api/auth/get-session` (extends the
  session); JSON `null` -> AC10 alert; network error or non-200 -> nothing.
- **Sign-out**: "Выйти" click -> `preventDefault()` -> `signOutAction()` -> `createSignOut` deps:
  `auth.api.signOut({ headers: await headers() })` (the request headers, so Better Auth sees the session
  cookie and `Host`). Better Auth deletes the session row and the cookie; if the row delete fails it logs
  `better-auth error: Failed to delete session from database` through L2, still deletes the cookie and
  resolves (V19), so the row stays valid until `expires_at` (ADR-0008 residual). The action's own `catch`
  covers what still throws (base URL resolution from `Host`, `to-auth-endpoints.mjs:20-24`): log (L5) and
  delete both cookie names. Then, outside the `try`, `redirect("/sign-in?signed-out=1")`.

## 9. Design conformance

### 9.1 Sign-in (all ACs met)
AC1-AC12 as in `design/pages/sign-in/acceptance.md`. Notes for judges: Alert with `role="group"`,
`tabindex="-1"`, `aria-labelledby`, `aria-describedby` only with the hint line; "Войти" busy with
`aria-disabled="true"` + `aria-busy="true"`, never `disabled`; second submit ignored; `noValidate`;
`method="post"` and no `action` (judge_code round 1, security F1: an Enter before hydration posts the
fields in the body to `/sign-in?next=...`, which answers 200 with the sign-in page again, no cookie, nothing
logged; a GET would put the password into the URL);
`type="email" autocomplete="username"` / `type="password" autocomplete="current-password"`; no `onPaste`;
invalid inputs draw the ring in `destructive`; "Вы вышли" as `CardDescription` under the h1. Decisions not
covered by the design: `signed-out=1` (4.6), the signed-in redirect (4.10), `400` -> AC4, `403`/`500` ->
AC6 (8). No element differs from the prototype.

### 9.2 Dashboard: deviations, waiver and owners

**Waiver of ADR-0006 item 5 for the data ACs (recorded 2026-10-30, Stepan's decision of the same day:
"the dashboard ships with an empty state, real data later").** ADR-0006 item 5 allows a deviation only
with a follow-up DESIGN issue. The rows marked "data" below are not design deviations: the design is
right, dev has not built the data yet. For them, item 5's DESIGN-issue requirement is waived; each is
tracked instead as an acceptance criterion in the dev issue that builds the data. The PR body's "Design
deviations" section repeats this table and the waiver sentence verbatim, so judge-architecture's code
review finds it where ADR-0006 says. The waiver covers only these rows and only #29.

| Dashboard item | Status in #29 | Kind | Owner |
|---|---|---|---|
| AC1 Card (first ready lesson) | deferred | data | #30 (course tree); "not finished" filter #35 |
| AC2 "Начать" (only "Начать" until #31/#34, R5) | deferred | data | #30; "Продолжить" #35 |
| AC3 first run (course line, "0 из N уроков") | deferred | data | #35 |
| AC4 course line and bar | deferred | data | #35 |
| AC5 module rows, "Готовится", row links | deferred | data | #30 (rows, Badge, links); counts and bars #35 |
| AC6 all ready lessons passed | deferred | data | #35 |
| AC7 no ready lessons | **met**, shown unconditionally | data | #30 makes it conditional |
| AC8 course load error | deferred | data | #30 |
| AC9 progress error | deferred | data | #35 |
| AC10 session expired | **met** | | |
| AC11 user menu, "Выйти" | **met**, prototype markup (4.15) | | no deviation left |
| AC12 `F6` cycle | **met** (top bar, "Уведомления" when non-empty, `main` itself) | | |
| AC13 layout | **met** for the shown state | | |
| loading state (Skeleton) | not built | data | #30 |
| top bar link "Курс" | **omitted** | design | DESIGN follow-up issue below; #30 adds the link |

Text the orchestrator adds to the issue bodies (checked 2026-10-30: #30's body covers only the catalog
and the lesson page; #35's body names attempts, statuses and percentage but no dashboard AC):

#30, append:
```
Dashboard, from design/pages/dashboard (deferred by #29 under a waiver of ADR-0006 item 5, 2026-10-30):
- [ ] top bar link "Курс" to /courses/[courseId]; tab order as in the dashboard acceptance notes
- [ ] AC1 Card with the first `ready` lesson in catalog order (no progress filter until #35), AC2 "Начать" only (R5)
- [ ] AC5 module rows: title, "Готовится" Badge, link to /courses/[courseId]#[moduleId] focusing the module heading
- [ ] AC7 "В курсе пока нет готовых уроков" only when no lesson is `ready` (#29 shows it unconditionally)
- [ ] AC8 course read failure with "Повторить"; loading state (Skeleton)
- [ ] AC13 and the "Design conformance" evidence for every dashboard state it adds
```
#35, append (and add `blocked by #30`, because the Card and module rows it fills come from #30):
```
Dashboard progress, from design/pages/dashboard (deferred by #29 under a waiver of ADR-0006 item 5, 2026-10-30):
- [ ] AC3 first run: "Пока нет пройденных уроков", module rows "0 из N уроков", no attempts, weak topics or cost block (R6)
- [ ] AC4 course line "Пройдено уроков: N из M" and the bar with aria-valuetext "N из M", counted per ADR-0007 item 5
- [ ] AC5 progress part: module row counts and bars
- [ ] AC6 all ready lessons passed: "Все доступные уроки пройдены", "Новые модули появятся в каталоге", "Открыть курс"
- [ ] AC9 progress read failure with "Повторить"
- [ ] AC1 "not finished" filter and AC2 "Продолжить" once a lesson can be started (R5)
```

**The "Курс" omission cannot be eliminated in #29.** Its target `/courses/[courseId]` is #30's page;
rendering the link now would be a dead end (404), which `ia.md` R6 forbids ("A control appears only when
the feature behind it works"); a disabled nav link exists nowhere in the design system (R1 covers
actions with a reason, not navigation). The dashboard acceptance notes, however, list "Курс" in the tab
order unconditionally, so the two design files disagree about the release before #30. That is a design
question, hence a DESIGN issue. The orchestrator files it (milestone M0 Foundation, labels `team:design`,
`tier:design`, `type:docs` if present, not blocking #29):

Title: `design(dashboard): top bar before the catalog ships ("Курс" link, R6)`

Body:
```
#29 ships the dashboard shell before #30 builds the catalog. design/pages/dashboard/acceptance.md lists the
top bar tab order "К содержимому", "Академия", "Главная", "Курс", user menu, and the prototype draws the "Курс"
link, while design/flows/ia.md R6 says a control appears only when the feature behind it works. Until #30 the
link's target /courses/[courseId] does not exist, so #29 omits it and the tab order is "К содержимому",
"Академия", "Главная", user menu. This is listed under "Design deviations" in the #29 PR (ADR-0006 item 5).

Decide and record the top bar's release state before #30:
- [ ] ia.md R6 names the top bar link "Курс" (hidden until #30), or the design specifies another state
- [ ] dashboard acceptance notes: tab order and F6 regions for that state; the prototype gains the state if it differs visibly
- [ ] the same rule for every other page whose top bar #29/#30 ship (sign-in has none)
- [ ] Status stays ready; the validator (scripts/design_tokens.py) stays green

Refs #29, #30
```
The issue number goes into the PR body's "Design deviations" row.

**"Выйти" is no longer a deviation** (4.15): same element (`a.dropdown-item`), role (`menuitem`), name,
`href` target (the signed-out sign-in state), group and label markup as the prototype.

### 9.3 Copy (`lib/copy.ts`, each with its `ia.md` / acceptance source comment)
Sign-in: "Вход", "Почта", "Пароль", "Войти", "Входим...", "Введите почту", "Введите пароль", "Неверная
почта или пароль", "Пользователя создаёт скрипт seed, см. README", the server-unreachable sentence,
"Повторить", "Слишком много попыток входа. Подождите и попробуйте снова.", "Вы вышли". Dashboard shell:
"Выйти", "Уведомления", "Сессия закончилась. Файлы в рабочей папке сохранены.", "Войти снова", "В курсе
пока нет готовых уроков". Existing: "Академия", "Главная", "К содержимому". Nothing invented.

### 9.4 Components
`pnpm dlx shadcn@4.23.0 add card field input label alert button spinner dropdown-menu empty` (only these).
U4 (token block drift) must still pass; if `add` touches the block, the coder restores it from
`design/system/tokens.css` and records it. Alert on sign-in without `role="alert"` (prop override, else a
wrapper). The DropdownMenu item for "Выйти" uses `asChild` with an `a` (4.15). Not added: badge, progress,
item, skeleton (#30 / #35).

## 10. Failure modes

| Failure | Mitigation | Caught by (seen red) |
|---|---|---|
| Brute force on sign-in | BA limiter always on, HTTP path only | I-rl (M5); E-in-7 |
| XFF spoofing dodges the limiter | accepted residual (ADR-0008) | T-xff; documented |
| Missing/default/short secret, or `BETTER_AUTH_SECRETS` | `readAuthSecret` at startup, in `getAuth()`, in the seed; compose `:?` | U-secret (M3, M-secrets), U-start (M4), I3, I3b, I3c |
| `next build` without env | lazy `getAuth()` / `getDb()` | CI `checks` (M23) |
| Pool leak on dev HMR | `globalThis` memo | review; RK8 |
| Open redirect via `next` | `safeNextPath` server-side | U-next (M1, M2, M2b, M-ctrl); E-in-5 |
| Cookie-only protection | DAL in every entry point | U-guard (M13, M-guard-*); I-dal |
| A future page, action or route handler forgets the DAL | U-guard scans all three kinds anywhere in `apps/web`, rejects inline actions, unrecognised exports, and checks every non-allowlisted export | M13, M-guard-action, M-guard-route, M-guard-export, M-guard-unrec, M-guard-root |
| Proxy public list drifts | in code, unit-tested; e2e lesson URL | U-proxy (M12); E-prot-2 |
| Token / hash in logs | L1-L5 | U-dberr, U-log (M9, M-first, M-lines), U-dal (M11), I-redact (M10), U-signout, U-seedcli |
| RSC refreshes the row but not the cookie | `disableRefresh` in the reader | U-dal (M14u), I-dal (M14) |
| CSRF on sign-in / sign-out | BA origin + Fetch-Metadata; Next action origin check; no GET sign-out | I-origin (M6) |
| Non-loopback Host (DNS rebinding) | `allowedHosts`; handler throws before the router | I-host (M7) |
| `__Secure-` cookie over http | `useSecureCookies: false` | I-signin (M8) |
| Sign-out does not revoke the server session (headers without the cookie, a regression hiding the token) | the action passes the request headers; revocation asserted on the server side | E-out-1 old-token assertion (M-revoke-out) |
| Sign-out DB delete fails | Better Auth swallows it (logs, `sign-out.mjs:49-53`) and deletes the cookie (`:54`); the row, and a copied token, stay valid until `expires_at` (at most 7 d): accepted residual (ADR-0008); the log line is the operator's trace; a re-key (`pnpm seed`) revokes every session | documented residual; not testable without breaking the DB mid-request |
| Sign-out call itself throws (base URL resolution) | the action's `catch` logs (L5) and deletes both cookie names | U-signout (M19) |
| "Выйти" JS fails, link navigates without signing out | visible: `/sign-in?signed-out=1` redirects a signed-in visitor to `/` | E-out-1 (M-menu) |
| Seed creates a second user / plaintext / mixed case | conflict error; BA hash; adapter lowercases | I-seed (M15, M16) |
| Seed crash between its writes | rerun links the missing account | I-seed 7 (M-link) |
| Re-key keeps the attacker's sessions | `deleteUserSessions` | I-seed 3 (M-revoke) |
| Seed run before the stack / on a stopped DB | `42P01` and connect hints, by class | I-seed 6, 8 (M-hint) |
| Seed hangs on an open pool | `close()` in `finally`; CI step timeout | U-seedcli (M-close) |
| Seed imports stale or missing `dist/` | turbo `^build` | CI seed step on a clean runner |
| Schema keys drift from BA fields | BA schema check | I-map (M18) |
| Cascade missing | FK `ON DELETE CASCADE` | I-db-1 (M17) |
| e2e flakiness from 3/10 s | own XFF bucket per test; fallback in 13.3 | T-xff; 3 green runs |
| Pool error crashes Node | `onPoolError` (L4) | existing `@academy/db` I-tests |
| DB down mid-run | sign-in 500 -> AC6; render throws `SessionReadError` (SQLSTATE only) | I-redact; U-dal |
| Tester or coder touches Stepan's stack, image or DB | env file + `t29` wrapper, separate tag and port, volume and `.env` checks | 13.5 |

## 11. Rollout, rollback and re-landing

Order on Stepan's machine after the merge (README "Web app" says the same; every command from the
repository root):
1. `ls .env` - if missing: `cp .env.example .env`.
2. Append the secret without printing it: `printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -hex 32)" >>
   .env`; check: `grep -c '^BETTER_AUTH_SECRET=' .env` prints `1`.
3. Open `.env` in an editor and add `SEED_EMAIL=...` and `SEED_PASSWORD=...` (8-128 characters). The
   file is git-ignored (`.gitignore:27`). Never type the password on a command line (shell history).
   Alternative without the file, in zsh: `read -rs "SEED_PASSWORD?Seed password: " && export
   SEED_PASSWORD && SEED_EMAIL=you@example.com pnpm seed; unset SEED_PASSWORD`.
4. `docker compose up -d --build --wait` (web applies `0001_auth`). Without step 2 every compose command
   that interpolates the file fails with the variable's name, including `up -d --wait db` before
   `pnpm dev`.
5. `pnpm seed` -> `seed: created` (builds `@academy/db` and `@academy/lesson-schema` first).
6. Open `http://127.0.0.1:3080` and sign in.
Re-keying: change `SEED_PASSWORD` in `.env`, `pnpm seed` -> `seed: updated`; every existing session ends.

Rollback: revert the PR. The three tables stay in the local DB (unused); the `.env` lines are ignored by
the old code. **Re-landing after a revert** must reuse the identical `0001_auth.sql` and its
`_journal.json` entry (same `when`): the DB already recorded that migration, so the identical file is
skipped. A regenerated `0001` (new `when`) runs `CREATE TABLE` against existing tables and every startup
fails with `42P07`; then either restore the original files from git, or drop the three tables and the
migration row (`DELETE FROM drizzle.__drizzle_migrations WHERE created_at = <when>`), or
`docker compose down -v` (also deletes progress).

## 12. Risks

- RK1 `$context.internalAdapter` is semi-internal (V10, V16): exact pin; I-seed goes red on a breaking
  upgrade.
- RK2 Wildcard origin matching unverified (U-2): fallback 6.3.
- RK3 XFF spoofing (V7): accepted; e2e depends on it; fallback 13.3.
- RK4 The get-session call on mount adds one request per protected page load.
- RK5 A log path L2 does not recognise; residuals in ADR-0008.
- RK6 `shadcn add` rewrites `globals.css` or adds unused deps: U4 and the #1 dependency rule.
- RK7 The Empty copy is untrue while `course/` has ready lessons: accepted by Stepan; #30 fixes.
- RK8 The `globalThis` memo keeps a stale auth instance across a dev edit of `options.ts` until the dev
  server restarts; acceptable for dev, irrelevant in production.

## 13. Tests (every row has a mutation that turns it red at the stated assertion)

Mutation protocol: each mutation alone, on a file **backed up first** to the scratchpad, restored from
the backup and proven with `cmp`; never `git checkout` a file of this diff; mutations written against
formatted code (`pnpm format` on the mutated file before running); schema mutations edit a copy of the
migrations folder passed via `migrationsFolder`. Image mutations (I3 under M4, E-in-7) build only
`academy-web:t29` (13.5).

Assertion helper (security F2): `serialised(calls)` = every argument of every recorded call, each through
`util.inspect(arg, { depth: 10 })`, joined; every canary assertion checks it, never `String(arg)`.

### 13.1 Unit (Vitest, `pnpm test`, Docker-free)

Files without DOM start with `// @vitest-environment node`.

| Id | File | Behaviour | Mutation -> red at |
|---|---|---|---|
| U-next | `lib/next-path.test.ts` | `it.each`: accepts `/`, `/courses/a/lessons/b?tab=checks`, `/a/%2F%2Fb`; maps to `/`: `undefined`, `""`, `["/a","/b"]`, `//evil.example`, `/\evil.example`, `/a\b`, `https://evil.example`, `javascript:alert(1)`, `\t/a`, `/\t/evil.example`, `/\n/evil.example`, `/\r/evil.example`, `/` + 2048 x `a`; `signInPath("/x?tab=checks")` = `/sign-in?next=%2Fx%3Ftab%3Dchecks`; `isPublicPath`: `/sign-in`, `/api/auth/x` true; `/`, `/courses/a/lessons/b`, `/sign-in-x`, `/api/authx`, `/api` false | M1 drop the `//` rule -> `//evil.example`; M2 drop the backslash-anywhere rule -> `/a\b` only (`/\evil.example` stays rejected by the second-character rule); M2b drop both backslash rules -> `/\evil.example` and `/a\b`; M-ctrl drop the control-character rule -> the three `/\t/`, `/\n/`, `/\r/` cases; M12 treat `/courses` public -> lesson case; prefix without slash -> `/api/authx` |
| U-secret | `lib/auth/env.test.ts` | rejects: `BETTER_AUTH_SECRET` undefined, `""`, the BA default, 31 chars (message has `BETTER_AUTH_SECRET` and `31`); `BETTER_AUTH_SECRETS` = `1:canary-secrets-u` with a valid `BETTER_AUTH_SECRET` (message names `BETTER_AUTH_SECRETS`), and `"   "`; accepts 32 chars with `BETTER_AUTH_SECRETS` undefined or `""`; no message contains `canary-` | M3 accept the default -> default case; M-secrets ignore `BETTER_AUTH_SECRETS` -> its two cases |
| U-start | `lib/startup.test.ts` (extend) | invalid secret: exit 1 once, `migrate` not called, line has `InvalidAuthSecretError`, no canary; valid: migrate called; existing U1-U3 pass with a valid `authEnv` | M4 migrate before the secret check -> "migrate not called" |
| U-dberr | `lib/db-error.test.ts` | a `DrizzleQueryError`-shaped error (`message` `Failed query: select ... params: canary-token-u`, `params: ["canary-token-u"]`, cause pg error `23505`, constraint `sessions_token_unique`) -> exactly `DrizzleQueryError (23505, constraint sessions_token_unique)`; a Node error with `code: "ECONNREFUSED"` -> `Error (ECONNREFUSED)`; string, `null`, an `Error` named with a URL -> `unknown` / name | M print `message` -> canary |
| U-log | `lib/auth/logger.test.ts` | (a) `log("error", "Failed query: select canary-l1 from sessions\nparams: canary-l2", { token: "canary-l3" })`; (b) `log("error", "boom\ncanary-l4")`; (c) `log("error", "boom", new Error("canary-l5"))`; (d) `log("warn", "plain message")`. `serialised(sink calls)` contains no canary; (a) gives exactly `better-auth error: database error (details withheld)`; (b), (c) give `better-auth error: boom`; (d) `better-auth warn: plain message` | M9 pass `args` to the sink -> `canary-l3`, `canary-l5`; M-first drop the withheld rule -> `canary-l1` (line 1 of (a)); M-lines print the whole message -> `canary-l4` |
| U-dal | `lib/session-reader.test.ts` | `createSessionReader({ getSession })` (injected fake): a throw with canary in message and `params` -> `SessionReadError`, `cause === undefined`, `serialised` lacks canary; null -> null; the fake receives `query.disableRefresh === true` | M11 attach `cause` -> cause assertion; M14u drop `disableRefresh` -> query assertion |
| U-signout | `lib/sign-out.test.ts` | the throws that still reach the action (V19: a DB failure does not): `signOut` rejects (canary) -> `deleteCookie` for both names, `redirect("/sign-in?signed-out=1")` once, log line without canary; success -> no delete, same redirect | M19 skip deletes on throw -> delete assertion |
| U-seedcli | `lib/seed-cli.test.ts` | `runSeed` with injected `createDb` (returns `{ db, close: spy }`), `seed` fake, `log` sink, `env` incl. `DATABASE_URL` with password `canary-url-pw`: (1) seed resolves `created` -> one line `seed: created`, exit 0, `close` once; (2) seed rejects with a pg-shaped `ECONNREFUSED` error -> exit 1, line has `ECONNREFUSED` and `connectHint`, lacks the 42P01 hint, `close` once; (3) rejects with `42P01` -> 42P01 hint, no connect hint; (4) rejects with `23505` -> no hint; (5) invalid secret -> `InvalidAuthSecretError` line, `createDb` never called; no line has `canary-url-pw`, the email or the password | M-close drop the `finally` -> (2) `close` count; M-hint attach the connect hint to every code -> (3), (4) |
| U-proxy | `proxy.test.ts` | `proxy(new NextRequest(...))` without cookie -> 307 to `signInPath(path+search)`; with `better-auth.session_token` -> pass-through; `/sign-in` and `/api/auth/get-session` without cookie -> pass-through | M12 (via `isPublicPath`) -> lesson case |
| U-guard | `lib/entry-guard.test.ts` + `app/entry-points.test.ts` | scanner on in-memory sources (4.8): page (`export default async function Page`) without call -> listed; `"use server"` module with two exported functions and one call (in the first) -> listed (second segment); `route.ts` with `GET` and `POST` and one call -> listed; `"use server"` module exporting only `export { x }` -> listed "unrecognised export"; **`"use server"` module with a guarded `export async function a` plus `export { b }` -> listed "unrecognised export"**; `route.ts` with a guarded `export async function GET` plus `export const POST = wrap(handler)` -> listed; guarded `route.ts` plus `export const dynamic = "force-dynamic"` and a `"use server"` module plus `export type T` -> not listed (positive controls for the exceptions); inline `"use server"` in a page -> listed with "inline"; call only inside a comment -> listed; allowlisted page file -> not listed; **`"use server"` module with allowlist entry `x.ts#a`, `a` without a call and a second export `b` without a call -> `b` listed, `a` not**; allowlist entry with empty reason -> error; stale entry (missing file, or missing export name) -> error; file entry (no `#`) for a `"use server"` module -> error. Walker on a temp dir: finds `actions/x.ts` with the directive (outside `app/`, `lib/`, `components/`); skips `node_modules/`, `.next/`, `e2e/`, `test/` and `lib/y.test.ts`, each holding a directive file. Real tree: walks `apps/web` (4.8), asserts at least one page, one route and one `"use server"` module were scanned, that `lib/entry-guard.ts` and the test files are not among the scanned entry points, and that the list of unguarded entry points is empty | M13 remove `requireSession(` from `(app)/page.tsx` -> real-tree assertion; M-guard-action scanner ignores `"use server"` files -> two-function case; M-guard-route scanner ignores `route.ts` -> real-tree "one route scanned"; M-guard-comment no comment stripping -> comment case; M-guard-reason accept empty reasons -> reason case; **M-guard-export** allowlist matched by the file part only (`#name` ignored) -> the `x.ts#a` case (`b` not listed); **M-guard-unrec** drop the unrecognised-export rule -> the `a` + `export { b }` case and the `wrap` case; **M-guard-root** walker reads only `app/`, `lib/`, `components/` -> the `actions/x.ts` walker case |
| U-form | `components/sign-in-form.test.tsx` (RTL; `fetch`, `navigate`, `needsSeedHint` injected) | AC2, AC3 (busy, `aria-disabled`, no `disabled`, one fetch), AC4 (Alert, focus, no `role="alert"`, email kept, password empty), AC5, AC6 (reject -> message, "Повторить" re-sends, focus "Войти"; also status 500 -> AC6), AC7 (429, no digit), success -> `navigate(next)`, "Вы вышли" only with `signedOut`; server-rendered markup (`renderToString`) has `method="post"` and no `action` (round 1 F1) | M24 busy uses `disabled` -> AC3; M25 Alert keeps `role="alert"` -> AC4; M navigate to `/` -> success; M-method (remove `method`) -> `expected null to be 'post'` |
| U-cycle | `components/region-cycle.test.tsx` | `F6` from body -> "Академия"; `F6` -> `main`; with an alert -> "Войти снова" between; Shift+`F6` reverse; Ctrl+Shift+Period | M21 skip `main` -> second step |
| U4 | `app/globals.test.ts` (existing) | token block unchanged after `shadcn add` | existing |

U5 (`course-list.test.tsx`) is deleted with its component (step 47).

### 13.2 Integration (Vitest + testcontainers, `pnpm test:integration`, CI `db` job)

`vitest.integration.config.ts` + `test/integration/global-setup.ts` (copy of `@academy/db`'s, canary
password `canary-s3cret-29`); `test/integration/db.ts` creates `db_<random>` per test and runs
`migrateDatabase(url)`. Auth: `betterAuth(createAuthOptions({ db, secret: randomBytes(32).toString("hex"),
log }))` with a recording sink; `console.*` spied; canary checks use `serialised` (13). Requests:
`auth.handler(new Request("http://127.0.0.1:3080/api/auth/...", ...))` with explicit `Host`, `Origin`,
`X-Forwarded-For`. No test imports `lib/auth/index.ts` or `lib/session.ts` (V18).

| Id | Behaviour | Mutation -> red at |
|---|---|---|
| I-map | `typeof ctx.checkSchema === "function"`, then `await ctx.checkSchema()` resolves; no sink line contains `SchemaMismatch` | M18 rename key `token` -> `sessionToken` (SQL name unchanged) -> resolve assertion |
| I-signin | correct credentials -> 200, `set-cookie` has `better-auth.session_token=`, no `Secure`, no `__Secure-`, `HttpOnly`, `SameSite=Lax`; wrong password -> 401; unknown email -> 401; `POST /sign-up/email` -> not 2xx, user count unchanged | M8 `useSecureCookies: true` -> cookie name; M remove `disableSignUp` -> sign-up case |
| I-rl | `X-Forwarded-For: 10.29.0.1`: 3 wrong attempts 401, 4th 429 with `x-retry-after`; `10.29.0.2` next -> 401 | M5 `enabled: process.env.NODE_ENV === "production"` -> 4th status |
| I-origin | sign-out POST with the cookie and `Origin: http://evil.example`, `Host: 127.0.0.1:3080` -> 403, session row kept; `Origin: http://127.0.0.1:3080` -> 200, row gone; same with `localhost:3000` | M6 drop `disableOriginCheck: false` (V3) -> 403 assertion |
| I-host | sign-in POST with correct credentials, `Host: evil.example:3080`, `Origin: http://evil.example:3080`: `await expect(auth.handler(req)).rejects.toThrow(/is not in the allowed hosts list/)` (V13, `utils/url.mjs:214`); `SELECT count(*) FROM sessions` = 0 afterwards | M7 add `"*"` to the allowed hosts -> the call resolves (host matches, origin `http://evil.example:3080` becomes trusted by V5, credentials valid: 200 and a session row) -> `rejects` and count assertions |
| I-dal | reader = `createSessionReader({ getSession: auth.api.getSession })`, headers with the cookie from a handler sign-in **and `host: 127.0.0.1:3080`** (a direct `auth.api.*` call resolves the dynamic base URL from `Host`; without it every call is a 500 `APIError`, `to-auth-endpoints.mjs:20-24`). (a) forged cookie -> null; (b) valid -> the user's email; (c) `expires_at` set to the past -> null. (d) **refresh guard**: `UPDATE sessions SET expires_at = now() + interval '5 days'` (inside the refresh window: `expires_at <= now + 6 d`, V14), record it, read through the reader -> `expires_at` unchanged (to the millisecond). (e) **positive control**, same row state reset to `now + 5 d`: `GET /api/auth/get-session` through `auth.handler` with the cookie -> `expires_at` > `now + 6 d` (refreshed; the router path skips the nextCookies hook, V15) | M14 drop `disableRefresh` in the reader -> (d): the direct call refreshes, because outside a Next request the nextCookies before-hook cannot read `headers()` and returns without setting "skip" (V15, `integrations/next-js.mjs:50-54`), so `session.mjs:180` holds and `:198` updates. If (e) fails, the precondition is wrong and (d) proves nothing: the row is reported as broken, not green |
| I-redact | sign in, then `ALTER TABLE sessions RENAME TO sessions_x`; `GET /api/auth/get-session` with the cookie -> not 2xx-with-session; the reader (headers: the cookie and `host: 127.0.0.1:3080`, as in I-dal) throws `SessionReadError` without cause; `serialised` of every sink call and every spied `console.*` call contains neither the cookie's token nor `params:` | M10 remove the `logger.log` option -> console assertion (U-4). If it stays green, the tester reports the row as "evidence, not a guard" (architecture A3); U-log carries the guard |
| I-seed | `seedUser` on a fresh DB, `ctx = await betterAuth(createAuthOptions(...)).$context`. (1) `Learner@Example.COM` -> `created`; email stored lowercase; one `accounts` row, `provider_id = 'credential'`, `password` != plaintext. (2) handler sign-in -> 200, keep the cookie `c1`. (3) rerun with a new password -> `updated`; one user; old password 401, new 200; `GET /get-session` with `c1` -> JSON `null` and `c1`'s row gone. (4) another email -> `SeedConflictError`, counts unchanged | M15 store `password` instead of the hash -> (1); M16 always create -> (3) count; M-revoke skip `deleteUserSessions` -> (3) `c1` assertion |
| I-seed (cont.) | (5) 7-char and 129-char passwords, empty email -> `InvalidSeedInputError` naming the variable, nothing written. (6) DB without migrations -> rejects with SQLSTATE `42P01` (the CLI hint is U-seedcli's). (7) **half-written state**: `ctx.internalAdapter.createUser({ email, name, emailVerified: false })` only (no account), plus a session row for that user -> seed -> `repaired`; exactly one credential account; sign-in 200; the old session row gone. (8) DB URL with port 1 -> rejects; `describeDbError` gives `ECONNREFUSED`. No `serialised` sink or console output contains the password or email | M-link always `updatePassword` for an existing user -> (7) sign-in (0 rows updated, V16) and account count |

`packages/db/test/integration/schema.int.test.ts` (extend):

| Id | Behaviour | Mutation -> red at |
|---|---|---|
| I-db-1 | user with a session and an account; `DELETE FROM users` -> both gone | M17 in a copy of the migrations, `cascade` -> `no action` for `sessions_user_id_fk` -> 23503 |
| I-db-2 | `pg_constraint` / `pg_indexes` list exactly the names of 5.1 | rename one constraint, regenerate into a scratch folder -> name assertion |
| I-db-3 | duplicate `sessions.token` -> 23505 `sessions_token_unique`; duplicate `(provider_id, account_id)` -> 23505 `accounts_provider_account_unique` | drop the unique in the copy -> insert succeeds |

### 13.3 e2e (Playwright against compose; `pnpm test:e2e`)

Config: loads the root `.env` if present (shell wins); projects `setup` (`auth.setup.ts`) and `chromium`
(`dependencies: ["setup"]`, `storageState: "playwright/.auth/learner.json"`); unauthenticated specs use
`test.use({ storageState: { cookies: [], origins: [] } })`. `e2e/fixtures.ts`: `useOwnBucket(page)`
routes `**/api/auth/**` via `route.continue({ headers: { ...headers, "x-forwarded-for": <unique 10.29.x.y
per test> } })`; `credentials()` reads `SEED_EMAIL` / `SEED_PASSWORD`, throws a named error if absent.
Setup signs in with `request.post("/api/auth/sign-in/email", { data, headers: { origin, "x-forwarded-for":
"10.29.255.1" } })`.

| Id | Spec | Behaviour (AC) | Mutation -> red at |
|---|---|---|---|
| E-prot-1 | protection | anonymous `/` -> `/sign-in?next=%2F`, h1 "Вход" | proxy disabled -> URL |
| E-prot-2 | protection | anonymous lesson URL with `?tab=checks` -> sign-in with that `next` | M12 |
| E-prot-3 | protection | `request.get("/api/auth/get-session")` without cookie -> 200 JSON `null` | prefix rule broken -> 307 |
| E-in-1 | sign-in | AC1 focus; AC10 paste; valid sign-in with `next` = lesson path -> final URL equals it (AC8); no horizontal scroll at 375 | M navigate to `/` -> URL |
| E-in-2 | sign-in | AC2 empty submit: zero requests to sign-in (listener before goto) | validation removed -> count |
| E-in-3 | sign-in | AC3 delayed response: "Входим...", `aria-disabled`, one request | M24 |
| E-in-4 | sign-in | AC4 wrong password: Alert, focus, email kept, password empty; a later valid submit lands on `next` | M25 / navigate rule |
| E-in-5 | sign-in | AC8 `next=//evil.example`, `next=https%3A%2F%2Fevil.example`, `next=%2F%09%2Fevil.example` -> lands on `/` | M1; M-ctrl -> the `%09` case |
| E-in-6 | sign-in | AC6 `route.abort()` -> message + "Повторить"; un-route; "Повторить" -> lands on `next` | retry drops `next` -> URL |
| E-in-7 | sign-in | AC7 four wrong submits in one bucket -> rate-limit copy, no digit | `rateLimit.enabled: false` in `academy-web:t29` rebuilt from the mutated file -> text |
| E-in-8 | sign-in | `javaScriptEnabled: false`: Enter in the password field sends a POST navigation to `/sign-in?next=...`, the page renders the h1 again, the URL never holds the password (round 1 F1) | M-method in `academy-web:t29` rebuilt from the mutated file -> `expect(request.method()).toBe("POST")`, received `GET` |
| E-out-1 | sign-out | fresh context, own bucket: sign in via UI; **save the value of the `better-auth.session_token` cookie (`context.cookies()`) as `old`, and check with a cookie-less `request` context that `GET /api/auth/get-session` sent with header `cookie: better-auth.session_token=<old>` returns the session (positive control: the saved value is a valid token)**; open the menu with Enter, email shown (AC11), Esc returns focus, reopen, "Выйти" -> URL `/sign-in?signed-out=1` and "Вы вышли" under h1; then `/` -> sign-in; cookie `better-auth.session_token` absent; **the same `get-session` request with `old` -> 200 JSON `null` (server-side revocation, not only the deleted cookie)** | M19-like (action redirects without signing out) -> the `/` assertion; M-menu click handler without the action call (plain link navigation) -> URL assertion (signed-in visitor redirected to `/`); **M-revoke-out** the action passes headers without the cookie (`new Headers({ host })`) to `auth.api.signOut` -> URL, note and cookie stay green (Better Auth still deletes the cookie, V19), red at the `old` -> `null` assertion. If the positive control fails, the row is reported as broken, not green |
| E-dash-1 | dashboard | storage state: h1 "Главная", Empty text, no listitem, user button name = `SEED_EMAIL`; `/_next/static` and `>= 400` assertions kept; no horizontal scroll at 375 | removed `.next/static` (existing) |
| E-dash-2 | dashboard | AC12: `F6` -> "Академия"; `F6` -> `main`; Shift+`F6` back | M21 |
| E-dash-3 | dashboard | AC10: `get-session` fulfilled with `null` -> the pre-existing empty `role="alert"` now holds the alert; region "Уведомления"; focus unchanged; "Войти снова" href `/sign-in?next=%2F` | M20 container rendered with its text -> "existed empty before" |
| E-dash-4 | dashboard | theme follows the system (old E2); skip link first stop, `main` with inset ring (old E3) | existing |
| T-xff | tester, once | two `useOwnBucket` tests in one run: each gets three 401 then 429 on the 4th, independently | n/a (verification of U-1) |

**T-xff fallback** (if the second test sees 429 on its first attempt: Chromium or Docker dropped the
header, so every browser post shares the bridge gateway's bucket): set `workers: 1` in
`playwright.config.ts` (a config-level option; the suite is small, so running it serially costs little)
and replace `useOwnBucket` with `freshWindow(page)`, which waits 10.5 s before the test's first
credential post. The window is 10 s and no test posts more than 4 times (E-in-7 needs exactly 4 in one
window), so with one worker no two tests ever share a window. The setup project keeps its API post with
`X-Forwarded-For` (the request API sends headers as given). Cost: about 80 s for the 7 posting tests.
Record the switch in the PR and in ADR-0008's residual line.

### 13.4 Image check (`apps/web/scripts/check-image-migrations.sh`)
Header comment gains: "Runs against the compose project in `COMPOSE_PROJECT_NAME` (default: `academy`
from `name:`); isolated runs export it."
- I1 unchanged (2 entries from the journal). I2 unchanged (`.env` carries a valid secret, the secret
  check passes, connect fails).
- **I3** `docker compose run --rm --no-deps -e DATABASE_URL=postgres://academy:canary-pass-i3@db:1/academy
  -e BETTER_AUTH_SECRET= web`: rc != 0, output has `InvalidAuthSecretError`, lacks `MigrationError`
  (order: with M4 the unreachable DB fails first), lacks `canary-pass-i3`.
- **I3b** same with `-e BETTER_AUTH_SECRET=better-auth-secret-12345678901234567890`: rc != 0,
  `InvalidAuthSecretError` and `public default` present, the value absent.
- **I3c** same with the valid compose secret and `-e BETTER_AUTH_SECRETS=1:canary-secrets-i3c`: rc != 0,
  output has `BETTER_AUTH_SECRETS is not supported`, lacks `canary-secrets-i3c`.
Lines print `I3 OK` / `I3 FAIL ...`; no line starts with a bare verdict token.

### 13.5 Isolation for every role that runs anything (coder and tester)

Rules: nobody creates, edits or deletes the root `.env` (no root `.env` exists in the main checkout today;
`next.config.ts`, the seed and Playwright load it only if present, and an exported variable always wins);
nobody runs a compose command outside the `t29` wrapper, with one stated exception: the read-only bare
`docker compose config` (with `--quiet` or not) in the checks of steps 1 and 8, which creates, starts and
tags nothing; nobody runs `pnpm seed`, `pnpm dev` or e2e
against port 5432 or 3080; nobody runs `docker image prune`, `docker volume rm` or `down -v` except
`t29 down -v`.

Setup, once per role session, in that role's scratchpad (`H` = the absolute path of `t29-env.sh` there;
every later call starts with `bash -c '. "<H>" && ...'`, because each tool call is a fresh shell):
1. Write `t29-env.sh` with exactly:
   ```sh
   # Sourced at the start of every call (bash or zsh). The root .env is never created or edited.
   export COMPOSE_PROJECT_NAME=academy-t29
   export WEB_PORT=3180 DB_PORT=55432 WEB_IMAGE_TAG=t29
   export DATABASE_URL=postgres://academy:academy@127.0.0.1:55432/academy
   export E2E_BASE_URL=http://127.0.0.1:3180
   export SEED_EMAIL=learner-t29@example.com
   t29() {
     if [ "${COMPOSE_PROJECT_NAME:-}" != academy-t29 ]; then echo "t29 REFUSED: COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-unset}"; return 97; fi
     for t29_arg in "$@"; do
       case "$t29_arg" in -p|-p*|--project-name|--project-name=*|-f|--file|--file=*) echo "t29 REFUSED: $t29_arg is fixed by the wrapper"; return 97;; esac
     done
     t29_name=$(docker compose -p academy-t29 config --format json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).name))' 2>/dev/null) || { echo "t29 REFUSED: compose config failed"; return 97; }
     if [ "$t29_name" != academy-t29 ]; then echo "t29 REFUSED: resolved project $t29_name"; return 97; fi
     docker compose -p academy-t29 "$@"
   }
   ```
   then append the two generated values without printing them:
   `printf 'export BETTER_AUTH_SECRET=%s\nexport SEED_PASSWORD=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 16)" >> "<H>"`.
   Rehearsed by the architect in bash 3.2 and zsh against a scratch compose file with the step-1 and
   step-8 interpolations: `t29 config` resolves `name academy-t29`, port `55432`, image
   `academy-web:t29`; `t29 -p academy down -v` and `COMPOSE_PROJECT_NAME=academy t29 ps` both print
   `t29 REFUSED` and return 97; without `BETTER_AUTH_SECRET` compose fails with the variable's name.
   Revision 3 re-rehearsed the changed `config` line (bash 3.2 and zsh, scratch compose with the step-8
   interpolation): without the secret, compose's own message, then `t29 REFUSED: compose config failed`,
   rc 97, no node trace; with it, `name: academy-t29`, image `academy-web:t29`. Compose's message stays on
   stderr; only node's is silenced.
2. Record the owner's state into `<scratchpad>/t29-before.txt`:
   `docker volume inspect -f '{{.CreatedAt}}' academy_db-data 2>/dev/null || echo absent`;
   `docker image inspect -f '{{.Id}}' academy-web:local 2>/dev/null || echo absent`;
   `cksum .env 2>/dev/null || echo absent` (from the repository root).
The wrapper only works from step 1 on (compose before step 1 has no `DB_PORT`/`WEB_IMAGE_TAG`); no step
before it runs compose.

Use: `t29 up -d --build --wait`; `bash apps/web/scripts/check-image-migrations.sh` (bare `docker compose`
inside follows the exported `COMPOSE_PROJECT_NAME`, verified by the operations judge); `pnpm seed`;
`pnpm dev` (port 3000, DB 55432 through the exported `DATABASE_URL`); `pnpm test:e2e`. Mutated images:
`t29 build web` (tag `academy-web:t29` only).

Teardown: `t29 down -v`; `docker image rm academy-web:t29`; recompute the three lines of step 2 and
`diff` them with `t29-before.txt`: any difference is reported to Stepan as an incident, never "fixed".
Per `architect_mistakes.md`: backups and `cmp` for every mutation; no `rm -rf $VAR`.

## 14. Implementation steps

Check sets (each step runs [U]; brackets add more):
- **[U]** `pnpm lint && pnpm typecheck && pnpm test` (CI `checks` minus build).
- **[B]** `env -u BETTER_AUTH_SECRET -u DATABASE_URL pnpm build` (CI `checks` build).
- **[DB]** `pnpm --filter @academy/db db:check`, `bash packages/db/scripts/check-drift.sh` (literal), the
  append-only check (CI `db`).
- **[I]** `pnpm test:integration` (CI `db`).
- **[S]** under 13.5: `t29 up -d --build --wait`, `bash apps/web/scripts/check-image-migrations.sh`,
  `pnpm seed` (from step 25), `pnpm test:e2e` (CI `e2e`).
- **[G]** from the repository root, `rg -n "lib/(auth(/index)?|session)['\"]" apps/web --glob '**/*.test.*' --glob 'apps/web/test/**' --glob 'apps/web/scripts/**' --glob 'apps/web/lib/seed*.ts'`
  prints nothing (no test or seed imports a wiring file). Globs are anchored with `apps/web/` or `**/`
  (architecture C2; a bare `lib/...` glob matches nothing when the search path is `apps/web`).
The last step of every commit runs [U][B][DB][I][S] (a commit is what CI sees). LOC excludes generated
files and deletions. Every commit leaves all of them green, because each new runtime requirement lands in
the same step as, or after, whatever supplies it; a step inside a commit may leave a check red that a
later step of the same commit turns green (step 2 leaves the drift check red until step 3).

Commit 1, `build(compose): parametrise the db port and the web image tag`
1. compose `db.ports: "127.0.0.1:${DB_PORT:-5432}:5432"`, `web.image: academy-web:${WEB_IMAGE_TAG:-local}`,
   header comment; `.env.example` `DB_PORT` and `WEB_IMAGE_TAG` blocks (6.2). ~12 LOC. [read-only bare
   `env -u DB_PORT -u WEB_IMAGE_TAG -u COMPOSE_PROJECT_NAME docker compose config` in a shell that has not
   sourced `t29-env.sh` (the one exception of 13.5) shows 5432 and `academy-web:local`; [S] in
   `academy-t29`]

Commit 2, `feat(db): add sessions, accounts and verifications tables for better auth`
2. `schema.ts` tables and 5.4 comments. ~55 LOC. [`pnpm --filter @academy/db typecheck`]
3. Generate `0001_auth`; read the SQL. [DB; `git diff --name-status main -- packages/db/drizzle` shows
   `A` for `0001_*`, `M` only for `_journal.json`]
4. I-db-1..3. ~60 LOC. [I; M17]

Commit 3, `feat(web): add redaction helpers for database and auth errors`
5. `lib/db-error.ts` + U-dberr. ~55 LOC.
6. `lib/auth/logger.ts` + U-log. ~55 LOC. [M9, M-first, M-lines]

Commit 4, `feat(web): require the auth secret in compose, ci and at startup`
7. `lib/auth/env.ts` + U-secret (incl. `BETTER_AUTH_SECRETS`). ~60 LOC. [M3, M-secrets]
8. Supply the secret before anything requires it: compose `web.environment.BETTER_AUTH_SECRET` with
   `:?`; `.env.example` auth block (6.2, removes `AUTH_SECRET`); turbo `dev.passThroughEnv`; CI e2e
   "generate the auth secret" step with `::add-mask::` (6.4.1); README "Web app": the secret line and that
   every compose command, including `up -d --wait db`, needs it. ~30 LOC. [read-only bare `docker compose
   config --quiet` (the one exception of 13.5) fails naming the variable in a shell without `t29-env.sh`
   and passes with it sourced; [S]]
9. `startup.ts` / `startup-node.ts` secret-first + U-start. ~45 LOC. [M4; [S]: the container starts
   because step 8 supplies the secret]
10. `check-image-migrations.sh` I3, I3b, I3c + header comment. ~50 LOC. [[S]; M4 in `academy-web:t29`
    -> I3 red]

Commit 5, `feat(web): configure better auth with redacted logging and lazy initialisation`
11. Deps `better-auth@1.7.14`, `drizzle-orm@^0.45.4`, `server-only@0.0.1`; `lib/auth/options.ts` (6.1).
    ~50 LOC. [`pnpm why drizzle-orm -r` one 0.45.x]
12. `lib/auth/index.ts` (`server-only`, `getAuth`/`getDb` on `globalThis`, L4) + route handler. ~45 LOC.
    [B; M23 (module-level instance) -> [B] red; [G], proven able to fail once here: a scratch
    `apps/web/lib/g-probe.test.ts` importing `@/lib/auth` makes [G] print it, then the file is deleted;
    [S]]
13a. Integration harness: dev dep `@testcontainers/postgresql`, `test:integration` script,
    `vitest.integration.config.ts`, `test/integration/global-setup.ts` (copy of `@academy/db`'s, ~35
    lines), unit config excludes `**/*.int.test.ts`. ~50 LOC. [`pnpm --filter @academy/web typecheck`;
    [U]; [I] stays red ("no test files") until 13b, same commit]
13b. `test/integration/db.ts` (db-per-test helper, `migrateDatabase`) + one smoke test (fresh DB has the
    `users` table). ~35 LOC. [I]
14. I-map, I-signin. ~60 LOC. [I; M18, M8, sign-up]
15. I-rl. ~35 LOC. [I; M5]
16. I-origin. ~45 LOC. [I; M6; if the wildcard fails (U-2), apply 6.3 here, all of its parts]
17. I-host. ~30 LOC. [I; M7]

Commit 6, `feat(web): add the session data access layer and safe return paths`
18. `lib/next-path.ts` + U-next (incl. `isPublicPath`). ~60 LOC. [M1, M2, M2b, M-ctrl, M12]
19. `lib/session-reader.ts` + U-dal. ~55 LOC. [M11, M14u]
20. `lib/session.ts` (`server-only`, `cache()`, `requireSession` -> `redirect(signInPath(returnPath))`).
    ~30 LOC. [B; G]
21. I-dal. ~55 LOC. [I; M14; (e) green first]
22. I-redact. ~45 LOC. [I; M10 per U-4]

Commit 7, `feat(web): add an idempotent seed for the local user`
23. `lib/seed.ts` (`seedUser`, the five branches of 4.5, errors). ~60 LOC. [U]
24. `lib/seed-cli.ts` (`runSeed`) + U-seedcli. ~60 LOC. [M-close, M-hint]
25. `scripts/seed.ts` (root `.env` load, `runSeed` wiring), web `seed` script, root `seed`, turbo `seed`
    task (6.7), CI e2e "seed the e2e user" step after the image check (6.4.4). ~35 LOC. [[S] incl.
    `pnpm seed` -> `seed: created`, rerun -> `seed: updated`; G]
26. I-seed cases 1-4. ~60 LOC. [I; M15, M16, M-revoke]
27. I-seed cases 5-8. ~60 LOC. [I; M-link]

Commit 8, `feat(web): add the sign-in page and protect every route`
28. `shadcn add` (9.4) + `globals.css` exceptions (c), (d). ~10 LOC by hand. [U4 green; unused-dep check]
29. `lib/copy.ts` (9.3). ~25 LOC. [from the repository root, `rg -l '[а-яА-ЯёЁ]' apps/web --glob
    '!apps/web/lib/copy.ts' --glob '!**/*.test.*' --glob '!apps/web/e2e/**'` lists exactly
    `apps/web/lib/courses.ts` (its stub data, deleted in step 47) and nothing else; rehearsed on the
    current tree]
30. `sign-in-form.tsx` part 1: fields, AC2 validation, focus. ~55 LOC.
31. `sign-in-form.tsx` part 2: submit, status mapping, Alert, retry, busy. ~60 LOC.
32. U-form part 1 (AC2-AC4). ~60 LOC. [M24, M25]
33. U-form part 2 (AC5-AC7, 500, success, signed-out). ~60 LOC.
34. `app/sign-in/page.tsx` + `app/sign-in/actions.ts` (`needsSeedHint`). ~45 LOC. [B; `pnpm dev` under
    13.5: `/sign-in` renders; [S]: `/` still public, home.spec green]
35. `playwright.config.ts` (root `.env` load, `setup` project, storage state), `e2e/fixtures.ts`,
    `e2e/auth.setup.ts`; `.gitignore`, `.dockerignore`, `biome.json` `!**/playwright/.auth`
    (architecture C5); turbo `test:e2e.passThroughEnv` += `SEED_*`. `home.spec.ts` runs under the storage
    state unchanged. ~55 LOC. [[S]: setup signs in with the seeded user from step 25; then `pnpm lint`
    with `apps/web/playwright/.auth/learner.json` present stays green]
36. `proxy.ts` + U-proxy; `app/page.tsx` calls `requireSession("/")`. ~50 LOC. [B; [S]: healthcheck `/`
    -> 307 -> `/sign-in` 200; home.spec green through the storage state]
37a. `lib/entry-guard.ts` scanner core (comment stripping, directive position without the quoted
    literal, entry kinds, recognised and unrecognised exports with the two exceptions, per-export
    segments) + `lib/entry-guard.test.ts` in-memory cases for those rules (4.8, U-guard). ~60 LOC.
    [M-guard-action, M-guard-comment, M-guard-unrec]
37b. Allowlist in `lib/entry-guard.ts` (`<file>#<export>` and file entries, non-empty reason, stale
    file or export, file entry refused for a `"use server"` module) + its in-memory cases. ~50 LOC.
    [M-guard-reason, M-guard-export]
37c. Walker (all of `apps/web` minus `node_modules`, `.next`, `e2e`, `test`, `*.test.ts(x)`) + its
    temp-dir case + `app/entry-points.test.ts` (real tree, #29's allowlist of 4.8 minus
    `app/(app)/actions.ts#signOutAction`: the file does not exist yet and a stale entry fails). ~55 LOC.
    [M13 on `app/page.tsx`, M-guard-route, M-guard-root]
38. `e2e/protection.spec.ts`. ~40 LOC. [S]
39. `e2e/sign-in.spec.ts` E-in-1..E-in-4. ~60 LOC. [S]
40. `e2e/sign-in.spec.ts` E-in-5..E-in-7; T-xff run once (13.3, fallback if red). ~55 LOC. [S; M-ctrl
    via E-in-5]

Commit 9, `feat(web): add the dashboard shell with user menu, notifications and sign-out`
41. `lib/sign-out.ts` + U-signout. ~55 LOC. [M19]
42. `app/(app)/actions.ts` (`signOutAction`) + `components/user-menu.tsx` (4.15 markup and handler) +
    allowlist entry `app/(app)/actions.ts#signOutAction`. ~60 LOC. [U-guard green]
43. `components/top-bar.tsx`. ~35 LOC.
44. `components/notifications.tsx` (containers, get-session on mount, AC10). ~50 LOC.
45. `components/region-cycle.tsx`. ~50 LOC.
46. U-cycle. ~55 LOC. [M21]
47. `app/(app)/layout.tsx`, `app/(app)/page.tsx` (Empty, `requireSession("/")`); delete `app/page.tsx`,
    `components/course-list.tsx`, `components/course-list.test.tsx`, `lib/courses.ts`; in the same step
    `e2e/home.spec.ts`'s first test drops the `lib/courses` import and asserts h1 "Главная" and the Empty
    text (typecheck includes `e2e/`); `lib/copy.ts`'s header comment drops "or in the stub data of
    lib/courses.ts". ~60 LOC. [B; [S]; M13 now on `(app)/page.tsx`; the step-29 `rg` now lists nothing]
48. `git mv e2e/home.spec.ts e2e/dashboard.spec.ts` + E-dash-1..E-dash-3 (E-dash-4 is the old E2/E3).
    ~60 LOC. [S; M20, M21]
49. `e2e/sign-out.spec.ts` (E-out-1 incl. the saved-token positive control and the revocation
    assertion). ~55 LOC. [S, three consecutive green runs of the whole suite; M19-like, M-menu,
    M-revoke-out]

Commit 10, `docs: document the auth secret and seed; propose adr-0008; amend adr-0007`
50. README "Web app": the order of section 11, re-keying ends sessions, local traces may hold the typed
    password; `docs/adr/0008-authentication.md`, `docs/adr/0007-progress-data-model.md` (already written
    in the architect phase). ~30 LOC. [lint]

## 15. Commits

Each body ends with `Refs #29`; the PR body says `Closes #29`, carries "Design deviations" (9.2 table,
the waiver sentence, the DESIGN issue number) and the `auth generate` summary (5.3).

1. `build(compose): parametrise the db port and the web image tag` (1)
2. `feat(db): add sessions, accounts and verifications tables for better auth` (2-4)
3. `feat(web): add redaction helpers for database and auth errors` (5-6)
4. `feat(web): require the auth secret in compose, ci and at startup` (7-10)
5. `feat(web): configure better auth with redacted logging and lazy initialisation` (11-17)
6. `feat(web): add the session data access layer and safe return paths` (18-22)
7. `feat(web): add an idempotent seed for the local user` (23-27)
8. `feat(web): add the sign-in page and protect every route` (28-40)
9. `feat(web): add the dashboard shell with user menu, notifications and sign-out` (41-49)
10. `docs: document the auth secret and seed; propose adr-0008; amend adr-0007` (50)

## 16. Needs Stepan

1. Accept ADR-0008 (Proposed) and approve the ADR-0007 amendment (items 6 and 8; ADR-0007 item 10 needs
   his approval) in the PR.
2. Confirm the waiver of ADR-0006 item 5 for the data rows of 9.2 as worded (dated 2026-10-30, from his
   "empty state, real data later" decision).
3. Orchestrator actions (GitHub, not files; done before the coder phase, and the DESIGN issue is #79): append the 9.2 texts to #30 and #35,
   add `blocked by #30` to #35, file the DESIGN issue of 9.2.
4. Optional: relabel #29 `tier:project`.
5. After merge: section 11 (secret, seed values in `.env`, `up --build`, `pnpm seed`).
6. Until #29 merges: do not run `docker compose up --build` (or any `up` that rebuilds `web`) for the
   `academy` project from this checkout. The main checkout is on `feat/29-sign-in-dashboard`, so the
   rebuilt image would apply the unmerged `0001_auth` to `academy_db-data`, and any later change of that
   migration would then fail every startup with `42P07` (section 11). Roles never do it (13.5).
7. `0001_auth.sql`, its snapshot and its `_journal.json` entry (incl. `when`) are frozen after step 3:
   later schema needs go into a new migration; regenerating `0001` needs Stepan's agreement.
