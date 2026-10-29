# #28 design review, round 2: operations judge

Reviewed: `plans/28-db-schema-design.md` (revision 2, all 1013 lines), my round-1 report, the security and
architecture round-1 reports, `.github/workflows/ci.yml`, `.claude/hooks/` (whether anything gates
`git commit`), `.claude/feedback/judge_mistakes.md`, `agent_roles_mandatory.md` and `orchestrator_mistakes.md`.

Everything ran in a new scratch directory outside the repo, `$TMPDIR/op28r2.oHX5sE`:
- `lockclone`: a fresh `git clone` of this worktree's HEAD (8d47a4a).
- a scratch `packages/db` with three tables, including the exact 4.5 transcript CHECK, the guarded IN-list
  helper and `CHECK_KINDS` derived from lesson-schema, plus a minimal testcontainers integration setup.
- a throwaway `postgres:17.6-alpine` container (since stopped).

No repo file was touched except this report and `.claude/feedback/architect_mistakes.md`. The main
checkout was only read. Tools: pnpm 10.28.0, Node 22.23.1, Docker 29.7.2, pg 8.23.1, drizzle-orm 0.45.4,
drizzle-kit 0.31.11, @testcontainers/postgresql 12.2.1, vitest 5.0.5.

## Verdict summary

- O1 (drift guard exits 0 on a rename) is resolved. I ran it live in both directions.
- O2 is half resolved. Step 0 and T-lockfile work exactly as written. T-install, which the Revision 2
  table also lists under O2, cannot pass on correct work, for three separate reasons.
- Three more prescribed checks are not precise or not runnable as written: T-sep, the I11 M1-M3
  expectations, and T-drift positive against the section 6 script spec.
- Everything else I was asked to check holds.

## Brief items, run live

### (1) check-drift.sh as the design specifies it

I wrote the script from the section 6 row: `set -uo pipefail`, a `cd` to the git top level,
`pnpm --filter @academy/db run db:generate </dev/null`, output and exit code captured, and a here-string
`grep -qF "No schema changes, nothing to migrate" <<< "$out"`. Then I ran the 7.1 T-drift blocks verbatim:
positive, backup, a check call per negative, and the restore block after each negative.

```
positive:  No schema changes, nothing to migrate / T-drift positive OK
A (column added):  drift exit=1;  M meta/_journal.json, ?? 0001_slippery_brood.sql, ?? meta/0001_snapshot.json
B (MENTOR_REVIEW_STATUSES + cancelled):  drift exit=1; the B grep prints
   ALTER TABLE "mentor_reviews" DROP CONSTRAINT "mentor_reviews_status_check";
   ALTER TABLE "mentor_reviews" ADD CONSTRAINT "mentor_reviews_status_check" CHECK (... 'cancelled'));
C (check_kind -> kind_of_check):  "Error: Interactive prompts require a TTY terminal ..."; drift exit=1; status empty
guard mutation (literal condition removed, C kept):  drift exit=0
restore block after each:  restore OK, git status clean
```

O1 is resolved: the output literal is the condition that catches C. The script with the here-string
behaves correctly under pipefail.

The generated `0000_init.sql` contains the 4.5 transcript pattern byte for byte (`grep -cF` = 1), and every
CHECK has literal values.

### (2) Step 0 and T-lockfile in a fresh clone

I ran the T-lockfile block verbatim:

```
integrity.before 131 lines, integrity.after 131 lines, diff empty
git diff --shortstat: 1 file changed, 547 insertions(+), 937 deletions(-); lockfileVersion: '9.0'
T-lockfile OK
```

The tree condition holds with a modified `.claude/feedback/*.md` and an untracked `plans/` file. It goes
red when `README.md` is changed. The section 10 commit command runs as written, and the message ends
with `Refs #28`, which the pr gate requires. The hooks check `git commit` nowhere except the pr and Stop
clean-tree gates (`phase-complete.sh:90`, `pipeline-advance.sh:250`), so the claim in step 0 holds.

T-install then failed. See blocking item 1.

### (3) `set_config('lock_timeout', $1, false)` with pg 8.23.1, then `pg_advisory_lock`

A second session held `pg_advisory_lock(28280001)`:

```
is_local=false 500:  error code 55P03 DatabaseError "canceling statement due to lock timeout" 515 ms
is_local=true  500 (mutation b):  set_config -> 500ms | SHOW -> 0 | still waiting after 3 s
value 2147483647 -> accepted 2147483647ms
value 2147483648 -> error 22023 invalid value for parameter "lock_timeout"
value 0 -> accepted 0        value 1.5 -> accepted 2ms
```

F3, I5 and mutation (b) are confirmed. `MAX_LOCK_TIMEOUT_MS` is exactly the Postgres bound. Postgres
silently rounds `1.5` and accepts `0`, which disables the timeout, so the `isSafeInteger` and `>= 1`
validation in 4.7 is needed.

### (4) transcript_path regex in Postgres 17.6

