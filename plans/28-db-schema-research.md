# #28 db schema v1: research

Checked 2026-10-29. Versions from `npm view` (publish dates in brackets). Library behaviour was read from
the published tarballs (`npm pack`) and verified in throwaway projects under the session scratchpad
(pnpm 10.28.0, Node 22.23.1, Docker 29.7.2), not from memory. Context7 was not reachable from this
agent (no ToolSearch tool); docs were read with WebFetch instead.

## Findings

### 1. Versions

| Package | latest | Notes |
|---|---|---|
| drizzle-orm | 0.45.4 [2026-10-08] | `rc` = 1.0.0-rc.5 [2026-10-21], `beta` = 1.0.0-beta.22 |
| drizzle-kit | 0.31.11 [2026-09-21] | `rc` = 1.0.0-rc.5 [2026-10-21] |
| pg / @types/pg | 8.23.1 [2026-09-30] | |
| postgres (postgres.js) | 3.4.9 [2026-04-05] | |
| @testcontainers/postgresql, testcontainers | 12.2.1 [2026-10-13] | `engines.node: ">= 22.22"` |
| better-auth, @better-auth/drizzle-adapter | 1.7.14 [2026-10-26] | CLI is now npm `auth` 1.7.14 (bin `auth`); `@better-auth/cli` is deprecated on npm |
| vitest | 5.0.5 [2026-10-15] | already in the lockfile |
| typescript | 7.0.2 [2026-07-08] | already in the lockfile; `tsc -v` = 7.0.2 |

- Implication: the `latest` line of Drizzle is still 0.x; 1.0 is RC. The Drizzle "upgrade to v1" page
  (orm.drizzle.team/docs/upgrade-v1) installs with `@rc` and shows the roadmap at 98%; no stable 1.0.

### 2. Drizzle migrations: how they work (0.45.4, source `pg-core/dialect.js` `migrate()`)

- `drizzle-kit generate` (no DB needed) writes `<out>/NNNN_<name>.sql` plus `<out>/meta/_journal.json`
  and `<out>/meta/NNNN_snapshot.json`. Statements are separated by `--> statement-breakpoint`.
- Runtime `migrate(db, { migrationsFolder })` from `drizzle-orm/node-postgres/migrator`:
  1. `CREATE SCHEMA IF NOT EXISTS "drizzle"`; `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations
     (id serial pk, hash text not null, created_at bigint)`. Schema/table configurable via
     `migrationsSchema` / `migrationsTable`.
  2. Reads only the newest row (`order by created_at desc limit 1`).
  3. Applies every journal entry whose `when` (generation timestamp, ms) is greater than that
     `created_at`, all pending ones in ONE transaction, inserting `(sha256 of file, when)` per file.
- Re-run idempotency comes from the journal table only. The generated SQL itself is not idempotent
  (`CREATE TYPE`, `CREATE TABLE` without `IF NOT EXISTS`). Verified: migrate twice on an empty
  testcontainers Postgres 17.6 -> no error, `__drizzle_migrations` has 1 row.
- Caveats from the source: the hash is stored but never compared (editing an applied file is not
  detected); a migration whose `when` is older than the newest applied one is silently skipped
  (possible when two branches generate migrations and merge out of order); no advisory lock, so two
  concurrent `migrate()` calls are not serialized.
- `drizzle-kit migrate` uses the same journal table (config keys `migrations.table`, `migrations.schema`,
  `migrations.prefix`) but needs `dbCredentials` and drizzle-kit at runtime. `drizzle-orm` alone
  suffices for runtime `migrate()`.
- `drizzle-kit generate` with no schema change prints "No schema changes, nothing to migrate" and
  writes nothing; `drizzle-kit check` prints "Everything's fine". Both usable for a drift check in CI
  (e.g. generate then `git status --porcelain`).
- Postgres enums: PG 17 docs (sql-altertype): "If ALTER TYPE ... ADD VALUE ... is executed inside a
  transaction block, the new value cannot be used until after the transaction has been committed";
  there is no DROP VALUE. Since Drizzle runs all pending migrations in one transaction, adding an
  enum value and using it in the same migrate run fails. `text` + `check(...)` avoids this; both
  `pgEnum` and `check()` generate correctly (verified).
