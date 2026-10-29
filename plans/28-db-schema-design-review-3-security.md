# #28 design review, round 3: security

Reviewer: judge-security. Read in full: `plans/28-db-schema-design.md` (revision 3, 1479 lines), my round-2
report, the round-2 operations report (blockers 1-3) and the round-2 architecture verdict, `.gitignore`,
`.claude/feedback/judge_mistakes.md`. Design review: no code exists, nothing was run.

## S1-S4 still intact (checked in the body, not in the Revision 3 table)

- **S1** transcript_path: 4.5 (lines 331-365) has the same pattern
  `^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*/?$`, both anchors explained, reader confinement
  kept as the boundary (4.5, ADR item 7). I11 now names one test per case, and M1-M3 have the exact red sets
  measured by operations r2 (8/7/5), which only makes the mutations stricter. The new "no length cap" line is
  my r2 note 3, recorded as residual.
- **S2** lock_timeout: 4.7 step 2 still `SELECT set_config('lock_timeout', $1, false)` with a bind parameter on
  a dedicated `pg.Client`; no `sql.raw`, no interpolation. Validation before I/O unchanged in substance.
- **S3** cascade scope: 4.6 unchanged (Postgres rows only, collect paths -> delete -> delete files, #30 FKs
  cascade); F22, ADR item 6, section 11 unchanged.
- **S4** connection string: 4.11 rule unchanged, extended with the two option errors; pre-check (fixed
  message, no input, no `cause`) unchanged; U5, U6, I4, I5, I8b, I12 canary tests unchanged; B15 still greps
  `canary` out of `src/` and `scripts/`.

## Revision 3 additions

### Clone C (7.1.0, B4)

- What is copied: `git ls-files -z -m -o --exclude-standard` = modified tracked plus untracked files that are
  not ignored. `.gitignore` lines 2, 8, 9, 26-28 ignore `.claude/pipeline_state*`,
  `.claude/settings.local.json`, `.claude/settings.pipeline-grant.json`, `.env`, `.env.*` (except
  `.env.example`); `node_modules/`, `dist/`, `.turbo/` are ignored too. `--exclude-standard` applies
  `.gitignore`, `.git/info/exclude` and the global excludes, so none of these files enters C. The lists in
  7.1.0 (the coder's files, `plans/*`, `.claude/feedback/*.md`) hold no secrets.
- Residual (not a defect): an untracked, *not ignored* secret file in the worktree (e.g. a stray `key.pem`)
  would be copied and committed inside C. C lives in the session scratchpad on the same machine, owned by
  the same user, and is never pushed, so nothing leaves the host. The same file would equally be picked up by
  any `git add -A` in the worktree, so the clone adds no exposure.
- No push and no network remote: `git clone "$WT" "$C"` makes `origin` the local worktree path; no block
  contains `git push`, `git remote` or a fetch from GitHub (I searched 7.1 and section 10; "push" appears only
  for the CI trigger and the F6 residual). The snapshot commit uses a throwaway identity
  `t@example.invalid` in C only, so it cannot reach Stepan's history. `git clone` does not copy hooks from the
  source repo. The only network access is the frozen `pnpm install` from the registry, same as CI, with no
  credentials in the command line.
- Archive safety: paths come from `git ls-files` (repo-relative); bsdtar strips a leading `/` and refuses
  `..` on extraction by default, and `-C "$C"` confines it. `cmp` checks prove the copy.
- Guards against writing into the worktree: B8 and B10 negatives use `;` before the restore, but restore
  starts with `: "${S:?}"` (and `"${F:?}"`); `S` is set only after `cd "$C"` succeeded, so a failed `cd` aborts
  before any `cp`. B11 restore `rsync -a --delete` targets a relative path only after `cd "$C"` and the
  `"${C:?}"`/`"${S:?}"` guards in an `&&` chain. No `rm`, no `eval`.

### sed / awk mutations

`sed "s/postgres:17.6-alpine/postgres:0.0.0-nonexistent/"` (B10) and the noallow `awk` filter (B4) operate on
fixed literals in files of C, preceded by `grep -c ... = 1`; the B3 awk only reads numstat. No external or
caller input reaches any of them, so there is no injection surface.

### F9 `console.error` line

Prints the image constant and only `error.message` of the caught container-start error, never the error
object or the container config (stated in F9). The connection URI does not exist yet at that point (it is
built from the started container). The only credential in reach is the throwaway test password
`canary-s3cret-28`, which is a public literal in the test file and not a secret; testcontainers start errors
(Docker API 404, pull, wait-strategy timeout) carry the image and Docker messages, not container env. No real
connection string or password can be printed.

### InvalidMigrationsFolderError, typeof change

- `InvalidLockTimeoutError` now prints `String(value)` for numbers and only `typeof` otherwise: closes my r2
  note 1; U4 has the `10n` case and the `JSON.stringify` mutation.
- `InvalidMigrationsFolderError` echoes a string value. A folder path is not a credential and 4.11 says so.
  Non-blocking: a caller who puts a newline in it would get a two-line message (caller bug, local config, no
  untrusted user input reaches this option).

### #30 DB-error logging rule

4.11 (lines 613-618), ADR consequences (section 9) and section 11 #30 bullet all state that #30 must keep
`DrizzleQueryError` messages (query params) out of logs, with an example rule. Closes my r2 note 2.

### Other revision-3 items checked

CI section 8 unchanged in security terms (`persist-credentials: false`, `PR_HEAD_SHA` via env and quoted,
`pull_request` trigger). B14's manual `docker rm -f <id>` is a literal, separate call on a Ryuk container,
an operational step with no security impact. B13 moves the deleted file to a scratchpad sibling path.

## Non-blocking notes

1. Optional: tell the tester to read the B4 file list (`git ls-files -m -o --exclude-standard`) before the
   copy and to stop if it lists anything outside the expected set from 7.1.0.

## Verdict

PASS - no security issues found