I loaded the generated `0000_init.sql` into a database and inserted every I11 value through the real
constraint. Every reject case gave `23514 attempts_transcript_path_check`: `''`, `.`, `..`, `../a`,
`a/..`, `a/../b`, `/abs`, `a//b`, `a\b`, `a`+newline+`b`, `%2e%2e/x`, and also `.hidden`. Accepted:
`<uuid>/`, `<uuid>/agent.jsonl`, `a..b` and NULL. The expression is correct. The mutation columns are in
blocking item 3.

### (5) `withPassword` in @testcontainers/postgresql 12.2.1

`build/postgresql-container.d.ts:10` declares `withPassword(password: string): this`. A live global setup
used `new PostgreSqlContainer("postgres:17.6-alpine").withPassword("canary-s3cret-28")`. The test asserted
`new URL(getConnectionUri()).password === "canary-s3cret-28"` and connected to server version `17.6`:
1 passed. The [verify] can be removed.

### (6) The section 7.1 commands

| Block | Result |
|---|---|
| T-lockfile | runs verbatim, OK |
| T-install | goes red on correct work, blocking 1 |
| T-drift positive / backup / restore / check call / A / B / C / guard | run verbatim, as expected (see 1). The positive depends on the script printing its output when green, blocking 4 |
| I11 M1-M3 | the generate step works (a changed CHECK body gives `DROP`/`ADD CONSTRAINT`, no prompt). The "exactly the cases listed" expectation is wrong, blocking 3 |
| T-append | `none` exit 0; `edit` M, `rename` R100, `snapshot` M, all exit 1; `wrongsha` and `nomerge` print the fetch-depth message and exit 1. I could not run `delete`, see notes |
| T-env | positive `T-env positive OK`; negative prints a Ryuk container id |
| T-sep | the positive passes; the negative cannot fail, blocking 2 |
| T-biome | positive green. The negative is red on `meta/0000_snapshot.json` and `meta/_journal.json` (see notes about the trailing comma) |
| T-dist | prints `<clone>/packages/db/drizzle` |

### CI job changes

- `persist-credentials: false`: nothing after checkout fetches or pushes. Both scripts use only local git
  (`rev-parse`, `diff`, `status`), so nothing breaks.
- `"$PR_HEAD_SHA"` is quoted and passed through step `env`. `HEAD^1`/`HEAD^2` are quoted in my run.
- The fetch-depth message prints on `wrongsha` and on `nomerge`.
- `git ls-remote origin 'refs/pull/*/merge'` returns nothing today (no open PR), so the GitHub
  parent-order check stays [verify on the first CI run]. It fails closed (exit 1 with that message),
  never as a false green. Acceptable.
- The CI job installs fresh, so blocking item 1 does not affect CI.
- No regression found in the other sections (F1-F25, rollback, 4.7 stages, 4.11, the turbo, Biome,
  editorconfig and allowBuilds decisions).

## Blocking

### 1. [design 7.1 T-install, lines 747-765; 7 T-install row, line 712] T-install fails on correct work in three independent ways

Steps: a fresh clone, then T-lockfile (which runs `CI=true pnpm install --frozen-lockfile` before
`allowBuilds` exists), the step-0 commit, then the step 1 scaffold with the design's dependencies and the
`allowBuilds` block. The T-install block verbatim then fails all three of these assertions:

a. **A stale ignored build.**
   - What happens: the step-0 frozen install records `ignoredBuilds: [esbuild@0.28.2]` in
     `node_modules/.modules.yaml`. Later installs keep reprinting `Ignored build scripts: esbuild@0.28.2.`
     even with `esbuild: false`. A second plain install printed it again.
   - Not a scratch artifact: this worktree's own `node_modules/.modules.yaml` already lists
     `ignoredBuilds: - esbuild@0.28.2`.
   - The negative run fails too: on a populated `node_modules`, removing the block and running
     `pnpm install` printed no Ignored line.
   - With `node_modules` removed first, both directions work: the positive has no Ignored line, and the
     negative prints `Ignored build scripts: cpu-features@0.0.10, esbuild@0.18.20, ...`.

b. **Deletions from git's default diff algorithm.**
   - `git diff --numstat HEAD -- pnpm-lock.yaml` gives `2041 24`. The 24 removed lines are unchanged
     entries (`assertion-error@2.0.1`, `chai@6.3.0`, `esbuild@0.28.2`, `'@types/node@26.6.5'`, ...) that
     Myers moves and re-adds further down.
   - `--diff-algorithm=histogram`, `patience` and `minimal` all give `2017 0`.
   - The fallback text ("re-keyed by a peer change, not a changed version") does not describe these lines,
     so the tester has no correct rule to apply.

c. **A deprecation warning.** The first resolving install prints
   `WARN  3 deprecated subdependencies found: @esbuild-kit/core-utils@3.3.2, @esbuild-kit/esm-loader@2.6.5, glob@10.5.0`
   (from drizzle-kit 0.31.11). The `grep WARN | grep -v lesson-validate` filter rejects it. The warning does
   not appear on a later install that skips resolution, so the result depends on who ran `pnpm install`
   first.