- Identity columns: `integer().generatedAlwaysAsIdentity()` emits `GENERATED ALWAYS AS IDENTITY`
  (verified). `uuid().defaultRandom()` emits `DEFAULT gen_random_uuid()` (core in PG 13+).
- `casing: "snake_case"` in 0.45: set in both `drizzle.config.ts` and `drizzle({ client, schema,
  casing })`; generated SQL uses `user_id` for `userId` (verified).

### 3. Drizzle 1.0 RC differences (1.0.0-rc.5, verified in a scratch project)

- Migration folder format changed: one directory per migration `<out>/<YYYYMMDDHHMMSS>_<name>/
  {migration.sql, snapshot.json}`, no `meta/_journal.json`. The 1.0 migrator throws if it finds an old
  `_journal.json` ("run drizzle-kit up"). Going 0.x -> 1.0 later = one `drizzle-kit up` conversion.
- 1.0 journal table gets `name` and `applied_at`; pending migrations are chosen by NAME not seen in the
  DB (`getMigrationsToRun`), so out-of-order merges are applied, not skipped. Still one transaction,
  still no lock. Migrate twice: verified OK.
- Breaking API seen with the same code: `casing` is no longer a key of `defineConfig` or `drizzle()`
  (TS2353/TS2345); casing moved to table builders (`snakeCase.table(...)` from `drizzle-orm/pg-core`);
  without it columns are emitted as `"userId"`. `drizzle({ schema })` replaced by relations (RQB v2);
  `db.execute()` result type changed (no `.rows` on node-postgres raw result type).
- drizzle-kit 1.0 RC ships with zero npm dependencies (bundled, loads TS config with jiti).
- Better Auth 1.7.14 peer range accepts both: `drizzle-orm: ^0.45.2 || >=1.0.0-rc.1 <2.0.0`.

### 4. Driver: pg vs postgres.js

- drizzle-orm peers: `pg >=8`, `postgres >=3`, both optional. Better Auth peers `pg ^8.0.0` (optional).
- Verified end to end with `pg` 8.23.1 + `drizzle-orm/node-postgres` (Pool, migrate, insert returning).
  postgres.js was not tried.
- `pg` has no install scripts. Facts favouring `pg`: newer release (2026-09 vs 2026-04), the only
  driver named in Better Auth's peers, `Pool` is the object Better Auth/Kysely also accept.

### 5. drizzle-kit and TypeScript 7

- drizzle-kit 0.31.11 loads `drizzle.config.ts` and the schema with `tsx` (`tsx.register()` in
  `safeRegister`, bin.cjs ~line 15258), i.e. esbuild, not `tsc`. TS 7 does not participate.
- `tsc` 7.0.2 with the repo's `tsconfig.base.json` (NodeNext, strict, verbatimModuleSyntax,
  isolatedModules, noUncheckedIndexedAccess, declaration) typechecks drizzle-orm 0.45.4 and 1.0-rc.5
  schemas, `vitest/node` `TestProject`, `@testcontainers/postgresql` types: no errors. Declaration
  emit of exported tables works (`PgTableWithColumns<...>` in `.d.ts`), no TS2742.
- lesson-schema pattern: `type: module`, exports `./dist/index.{js,d.ts}`, `build: tsc -p
  tsconfig.build.json` (rootDir src), `typecheck: tsc -p tsconfig.json --noEmit` (rootDir ., include
  src+test), `vitest.config.ts` with `include: ["test/**/*.test.ts"]`. Fits packages/db, with one
  consequence: SQL migrations are not compiled into `dist/`, so the runtime `migrationsFolder` must be
  resolved relative to the package (e.g. `new URL("../drizzle", import.meta.url)`), not to cwd.

### 6. testcontainers + vitest 5

- API (12.2.1 `.d.ts`): `new PostgreSqlContainer(image: string)` (image is required),
  `.withDatabase/.withUsername/.withPassword`, `.start(): StartedPostgreSqlContainer`,
  `getConnectionUri()`, `snapshot()/restoreSnapshot()` (template-DB reset between tests), `.stop()`.
