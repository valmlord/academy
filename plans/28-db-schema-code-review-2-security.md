# #28 db schema v1: judge_code round 2, security

Reviewer: judge-security. Date: 2026-10-29. Worktree `.claude/worktrees/confident-ellis-4d58ed`, HEAD 45396e7 plus the
uncommitted diff. Inputs read: round-1 security report (FAIL, I8b), the re-test section of
`plans/28-db-schema-test-report.md` (lines 117-174), the three changed files, the full `packages/db/src`, the test
assertion helpers, and `pg-connection-string@2.14.1` plus `pg@8.23.1` (`client.js`, `connection-parameters.js`) under
`node_modules/.pnpm`.

## Verdict: PASS

## Round-1 finding: resolved

- `packages/db/test/integration/client.int.test.ts:38-40` `loggedArgument`: a string is kept as is (what `console`
  prints for a string), anything else goes through `inspected` (`test/assertions.ts:7-9`,
  `util.inspect(value, { depth: Infinity })`). `:78` builds `logged` from
  `consoleError.mock.calls.flat().map(loggedArgument)`; `:81-82` assert the canary and the URL are absent. An object
  argument such as `pool.options` now renders its `connectionString` property, so the guard can fail. `inspected` is
  deeper than the real `console.error` (depth 2), so anything the real logger would print is visible here. The
  `.map(String)` rendering is gone.
- Proof it can fail, re-test table rows 1-3: (1) `pool.options` passed to `console.error` -> I8b red at `:81:24`,
  received text contains `connectionString: 'postgres://test:canary-s3cret-28@...'`; (2) same mutation with the
  round-1 `.map(String)` -> green, which is the negative run proving the old test was blind and the new one is not;
  (3) URL interpolated into the message string -> red. Old and new behaviour diverge, as required.

## migrate.ts change (round-1 non-blocking note)

- `src/migrate.ts:84-90`: `let client: pg.Client | undefined`, constructed at `:89` inside the try with
  `stage = "connect"` (`:85`); `:106` `await client?.end()`. When the constructor throws, `client` stays undefined,
  `end` is skipped, and the catch (`:98-103`) wraps the error as `MigrationError` stage `connect` with message
  `could not open the migration session (<code>)` (`:118`). Error contract kept: option and URL pre-checks (`:74-82`)
  still run before any I/O and outside the try, so `InvalidConnectionStringError` / `InvalidLockTimeoutError` /
  `InvalidMigrationsFolderError` are still thrown unwrapped (U4, U6, U7 green per re-test).
- What can now become the `cause` (it previously escaped raw, so the cause holds nothing that was not already
  exposed; the change only wraps it). I enumerated every synchronous throw on the constructor path:
  - `pg-connection-string/index.js:33-36`: URL parse failure, `err.input` redacted to `*****REDACTED*****`.
  - `:91,95,99`: `fs.readFileSync(config.sslcert|sslkey|sslrootcert)`; the ENOENT message and `err.path` hold the
    path taken from the URL query parameter, never userinfo. The password is read from `result.password` (`:45`),
    never passed to fs.
  - `:103,127-129`: fixed text. `:198` `Invalid port: <value>`: in `toClientConfig`, not on the `parse()` path pg
    uses, and the value is the port anyway.
  - `pg/lib/connection-parameters.js:105-111`: `Invalid sslnegotiation value: "<value>"` (a query value) or fixed
    text. `pg/lib/client.js:50-110`: no throw; password defined non-enumerable (`:62-67`).
  None of these messages or properties contain the password or the full URL. The new U5 case
  (`test/unit/options.test.ts:75-84`) asserts stage `connect`, `ENOENT` in the cause chain, and
  `inspected(error)` without `canary-u5`; the URL there carries the canary in userinfo, so a password leak via the
  cause would show. Re-test row 4: the old placement (constructor outside the try) turns this case red with
  `expected MigrationError, got Error: ENOENT ...` while the refused-connection U5 stays green, so the test guards
  the fix.
- `errorCode` (`:130-143`) picks the Node `code` (`ENOENT`) for the message: a fixed vocabulary, no caller data.

## Regression sweep over packages/db

- Grep over `packages/db` (excluding node_modules, dist, .turbo) for `console.`, `sql.raw`, `process.env`, `eval(`,
  `exec(`, `postgres://`, `password`, `secret`: same hits as round 1. One production `console.error`
  (`src/client.ts:32`, fixed prefix, code, message only); `sql.raw` only at `src/vocabulary.ts:39` behind the
  kebab-case check; no env reads in `src`; only canary credentials in tests.
- `src/client.ts`, `src/errors.ts` re-read: unchanged contract; `MigrationError` (`errors.ts:51-59`) stores only stage,
  the built message and the cause. `lock_timeout` still a bind parameter (`migrate.ts:93`), advisory-lock key bound
  (`:95`).
- Imports of the changed files resolve: `../assertions.js` (exports `inspected`, `causeCodes`, `rejectionOf`,
  `thrownBy`), `./helpers.js`, `../../src/*.js`.
- Re-test authority runs: typecheck, unit (34), build, integration (38) all exit 0; lint shows only the three
  git-ignored `.claude/` state files.

## Non-blocking notes

- The design file still marks I7 mutation (b) unverified; re-test row 5 verified it live (only I7 red). Not a
  security matter; the orchestrator may update the design text.

PASS
