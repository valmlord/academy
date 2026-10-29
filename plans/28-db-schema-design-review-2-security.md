# #28 design review, round 2: security

Reviewer: judge-security. Read in full: `plans/28-db-schema-design.md` (rev 2, 1014 lines), my round-1 report
`plans/28-db-schema-design-review-1-security.md`, the round-1 architecture and operations verdicts (for context),
`.github/workflows/ci.yml`, `.claude/feedback/judge_mistakes.md`. Design review, no code exists yet, nothing run.
Each round-1 blocker was checked against the body text, not the Revision 2 changelog.

## Round-1 blockers

### S1 transcript_path constraint: resolved

Text: 4.5 (lines 282-311), section 5 attempts row (559), I11 (704), 7.1 M1-M3 (818-822), ADR item 7 (940-942).

Regex walked by hand, `^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*/?$`:

| Input | Result | Why |
|---|---|---|
| `''` | reject | first class needs one char |
| `.`, `..`, `../a`, `.hidden` | reject | first char must be alnum |
| `a/..` | reject | group needs `/` + alnum, `.` fails; `/?` takes `/`, then `$` meets `..` |
| `a/../b`, `a/.b` | reject | same: no segment may start with `.` |
| `/abs` | reject | `^` then alnum required |
| `a//b` | reject | group's alnum fails on the second `/`; `/?$` fails |
| `a\b`, newline inside, `%2e%2e/x` | reject | `\`, LF, `%` are in no class |
| `<uuid>/`, `<uuid>/agent.jsonl`, `a..b` | accept | `-`, `.` allowed after the first char; trailing `/?` |
| NULL | accept | CHECK unknown passes |

So no accepted value has a `.` or `..` segment anywhere, and every accepted value is a relative path of
`[A-Za-z0-9._-]` segments: no traversal, no absolute path, no separator or control characters.

Postgres semantics: `~` is ARE, case-sensitive, not newline-sensitive by default, so `$` matches only at end of
string (Postgres has no Perl-style "before a final newline" rule) and no class matches LF. Inside the bracket
expression `.` is literal and the trailing `-` is literal. Ranges are code-point ranges in Postgres's engine, so
no locale letters slip in. The pattern has no backslash, so `standard_conforming_strings`, `E''` and the JS template
(only `${` is special; the pattern has `$'` and `$)` only) cannot alter it; step 2 of section 10 has the coder
confirm the byte-identical SQL. No backreferences, so no catastrophic backtracking.

Mutations checked: M1 (naive `NOT LIKE`) accepts `..`, `a/..`, `a/../b`, `a//b`, `a\b`, `%2e%2e/x`: red. M2 (no `^`)
accepts `/abs` (matches `abs`) and `../a` (matches `a`): red. M3 (no `$`) accepts `a/..` and `a/../b` by prefix: red.
Each reject asserts SQLSTATE and constraint name, so another CHECK cannot mask it. Reader confinement stays in
ADR-0007 item 7 and 4.5 (defence in depth, not the boundary).

### S2 lock_timeout without interpolation: resolved

4.7 step 2 (365-370): `SELECT set_config('lock_timeout', $1, false)` with `$1 = String(lockTimeoutMs)` as a pg bind
parameter on a dedicated `pg.Client` (not a pool client, so the session setting cannot leak into later pool users),
and an explicit ban on `sql.raw`/interpolation. `is_local = false` is correct and its mutation is in I5 (b).
Validation (357-364, F25, U4) runs before any I/O: `typeof === "number"`, `Number.isSafeInteger`, `1..2147483647`
(INT_MAX, the GUC maximum; `0` would disable the timeout and is rejected). U4 has a distinguishing case for each
check (`0`, `2147483647`, `1.5`, `"500"`, and order vs connect). `pg_advisory_lock($1)` uses a constant parameter.

### S3 cascade scope: resolved

4.6 (325-337): cascade covers Postgres rows of the six tables only; transcripts survive it; deletion order
(collect `transcript_path` -> delete user -> delete files), owners #30 and backlog 12, crash-between residual named;
#30's `session`/`account` FKs must cascade. Mirrored in F22, ADR item 6, consequences, section 11.

### S4 connection string out of errors and logs: resolved

Rule 4.11 (491-506) and 4.7 pre-check (344-350): fixed message, no input, no `cause` for malformed URLs; lock-timeout
error names only the timeout; MigrationError messages carry stage, SQLSTATE, folder, timeout, never URL parts; default
pool logger prints a fixed prefix, `code`, `message`, never the error object or the pool config.

Leak paths vs canary tests, all asserting on `util.inspect(..., { depth: Infinity })` of the whole chain:
- pg driver errors: U5 (ECONNREFUSED, connect stage), I12 (`28P01`, both wrong and real canary absent).
- `new URL` error carrying `input`: U6 (no `cause`; `[verify]` with a fallback mutation that is red either way).
- Drizzle wrapping (`DrizzleQueryError` in 0.45) on the apply path: I4 inspect lacks `canary-s3cret-28`.
- lock stage: I5 inspect lacks the canary.
- pool `error` event: I8b spies `console.error`, asserts prefix + `57P01` and no canary / URL; I8 for the listener.
- Every integration URL carries the canary password set in `global-setup.ts`; the tester greps that `canary` never
  appears in `src/` or `scripts/`.
After the pre-check, pg-connection-string re-parses an already-valid absolute URL, so its own `new URL` cannot throw
with the input; its `decodeURIComponent` failure is `URI malformed` with no input. DNS errors expose the host only,
which 4.11 allows. testcontainers debug logging would print the canary container env, but that is a throwaway test
password and `DEBUG` is not set in CI: not a leak of a real credential.

## Round-2 additions checked for new defects

- CI (section 8): `persist-credentials: false` on the job that runs PR code; trigger stays `pull_request`
  (ci.yml:3-6), top-level `permissions: contents: read` (ci.yml:12-13) applies; no secrets added. `PR_HEAD_SHA`
  passes via step `env`, quoted in the script; `git diff` pathspecs are quoted literals. Parent-order check
  (`HEAD^2 == "$PR_HEAD_SHA"`) fails closed.
- `check-drift.sh` (section 6, 8 step 6): no `eval`, no env input, stdin `/dev/null`, here-string instead of a pipe,
  prints only drizzle-kit output and git status of `packages/db/drizzle`; nothing secret is available to print.
  It executes PR code (drizzle-kit loads `schema.ts`), which is inherent to the job and contained by the token-less,
  read-only, secret-less `pull_request` context.
- `freshDatabase()` interpolates only its own random hex; the vocabulary `sql.raw` helper is guarded and unit-tested
  (U3, three mutations).
- `allowBuilds` denies all four build scripts; `--frozen-lockfile` in CI; no `--force`.
- 4.9 `details` holds no grader secrets / `checks/` contents; 4.6 attempt id is not authorization; both in ADR.

## Non-blocking notes (carry into the plan / later issues)

1. 4.7 line 362: `InvalidLockTimeoutError` prints `JSON.stringify(value)` for non-numbers. That throws a plain
   `TypeError` for a `BigInt` or a circular object (so the named error is lost), and it echoes whatever object a
   caller passed by mistake. Printing `typeof value` (plus `String(value)` for numbers) keeps the message useful and
   never echoes caller data. Add `10n` to U4 if the JSON form stays.
2. For #30 and every later writer: Drizzle 0.45's `DrizzleQueryError` message embeds the query **params**. Once
   `account`/`session` exist, a logged query failure can contain password hashes or session tokens. 4.11 covers
   only the connection string; #30 should state its own rule for logging DB errors.
3. `transcript_path` has no length cap. The writer generates it, so this is cosmetic; a `char_length <= 1024`
   check would be additive later if ever needed.

## Verdict

PASS - no security issues found