- Defaults (source): wait = health check + listening ports, startup timeout 120 000 ms; Ryuk image
  `testcontainers/ryuk:0.14.0`, disabled with `TESTCONTAINERS_RYUK_DISABLED=true`.
- Verified: vitest 5.0.5 `globalSetup` starting `postgres:17.6-alpine` (same tag as docker-compose),
  `project.provide("databaseUrl", ...)` + `inject("databaseUrl")` in tests, `declare module "vitest"
  { interface ProvidedContext {...} }`. Run time ~13 s locally with the image cached.
- Docker on ubuntu-24.04: the existing `compose` CI job runs `docker compose up` on that runner, so
  Docker is present. Ryuk on GitHub runners: not verified in this repo's CI.
- Separation: lesson-schema's include glob `test/**/*.test.ts` also matches `*.int.test.ts`; a db
  package needs disjoint globs or directories so `pnpm test` stays Docker-free.

### 7. Better Auth tables and our `users`

- Core models (`@better-auth/core` 1.7.14 `db/get-tables.mjs`): `user` (id, name, email unique,
  emailVerified bool, image?, createdAt, updatedAt), `session` (id, expiresAt, token unique, createdAt,
  updatedAt, ipAddress?, userAgent?, userId -> user), `account` (id, accountId, providerId, userId,
  accessToken?, refreshToken?, idToken?, accessTokenExpiresAt?, refreshTokenExpiresAt?, scope?,
  password?, createdAt, updatedAt; email+password stores the hash here), `verification` (id,
  identifier, value, expiresAt, createdAt, updatedAt). `rateLimit` only if DB rate limiting is on.
- Ids: default is app-generated 32-char `[a-zA-Z0-9]` string -> `text` PK.
  `advanced.database.generateId`: function | `false` | `"serial"` | `"uuid"` (uuid -> `gen_random_uuid()`).
- Renaming: per model `modelName` and `fields` (column mapping); extra columns via
  `user.additionalFields`. Drizzle adapter (`drizzleAdapter(db, { provider: "pg", schema, usePlural,
  camelCase })`) looks tables up by the KEY in the `schema` object (`schema[model]`); `usePlural: true`
  accepts a `users` key. SQL table names are whatever `pgTable()` says.
- So a single `users` table can be the Better Auth user table (our Drizzle table, exported under the key
  the adapter expects), or ours can be separate with a 1:1 FK to Better Auth's. Schema generation:
  `npx auth generate` (package `auth`), not verified here.
- Issue #30 (backlog/03-auth.md) is open and later; nothing in the repo constrains the choice yet.

### 8. Lesson references (ADR-0001, `packages/lesson-schema/src/schema.ts`)

- Ids are slugs `^[a-z0-9]+(?:-[a-z0-9]+)*$` (schema.ts:8) for course, module, lesson, check.
  Example: course `ai-for-developers`, lesson `intro-models-effort`, checks `model-routing`,
  `models-effort-quiz`.
- Uniqueness: lesson ids unique per course (validate.ts: `lessonIds` map created per course, ~line 80);
  check ids unique per lesson (schema.ts:121). Module and course ids: no uniqueness check exists.
  Directory names `NN-slug` (order) are separate from ids.
- Check kinds: `quiz | command | rubric | hidden-task | bug-hunt` (schema.ts:32-66); `weight` default 1;
  `passScore` 0..1 for quiz/rubric; `timeoutSec` for command (<=1800) and hidden-task (<=3600);
  `budgetUsd` (<=20) for hidden-task.
- Statuses `planned | draft | ready` are CONTENT statuses (schema.ts:21). No attempt/progress status
  vocabulary exists anywhere in the repo. Backlog hints: check "timeout" (08), cost per attempt shown
  on the dashboard (docs/learning-process.md section 2), weak topics later in DB (section 4),
  transcript attached to attempt (12), mentor score + Socratic text (11), quiz scored server side (10).

### 9. pnpm 10.28

