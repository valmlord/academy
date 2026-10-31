# #30 judge_design round 3: operations

Reviewer: judge-operations. Design: `plans/30-catalog-lesson-page-design.md` revision 3, ADR-0009 (Proposed).
Scope (Stepan): block only on regressions from the round-2 fixes and on my own round-2 items left undone
(O7, O8, N1-N4 in `plans/30-catalog-lesson-page-design-review-2-operations.md`). No code exists.
Rehearsals in my scratchpad:
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy/6d233eca-f88c-48bf-8ce7-8d231a07c5ec/scratchpad/ops3/`.

Stepan's stack was not touched. Before and after, `diff` empty: `academy-web-1` StartedAt
`2026-10-30T13:10:31.210477338Z`, `academy-db-1` StartedAt `2026-10-30T13:10:25.621489835Z`, `academy-web:local`
Id `sha256:a4a809b2...`, volume `academy_db-data` CreatedAt `2026-10-29T04:32:08Z`, root `.env` by
`stat -f '%i %z %m'` only (never opened, printed or hashed). I ran two throwaway containers from
`academy-web:local` (`docker run --rm --network none`, no env file); afterwards only `academy-web-1` exists from
that image. The repository's `turbo.json` was not modified (`git status` clean for it).

Verdict: **PASS**. O7 and O8 are fixed and I reproduced both rehearsals; N1-N4 are addressed; no regression found.

## Round-2 items

| Item | Status | What I checked |
|---|---|---|
| O7 M-env-turbo in this checkout | **Fixed** | 13.6 now forbids any mutation that can disable the opt-out while a real entry point can run here; 13.7 M-env-turbo is "Never in this checkout"; step 1 order (a)-(e) puts M-env-turbo in the scratch workspace and [D] before the first real run. Rehearsed myself on a copy of the architect's `r3/tw` (no `.env` file present, `turbo.json` semantically the repository's plus `globalPassThroughEnv`, turbo 2.11.10 from the repository, `--force`): [D] query prints `["ACADEMY_SKIP_ROOT_ENV=6b86b273...b4b"]` with the flag `1` (equals `printf 1 \| shasum -a 256`), `[]` with it unset, a different hash with `true`, so [D]'s exact-match requirement is red on every wrong state. Run time with the entry: build, typecheck, seed, test:e2e, dev (bounded by `perl alarm 20`) all `flag=1`. Entry removed: [D] prints `null`, all five print `flag=UNSET`. Restored, `cmp` clean. |
| [D] in this checkout | **Valid and read-only** | `pnpm exec turbo run build --filter=@academy/web --dry=json` against today's repository prints `null` (entry not yet added), so [D] is red until step 1 lands, as intended; a dry run executed no task. Root `pnpm seed`, `dev`, `typecheck`, `test:e2e`, `build` are all `turbo run ...` (`package.json:10-18`), so the turbo passthrough is the path [D] has to prove. |
| O8 C2 as `node` | **Fixed** | 7.3 runs `docker compose run --rm --no-deps --user root --entrypoint sh web -c '<C2-IN>'`, merges in-container stderr, and passes only on compose rc 0, `C2-RC 0`, no non-hash line, hash count = `C2-COUNT` > 0. I ran `<C2-IN>` verbatim on `academy-web:local`: as root 4,035 hash lines, 0 other lines, `C2-RC 0`, `C2-COUNT 4035` (pass); as node 4,031 hash lines, 5 other lines (`/root`, `/lib/apk/db/lock`, `/etc/crontabs/root`, `/etc/shadow`, `/etc/shadow-`), `C2-RC 1`, `C2-COUNT 4036` (red on three separate criteria). Matches V20. The error lines carry paths, not content. |
| N1 [B] cache | **Done** | [B] is `pnpm exec turbo run build --force`, reason stated. |
| N2 late prefetch | **Done** | 7.2 lines 539-540: rejected reads ignored only for `next-router-prefetch: 1` requests issued after the last settle, and printed. Any other rejected read still fails. |
| N3 docs | **Done** | Step 1 and step 4 `.env.example` entries are comment lines only, with [D]-adjacent `grep -cE '^(ACADEMY_SKIP_ROOT_ENV\|COURSE_ROOT)=' .env.example` = 0; step 47 README spells out unset / `1` / other value / `COMPOSE_ENV_FILES=/dev/null`. |
| N4 dev leftovers | **Done** | 13.4 T-err part 2: `pgrep -f 'turbo\|next'` snapshot before start, stop the background task, kill only the 3232 listener, then `comm -13` against the snapshot must print nothing; Stepan's processes are excluded by the snapshot. |

## Regression check of the round-3 changes

- Step order: no build, dev, typecheck, seed or e2e before step 1 (e); M-env-flag/site/walk/echo only under
  `vitest run lib/root-env.test.ts` (Vitest does not load `next.config.ts`), restored with `cmp`. No new path
  where a real entry point runs with a mutated opt-out.
- CI is unaffected: CI does not set the flag, so `loadRootEnv` loads CI's copied `.env` exactly as today; [D]
  is a local check only. `--user root` changes only the throwaway C2 container.
- `--force` in [B] costs a full build each time; acceptable for a local check (CI has no cache anyway).

## Non-blocking

- `pgrep -f 'turbo|next'` (N4) can also catch unrelated processes started during the run whose command line
  contains `next` (editors, other tools), which would make the check falsely red, never falsely green. If it
  happens, narrow the pattern to `'turbo run dev|next dev'`.

## Attribution

None (PASS).

PASS
