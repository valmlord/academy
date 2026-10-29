# #28 db schema v1: judge_code round 1, security

Reviewer: judge-security. Date: 2026-10-29. Worktree `.claude/worktrees/confident-ellis-4d58ed`, HEAD 45396e7 plus the
uncommitted diff. Spec: `plans/28-db-schema-design.md` rev 3 (4.5, 4.7, 4.11, 8, S1-S4). Tester report read.

## Verdict: FAIL, 1 issue

1. `packages/db/test/integration/client.int.test.ts:72` (I8b, the default pool logger canary) flattens the
   logger's arguments with `String`: `consoleError.mock.calls.flat().map(String).join(" ")`. Any object argument
   becomes `"[object Object]"`. The design's I8b mutation, "log the pool options or the URL in the default logger"
   (design section 7, I8b; e.g. `pool.on("error", (e) => console.error(prefix, e, pool.options))`), therefore leaves
   `not.toContain(testPassword())` and `not.toContain(url)` green, while the real `console.error` renders
   `pool.options` with `util.inspect` and prints `connectionString: 'postgres://test:canary-s3cret-28@...'`. Only a
   leak written as a string is caught. Design 4.11 requires the tests to assert on
   `util.inspect(value, { depth: Infinity })` "which is what a logger prints". The tester did not run the I8b
   mutation (report line 90). Fix: build `logged` from `consoleError.mock.calls.flat().map(inspected)` (from
   `test/assertions.ts`, as I4/I5/I12 already do) or `util.format(...call)` per call, and watch the
   object mutation go red. Owner: coder (the design specified inspect; the implementation deviated).
   Lesson appended to `.claude/feedback/coder_mistakes.md`.

The production code itself leaks nothing on the paths I checked; the defect is that one leak path's guard cannot fail.

## What I checked (all PASS except item 1 above)

- **transcript_path CHECK = 4.5.** `src/schema.ts:137-140` and `drizzle/0000_init.sql:12`: the pattern
  `'^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*/?$'` is byte-identical to design 4.5 line 333, constraint
  name `attempts_transcript_path_check`, column `"attempts"."transcript_path"`, operator `~`. Only the line break
  between the name and `CHECK` differs (drizzle-kit layout). No backslash. Tester B12 M1-M3 sets match 7 I11.
- **lock_timeout.** `src/migrate.ts:90` `SELECT set_config('lock_timeout', $1, false)` with `[String(lockTimeoutMs)]`,
  a bind parameter, session-level. No `SET`, no `sql.raw`, no interpolation of it anywhere (`sql.raw` occurs only in
  `src/vocabulary.ts:39`). Validated before any I/O: `migrate.ts:74-82` (pre-check, then `validateLockTimeoutMs`
  `:46-56` with `typeof`, `isSafeInteger`, `1..MAX`), the client is created only at `:84`. Error text
  `errors.ts:15-21` prints `String(number)` or only `typeof`. U4 covers NaN, Infinity, -1, 0, 1.5, 2^31, "500", 10n.
- **Advisory lock** `migrate.ts:92` key as bind parameter.
- **Connection-string pre-check.** `src/connection-string.ts:10-24`: non-string or empty, `new URL` failure (parse
  error dropped, no cause), protocol not in `{postgres:, postgresql:}` all throw `InvalidConnectionStringError` with
  the fixed message `errors.ts:10`, no input, no cause. Called first in `createDb` (`client.ts:23`) and
  `migrateDatabase` (`migrate.ts:74`). U6 asserts `cause === undefined` and inspect lacks the canary for both
  functions and both malformed inputs.
- **No password/URL in errors.** `MigrationError` messages `migrate.ts:107-124` contain only the stage text, code,
  timeout number and folder path. `errorCode` `:127-140` walks at most 10 causes. Cause is the pg/Drizzle error.
  I also read `pg-connection-string@2.14.1/index.js`: it redacts `err.input` on URL failure (`:34-36`) and its other
  throws name a key/value or file path, never the URL. U5 (refused), I4 (apply), I5 (lock), I12 (28P01, both wrong
  and right canary) assert `util.inspect(depth: Infinity)` of the whole error lacks the canary, via `inspected`
  (`test/assertions.ts:7-9`) and `expectNoSecret` (`helpers.ts:89-91`). These can fail: putting the URL into a
  message or attaching an object holding it is visible to inspect. `testPassword()` (`helpers.ts:109-115`) refuses a
  non-canary container password, so the canary cannot silently be empty.
