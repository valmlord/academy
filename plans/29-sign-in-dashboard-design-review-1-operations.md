# #29 judge_design round 1: operations

Reviewer: judge-operations. Inputs read in full: `plans/29-sign-in-dashboard-research.md`,
`plans/29-sign-in-dashboard-design.md`, `docs/adr/0008-authentication.md`. Context read: `docker-compose.yml`,
`.env.example`, `turbo.json`, root and `apps/web` `package.json`, `.github/workflows/ci.yml`,
`apps/web/{Dockerfile,instrumentation.ts,lib/startup.ts,lib/startup-node.ts,next.config.ts,playwright.config.ts}`,
`apps/web/scripts/check-image-migrations.sh`, `.dockerignore`, `.gitignore`, `README.md` (Getting started, Web
app), `packages/db/{package.json,src/client.ts,src/index.ts,drizzle/meta/_journal.json}`,
`packages/lesson-schema/package.json`, `.claude/feedback/{judge,architect}_mistakes.md`.

No code exists yet, so `pnpm lint/typecheck/test/build` have nothing new to run; the checks below are
read-only commands against the real repo and scratch compose projects.

## Commands run (read-only or scratch)

| Check | Result |
|---|---|
| `X=shell node -e 'process.loadEnvFile("t.env")'` with `X=file` in the file (Node 22.23.1) | prints `shell`: the root `.env` loader never overrides an exported value, so the "shell wins" claims for `next.config.ts`, the seed and Playwright hold |
| scratch compose file with `name: academy` and `${BETTER_AUTH_SECRET:?...}`, project `zz-judge-t` | `config` and `--dry-run up -d db` and `--dry-run run web` fail with `required variable BETTER_AUTH_SECRET is missing a value: set BETTER_AUTH_SECRET in .env, see .env.example`; `ps`, `down`, `logs` still work; an empty value fails like a missing one |
| `COMPOSE_PROJECT_NAME=zz-env docker compose config` and `-p zz-flag` against `name: academy` | `name: zz-env` / `name: zz-flag`: both override the top-level name |
| `grep` in `drizzle-orm@0.45.4/pg-core/dialect.js:57-67` | the migrator applies every migration whose `folderMillis` is greater than the last applied `created_at`; no hash check |
| `git check-ignore -v packages/db/dist`; `ls -la packages/db/dist` | ignored (`.gitignore:17 dist/`); Stepan's copy was built 2026-10-29 23:52, before #29's schema |
| `docker ps`; `docker volume ls` | no container running; `academy_db-data` exists; no root `.env` in the main checkout |
| `.env.example` tail via `od -c` | ends with `\n`, so CI's `printf ... >> .env` starts a new line |

## Verified OK

- **Startup order (6.5).** `DATABASE_URL` present, then `readAuthSecret`, then migrate; exit 1 on
  `InvalidAuthSecretError`; messages name the variable and the rule, never the value. U-start (M4) and I3
  discriminate the order: with the secret check moved after migrate, I3's `db:1` URL yields `MigrationError`
  first and I3 goes red at "does not contain `MigrationError`". I2 stays meaningful because compose still
  passes the `.env` secret into `run` (only `DATABASE_URL` is overridden). I3b's "lacks the value" assertion
  guards the echo.
- **`next build` without secrets.** Lazy `getAuth()`/`getDb()`; route handler wraps the call (V11); CI
  `checks` (`pnpm build`, no env, turbo strict mode) and the Docker build stage (`turbo run build`, no env)
  are both guards; M23 is named.
- **CI secret.** Appended after `cp`, before `docker compose config --quiet` and `up`; `-hex` for the
  password; `.env.example` newline verified. `config --quiet` never prints the resolved secret.
- **Healthcheck stays DB-free**: `/` -> 307 -> `/sign-in` -> 200 with no cookie, no DB read (8).
- **Migration 0001** is additive (`CREATE TABLE`, `ADD CONSTRAINT`, `CREATE INDEX`), safe on Stepan's
  non-empty DB; append-only and drift checks unchanged.
