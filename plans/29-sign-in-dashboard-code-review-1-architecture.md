# Issue #29 code review, round 1: architecture

Judge: architecture. Diff: `git diff main...HEAD` (10 commits, 7ae73ee..df0910b), branch `feat/29-sign-in-dashboard`.
Upstream read: design Revision 3 (all of it), ADR-0008, the ADR-0007 amendment, ADR-0006 item 5, sign-in
acceptance notes, `design/system/README.md` and `proto.css` (control, card and input rules), planner file,
mutation log, resume note, tester report, my design-round reviews.

## Verdict

FAIL - 3 issues found:

1. [apps/web/test/integration/db.ts:5-6] The comment justifying raw-string statements is false: "apps/web and
   @academy/db resolve two copies of drizzle-orm 0.45.4 (one with Better Auth's kysely peer, one without), whose SQL
   types do not mix." The lockfile at every commit from a1cc532 on has one package entry and one snapshot,
   `drizzle-orm@0.45.4(@types/pg@8.23.1)(kysely@0.29.7)(pg@8.23.1)`; `apps/web/node_modules/drizzle-orm` and
   `packages/db/node_modules/drizzle-orm` both link to that one store dir (checked with `readlink`); the tester
   (report section 10) and the coder's own note in design 6.6 say the same. The comment is the pre-resume belief
   (resume note, open finding 2) that was settled later without updating the comment. Under the author's rules a
   comment that lies is a defect. Fix: delete the clause (raw strings need no justification beyond "assertions on
   what the app wrote") or state a true reason. Commit 5.

2. [.env.example] `SEED_EMAIL` / `SEED_PASSWORD` are not listed. Design 6.2 (and step 8: "`.env.example` auth block
   (6.2)") prescribes the commented block ending with `# SEED_EMAIL=learner@example.com` / `# SEED_PASSWORD=` and
   "Put them here, never on a command line"; design 2.1 maps issue AC3 ("`.env.example` updated") to
   `BETTER_AUTH_SECRET`, `SEED_*`, `DB_PORT`, `WEB_IMAGE_TAG`; the file's own header says "Every variable the code
   reads must be listed here", and `lib/seed-cli.ts`, `e2e/fixtures.ts` and turbo read them. Not in the coder's
   deviation list; the tester found it (report section 6). README step 3 tells the reader to add them to `.env`
   copied from a file that does not mention them. Fix: add the 6.2 lines (and `# SEED_NAME=` if kept optional).
   Commit 7 (the seed) is the natural home.

3. [apps/web/components/ui/input.tsx, ui/button.tsx, ui/card.tsx; sign-in-form.tsx, user-menu.tsx] The tester's
   "minor visual differences" are deviations from documented design-system rules, not prototype pixel noise, so
   ADR-0006 item 5 applies: match, or list with a DESIGN issue. They come from the `radix-nova` registry defaults
   that `shadcn add` wrote, which the design system does not use (it is built on `new-york-v4`, README line 7):
   - Controls: README "Controls: height 2.25rem (`--control-height`), small 2rem". App: `Input` `h-8` (32px),
     `Button` default `h-8`, `sm` `h-7` (28px): "Повторить" and the user-menu trigger are 28px instead of 32px;
     every field is 32px instead of 36px. ("Войти" is patched to `h-9` by className, the rest is not.)
   - Card: README "Elevation: borders first, shadows only on cards, menus and dialogs"; `proto.css .card` has a
     1px `border` and `--shadow-sm`. App: `ring-1 ring-foreground/10`, no shadow.
   - Dark input fill: `proto.css .input` fills with `background` (opaque); app `dark:bg-input/30` (translucent,
     visibly lighter on the dark card). README: "No opacity on text or on any container with text", because a
     translucent surface has no defined contrast; the README's own `input` token note made the token opaque for
     exactly this reason.
   Owner: coder. The coder already edits these vendored files where the design system differs (focus halo removed,
   `warning` Alert variant), so aligning sizes, the card border/shadow and the input fill with the documented values
   is the same kind of change and fits commit 8. If Stepan prefers to keep the radix-nova look instead, each item
   goes into the PR's "Design deviations" with a DESIGN follow-up issue; an unlisted one fails ADR-0006 review.

Who: all three are implementation (coder); the design specified 6.2 and ADR-0006 conformance, and no design
statement led to them. Lesson appended to `.claude/feedback/coder_mistakes.md`.

## What I checked, and found right

**Design intent and module boundaries.**
- `apps/web` never imports `services/*`; shared code only via `@academy/db`. Auth core in `lib/auth/`: `env.ts`
  (`readAuthSecret`, `InvalidAuthSecretError`, BETTER_AUTH_SECRETS checked first), `options.ts` (every 6.1 option:
  plural adapter, dynamic loopback base URL, sign-up off, 8/128, limiter on, `useSecureCookies: false`,
  `disableOriginCheck: false`, redacting logger, telemetry off, `nextCookies()` last), `logger.ts` (L2).
- Lazy, single instances: `lib/auth/index.ts` creates `getDb()` / `getAuth()` on first call, memoised on
  `globalThis` under `Symbol.for(...)` (dev HMR pool leak, design 4.7), the one `as` justified in a comment; route
  handler `toNextJsHandler((request) => getAuth().handler(request))`, so `next build` never builds the instance
  (mutation log: M23 red at build). One `pg.Pool` per process: `getDb()` is shared by Better Auth and
  `needsSeedHint`; the seed opens its own only as the ADR-0007-item-8 operator command, and closes it in `finally`.
- `server-only` only in the two wiring files (`lib/auth/index.ts`, `lib/session.ts`); all logic in marker-free
  modules with injected deps (`session-reader.ts`, `sign-out.ts`, `seed.ts`, `seed-cli.ts`, `entry-guard.ts`).
  Design [G] rg over tests, `test/**`, `scripts/**`, `lib/seed*.ts`: no wiring import. Client components import
  only marker-free modules (`sign-in-form` gets `needsSeedHint` as a prop; `user-menu` gets `signOutAction` as a
  prop).
- DAL: `getSession()` wraps the reader in React `cache()`; reads pass `query: { disableRefresh: true }` (U-dal and
  I-dal (d)/(e) guard it); `requireSession(returnPath)` redirects through `signInPath`. `(app)/page.tsx` calls
  `requireSession("/")`; the sign-in page calls `getSession()` and redirects a signed-in visitor (decision 10).
- Proxy: default deny, `isPublicPath` exact `/sign-in` plus `/api/auth/` prefix, cookie presence only, 307. The
  absolute-Location deviation is recorded in design 4.8 and ADR-0008 item 8 and unit-tested (both host cases and
  the malformed-Host fallback).
- Sign-out: `createSignOut` deletes both cookie names only when `signOut` throws (V19), logs `describeDbError`,
  redirects outside the `try`; the action passes `await headers()` (E-out-1 under M-revoke-out goes red at the
  server-side `null` assertion, tester re-ran it).
- Entry guard: per-export segments, `file#export` allowlist with non-empty reasons, stale and file-level entries
  for `"use server"` modules refused, unrecognised exports listed, inline directive refused, comment stripping that
  keeps string literals, walker over all of `apps/web` minus `node_modules`/`.next` anywhere and `e2e`/`test` at the
  root and test files; the directive regex uses `\x20`. The real-tree test asserts all three kinds were scanned and
  the allowlist is exactly design 4.8's four entries.
- Schema and migration: `sessions`, `accounts`, `verifications` with BA property keys, snake_case SQL,
  `timestamptz`, no id default, every constraint/index named (`*_pkey`, `sessions_token_unique`,
  `accounts_provider_account_unique`, `*_user_id_fk ON DELETE cascade`, `*_user_id_idx`,
  `verifications_identifier_idx`); `0001_auth.sql` is additive and generated, `0000` untouched, journal gains one
  entry; 5.4 stale comments fixed; I-db-1..3 present (constraint and index names asserted exactly). The
  `migrate.int.test.ts` table list was updated to nine tables and the test title no longer says "six".
- Seed: the five branches of 4.5 in order (validate, find, conflict/create+link, repair+revoke, update+revoke),
  the hash computed before any write, `deleteUserSessions` after link and update; CLI prints exactly one L5 line,
  hint by code class (connect set, `42P01`, none otherwise), never the URL, email or password.
- Infra: compose `DB_PORT`, `WEB_IMAGE_TAG`, `BETTER_AUTH_SECRET:?`; turbo `dev`/`seed`/`test:e2e`
  `passThroughEnv` as 6.7; root `seed` script; CI secret and seed steps with `::add-mask::` and the seed step's
  `timeout-minutes: 3`; `.gitignore`, `.dockerignore`, `biome.json` cover `playwright/.auth`; the image script gains
  I3/I3b/I3c with the "secret before migrate" check (MigrationError absent).
- ADRs: ADR-0008 items match the code (items 4-11 checked against the files above); every `ADR-0008 item N`
  reference in a code comment points at the right item. ADR-0007 amended in place (items 6, 8) with the dated
  Consequences note; status stays Accepted.

**Coder's listed deviations**, each accepted: I1 table list; shadcn's extra deps (`radix-ui`, `lucide-react`,
`class-variance-authority` are imported by the added components; `separator` is a dependency of `field`); focus halo
classes removed (design-system "Focus ring" rule, global `:focus-visible` in `globals.css`); Alert `warning`
variant (acceptance notes name it, shadcn has none); form a11y details; seed email check; `describeDbError`
naming; absolute proxy Location (recorded); both cookie names (V19 path only); "Курс" omitted (9.2, DESIGN #79);
`(app)/layout.tsx` renders children without a session (the page's `requireSession` redirects; the shell would only
show an empty email); notifications Alert `role={undefined}` (the spread after `role="alert"` removes it, so the
pre-existing container is the one live element, E-dash-3); English e2e titles; E-in-3 `force` click (commented:
Playwright treats `aria-disabled` as disabled); E-dash-3 selector (commented: Next's route announcer is a second
`role="alert"`).

**Commits.** Order and content match design section 15: each commit carries its own tests (I-db with the schema,
U-dberr/U-log with the redactors, U-secret/U-start/I3 with the secret, I-map..I-host with the auth config, U-next/
U-dal/I-dal/I-redact with the DAL, U-seedcli/I-seed with the seed, U-form/U-proxy/U-guard/E-in with the sign-in
page, U-signout/U-cycle/E-dash/E-out with the dashboard); "supply before require" holds (compose, CI, turbo and
startup secret all in commit 4; seed CI step in 7 before the e2e setup in 8; the `signOutAction` allowlist entry
lands with the file in 9). Every body ends with `Refs #29`. Subject lengths (2, 5, 9, 10 over 72) are the
orchestrator's reword, as stated.

**Code style.**
- `rg '[а-яА-ЯёЁ]'` over every added or modified file: hits only in `apps/web/lib/copy.ts` (22 lines, UI copy) and
  four ADR-0008 lines that quote UI copy ("Выйти", "Вы вышли"). No Russian identifier, comment or log string.
- No `any`. Two `as` in product/test code, both with a reason (`lib/auth/index.ts:18-19` globalThis slots,
  `lib/seed-cli.test.ts:26-27` an unqueried fake); `as const` elsewhere.
- Every `export function` / `export default function` in the diff has an explicit return type (multi-line
  signatures read one by one: `SignInPage`, `SignInForm`, `findUnguardedEntryPoints`, `createCredentialUser`,
  `signIn`, the rest single-line).
- Dedicated errors: `InvalidAuthSecretError`, `SessionReadError`, `SeedConflictError`, `InvalidSeedInputError`,
  `InvalidAllowlistEntryError`, `MissingSeedCredentialsError`; messages name the variable and rule. Catches narrow
  `unknown` (`startup.ts` rethrows anything but `InvalidAuthSecretError`); the two bare `catch {}` in client code
  have a reason comment and a defined fallback.
- Why-comments throughout (limiter default, origin check under `NODE_ENV=test`, 307, control characters, cookie
  names, ref vs state for in-flight, `\x20`); the one false comment is issue 1.
- Raw colour grep (`#hex|oklch(|rgb(|hsl(` outside `globals.css`): none; `color-mix(... var(--foreground))` in
  `ui/button.tsx` uses tokens only.

**Tests able to fail.** Read the unit tests (logger, db-error, session-reader, sign-out, proxy, seed-cli,
startup, entry-points) and the integration harness and I-map..I-host; canaries use `serialised` (`util.inspect`,
depth 10), never `String()`. The mutation log records each design-named mutation red at its named assertion, and
the tester independently re-ran eight (M3, M9, M-guard-export, M5, M7, M14, M15, M-revoke-out) with backups and
`cmp`. M16's red point differs from the design (the unique constraint stops it first); the guard still fails, noted
honestly.

## Non-blocking observations

- `components/user-menu.tsx` imports `SIGNED_OUT_PATH` from `lib/sign-out.ts`, pulling `db-error.ts` into the client
  bundle. Moving the constant next to `signInPath` in `lib/next-path.ts` would keep the client import graph to
  route helpers. Not wrong today (both marker-free, tiny).
- `describeDbError` also describes non-database errors (the sign-out action's catch, the seed's generic branch).
  Accepted as listed; a rename can wait.
- The shadcn files export components through `export { ... }` without return types. Vendored generator output; if
  Stepan wants the return-type rule applied to them too, it is a one-line `ReactElement` per function.
- The sign-in h1 is a plain `h1` with CardTitle's sizes, not `CardTitle` (a `div` with no `asChild`): the acceptance
  notes' "CardTitle is the page h1" is about the role and look; worth one line in the PR so the consistency judge
  does not read it as a component swap.

## What the PR body must carry (design 9.2, 15; ADR-0006 item 5)

1. `Closes #29`.
2. "Design deviations": the 9.2 table verbatim, the waiver sentence ("Waiver of ADR-0006 item 5 for the data ACs
   (recorded 2026-10-30, Stepan's decision of the same day ...)"), and the "Курс" row with DESIGN issue **#79**.
   Plus, only if Stepan keeps them instead of issue 3's fix, each control-size / card / input-fill item with its own
   DESIGN issue.
3. The `auth generate` summary (design 5.3): `pnpm dlx auth@1.7.14 generate` into the scratchpad, diff summarised
   (expected differences: `accounts_provider_account_unique`, named constraints, `timestamptz`). I found no trace of
   this run in the plans or the coder scratchpad; the coder should run it in the fix round.
4. ADR-0008 Proposed and the ADR-0007 amendment for Stepan's acceptance (16.1, 16.2).
5. The tester's CI trace-artifact finding (report section 11) for the security judge's decision, and the
   pre-existing standalone-tracing observation as a follow-up, not a #29 change.

FAIL