- No `onlyBuiltDependencies`/`allowBuilds` configured; no `.npmrc`. Today `esbuild@0.28.2`'s
  postinstall is already ignored (`node_modules/.modules.yaml` `ignoredBuilds`) and tsx/vitest work.
- Adding the stack yields the warning "Ignored build scripts: cpu-features, esbuild@0.18.20,
  esbuild@0.25.12, esbuild@0.28.2, protobufjs, ssh2" (0.x kit). With those ignored, drizzle-kit
  generate and the testcontainers run both worked. `strictDepBuilds` defaults to false (warning only).
- pnpm docs (10.x settings): `allowBuilds` (map in pnpm-workspace.yaml, added 10.26.0) replaces the
  deprecated `onlyBuiltDependencies`/`ignoredBuiltDependencies`.
- No peer-dependency warnings with: drizzle-orm 0.45.4, pg 8.23.1, drizzle-kit 0.31.11, @types/pg,
  typescript 7.0.2, @types/node 26.6.5, @testcontainers/postgresql 12.2.1, vitest 5.0.5. Same for the
  1.0-rc.5 pair. No `--force`/`--legacy-peer-deps` needed.
- `pnpm audit`: drizzle-kit 0.31.11 pulls `@esbuild-kit/esm-loader` -> `esbuild@0.18.20`, moderate
  GHSA-67mh-4wv8-2f99 (esbuild dev server, dev-only path). drizzle-kit 1.0-rc.5 has no deps, so no
  such path.

### 10. Repo conflicts

- Biome (`biome.json`) checks every `**/*.json`. drizzle-kit's generated `meta/_journal.json` and
  `meta/*_snapshot.json` (and 1.0's `snapshot.json`) FAIL `biome check` formatting (verified); the
  journal also has no final newline (`.editorconfig` insert_final_newline). `*.sql` is not in Biome's
  includes.
- Turbo 2.11.10 strict env mode (verified in a scratch workspace): `DOCKER_HOST`, `HOME`, `CI` reach
  the task; `DATABASE_URL` and `TESTCONTAINERS_RYUK_DISABLED` are filtered out unless listed in
  `turbo.json` (`env` / `passThroughEnv`).
- turbo.json: `test:integration` exists (`dependsOn ^build`, `cache: false`); `build` outputs
  `dist/**` only.
- CI (`.github/workflows/ci.yml`): no job runs `pnpm test:integration` today; `checks` runs lint,
  typecheck, test, build.
- `.env.example` already has `DATABASE_URL=postgres://academy:academy@localhost:5432/academy`;
  compose service `db` is `postgres:17.6-alpine` on `127.0.0.1:5432`.
- CODEOWNERS covers `packages/lesson-schema/` and `docs/adr/`, not `packages/db/`.
- docs/architecture.md: "DB schema ... their ADRs will come with the corresponding tasks"; next free
  ADR number is 0007.

## Constraints discovered

- Node must be >= 22.22 for testcontainers 12 (CI resolves `22` from `.nvmrc` to latest 22.x; local 22.23.1).
- Drizzle 0.x migrations must be generated in timestamp order relative to what is applied, or they are
  skipped silently; 1.0 RC fixes this but is pre-release and changes the folder format and casing API.
- All pending migrations run in one transaction: enum `ADD VALUE` + use in one run fails.
- Generated drizzle JSON must be excluded from Biome or formatted after every generate.
- Integration tests need their own vitest config/glob; turbo env passthrough for any env they read.
- packages/db must not import from apps/web (does not exist).

## Open questions

- Drizzle 0.45 (stable, `_journal.json`, timestamp-ordered) or 1.0 RC (name-tracked migrations, new
  casing API, zero-dep kit, but RC)? Needs Stepan's call.
- One `users` table shared with Better Auth vs our own `users` + Better Auth's `user`: affects id type
  (text 32-char vs uuid) of every FK in v1.
- Should `lesson_id` be stored alone (unique per course) or with `course_id`? Module/course ids are not
  uniqueness-checked by the validator.
- Attempt statuses and check-result outcomes (e.g. timeout, error) are not defined anywhere yet.