- **turbo**: `BETTER_AUTH_SECRET` in `dev.passThroughEnv` (needed only for a shell override; the root `.env`
  is read by `next.config.ts` anyway), `SEED_*` in `test:e2e.passThroughEnv` (needed: in CI they live only in
  `$GITHUB_ENV`, not `.env`). `build`, `test`, `test:integration` read no new variable.
- **XFF through Docker**: the published port is an L4 proxy and cannot touch HTTP headers; Next keeps a
  client value (V7). Chromium header override via `route.continue` is the only unverified link, and T-xff
  checks it.
- **Compose `:?` and `ps/down/logs`**: Stepan can still inspect and stop the stack without the secret.

## FAIL: 4 issues

1. **[design 4.5, 6.4 step 4, 11.2, 14 step 17] `pnpm seed` cannot run where the design runs it.**
   `scripts/seed.ts` under `tsx` imports `@academy/db` (and through `vocabulary.ts` the value `Check` from
   `@academy/lesson-schema`); both packages export only `./dist/index.js`, and `dist/` is git-ignored. The
   seed is a plain `pnpm --filter` script, so nothing builds `^build` first.
   - CI `e2e`: steps 1-4 are `cp`, `compose up`, `pnpm install`, image check, `pnpm seed`. No host build has
     run (the image builds inside Docker), so the seed fails with `ERR_MODULE_NOT_FOUND` for
     `packages/db/dist/index.js`, and the job is red before Playwright.
   - Stepan after merge: `packages/db/dist` is stale (built 2026-10-29, no `sessions`/`accounts`), so the
     seed gets `undefined` tables in the adapter schema and fails, although README step 38 tells him to run
     it right after `compose up`.
   Fix: make the seed build its dependencies, e.g. a turbo task `"seed": { "dependsOn": ["^build"],
   "cache": false, "passThroughEnv": ["DATABASE_URL", "SEED_*"] }` with root `"seed": "turbo run seed"`
   (wildcards work there, `DOCKER_*` already does), or root `"seed": "turbo run build
   --filter=@academy/web^... && pnpm --filter @academy/web seed"`. State which, and make CI step 4 prove it on
   a runner without `dist/`.

