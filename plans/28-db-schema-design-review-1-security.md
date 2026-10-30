# #28 design review, round 1: security

Reviewer: judge-security. Read: `plans/28-db-schema-design.md` (full), `plans/28-db-schema-research.md` (full),
`.github/workflows/ci.yml`, `packages/lesson-schema/src/schema.ts` (`relPath`, `Check`),
`.claude/feedback/judge_mistakes.md`, `.claude/feedback/agent_roles_mandatory.md`. Nothing was run (design review,
no code yet).

## What was checked and found sound

- **Secrets in code/config:** `drizzle.config.ts` has no credentials and no env (6); `createDb`/`migrateDatabase`
  take the URL as an argument, no env read at import (4.7); `DATABASE_URL` not added to turbo (4.8); no compose or
  `.env.example` change. Testcontainers' default password is throwaway and never leaves the runner.
- **SQL built with `sql.raw`:** the CHECK `IN (...)` builder refuses any value not matching `^[a-z][a-z0-9-]*$`
  at import (4.4), and this applies to the `CHECK_KINDS` derived from lesson-schema too, so a contract change cannot
  inject DDL. `freshDatabase()` interpolates only its own random hex. `MIGRATION_LOCK_KEY` is a constant.
- **Better Auth / PII placement:** `users` holds only Better Auth's core `user` fields (name, email, email_verified,
  image, timestamps). No password, token or session column: those live in `account`/`session`, which #30 adds
  (research 7). Text id without DB default matches Better Auth's app-generated ids.
- **CI workflow:** top-level `permissions: contents: read` (ci.yml:12-13) applies to the new job; trigger is
  `pull_request`, not `pull_request_target`, so PR code runs without secrets; the job adds no secrets.
  `github.event.pull_request.head.sha` is passed through step `env` and never interpolated into `run:` (design
  line 493). The value is a hex SHA anyway, not attacker text. The `git diff` pathspecs are fixed literals.
- **Supply chain:** CI installs with `--frozen-lockfile`, so the caret ranges resolve to the committed lockfile;
  `allowBuilds` explicitly denies all four build scripts (deny-by-default made visible, and a new build script stands
  out); no `--force`/`--legacy-peer-deps`. `pg` has no install scripts.
- **Testcontainers and Ryuk:** test infrastructure only, never reachable from an app or the browser. Disabling Ryuk
  in CI removes a container that mounts the Docker socket, on a VM that is discarded anyway: it reduces exposure.
- **GHSA-67mh-4wv8-2f99 (esbuild <= 0.24.2 dev server, CORS):** exploitable only while `esbuild serve` runs.
  drizzle-kit 0.31 uses esbuild for in-process transforms (tsx / esm-loader), and the design adds no `serve`,
  no `drizzle-kit studio` script. Accepting it with an ADR line (F20) is reasonable.
- **Cascade:** one FK chain, every FK `ON DELETE CASCADE`, so deleting a user removes all DB rows that carry the
  learner's work. Correct for account deletion.

## Blocking issues

1. **[plans/28-db-schema-design.md:206-209, :335, :461] The transcript traversal constraint is not specified, and
   its tests cannot tell a correct one from a broken one.** The design states the rule in words ("has no `..`
   segment") but not the SQL. I11 tests only `../etc/passwd` and `/abs/path`. A naive implementation such as
   `transcript_path NOT LIKE '../%' AND transcript_path NOT LIKE '/%'` passes both cases, yet accepts
   `a/../../etc/passwd`, `x/..` and the bare `..`. The constraint is called "defence in depth for the reader that
   joins root + path" (4.5), so a hole here is exactly the case it exists for, and the test suite would report it
   closed. Required:
   - Write the exact expression in the design. Either the relPath-equivalent
     `transcript_path <> '' AND left(transcript_path, 1) <> '/' AND transcript_path !~ '(^|/)\.\.(/|$)'`,
     or (preferred: an allowlist cannot miss a spelling) a segment grammar such as
     `transcript_path ~ '^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*/?$'`, which also rules out
     backslashes, control characters (log injection) and `%`-encoded dots.
   - I11 rejects at least: `..`, `a/../b`, `a/..`, `/abs`, `''`; and accepts at least
     `<uuid>/`, `<uuid>/agent.jsonl` and a file name containing `..` inside a segment (`a..b`) for the relPath variant.
   - Mutation row: replace the regex with the `NOT LIKE '../%'` form; `a/../b` must turn red.
   - ADR-0007 item 6 says the DB check does not replace the reader's own containment check (#12 resolves
     `realpath(root + path)` and verifies it stays under the root; symlinks inside the store are its concern).