- **Default pool logger.** `client.ts:25,30-33`: listener always registered; prints the fixed prefix, `code` and
  `message` only, never the error object, the client (2nd listener argument ignored) or the pool config. Correct;
  its test is item 1.
- **global-setup.** `test/integration/global-setup.ts:23-29`: console line uses only the caught error's message.
- **sql.raw.** `src/vocabulary.ts:33-40`: every value tested against `^[a-z][a-z0-9-]*$` before `sql.raw`; all five
  call sites (`schema.ts:99,131,170,174,204`) pass `as const` vocabularies or `CHECK_KINDS` derived from
  lesson-schema; generated SQL `0000_init.sql:10,27,28,52,65` shows only kebab-case literals. Error message
  `errors.ts:40` uses `JSON.stringify` of a string (cannot throw). Test-only identifier interpolation
  `helpers.ts:36,42` uses generated hex.
- **CI job `db`** (`.github/workflows/ci.yml:48-80`): workflow-level `permissions: contents: read` (`:12-13`) applies;
  trigger is `pull_request`, not `pull_request_target`, so no secrets reach PR code; `persist-credentials: false`
  (`:61`); `fetch-depth: 2`; `PR_HEAD_SHA: ${{ github.event.pull_request.head.sha }}` only in step `env` (`:70-71`),
  never in `run:`; no other `${{ }}` in any `run:` line of the job. Actions are tag-pinned `@v4`, same as every
  existing job (not a regression).
- **check-append-only.sh**: `set -uo pipefail`, `${PR_HEAD_SHA:?}`, all expansions quoted (`:17,21,27-28,33`), pathspecs
  single-quoted, no eval, output printed with `printf '%s\n'`. The sha is only compared as a string. No injection.
- **check-drift.sh**: no external input; `$out`/`$status` quoted, here-string grep, stdin `/dev/null`. No injection.
- **Deps.** `packages/db/package.json` caret ranges are fixed by the committed lockfile: `pnpm-lock.yaml` resolves
  pg 8.23.1, drizzle-orm 0.45.4, drizzle-kit 0.31.11, testcontainers / @testcontainers/postgresql 12.2.1,
  @types/pg 8.23.1, each with an integrity hash (`:754,808,1143,1147,1524,1707`). `pnpm-workspace.yaml:6-10`
  `allowBuilds` denies all four build scripts (`false`), so nothing new runs at install. F20 esbuild advisory
  accepted in design (no `serve`/`studio` script in package.json).
- **Secrets.** Grep for password/secret/token/api key/`postgres://` in `packages/db` (excluding node_modules, dist,
  .turbo): only the canaries `canary-s3cret-28`, `canary-u4..u7`, `wrong-canary-28` in tests. `drizzle.config.ts`
  has no credentials, reads no env. `turbo.json:10` passes only `DOCKER_*`, `TESTCONTAINERS_*`.
- **Biome** `biome.json:15` ignores only `packages/db/drizzle/meta/**`.
- **ADR-0007** states the reader still confines `realpath` (`:110`), attempt id is not authorization (`:114`), the
  connection-string rule (`:133`) and the `DrizzleQueryError` params caveat for #30 (`:176`).
- Imports: every `src` and test import resolves to an existing file (`errors.js`, `connection-string.js`,
  `client.js`, `migrate.js`, `vocabulary.js`, `schema.js`, `../assertions.js`, `./helpers.js`).

## Non-blocking notes

- `migrate.ts:84` constructs `pg.Client` (which parses the URL synchronously) outside the `try`, so a
  pg-connection-string throw (e.g. a missing `sslrootcert` file) escapes as a raw error, not `MigrationError` stage
  `connect`. No secret leaks (checked above); a contract nit only.
