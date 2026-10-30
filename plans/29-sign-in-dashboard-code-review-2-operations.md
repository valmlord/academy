# #29 judge_code round 2: operations

Reviewer: judge-operations. Diff: `git diff main...HEAD` (10 commits, HEAD b8fa8ab, rewritten by autosquash).
Round-1 base for the delta: df0910b. Upstream read: my round-1 review, the security and architecture round-1
reviews, the tester's re-test in `plans/29-sign-in-dashboard-test-report.md`, `.claude/feedback/coder_mistakes.md`.

## Verdict: PASS

### O1 `.env.example` SEED_* lines: fixed

`.env.example:23-28` now carries the design 6.2 block verbatim ("The seed creates the only user ...", "Put them
here, never on a command line.", `# SEED_EMAIL=learner@example.com`, `# SEED_PASSWORD=`) plus
`# Optional display name of that user, "Learner" when unset.` / `# SEED_NAME=`. The comment is true:
`apps/web/lib/seed.ts:36` `DEFAULT_NAME = "Learner"`; `apps/web/lib/seed-cli.ts:47-49` reads exactly these three
names. The lines are commented, so the CI `>>` append to `.env` is unaffected. The change was autosquashed into
`c8d7493 feat(web): add an idempotent seed for the local user`, the same commit that adds `seed-cli.ts`, so no
commit in the series reads a variable `.env.example` does not list.

### C1 ADR-0008 residual: fixed

`docs/adr/0008-authentication.md:160-167` now says a failed CI run's traces hold the run's seed password (the
`fill()` value and the sign-in POST body) and session cookies, that `playwright-report` embeds the same traces,
both go into `e2e-report`, and why it is accepted. Each cited fact checked against `.github/workflows/ci.yml`:
`openssl rand -hex 24` (line 170), upload `if: failure()` (179/183), artifact `e2e-report` with
`playwright-report` and `test-results` (186-189), `retention-days: 7` (192), `docker compose down -v` under
`if: always()` (194-195). Matches my round-1 ruling.

### Round-1 fixes from the other judges: no operational impact

`git diff df0910b b8fa8ab` touches only `.env.example`, `apps/web/components/{sign-in-form,ui/button,ui/card,
ui/input,user-menu}.tsx`, `sign-in-form.test.tsx`, `e2e/sign-in.spec.ts`, `lib/next-path.ts`, `lib/sign-out.ts`,
`lib/sign-out.test.ts`, `test/integration/db.ts`, ADR-0008. A pathspec diff over everything else
(`docker-compose.yml`, `.github/`, `turbo.json`, `apps/web/Dockerfile`, `.dockerignore`, `package.json`,
`apps/web/package.json`, `playwright.config.ts`, `biome.json`, `packages/db/**` incl. migrations, `seed*.ts`,
`scripts/`, `startup*.ts`) is empty, so compose, CI, turbo, image, migration, seed and startup behaviour are
byte-identical to what I verified by running in round 1.

- shadcn styling (button/card/input classes): CSS only, no runtime config.
- `method="post"`: an Enter before hydration now POSTs to `/sign-in?next=...` and gets the sign-in page back;
  no password in a URL, so none in access logs, history or traces' URL lines. Covered by a unit assertion
  (`sign-in-form.test.tsx:228`) and a JS-disabled e2e test; no server action or route handler was added.
- `SIGNED_OUT_PATH` moved to `lib/next-path.ts`, same value (`${SIGN_IN_PATH}?signed-out=1`); `sign-out.ts`
  imports it. No env or startup effect.
- `test/integration/db.ts`: only the stale two-drizzle comment deleted.
- Commit rewrite: 10 commits, every message references `#29`; the ops files land in the commits that need them
  (`7ae73ee` compose params, `4082649` secret in compose/CI/turbo, `c8d7493` seed + `.env.example` SEED_* + CI
  seed step + turbo seed task, `bc803b5` turbo e2e env). The final tree is what I ran.

### README "Signing in" vs `.env.example`

README steps: 1 `cp .env.example .env`, 2 append `BETTER_AUTH_SECRET` (the printf command in `.env.example:20`),
3 `SEED_EMAIL` / `SEED_PASSWORD` in `.env` via an editor, never on a command line, 4 `up -d --build --wait`,
5 `pnpm seed`, 6 sign in. `.env.example` orders the same way: the secret block, then the seed block with the
same "never on a command line" advice. Consistent. `SEED_NAME` is optional and not mentioned in the README,
which is fine since the example file documents its default.

## What I checked (ran)

- `biome check` over every tracked top-level path except `.claude` (local untracked worktrees carry nested
  `biome.json`, not this diff): 155 files, clean.
- `pnpm typecheck`: 5/5 (turbo cache hit on the current inputs).
- `pnpm test`: lesson-schema 12, db 34, web 106 (one more than round 1: the `method` assertion), all green.
- `pnpm build` with `BETTER_AUTH_SECRET` unset: 3/3 tasks green, same 3 Turbopack warnings as main.
- `pnpm --filter @academy/db run db:check`: "Everything's fine".
- Not re-run: integration tests, compose `config`, standalone startup and seed runs, because their inputs are
  unchanged since round 1 (empty pathspec diff above) and the tester re-ran the stack, seed, I1-I3c and e2e 18/18
  on b8fa8ab.
- Isolation: `docker ps -a` shows no `academy` containers; no root `.env` exists; I touched no Docker project,
  volume or image.

## Non-blocking (carried, unchanged)

- N1: rerunning `pnpm seed` with an unchanged password also prints `seed: updated`.
- N2: `if: always()` `docker compose down -v` fails interpolation if the secret step itself failed; harmless on
  an ephemeral runner.

PASS