2. **[plans/28-db-schema-design.md:78, :239-241, :250] How `lockTimeoutMs` reaches SQL is unspecified, and the
   obvious way is string interpolation.** `SET lock_timeout = ...` does not accept bind parameters, so a coder
   writing "`SET lock_timeout`" from 4.7 will build `sql.raw(\`SET lock_timeout = ${lockTimeoutMs}\`)`. The option
   is a public API argument; the first app will likely feed it from env (code-style 2: data crossing a boundary is
   untrusted), and `number` is a compile-time promise only. Required: set it through
   `SELECT set_config('lock_timeout', $1, false)` with a parameter (or the `pg` client config option
   `lock_timeout`, **[verify]** it exists in pg 8.23), and validate `Number.isSafeInteger(lockTimeoutMs) &&
   lockTimeoutMs > 0` up front with a dedicated error naming the value. Add a unit test for the rejection (`NaN`,
   `-1`, `1.5`).

3. **[plans/28-db-schema-design.md:224-228] "One cascade path removes everything" is false for learner data
   outside Postgres.** The cascade is justified as deliberate account deletion, but transcripts (agent and terminal
   logs of the learner, the most sensitive data the platform holds) live in the workspace service's store and are
   untouched by `ON DELETE CASCADE`; after an account deletion they remain, now orphaned and unreachable by any
   cleanup that walks the DB. Required: ADR-0007 consequences say the cascade covers DB rows only, that account
   deletion must also delete the user's transcript files (collected from `attempts.transcript_path` before the
   `DELETE`, owned by #12/#30), and that #30's `session`/`account` FKs to `users` must be `ON DELETE CASCADE` too
   (Better Auth's `deleteUser` would otherwise fail or leave credential rows).

4. **[plans/28-db-schema-design.md:88, :237, :242-243] No rule that the connection string never reaches logs or
   error messages.** The design adds a default `console.error` "with context" for pool errors and a `MigrationError`
   whose message names the folder. "Context" is unspecified; the URL (with password) is the most natural context a
   coder will add, and `InvalidConnectionStringError` invites echoing the input. Required: state that no error
   message, log line or `cause` text built by `@academy/db` contains the connection string or any part of it
   (host/port included only if parsed out, never the password), and add an assertion in I4/I5 (or a unit test with
   an invalid URL `postgres://u:s3cret@...`) that `String(error)` and `error.message` do not contain `s3cret`.

## Non-blocking conditions (carry into the plan)

- CI job `db`: `actions/checkout` with `persist-credentials: false`. The job executes PR code (drizzle-kit loads
  `schema.ts`, tests), which can otherwise read the `GITHUB_TOKEN` from `.git/config`; the token is read-only, so
  this is hardening. Quote `"$PR_HEAD_SHA"` in the script.
- Actions pinned by major tag (`@v4`) and images by tag (`postgres:17.6-alpine`, `testcontainers/ryuk:0.14.0`): same
  as existing jobs and compose, accepted residual; digest pinning is a separate repo-wide decision.
- `check_results.details` (jsonb): ADR-0007 says writers must not store hidden-task internals (verify-script
  source, expected outputs) there, because a later attempt view would leak them to the learner before the next
  grading.
- 4.6 "uuids, not guessable counters": unguessability is not authorization; ADR says every route that takes an
  attempt id checks `attempts.user_id` against the session.
- `users.id`: add `CHECK (id <> '')` like the other id columns. `users_email_unique` is case-sensitive; note in
  4.2 that #30 relies on Better Auth normalising email case.

## Verdict

FAIL - 4 issues found:
1. [plans/28-db-schema-design.md:206-209, :461] transcript_path constraint unspecified; I11 cannot distinguish a
   naive check that accepts `a/../../x`.
2. [plans/28-db-schema-design.md:78, :239-241] `SET lock_timeout` cannot take parameters; no rule against
   interpolating an unvalidated `lockTimeoutMs`.
3. [plans/28-db-schema-design.md:224-228] cascade claimed to remove everything; transcript files and #30's auth rows
   are not covered, nothing in the ADR says who deletes them.
4. [plans/28-db-schema-design.md:88, :237, :242-243] no rule or test keeping the connection string out of logs and
   error messages.