2. **[design 13.5, 14 steps 17, 26, 31, 36] The isolation recipe does not cover every path to Stepan's
   `academy` project and `academy_db-data`.**
   - (a) `check-image-migrations.sh` runs bare `docker compose exec/run` (no `-p`), so in the main checkout
     it targets project `academy` (from `name:`): I1 reads Stepan's DB and reports a wrong count, I2/I3/I3b
     start one-off `web` containers in his project. The recipe must export
     `COMPOSE_PROJECT_NAME=academy-t29` in the sourced helper (verified: it overrides `name:`), not only pass
     `-p` on typed commands.
   - (b) The image tag `academy-web:local` is shared. Every tester build, including the mutated images the
     design prescribes (E-in-7 "`rateLimit.enabled: false` in an image rebuilt from the mutated file", M4 for
     I3), retags Stepan's image. Any later `up` without `--build`, or a recreate, runs a feature or mutated
     image, which applies the unmerged `0001_auth` to `academy_db-data`. If review rounds regenerate `0001`
     (new `when`), the merged migration then fails with 42P07 at every startup; with the same `when` and
     changed SQL it is silently skipped (drift). Both need manual DB surgery (`dialect.js:57-67`). "Stepan's
     running container keeps its old image until he recreates it" names the hazard but does not prevent it.
     Fix: the tester uses its own tag, e.g. `image: academy-web:${WEB_IMAGE_TAG:-local}` in compose, or a
     scratch override file with `image: academy-web:t29`, and removes only that tag at teardown (never
     `image prune`).
   - (c) The coder is not covered. Step 26 `pnpm dev` reads the root `.env` (`DATABASE_URL` on 5432 =
     Stepan's db whenever his stack is up) and startup migrates it with the unmerged `0001`; step 17 says
     "`pnpm seed` against a scratch DB" without saying how. The main checkout has no root `.env` today: if the
     coder creates one, Stepan inherits a coder-generated secret. Fix: 13.5 applies to coder and tester; any
     local run uses the `academy-t29` project (or a testcontainers DB) with `DATABASE_URL` exported to port
     55432, and nobody creates or edits the root `.env`.
   - (d) Every call is a fresh zsh, so one forgotten `-p` on `down -v` deletes Stepan's volume. Fix: the
     helper defines one wrapper with the project hard-coded (`t29() { docker compose -p academy-t29 "$@"; }`)
     and refuses `down -v` when the resolved project is `academy`. Setup records `docker volume inspect -f
     '{{.CreatedAt}}' academy_db-data`, and teardown asserts the value is unchanged.

3. **[design 4.5, 10, 13.2 I-seed] The seed is not restart-safe.** Creating the user and linking its
   credential account are two writes with no transaction. If the seed dies between them (Ctrl-C, DB
   restart), a user without a credential account remains. A rerun takes the "user with `SEED_EMAIL` exists"
   branch, updates the password of an account that does not exist (0 rows), and prints `seed: updated`.
   Sign-in is then impossible, and the only recovery is SQL. Fix: on an existing user,
   `findCredentialAccount`, then `linkAccount` with the new hash if it is missing, else `updatePassword`
   (V10 lists all three), or both writes in one transaction. Add an I-seed case: a user row without an
   account, then the seed, then sign-in 200. Also state that the CLI calls `close()` on the `DbHandle` in
   `finally`. Otherwise the open `pg.Pool` keeps the process alive, and CI step 4 hangs until the job's
   20-minute timeout.

4. **[design 6.2, 6.3, 11, 14 step 38] Env and run-doc gaps.**
   - `DB_PORT` is new (6.2 table) but missing from the `.env.example` block. Add `# DB_PORT=5432` with a note
     that `DATABASE_URL`'s port must match, because the seed and `pnpm dev` read `DATABASE_URL`, not
     `DB_PORT`. The checklist requires every new variable in `.env.example`.
   - The 6.3 fallback adds `AUTH_ALLOWED_HOSTS` to compose only. It also needs `.env.example` and
     `dev.passThroughEnv` (the lesson from #1: verify through root `pnpm dev`).
   - README (step 38) must say that `docker compose up -d --wait db`, the "database alone" line used before
     `pnpm dev`, now also fails without the secret (verified: `up db` and `run` interpolate `web`'s
     environment), and give the order after merge: `cp`/edit `.env` with the secret, then `up --build`, then
     seed (with the item 1 fix).

## Non-blocking recommendations

- CI step 1: also `echo "::add-mask::$secret"` for the generated `BETTER_AUTH_SECRET` (assign it to a shell
  variable first). The failure step uploads `compose.log`, and any future debug print would show it
  unmasked.
- Seed when the stack is down: the error is `ECONNREFUSED` through L1, with no hint. The 42P01 hint covers
  only "db up, web never migrated". Add the connect hint to the connect class only (the #1 lesson).
- T-xff fallback: if Chromium drops the header, all browser sign-in POSTs share one bucket (the bridge
  gateway IP), and E-in-4/6/7, E-out-1 and E-in-1 exceed 3 per 10 s. Spell out the fallback now: a separate
  Playwright project with `workers: 1` for credential-posting specs, plus a wait for the window, rather than
  "switch to spacing".
- Rollback (5.2/11.4): add "a re-land after a revert reuses the identical `0001_auth.sql` and journal
  entry. A regenerated one fails with 42P07 on a DB that kept the tables".
- If `lib/auth/index.ts` or `lib/session.ts` get `import "server-only"`, that import throws under `tsx` and
  plain Vitest. Either do not import it, or keep it out of the seed's and the integration tests' import graph.
- For judge-security: re-keying the password leaves existing sessions valid. Consider revoking the user's
  sessions in the seed's update branch.

## Attribution

All four are architect (design) mistakes; nothing is implemented yet. Lessons appended to
`.claude/feedback/architect_mistakes.md`.

FAIL