Required:
- Start T-install from a fresh `node_modules`. The architect picks how, given the tester rules (no
  `rm -rf "$VAR"`; a literal-path removal inside `bash -c` may also hit the harness's rm safety check, as
  my T-append run did), for example a fresh clone of the step-0 commit with the step 1 files copied in.
  Say who runs it.
- Use `git diff --numstat --diff-algorithm=histogram`.
- Name the deprecation line as expected, or require that the coder ran the resolving install first.
- Apply the same fresh-state rule to the negative run.

### 2. [design F9 line 131; 7.1 T-sep lines 871-873; T-sep row line 713] The T-sep negative cannot fail, and F9's message is never shown

- **The negative passes.** `DOCKER_HOST=unix:///nonexistent pnpm test:integration` passed (rc 0, 1 test).
  The testcontainers debug log shows `ConfigurationStrategy does not work: "Error: connect ENOENT
  /nonexistent"` and then `UnixSocketStrategy works` (`/var/run/docker.sock`). testcontainers 12.2.1 falls
  back from a dead `DOCKER_HOST`, so the negative passes on any machine where Docker runs, including CI.
- **The message is lost.** When globalSetup does throw (an image tag that does not exist, or even a plain
  `throw new Error("Docker is required ...")` with no `cause`, in `.ts` and in `.mjs`), vitest 5.0.5
  prints only `TypeError: code.charCodeAt is not a function` (vite 8.3.5 `module-runner.js:366`,
  `extractInlineSourceMap`). The message from F9 never appears (`grep -c` = 0 in all three variants).
- **What works.** Adding `console.error(message)` before the rethrow makes the line visible, and the run
  still exits 1.

Required:
- F9 prescribes printing the message (and the cause's message) with `console.error` before rethrowing,
  because of this vitest behaviour.
- T-sep's negative uses a failure the tester can actually cause. Verified: Edit-tool mutation of the image
  tag to `postgres:0.0.0-nonexistent` gives rc 1. Then grep the printed line, restore with `cp`, prove it
  with `cmp`.
- Name in T-sep what the positive half proves.

### 3. [design I11 mutation column line 704; 7.1 lines 818-822] "Expect red on exactly the cases listed" is wrong for M1, M2 and M3

These are the I11 reject cases each mutation accepts, evaluated in Postgres 17.6:

| Mutation | Accepted (red in I11) | Listed in the design |
|---|---|---|
| M1 naive `<> '' AND NOT LIKE '../%' AND NOT LIKE '/%'` | `.`, `..`, `a/..`, `a/../b`, `a//b`, `a\b`, `a`+newline+`b`, `%2e%2e/x` | misses `.` and the newline case |
| M2 without `^` | `../a`, `a/../b`, `/abs`, `a//b`, `a\b`, `a`+newline+`b`, `%2e%2e/x` | lists only `/abs`, `../a` |
| M3 without `$` | `a/..`, `a/../b`, `a//b`, `a\b`, `a`+newline+`b` | lists only `a/..`, `a/../b` |

A tester who follows "exactly" reports a mismatch on correct work. Required: copy these complete sets
into I11 and 7.1, or say "at least".

### 4. [design 6 `check-drift.sh` row line 624 vs 7 T-drift row line 714 and the 7.1 positive line 772-773] Green output is unspecified

Section 6 says only "on red prints the output". I wrote the script to that letter: on green it prints a
single line. T-drift positive then printed `migrations match the schema` and no `T-drift positive OK`,
because its `grep -qF` looks for the literal in the script's output. After I changed the script to print
the generate output on green as well, the positive passed. Required: section 6 says the script always
prints the drizzle-kit output (which also helps CI logs).

## Notes (non-blocking)

- **T-append `delete` (line 836).** The Claude Code safety check refused the whole T-append block because
  its `bash -c` script contains `g rm -q`, so I ran the other six modes with that branch removed. Round 1
  verified `delete` live. The tester will hit the same refusal. A non-`rm` spelling such as moving the file
  into `$SCRATCH` and letting `g add -A` record the deletion avoids it.
- **T-biome (line 875).** The new ignore line is the last array item. Removing it with the Edit tool leaves
  a trailing comma, and Biome then fails on its own config ("Expected an array, an object, or a literal
  but instead found ']'"). That is red for the wrong reason. The tester must also remove the preceding
  comma and confirm that the red output names `_journal.json`.
- **T-dist (line 879).** On macOS the printed path is the realpath. It matches `$WT` only because the
  worktree path has no symlink.

## Attribution

All four blocking items are design prescriptions in `plans/28-db-schema-design.md` that were not run
against the state the tester will actually be in. They are architect mistakes. The lesson is appended
to `.claude/feedback/architect_mistakes.md`.

FAIL
