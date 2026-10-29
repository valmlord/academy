# #28 code review round 2: operations

Verdict: PASS (no operational issues found)

## Scope

This round covers the fix-round changes:
- `packages/db/src/migrate.ts`: `pg.Client` is now constructed inside the connect-stage try, and `finally`
  calls `client?.end()`.
- `packages/db/test/unit/options.test.ts`: a new U5 case for a missing `sslrootcert` file.
- `packages/db/test/integration/client.int.test.ts`: I8b now passes non-string log arguments through
  `inspected` instead of `String`.

I also read:
- my round-1 report (PASS);
- the security round-1 report (FAIL on I8b);
- the re-test section of `plans/28-db-schema-test-report.md`.

I edited no repo file except this report. I did not append to any feedback file because there is no FAIL.

## 1. The new U5 case is deterministic and needs no Docker and no network (code path read)

The test calls `migrateDatabase("postgres://u:canary-u5@127.0.0.1:1/x?sslrootcert=/nonexistent-academy-28/root.crt")`.
- `assertPostgresUrl` accepts it: a valid URL with the `postgres:` protocol. The query string does not matter.
- The validation of `lockTimeoutMs` and `migrationsFolder` uses the defaults.
- In the try, `new pg.Client({ connectionString })` runs:
  - `pg@8.23.1/lib/client.js:54` calls `new ConnectionParameters(config)`.
  - `connection-parameters.js:60` calls `parse(config.connectionString)`.
  - `pg-connection-string@2.14.1/index.js:98-99` does `fs.readFileSync(config.sslrootcert)`, which is
    synchronous and throws ENOENT.
- So the throw happens in the constructor, before `client.connect()` (`client.js:232` / `_connect:153`)
  is ever reached. No socket is opened, and 127.0.0.1:1 is never contacted.
- `client` stays `undefined`, and `client?.end()` is a no-op. The catch wraps the error as
  `MigrationError` with stage `connect` and code `ENOENT` (`errorCode` walks the cause chain).

Why it is deterministic on both platforms:
- The path sits in the filesystem root. On macOS the root is the read-only sealed system volume. On a
  GitHub ubuntu-24.04 runner, creating it would need sudo, and nothing in the workflow does that.
  Locally, `ls -ld /nonexistent-academy-28` prints "No such file or directory".
- The test has no timing dependency: the case ran in 1 ms.

The old refused-connection U5 case keeps its behaviour. `client.end()` on a client whose connect failed
was already called unconditionally before the fix, and the case is green (4 ms).

The re-test mutation 4 showed that the case goes red when construction moves back outside the try
(`got Error: ENOENT`). So the guard can fail.

## 2. Fresh B4 clone, outside the repo

I built a fresh clone with the design's verbatim B4 recipe, `MODE=full`:
- Path: `/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-confident-ellis-4d58ed/59ed1263-0af4-4853-9f1c-20456a13f403/scratchpad/r2ops/clone-full.FNBCma/repo`
- It is HEAD 45396e7 plus the pending files, committed once as `f07538a ops snapshot`.
- `cmp` confirmed that the three changed files are identical to the worktree copies.
- `CI=true pnpm install --frozen-lockfile` started on a fresh `node_modules`. Its only WARN was the known
  `lesson-validate` bin line, and `git status` stayed clean.

All commands below ran with `CI=true`.

| Command | rc | Output excerpt |
|---|---|---|
| `pnpm lint` | 0 | `Checked 39 files ... No fixes applied.` |
| `pnpm typecheck` | 0 | `Tasks: 3 successful`, `Cached: 0 cached` |
| `pnpm test --force` with `DOCKER_HOST=unix:///nonexistent/docker.sock` and a PATH without the docker CLI | 0 | lesson-schema `Tests 12 passed`, db `Tests 34 passed`, `Cached: 0 cached, 3 total` |
| vitest `-t U5 --reporter=verbose` (Docker unreachable) | 0 | both U5 cases passed, `2 passed \| 19 skipped (21)` |
| `pnpm build` | 0 | `Tasks: 2 successful` |
| `pnpm content:validate` | 0 | `6 lesson(s), 0 issue(s)` |
| CI `db` job: `turbo run build --filter='@academy/db^...'` | 0 | `Tasks: 1 successful` |
| CI `db` job: `db:check` | 0 | `Everything's fine` |
| CI `db` job: `check-drift.sh` | 0 | `No schema changes, nothing to migrate`, `migrations match the schema`; `git status --porcelain` showed 0 lines |
| CI `db` job: `pnpm test:integration --force` with `TESTCONTAINERS_RYUK_DISABLED=true` | 0 | `Test Files 3 passed (3)`, `Tests 38 passed (38)` |
| `docker ps -a --filter label=org.testcontainers=true` | - | 0 containers left behind |

The `pnpm test` unit suite stays Docker-free:
- `vitest.config.ts` includes only `test/unit/**`.
- With the Docker socket unreachable and no docker CLI on PATH, the suite is green.

The I8b change touches only the test (`.map(loggedArgument)`). It has no effect on resources or runtime.

## 3. Merge with main (094f573)

`origin/main` in the clone is 094f573. The difference from the branch point is two files: `CLAUDE.md`
(+5 lines) and `.claude/feedback/orchestrator_mistakes.md` (+9 lines). This branch touches neither file.

- On a scratch branch `merge-check`, `git merge origin/main` was clean (rc 0, no conflicts), and
  `merge-base --is-ancestor origin/main HEAD` returned rc 0.
- I re-ran the full suite on the merge result. Every command exited 0:
  - lint: 39 files.
  - `typecheck --force`: 3 tasks.
  - `test --force` without Docker: 12 + 34 passed.
  - `build --force`: 2 tasks.
  - `content:validate`: 0 issues.
  - `db:check` and `check-drift.sh`.
  - `test:integration --force`: 38 passed.
  - After the run: 0 testcontainers left and a clean tree.
- Append-only check:
  - My first attempt ran it on the branch-side merge commit, where main is the second parent. The script
    correctly refused that (rc 1, "expected the pull request merge commit with the PR head as second
    parent"). This was my setup error, not a defect.
  - I then simulated GitHub's `refs/pull/N/merge` properly: detached at `origin/main`, then
    `merge --no-ff merge-check`, giving parents `094f573 7c652b0`. On that commit,
    `PR_HEAD_SHA=<merge-check>` printed "applied migrations are append-only" (rc 0), and drift was also
    green.

## 4. Unchanged from round 1

The following still hold:
- CI job shape
- package shape
- no new env vars
- pinned test image
- forward-only `0000_init`
- rollback by `git revert` (no consumer runs migrations yet)
- ignored artifacts

## 5. Notes (non-blocking)

- The bring-up procedure (`git merge main`) still has to run on the branch before the PR. It is clean, as
  shown in section 3.
- The last commit must reference `#28` for the `pr` gate.
- Left over from round 1 and still open: enable Biome's `vcs.useIgnoreFile` so that local lint ignores the
  git-ignored `.claude/*.json` files, as CI already effectively does.
