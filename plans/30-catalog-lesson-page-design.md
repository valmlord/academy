# Issue #30 design (architect phase, revision 4): course catalog, M0 lesson page and the dashboard data

Tier: **PROJECT** (about 2,250 LOC over 45+ files). Branch `feat/30-catalog-lesson-page`, main checkout.
Upstream facts: `plans/30-catalog-lesson-page-research.md` (cited "R§n", its questions Q1-Q10 and risks R1-R9).
Machinery reused from `plans/29-sign-in-dashboard-design.md` revision 3 (cited "#29 §n"): the DAL
(`requireSession`), the entry guard U-guard, the redaction rules, the e2e setup project with storage state,
the mutation protocol. Round-1 reviews: `plans/30-catalog-lesson-page-design-review-1-{security,architecture,
operations}.md` (cited "Sec", "Arch", "Ops"); round-2 reviews: `...-review-2-{security,architecture,
operations}.md` (cited "S6", "Arch-1", "O7", ...); round-3 reviews: `...-review-3-{security,architecture,
operations}.md`.

## Revision 4: the round-3 findings and where they are fixed

Narrow fixes only (Stepan's short fourth round). Steps stay 47, commits stay 10; only test rows, 13.4 and
ADR-0009 item 7 change.

| Id | Fix | Where |
|---|---|---|
| Arch round 3 #1 (blocking) U-env-sites walks a root CI does not have | The walk has two required roots, `apps/` and `packages/` (both tracked; a missing one fails the test, so a typo cannot pass vacuously), and one optional root, `services/`, walked only if it exists: it has no tracked file (`git ls-files services` prints 0 lines) and git stores no empty directory, so CI's checkout has none. Only `services/` may be absent; the design names no other optional root. Positive controls per required root: `apps/web/next.config.ts` and `packages/db/src/vocabulary.ts` are in the visited set. Rejected: driving the walk from `git ls-files`, because the coder runs the test before `git add`, so a new untracked file with a direct loader call would pass locally | 13.1 U-env-sites |
| Arch A6 mode-`000` file left behind | Every mode-`000` case (U-fs, U-read, U-text) records the path and restores mode `0o644` in an `afterEach`, so a failed assertion leaves no unreadable file for later cases that reuse the fixture; the temp dir's removal would succeed anyway (unlinking needs write permission on the directory, not on the file) | 13.1 U-fs, U-read, U-text |
| Sec N10 `LOG_TOKENS` | ADR-0009 item 7 and 4.Q12 no longer say the parser logs nothing because of `logLevel`: yaml 2.9.1 `dist/parse/parser.js:178-179` prints every lexical token with `console.log` when `process.env.LOG_TOKENS` is set, whatever `logLevel` is. Stated reason instead of a unit test: the switch is a process environment variable, not an option our code passes, and it cannot reach the web process (compose `web.environment` is an explicit list; turbo strict mode drops undeclared variables), so a test that sets it would only prove that the library logs and would pin nothing of ours | 4.Q12, ADR-0009 item 7 |
| Ops round 3 note on N4 | The `pgrep` pattern is narrowed to `'turbo run dev\|next dev'` (root `dev` is `turbo run dev`, `apps/web` `dev` is `next dev`), so editors or other tools whose command line contains `next` cannot make the check falsely red | 13.4 |

## Revision 3: every round-2 finding and where it is fixed

Narrow fixes only (Stepan's third round, 2026-10-30). Steps stay 47, commits stay 10; no step is added or
moved, steps 1, 6, 8, 9 and the check sets change.

| Id | Fix | Where |
|---|---|---|
| S6 = Arch-1 = O7 M-env-turbo loads the real `.env` | No mutation that can stop the flag from reaching a process runs in the main checkout. M-env-turbo is proven in a scratch turbo workspace without any `.env` (a copy of the step-1 `turbo.json`, a stub `@academy/web` whose scripts echo the flag, the repository's turbo 2.11.10, `--force`): statically (`--dry=json`: `globalCacheInputs.environmentVariables.passthrough` holds `ACADEMY_SKIP_ROOT_ENV=<sha256 of "1">` with the entry, `null` without) and at run time (`flag=1` / `flag=UNSET` for build, typecheck, dev, seed, test:e2e); rehearsed (V12, V19). In the main checkout only the positive, non-executing check [D] runs, before the first real build, typecheck, seed or e2e and before every [U]/[B]/[S]. M-env-flag and M-env-site run only through `vitest run lib/root-env.test.ts`, restored with `cmp` before any other command. 13.6 gains the rule. [B] uses `turbo run build --force` (O N1) | 4.Q11, 13.5 [D] [B], 13.6, 13.7, 14 step 1, 10 |
| S7 `toJS()` logs a collection key | V15 corrected: `parseDocument` itself logs nothing; `doc.toJS()` logs a collection key through `process.emitWarning` at the default `logLevel` and at `"warn"`, not at `"error"` or `"silent"` (rehearsed, V15). U-read case with `? [CANARY-KEY]` under the channel spies; mutation M-yaml-level (`logLevel` removed) seen red; 4.Q12 and ADR-0009 item 7 name the option and both reasons for it | 0 V15, 4.Q12, 13.1 U-read, 13.7, ADR-0009 item 7 |
| Arch-2 no "unreadable" reason | Reason `unreadable (<errno code>)` added to the closed set, with the full errno mapping (`ENOENT`/`ENOTDIR` -> `missing`, `ELOOP` -> symlink reason, `EISDIR` -> `not a regular file`, any other `E...` code -> `unreadable (<code>)`, a non-errno error rethrown); U-fs (mode `000` -> `unreadable (EACCES)`; synthetic `EIO`), U-read and U-text cases; M-fs-unreadable | 5.1, 5.4, 13.1, ADR-0009 item 7 |
| Arch-3 `LEARNER_FILES` before its step | Step 6 creates `lib/course/files.ts` with `LEARNER_FILES` ("Supplies: `LEARNER_FILES`"); step 9 adds `learnerFiles(tree)` to it | 14 steps 6, 9 |
| O8 C2 fails as `node` | C2 runs `--user root`; the in-container stderr is merged and every line must be a hash line or a marker; requires compose rc 0, `C2-RC 0`, no other line, hashed lines = `C2-COUNT` (a second `find` in the same container), count above 0. Rehearsed on `academy-web:local` (V20): as `node` rc 1, 5 error lines, 4,031 of 4,036; as root rc 0, 0 other lines, 4,035 = 4,035 | 7.3 |
| S N7 U-env-sites only `apps/web` | Walks `apps/`, `packages/`, `services/` (skipping `node_modules`, `dist`, `.next`, `.turbo`, `coverage`, `playwright-report`, `test-results`); also refuses a `dotenv` import; positive control that `packages/db/src/vocabulary.ts` was visited; M-env-walk | 13.1 U-env-sites |
| S N8 `.env.example` live line | Both new entries are comment lines only; [D]-adjacent check `grep -cE '^(ACADEMY_SKIP_ROOT_ENV\|COURSE_ROOT)=' .env.example` prints 0 | 4.Q11, 14 steps 1, 4 |
| S N9 error echoes the value | `InvalidRootEnvOptOutError` prints the value only when it has at most 8 characters, else `<n characters>`; U-env case with a 40-character value | 4.Q11, 13.1 U-env |
| Arch A1 U-env-sites self-match | Needles built from parts (`["loadEnv", "File"].join("")`), so the test file holds no needle | 13.1 U-env-sites |
| Arch A2 strip-only loader | `lib/root-env.ts` header comment: erasable syntax only (no enum, namespace, parameter property), because Node's strip-only loader loads it (V11) | 4.Q11 |
| Arch A3 U-leak and `listDirs` | The recorder logs `readText` and `isRegularFile`; `listDirs` is asserted separately: exactly one call, `rel` `""` | 7.1 |
| Arch A4 per-tab catch | `instanceof LessonTextReadError` renders the text error, anything else is rethrown | 6.2 |
| Arch A5 lesson list label | The catalog's lesson `ul` carries `aria-labelledby="<moduleId>-heading"` (prototype line 116); E-cat-1 asserts the list's accessible name | 6.1, 13.2 |
| O N2 late prefetch | A rejected body read fails the test unless its request carries `next-router-prefetch: 1` and was issued after the last settle; such reads are printed ("ignored late prefetch <url>") | 7.2 |
| O N3 docs | README text and `.env.example` comments spelled out (unset = unchanged, `1` skips with the stderr line, anything else stops startup, `COMPOSE_ENV_FILES=/dev/null` is the compose counterpart) | 14 steps 1, 4, 47 |
| O N4 dev server leftovers | T-err part 2 records `pgrep -f 'turbo run dev\|next dev'` (revision 4) before start; stop = stop the background task, then the port kill; after it no new PID and no listener | 13.4 |

## Revision 2: every round-1 finding and where it is fixed

| Finding | Fix | Where |
|---|---|---|
| Sec S1 / Ops O6 root `.env` read | Real isolation, no "accept reads": `COMPOSE_ENV_FILES=/dev/null` in `t30-env.sh` (every compose call, wrapper and image scripts); one opt-out `ACADEMY_SKIP_ROOT_ENV=1` honoured by the three `loadEnvFile` call sites through one helper `lib/root-env.ts`, in turbo `globalPassThroughEnv`, with U-env (flag, absent file, invalid value) and U-env-sites (no direct `loadEnvFile` anywhere else), mutations M-env-flag, M-env-site, M-env-turbo; a skip line proves the flag reached each process; before/after record uses `stat`, key names come from `.env.example`. Commit 1, before anything that builds or runs | 4.Q11, 13.6, 14 step 1, V11-V14 |
| Sec S2 yaml warnings print source lines | Loader and export parse with `parseDocument(src, { lineCounter, prettyErrors: false, logLevel: "error" })`; any error **or warning** is `invalid YAML at line <n>` (fail closed), line from `lineCounter.linePos(pos[0])`, never a message. Not `logLevel: "silent"` (it drops the multi-document error, V15). U-read spies on `process.emitWarning`, every `console.*` and `process.stderr.write`; M-yaml-log, M-yaml-silent | 4.Q12, 5.4, 13.1 U-read, V15-V16 |
| Sec S3 layer 2 misses `/` and not-found | E-leak also scans one not-found URL (commit 8) and `/` with a positive control (commit 9, when the dashboard renders course data); M-leak-dash | 7.2, 13.2, 14 steps 40, 46 |
| Sec S4 M-leak-rsc fails the build | Mutation compiles: `leak?: unknown` added to `LessonTabs` props, `leak={node.lesson}` passed; asserted fragment `ACADEMY_CHECKS_DIR/verify_routing.py` (in the kept set, V17); tester records "build passed, E-leak red"; E-leak asserts at least one RSC body captured | 7.2, 13.2 |
| Sec S5 ADR wording | ADR-0009 Consequences: `lesson.yaml` grader metadata is in the image, why, and how it is kept from the browser | ADR-0009 |
| Sec N1 fs allowlist | `CourseFs.readText` also refuses a basename outside `LEARNER_FILES` and any `checks`/`starter` segment (reason `not a learner file`) | 5.1, U-fs |
| Sec N2 self-referential listing test | U-files' expected set is a literal list in the test; image check gains C4, a name scan for `checks`, `starter`, `quiz.yaml` (catches files under 64 bytes) | 13.1, 7.3 |
| Sec N3 / Arch A2 layout read order | `(app)/layout.tsx` reads the course only after `session !== null` | 4.Q9, 6 |
| Sec N4 crafted hash | `FragmentFocus`: `decodeURIComponent` in try/catch, then `document.getElementById`, never `querySelector` | 6.1 |
| Sec N5 images | `disallowedElements: ["img"]` until a design covers images; U-md case; M-img | 4 Markdown, 13.1 |
| Sec N6 `cut .env` | Removed; key names from `.env.example` (V8) | 0 |
| Arch 1 copy strings across commits | "Копировать" and "Не скопировано, выделите текст вручную" arrive in commit 6 with the copy button; every step lists the strings it supplies (14) | 9.3, 14 step 22 |
| Arch 2 E-cat-2 clicks dashboard rows | Dashboard part removed from E-cat-2; E-dash-1 (commit 9) covers "row -> catalog heading focused" | 13.2 |
| Arch 3 E-les-2 cannot fail | New order: `get-session` fulfilled `null` on load, wait for "Войти снова", then select Задание, assert `next` = `...?tab=task`. Negative run: today's `notifications.tsx` (reads `window.location` once, at resolve, `notifications.tsx:26`), restored from the backup taken in step 34 (the change is step 39) | 13.2 E-les-2, 13.7 |
| Arch 4 `data-region` mutation green | Two mutations, each traced through `region-cycle.tsx:20-29,49`: M-region-both (red at the third `F6`), M-region-moved (red at "focused element's nearest `[data-region]` is the section named Урок") | 13.2 E-les-3, 13.7 |
| Arch 5 M-msg schema half | Schema case uses two checks with id `canary-dup` (the only zod message that echoes input, V16); M-msg-schema (`issue.message`) and M-msg-yaml (`prettyErrors: true` + `error.message`) each named with the half they redden | 13.1 U-read, 13.7 |
| Arch 6 vendored drift by example | Full state tables from the radix-nova registry source, every class and state, in this design (8.4). Decisions: Collapsible and the shadcn Progress indicator are not used as shipped (Radix Collapsible drops `aria-controls` and unmounts the closed list; a function prop cannot cross the server/client boundary). E-ring asserts the focus ring on a row link, a tab trigger and the tab panel | 8.4, 13.2 E-ring |
| Arch 7 error-class contract | `CourseFs` throws one internal `CourseFileError { file, reason }`; `readCourse` maps it to `CourseReadError`, `readLessonText` to `LessonTextReadError`, the export to `CourseExportError`. The listing is a pure function of the parsed tree (`learnerFiles(tree)`), used by the export; the server opens only files on it (U-leak). ADR-0009 item 2 corrected | 5.1, 5.4, ADR-0009 |
| Arch 8 text-error state unrendered | T-err part 3: `theory.md` removed from a scratch copy: Alert, Задание still renders, "Источники" shown, log line, "Повторить" after restoring focuses the panel; in the conformance screenshots | 13.4 |
| Arch A1 not-found metadata | Catalog and lesson `generateMetadata` return "Страница не найдена" when they are about to call `notFound()`; the catch-all and `not-found.tsx` export it too | 6 |
| Arch A3 / Ops O3 turbo test inputs | `@academy/web#test` inputs += `$TURBO_ROOT$/course/**` in the step that adds U-md's real-course case | 14 step 25 |
| Arch A4 lesson ACs not M0 | Lesson AC1 (two panes), AC5, AC7-AC12 and the check-bar part of AC13 listed as N/A for M0 | 8.2 |
| Arch A5 prefetch claim | Dropped; E-leak visits every lesson directly | 7.2 |
| Arch A6 `getValueLabel` | `Progress` takes `valueText: string` and sets `getValueLabel` inside the client component | 8.4 Progress |
| Ops O1 T-err recipe | `--name academy-t30-web-err --publish 127.0.0.1:3231:3000`; `docker logs`; `docker stop` before teardown; port 3231 in the free-port precheck; teardown asserts no `academy-t30` container left. Rehearsed in bash and zsh (V13) | 13.4, 13.6 |
| Ops O2 `.env.example` | `COURSE_ROOT` (commit 3) and `ACADEMY_SKIP_ROOT_ENV` (commit 1) entries | 14 steps 1, 4 |
| Ops O4 E-leak hygiene, race, runtime | Fragments trimmed (V17: 6,029 kept); one known collision `abcdefghijklmnopqrstuvwxyz0123456789` in an explicit exclusion list with its reason; prefix-index scan (4.9 MB in 308 ms, V17); `networkidle` before each navigation; every body read awaited, a failed same-origin text read fails naming the URL; bodies deduped by hash; one test per lesson; bytes and ms printed | 7.2 |
| Ops O5 text read failures not logged | Wiring logs `web: lesson text read failed: <file>: <reason>`; T-err asserts it | 4 Caching, 13.4 |
| Ops non-blocking: C2 only `/app` | C2 hashes every regular file of the image (`find / -xdev -type f`) | 7.3 |
| Ops non-blocking: hash tool | Host hashes with Node `crypto` | 7.3 |
| Ops non-blocking: section 11 | `pnpm install` added; rollout check is `check-image-course.sh`, not the count 46 | 11 |
| Ops non-blocking: `e2e/course.ts` source | Reads `<repo>/course` explicitly, never `COURSE_ROOT` | 13.2 |
| New in revision 2 (found while fixing) | proto.css `.prose h2:focus-visible` draws the ring outside, README "headings inset": README wins (inset); note for #83 | 8.4, 9.1 |

**Binding decisions by Stepan (2026-10-30), unchanged.**
- S1 Progress: every lesson shows "Не начат" and every prerequisite counts as not passed, with no database
  read; #35 replaces this with real progress. States this leaves unreachable: 6.5.
- S2 The lesson page follows the design (M0 lesson: one column, theory and task, no right pane). The issue's
  "workspace stub on the right" is dropped (9.4 has the PR text).
- S3 A `ready` lesson inside a module that is not `ready` is hidden; such a module shows "Готовится".
- The dashboard shows the first-run state from constants (4.Q3); Skeletons move to #35 (4.Q10); deviations D1-D3
  with the DESIGN follow-up #83 (filed).

**Orchestrator decisions for revision 2.** The root `.env` is never read by any role (4.Q11), with the opt-out
named `ACADEMY_SKIP_ROOT_ENV`; Arch 6 is answered in the design (8.4).

**Dependency on #79 (DESIGN, PR #82, still open).** The coder starts only after #79 is on `main`. Statements
marked **[#79]** are re-checked against `main` once it merges (list in 9.5).

## 0. Facts verified in this phase (2026-10-30)

| # | Fact | Source |
|---|---|---|
| V1 | `packages/lesson-schema/dist/schema.js` and `schema.d.ts` exist; the package exports only `.`. `@academy/db` (NodeNext) and `apps/web` (Bundler) both resolve `exports` subpaths. | `ls packages/lesson-schema/dist`; `tsconfig.base.json:5-6`; `apps/web/tsconfig.json:5-6` |
| V2 | The only runtime import of `@academy/lesson-schema` reachable from the web is `packages/db/src/vocabulary.ts:5`; `apps/web` imports the package nowhere. The three build warnings trace through it. | `rg lesson-schema packages/db/src apps/web`; `apps/web/.turbo/turbo-build.log:15-60` |
| V3 | The warning text offers `fs.existsSync(/*turbopackIgnore: true*/ ...)`; the docs list `turbopackIgnore`. | `turbo-build.log:29-34`; `next/dist/docs/01-app/03-api-reference/08-turbopack.md:131-138` |
| V4 | `not-found.js` renders for `notFound()` in its segment; "Before streaming starts, Next.js returns a `404`"; it sits inside `loading.js`'s Suspense of the same segment. | `03-file-conventions/not-found.md:9-27` |
| V5 | `window.history.replaceState` integrates with the Next router and syncs `usePathname` / `useSearchParams`. | `01-getting-started/04-linking-and-navigating.md:344-349` |
| V6 | `react-markdown@10.1.0` depends on `unified ^11`, `remark-parse ^11`, `unist-util-visit ^5`; `remark-gfm@4.0.1` on `unified ^11`, `remark-parse ^11`. `mdast-util-to-string` latest 4.0.0. | `npm view` |
| V7 | Real content: 1 course, 6 modules (00, 01 `ready`; 02-05 `planned`, no lessons), 13 lessons, all `ready`, each with 1 outcome. Every theory.md starts with `# <lesson title>`; two theory files have a second `# ` line, both inside fenced code. No `####`; two task.md files use `###`. | `grep` over `course/**/{theory,task}.md` |
| V8 | A root `.env` exists in the main checkout. Its keys are not read by the architect; the variables it can hold are the ones `.env.example` lists (`POSTGRES_*`, `DATABASE_URL`, `DB_PORT`, `WEB_PORT`, `WEB_IMAGE_TAG`, `E2E_BASE_URL`, `BETTER_AUTH_SECRET`, `SEED_EMAIL`, `SEED_PASSWORD`, `SEED_NAME`, later services). | `ls -la .env`; `.env.example` |
| V9 | Readers of the root `.env` today: compose (any bare `docker compose` in the repo root), `next.config.ts:14-16` (so `next build`, `next dev` **and** `next typegen`, which `pnpm typecheck` runs: `next/dist/cli/next-typegen.js:15` loads the config), `playwright.config.ts:7-9`, `scripts/seed.ts:14-16`. Not readers: Vitest (Vite reads env files from its root, `apps/web`, which has none), Next's own env loading (`apps/web/.env*`, none exist), turbo (no `globalDependencies`), drizzle-kit (config uses no env; no dotenv dependency). `shadcn` 4.23.0 depends on `@dotenvx/dotenvx` (`pnpm-lock.yaml:7873`); it runs with cwd `apps/web`, which holds no env file (which files dotenvx reads was not verified). | `git grep -n loadEnvFile`; `ls -a apps/web`; lockfile |
| V10 | #79's branch adds to `ia.md` R6 "Before the catalog ships": from #30 the top bar is "Академия", "Главная", "Курс", user menu on every page; "Главная" `aria-current` on the dashboard, "Курс" on the catalog, neither on the lesson page and not-found; not-found ships with #30 with the top bar and its `F6` stop `main` lands on "Открыть курс"; dashboard "From #30: F4 and F18.1-F18.2 as designed". PR #82 head `2ae6a7b` changes nothing in `design/` after `1e51f71` (Arch, sound list). | `git diff main...docs/79-top-bar-before-catalog -- design/` |
| V11 | `next.config.ts` importing a local helper with an explicit `.ts` extension loads in both of Next 16.4.3's config loaders: native (`__NEXT_NODE_NATIVE_TS_LOADER_ENABLED=true`, Node 22.23.1 `process.features.typescript = "strip"`) and legacy SWC/CJS. Extensionless, the native loader fails with `ERR_MODULE_NOT_FOUND` and Next falls back with a warning. The same `.ts` import works in Playwright 1.64.1 (`playwright test --list`) and tsx 4.23.15. `tsc` 7.0.2 accepts it only with `allowImportingTsExtensions` (TS5097 otherwise; `noEmit` is already set). | rehearsal in `<scratchpad>/r2/nc` calling `next/dist/build/next-config-ts/transpile-config.js` |
| V12 | Turbo 2.11.10 records `globalPassThroughEnv` in `--dry=json`: `globalCacheInputs.environmentVariables.specified.passThroughEnv` lists the name, and `...environmentVariables.passthrough` lists `ACADEMY_SKIP_ROOT_ENV=6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b` (sha256 of `1`) when the shell exports `1`, `[]` when it is unset, `null` when the entry is removed. The per-task `environmentVariables.passthrough` stays `null` (the entry is global). A dry run executes no task. | revision 3: scratch turbo workspace `<scratchpad>/r3/tw` (no `.env`), never the repository's `turbo.json` |
| V13 | Revised `t30-env.sh` (13.6), rehearsed in bash 3.2 and zsh against a scratch compose file with `name: academy` and a canary `.env` (`FROMFILE`, `BETTER_AUTH_SECRET`, `COMPOSE_PROJECT_NAME=academy`): `t30 config` and **bare** `docker compose config` both resolve `academy-t30`, ignore `FROMFILE` and use the exported secret; with `COMPOSE_ENV_FILES` unset, bare compose interpolates `fromfile-canary`; `t30 -p academy ps` and `COMPOSE_ENV_FILES= t30 ps` return 97; `t30 run -d --rm --no-deps --name academy-t30-web-err --publish 127.0.0.1:3231:3000 -e COURSE_ROOT=... web` starts; `docker logs academy-t30-web-err` shows the line, `t30 logs` shows 0 lines; `docker stop` then `t30 down -v` leaves `docker ps -aq --filter label=com.docker.compose.project=academy-t30` empty. Stepan's `academy-web-1` / `academy-db-1` StartedAt unchanged. | `<scratchpad>/r2/reh.sh` |
| V14 | `stat -f '%i %z %m' <file>` prints inode, size and mtime without reading content; `|| echo absent` covers a missing file. | rehearsal |
| V15 | yaml 2.9.1: `parse()` logs warnings through `process.emitWarning` with the quoted source line (`public-api.js:71`); `parseDocument` itself logs nothing (all channels spied, 5 inputs), **but `doc.toJS()` does** (revision 3, S7): `id: x\n? [CANARY-KEY]\n: v\n` gives 0 errors and 0 warnings, and `toJS()` emits one warning naming `CANARY-KEY` (`nodes/addPairToJSMap.js:57` via `log.js`) with `logLevel` unset or `"warn"`, nothing with `"error"` or `"silent"` (`<scratchpad>/r3/y5.cjs`, every channel spied). With `prettyErrors: false`, errors carry `pos` but no `linePos` and no source line in `message`; `new LineCounter()` passed as `lineCounter` gives `linePos(pos[0]).line`. `logLevel: "silent"` suppresses the `MULTIPLE_DOCS` error (`public-api.js:49-50`), so a second document is silently dropped; `logLevel: "error"` keeps it. All 20 real course YAML files have 0 errors and 0 warnings under these options. | `<scratchpad>/r2/y2.mjs`, `y3.mjs`, `y4.mjs` |
| V16 | zod 4.6.7 messages for invalid `id`, `url`, `checkedAt` do not echo the input ("lowercase-kebab-case", "Invalid URL", "YYYY-MM-DD"); the duplicate-check refinement does: `duplicate check id: canary-dup`, path `["checks"]`, code `custom` (`schema.ts:124`). | `<scratchpad>/r2/yz.mjs` against `packages/lesson-schema/dist/schema.js` |
| V17 | E-leak fragment rule 7.2 on today's `course/`: 6,111 trimmed fragments, 6,029 after the allowed-corpus filter, `ACADEMY_CHECKS_DIR/verify_routing.py` among them (`00-introduction/01-models-and-effort/lesson.yaml:38`, in no theory.md or task.md). Prefix-index scan of today's `.next/static` + `.next/server` (164 files, 4.9 MB): 308 ms, one collision `abcdefghijklmnopqrstuvwxyz0123456789` (`00-introduction/02-agent-loop/checks/test_harness.py`). | `<scratchpad>/r2/frag2.mjs` |
| V18 | radix-nova registry sources of badge, item, tabs, breadcrumb, collapsible, progress (the style in `apps/web/components.json`) read class by class for 8.4. Radix 1.2.1 internals used there: Collapsible trigger sets `aria-controls` only while open (`react-collapsible/dist/index.mjs:66`) and the content renders its children only while open (`:84`, `:137`); Progress computes `aria-valuetext` from `getValueLabel`, default a percentage (`react-progress/dist/index.mjs:32,68-69`); TabsContent is `tabIndex: 0` with `hidden` while inactive (`react-tabs/dist/index.mjs:175-177`); triggers carry `data-state`, `aria-selected`. | `https://ui.shadcn.com/r/styles/radix-nova/<name>.json`; `node_modules/.pnpm/@radix-ui+react-*@1.2.1*/` |
| V19 | In a scratch turbo workspace (the repository's `turbo.json` plus `globalPassThroughEnv: ["ACADEMY_SKIP_ROOT_ENV"]`, `pnpm-workspace.yaml`, a stub `@academy/web` whose `build`, `typecheck`, `dev`, `seed`, `test:e2e` scripts print the flag, a minimal lockfile, `git init`, no `.env`), turbo 2.11.10 from the repository, `--force`: with the entry every task prints `flag=1`; with the entry removed every one prints `flag=UNSET` and the dry-run `passthrough` is `null`; restored with `cmp`. | `<scratchpad>/r3/tw` |
| V20 | `academy-web:local` (`USER node`), `docker run --rm --network none --entrypoint sh`, C2's in-container script (7.3): as `node`, 4,031 hash lines, 5 error lines (`/root`, `/lib/apk/db/lock`, `/etc/crontabs/root`, ...), `C2-RC 1`, `C2-COUNT 4036`; with `--user root`, 4,035 hash lines, no other line, `C2-RC 0`, `C2-COUNT 4035`. Stepan's containers, volume and tags untouched. | `<scratchpad>/r3/c2-in.sh` |

Not verifiable without the coder's build (each has a named check):
- U-1 `/*turbopackIgnore: true*/` on the `fs` calls of `lib/course/node-fs.ts` keeps the build warning-free
  and `course/` out of every `.nft.json` (N1, step 15; warning count in [B]).
- U-2 `notFound()` in a page under `app/(app)/` renders `app/(app)/not-found.tsx` inside `(app)/layout.tsx`
  with status 404 (E-nf-1); `<title>` comes from the page's own `generateMetadata` fallback (A1), so it does not
  depend on whether a nested `not-found.tsx` `metadata` export is honoured.
- U-3 `app/(app)/[...missing]/page.tsx` catches every unmatched path and shadows none of `/sign-in`,
  `/api/auth/*`, `/favicon.ico`, `/_next/*` (E-nf-1 plus the existing suite).
- U-4 `useSearchParams` in `components/notifications.tsx` causes no build error (every `(app)` route is
  dynamic) ([B]).
- U-5 M-leak-rsc and M-leak-dash: a prop of a client component is serialised into the RSC payload even when
  the component never reads it. This is React's documented contract for client props; the tester confirms
  "build passed, E-leak red at the fragment" (13.7).

## 1. Solution

- **Root `.env` isolation** first (commit 1): `lib/root-env.ts` is the only loader of the root `.env`; an
  exported `ACADEMY_SKIP_ROOT_ENV=1` makes every Node entry point skip it, and `COMPOSE_ENV_FILES=/dev/null`
  makes every compose call skip it.
- **Loader** in `apps/web/lib/course/` (marker-free, dependencies injected): parses the structure with
  `@academy/lesson-schema/schema`, derives the learner-visible file list from the parsed tree, builds view
  models field by field; per-request cache in a `server-only` wiring file. Course root from `COURSE_ROOT`.
- **Image**: the build stage exports exactly that list, deletes `course/`, then runs `next build`; the runner
  holds `/app/course` with 46 files today and nothing else from `course/` (ADR-0009, Proposed).
- **Pages** under `app/(app)/`: catalog, M0 lesson (`?tab=theory|task`), not-found (segment `not-found.tsx`
  plus a signed-in catch-all), the dashboard's first-run state. Top bar gains "Курс" with route-dependent
  `aria-current`.
- **Markdown** on the server with `react-markdown` + `remark-gfm`, raw HTML as text, no images, heading rules,
  "Содержание" ids; client islands only for copy, tabs, outcomes toggle, focus moves and retry.
- **Leak guards in four layers**, each seen red: unit canary, e2e response scan (every page kind), image check,
  build-trace check.

## 2. Scope

### 2.1 What #30 builds

| From | Builds |
|---|---|
| issue I1 "lessons not `ready` are not visible" | visibility rule 5.2 (with S3); U-view; tester T-vis on a fixture course |
| issue I2 "`checks/` never sent to the browser (with a test)" | ADR-0009; the four layers of section 7 |
| issue I3 "e2e: open a module, open a lesson, see the theory" | E-les-1 |
| issue body "web reads the course through `@academy/lesson-schema`" | `lib/course/` on `@academy/lesson-schema/schema` |
| `design/pages/catalog` (ready) | AC1-AC6, AC8, AC10-AC12; AC7, AC9 unreachable (6.5) |
| `design/pages/lesson` (ready), M0 lesson | AC2, AC3 (M0 row), AC4, AC6 (M0 part), AC13 (M0 width part), AC14-AC17, AC18 (M0 subset); N/A in M0: AC1 two panes, AC5, AC7-AC12, AC13 check bar |
| dashboard deferrals D-a..D-f (`#29 §9.2`) | D-a, D-b, D-c (first-run progress section, 4.Q3), D-d, D-e course error, D-f; D-e loading: #35 (4.Q10) |
| research R§2.3 | the three Turbopack warnings removed (commit 2) |
| `ia.md` page inventory, not-found **[#79]** | `app/(app)/not-found.tsx` + catch-all from the copy spec (deviation D1, #83) |
| Sec S1 / Ops O6 (round 1) | `lib/root-env.ts` and the opt-out (4.Q11) |

### 2.2 What #30 does NOT build

- Any progress read, attempt, "В процессе" / "Пройден" / "Не пройден", "Продолжить", "Прогресс недоступен"
  (S1; #35).
- A right pane, environment, check bar, Проверки or Квиз tab, idle warning, terminal (S2; #31, #32, #34, #36).
- `loading.tsx` anywhere, and the Skeleton component (4.Q10).
- A process-wide course cache, a build-time snapshot, a bind mount (ADR-0009 alternatives).
- Syntax highlighting, `rehype-raw`, `rehype-sanitize`, `rehype-slug`, a typography plugin, images in lessons.
- Several courses (ADR-0009 item 6); `/courses` index route.
- Badge, Item or Tabs variants and sub-components no #30 state uses (8.4 lists what is deleted from the
  vendored files); the shadcn Collapsible file (8.4).
- Changes to the lesson format, `course/`, `design/`, `.claude/`, the validator in `packages/lesson-schema`.
- A CI job of its own: the `checks` and `e2e` jobs gain one step each.

## 3. Files

### 3.1 packages
- `packages/lesson-schema/package.json`: `exports["./schema"] = { types: "./dist/schema.d.ts", default:
  "./dist/schema.js" }`.
- `packages/db/src/vocabulary.ts`: `import { Check } from "@academy/lesson-schema/schema"`.

### 3.2 apps/web (new unless marked)
- Root `.env` (commit 1): `lib/root-env.ts` + `lib/root-env.test.ts`; edited `next.config.ts`,
  `playwright.config.ts`, `scripts/seed.ts`, `tsconfig.json` (`allowImportingTsExtensions: true`).
- Marker-free course modules (importable by Vitest, tsx scripts and e2e helpers):
  - `lib/course/errors.ts`: `CourseFileError` (internal), `CourseReadError`, `LessonTextReadError`,
    `CourseExportError`.
  - `lib/course/root.ts`: `courseRoot(env, cwd)`.
  - `lib/course/node-fs.ts`: `nodeCourseFs`, the only server-bundled module with `node:fs` calls (each with the
    ignore comment).
  - `lib/course/yaml.ts`: `parseYamlFile(text, file)` (4.Q12).
  - `lib/course/files.ts`: `LEARNER_FILES`, `learnerFiles(tree)`.
  - `lib/course/read.ts`: `readCourse(fs, root)` -> `CourseTree`.
  - `lib/course/view.ts`: `isLessonVisible`, `toCatalogView`, `toDashboardView`, `findLesson`, `toLessonView`.
  - `lib/course/text.ts`: `readLessonText(fs, root, lessonDir, kind)`.
  - `lib/course/page-error.ts`: `loadOrError(fn)`.
- Wiring, `import "server-only"` first: `lib/course/server.ts` (`getCourse()`, `getLessonText()`, logging).
- Plain modules added in the coder phase, because a value exported from a `"use client"` file reaches a
  server component as a client reference: `lib/routes.ts` (`catalogPath`, `moduleAnchorPath`, `lessonPath`)
  and `components/lesson/lesson-panels.ts` (tab values, fixed panel and trigger ids, `lessonTabOf`);
  `components/lesson/lesson-text.tsx` holds one tab panel's read, text error and content.
- `scripts/export-course.ts` (CLI `export <src> <dest>` and `list <src>`), `scripts/check-image-course.sh`,
  `scripts/check-build-course.sh` (+ `scripts/nft-course-paths.mjs`).
- Routes: `app/(app)/courses/[courseId]/page.tsx`, `app/(app)/courses/[courseId]/lessons/[lessonId]/page.tsx`,
  `app/(app)/not-found.tsx`, `app/(app)/[...missing]/page.tsx`; edited `app/(app)/page.tsx`, `app/(app)/layout.tsx`.
- Components: `components/top-bar-nav.tsx` (client); edited `top-bar.tsx`, `notifications.tsx`;
  `components/course-error.tsx`, `retry-button.tsx` (client), `focus-on-mount.tsx` (client);
  `components/catalog/{module-list,module-section,lesson-row,fragment-focus}.tsx`;
  `components/lesson/{lesson-header,outcomes,lesson-tabs,toc,sources,prerequisite-alert}.tsx`;
  `components/markdown/{headings.ts,lesson-markdown.tsx,copy-button.tsx}`;
  `components/dashboard/{next-lesson-card,course-progress,module-bar}.tsx`;
  `components/ui/{badge,item,tabs,breadcrumb,progress}.tsx` from `shadcn add`, then edited (8.4);
  `components/ui/progress-styles.ts` and `components/ui/link-styles.ts` (class constants, not client modules).
- Edited: `lib/copy.ts` (9.3), `app/globals.css` (prose rules outside the token block), `package.json`,
  `Dockerfile`, `vitest.config.ts` (none expected).
- Tests: unit files next to modules (13.1), `test/course-fixture.ts`; e2e `e2e/course.ts`,
  `e2e/leak-fragments.ts`, `e2e/catalog.spec.ts`, `e2e/lesson.spec.ts`, `e2e/not-found.spec.ts`,
  `e2e/leak.spec.ts`; edited `e2e/dashboard.spec.ts`.

### 3.3 Root and docs
- `.dockerignore` (drop `course`, rewrite its comment); `turbo.json` (`globalPassThroughEnv:
  ["ACADEMY_SKIP_ROOT_ENV"]`, `dev.passThroughEnv` += `COURSE_ROOT`, `@academy/web#test.inputs` +=
  `$TURBO_ROOT$/course/**`); `.env.example` (`ACADEMY_SKIP_ROOT_ENV`, `COURSE_ROOT`); `.github/workflows/ci.yml`
  (one step in `checks`, one in `e2e`); `README.md` ("Web app": content needs `--build`, `COURSE_ROOT`, the
  opt-out).
- `docs/adr/0009-course-content-in-the-web-app.md` (Proposed, revised in this phase).

## 4. Key decisions (each with its because)

**Q1. How the web gets the course: runtime reads of an allowlisted copy (ADR-0009).**
- Runtime `fs` reads from `COURSE_ROOT`, because the designed course-error state (catalog AC8, dashboard AC8)
  stays reachable and testable, `pnpm dev` shows content edits on reload, and the leak guarantee equals a
  snapshot's once the image holds only allowlisted files.
- The image gets the files from `scripts/export-course.ts` in the build stage: it runs `readCourse` on
  `/repo/course` and copies exactly `learnerFiles(tree)`; then `rm -rf /repo/course` **before** `next build`.
  Because the build never sees `course/`, tracing cannot ship it whatever Turbopack resolves (R1). Rejected:
  `COPY --exclude` (recursion unverified, still a denylist); a `find -name` copy (matches a
  `starter/**/task.md`).
- Root: `courseRoot(env, cwd)` returns `env.COURSE_ROOT` when set and non-empty (must be absolute, else
  `CourseReadError` "COURSE_ROOT: must be an absolute path"); otherwise `path.resolve(cwd, "../../course")`. Dev
  runs in `apps/web` (turbo); the image sets `ENV COURSE_ROOT=/app/course` (its cwd `/app/apps/web` would give
  the same path). `turbo.json` `dev.passThroughEnv` gains `COURSE_ROOT`.
- **ADR, not an ADR-0001 amendment**, because the decision is about the web's consumption and the image, not
  the lesson format; ADR-0009 records the `quiz.yaml` gap for #36.

**Loader location: `apps/web/lib/course/` plus a schema-only entry point in the package.** Because the loader
encodes web concerns (visible subset, view shapes) and the contract package should not change for each page
tweak; ADR-0001 item 1 holds. The package gains `./schema` (V1): additive, no format change, owned by Stepan
via CODEOWNERS. `@academy/db` and the web import it, so no web import reaches `validate.js` and the three
warnings go away (V2). Rejected: loader in the package (ADR-0009 alternatives); keeping the index import.

**Q3. Dashboard module rows: the designed first-run state, built from constants** (Stepan's decision). Ready
rows: title, "0 из N уроков", a 0 % decorative bar; course line "Пока нет пройденных уроков" with a progressbar
`aria-valuetext="0 из M"`; other rows: "Готовится" Badge. This is the prototype's `#state-first-run`
exactly; #79 says "From #30: F4 and F18.1-F18.2 as designed" **[#79]**. #35 replaces the constants (9.6).

**Q5. Not-found without a ready prototype: the minimal compliant behaviour** (deviation D1, #83). Top bar (no
`aria-current`), "Уведомления", `main` (`data-region`, `tabindex=-1`) with h1 "Страница не найдена" and one
outline Button link "Открыть курс" to the catalog; `<title>` "Страница не найдена"; status 404.
Mechanism: `app/(app)/not-found.tsx` (inside `(app)/layout.tsx`) and `app/(app)/[...missing]/page.tsx`, which
calls `requireSession(<path>)` and then `notFound()` (U-3); anonymous requests never reach it (the proxy
redirects first). Metadata (Arch A1): the catalog's and lesson's `generateMetadata` return `{ title:
"Страница не найдена" }` on exactly the branches where the page calls `notFound()`; the catch-all exports that
`metadata`; `not-found.tsx` exports it too (harmless if ignored).

**Q7. Accessible names "Навигация" (breadcrumb `nav`) and "Разделы урока" (tab list).** From the lesson
page's Copy table (`design/pages/lesson/acceptance.md:272,280`); the register gap is #69's. `lib/copy.ts`'s
header rule becomes "quoted from `design/flows/ia.md` or from the Copy table of a ready page's acceptance
notes" in the first step that adds such a string (step 22).

**Q8. Partial content failure: two classes.**
- *Structure* (`course.yaml`, a listed `module.yaml` or `lesson.yaml` missing, unreadable, a symlink, a YAML
  error or warning, failing the schema; a duplicate lesson id; not exactly one course): `CourseReadError`, the
  whole course is unavailable. Because visibility, ids and prerequisites need the whole tree.
- *Text* (a visible lesson's `theory.md` or `task.md` missing, unreadable, a symlink, not a learner file):
  `LessonTextReadError`, only that tab shows `#state-text-error`.

**Q9. The "Курс" link's `courseId`:** the id in the one `course.yaml`. `(app)/layout.tsx` reads the course
**only after** `session !== null` (Sec N3, Arch A2), so an anonymous or forged-cookie render never touches the
files. When the course fails, `CourseReadError.courseId` still carries the id if `course.yaml` itself parsed;
only when `course.yaml` is unreadable is "Курс" omitted (D2).

**Q10. Loading states: no `loading.tsx`, no Skeleton in #30** (Stepan: Skeletons go to #35). A `loading.tsx`
would turn the 404 of an unknown lesson and the `requireSession` redirect into streamed 200 responses (V4).

**Q11. The root `.env` is never read in isolated runs (revision 2, Sec S1, Ops O6).**
- `lib/root-env.ts` exports `ROOT_ENV_OPT_OUT = "ACADEMY_SKIP_ROOT_ENV"`, `InvalidRootEnvOptOutError` and
  `loadRootEnv({ env, file, log, load = process.loadEnvFile }): "loaded" | "skipped" | "absent"`:
  value `"1"` -> logs `root .env not loaded: ACADEMY_SKIP_ROOT_ENV=1` once and returns `"skipped"` without
  touching the file (not even `existsSync`); unset or `""` -> `"absent"` when the file does not exist, else
  `load(file)` and `"loaded"`; any other value -> `InvalidRootEnvOptOutError` "ACADEMY_SKIP_ROOT_ENV must be 1
  or unset, got <value>" (fail closed: a typo such as `true` must not silently load the file), where `<value>`
  is the value only when it has at most 8 characters and `<n characters>` otherwise, because a secret pasted
  into the wrong variable must not land in a build log (S N9). The file name stays out of the log line.
- `lib/root-env.ts` uses erasable syntax only (no enum, namespace or parameter property) and says so in its
  header comment, because Node's strip-only TypeScript loader loads it for `next.config.ts` (V11); anything
  else makes Next fall back to its legacy loader with a warning (Arch A2). The call sites' comments do not
  name the loader function (U-env-sites scans for it).
- `next.config.ts`, `playwright.config.ts`, `scripts/seed.ts` call it with `log = (line) => console.error(line)`
  and import `./lib/root-env.ts` (`../lib/root-env.ts` from `scripts/`) with the explicit extension, because
  that is the one spelling both of Next's config loaders accept (V11); `tsconfig.json` gains
  `allowImportingTsExtensions: true`. The existing comments at the three sites are kept and gain one sentence
  naming the opt-out.
- `turbo.json` `globalPassThroughEnv: ["ACADEMY_SKIP_ROOT_ENV"]`, because turbo strict mode drops undeclared
  variables and the flag must reach `build`, `typecheck` (`next typegen` loads the config, V9), `dev`, `seed`
  and `test:e2e`; passthrough variables do not change cache hashes.
- `.env.example` documents it in **comment lines only**, no `ACADEMY_SKIP_ROOT_ENV=` line ("isolated test runs
  export it in the shell; never put it in .env"), because CI copies the file to `.env` and a live line would
  put the flag into every later process (S N8).
- Proof that the flag reaches each process, **before** any process could read the file: [D] (13.5), a dry run
  that executes nothing, shows turbo passing the value `1` (V12); it runs before the first real build,
  typecheck, seed or e2e of step 1 and before every [U], [B], [S]. Then, at run time, the skip line in the
  build, seed and e2e output ([B], [S]). The negative (entry removed) is proven only in a scratch workspace
  without any `.env` (V19, 13.7), never in this checkout (13.6).
- Rejected: Stepan accepting reads (the orchestrator's decision); `env -u` or empty values only (still reads
  the file); `dotenv`-style per-tool flags (three spellings to keep in sync).

**Q12. YAML parsing never echoes content (revision 2, Sec S2).** `lib/course/yaml.ts` `parseYamlFile(text,
file)`: `const lineCounter = new LineCounter(); const doc = parseDocument(text, { lineCounter, prettyErrors:
false, logLevel: "error" })`; the first of `doc.errors` then `doc.warnings` becomes `CourseFileError(file,
"invalid YAML at line <lineCounter.linePos(issue.pos[0]).line>")`; only then `doc.toJS()`. Because `parse()`
logs warnings with the source line (V15), a warning on a `checks[].run` line would otherwise reach the web log on
every request; `prettyErrors: false` keeps the source line out of every message object. `logLevel: "error"`
for two reasons (V15, revision 3): at the default `"warn"` (and `"debug"`), `doc.toJS()` reports a collection key
such as `? [x]` through `process.emitWarning` with the key's text, a case that has no error or warning and so
passes the fail-closed rule; and `"silent"`, which would also stop that, drops the multi-document error.
Each reason is pinned by its own mutation (M-yaml-level, M-yaml-silent). One path is not gated by `logLevel`
(revision 4, Sec N10): yaml 2.9.1 `dist/parse/parser.js:178-179` prints every lexical token with `console.log`
when `process.env.LOG_TOKENS` is set. No unit test for it, because it is an environment switch, not an option
this code passes, and it cannot reach the web process (compose `web.environment` is an explicit list; turbo
strict mode drops undeclared variables); a test setting it would only show that the library logs. The export uses the same function. Consequence: a
lesson.yaml with a YAML warning passes `content:validate` (it uses `parse`) but shows "Не удалось загрузить
курс" in the web, so CI's `e2e` job fails on the catalog; recorded in ADR-0009.

**Markdown (react-markdown 10.1.0, remark-gfm 4.0.1, server components).**
- `<Markdown remarkPlugins={[remarkGfm, [remarkLessonHeadings, { kind }]]} disallowedElements={["img"]}
  components={...}>`, no `rehypePlugins`, no `skipHtml`, default `urlTransform`. Because the defaults render
  raw HTML as text and drop `javascript:` URLs (R§2.4), keeping "<actor>" etc. in `04-spec-adr-tasks/theory.md`
  visible (R3); images are disallowed so a lesson cannot make the learner's browser fetch a third-party URL
  before a design covers images (Sec N5; no lesson has one, R§2.2).
- No highlighter (the design system has no syntax colours).
- Components: `pre` -> `.code-block` (bordered `muted` box, header row with "Копировать", `pre` with
  `overflow-x: auto`, mono `text-sm`); `table` -> wrapper `div` with `overflow-x: auto`; `a` -> link with the
  link classes (8.4 "Links"), same tab.
- Direct deps: `react-markdown` `10.1.0` exact, `remark-gfm` `4.0.1` exact, `unified` `^11.0.0`, `remark-parse`
  `^11.0.0`, `unist-util-visit` `^5.0.0`, `mdast-util-to-string` `^4.0.0`; dev `@types/mdast` `^4.0.0`; one store
  entry each (`pnpm why <name> -r`).

**Heading rules (`components/markdown/headings.ts`, one remark plugin for render and for the table of contents).**
- theory: a depth-1 heading that is the document's first block is removed (V7); any other depth 1 -> h2; 2 -> h2;
  3 -> h3; 4-6 -> h4.
- task: 1 -> h2; 2 -> h3; 3-6 -> h4 (D3).
- Each theory h2 gets `id="sec-<n>"` (1-based) and `tabIndex=-1`; `sectionsOf(md)` runs the same plugin and
  returns `{ id, text }` for "Содержание" (theory only). Because one plugin produces both, they cannot drift.
- "Содержание" links: click and Enter prevent the default jump, focus the h2, `scrollIntoView`; the URL is not
  changed (AC18).

**Typed course error, not `error.tsx`.** Pages call the loader through `loadOrError`, render `<CourseError>` only
for `instanceof CourseReadError`, and rethrow anything else (R4).

**Caching and logging:** `getCourse = cache(() => readCourse(nodeCourseFs, courseRoot(process.env,
process.cwd())))` and `getLessonText = cache((dir, kind) => ...)` in `lib/course/server.ts`; nothing
process-wide. The wiring logs once per request `web: course read failed: <file>: <reason>` for a
`CourseReadError` and `web: lesson text read failed: <file>: <reason>` for a `LessonTextReadError` (Ops O5),
then rethrows; both messages carry only the relative file and the closed reason (5.4).

**Retry ("Повторить") and focus.** Unchanged from revision 1: `RetryButton({ errorTargetId })` calls
`router.refresh()` in a transition and sets a one-shot module-level flag `retryFocus = <success target id>`;
`FocusOnMount({ id })` next to each success target focuses it on mount when the flag names it; a refresh that
still fails focuses `errorTargetId` (R2).

**Top bar.** `TopBarNav` (client, `usePathname()`): "Главная" -> `/`, `aria-current="page"` iff path is `/`;
"Курс" -> `/courses/<courseId>`, `aria-current="page"` iff the path equals that; on lesson and not-found neither
**[#79]**. Links sit directly in the `nav`, no list (today's markup; the existing dashboard spec counts
`listitem` 0 until commit 9). Rendered only with a known `courseId` (Q9).

**Lesson tab state.** `searchParams.tab` `theory` or `task` selects it, anything else selects Теория.
`LessonTabs` (Radix Tabs, automatic activation) writes `?tab=` with `window.history.replaceState`, keeping other
params and the hash. `requireSession` gets the path with the validated `?tab=`. `Notifications` keeps a boolean
"session gone" in state and builds "Войти снова" during render from `usePathname()` + `useSearchParams()` (V5), so
the link follows a tab change made while the alert is shown (AC17); today it fixes the URL when the session read
resolves (`notifications.tsx:26`).

**Region cycle on the lesson page.** `main#main` (skip-link target, `tabindex=-1`) has no `data-region`; the
section "Урок" has it, with a visually hidden h2 "Урок", so `F6` lands on the breadcrumb "Курс". Catalog,
dashboard and not-found keep `data-region` on `main`.

**`generateMetadata`** in catalog and lesson pages starts with `await requireSession(path)`.

**Sources and links.** `toLessonView` keeps only sources whose URL parses with protocol `http:` or `https:`;
markdown links rely on `defaultUrlTransform`.

**shadcn components:** `pnpm dlx shadcn@4.23.0 add badge item tabs breadcrumb progress`, run in `apps/web`.
`collapsible` is not added (8.4). Each vendored file is edited to its 8.4 table in the step after `add`.

## 5. Data model

### 5.1 Server-side tree, files and errors (revision 2, Arch 7)
`CourseTree { id, title, description, dir, modules: ModuleNode[] }`; `ModuleNode { dir, number, module,
lessons: LessonNode[] }`; `LessonNode { dir, number, lesson }`. `dir` is relative to the course root, `number`
the two-digit prefix.

- **`CourseFs`** (`node-fs.ts`): `readText(root, rel)`, `isRegularFile(root, rel)`, `listDirs(root, rel)`. Every
  failure is one internal `CourseFileError { file: rel, reason }` with reason `missing`, `not a regular file`,
  `symlink or outside the course root` (the real path differs from `realpath(root) + "/" + rel`, so a symlink
  anywhere on the path, `..` or an absolute `rel` is refused) or `not a learner file` (`readText` and
  `isRegularFile` refuse a basename outside `LEARNER_FILES` = `course.yaml`, `module.yaml`, `lesson.yaml`,
  `theory.md`, `task.md`, and any path segment `checks` or `starter`; Sec N1), or `unreadable (<code>)`
  (revision 3, Arch-2). `LEARNER_FILES` lives in `files.ts` from step 6. `listDirs` is used once, to find the
  single course directory.
- **Errno mapping** (one pure function `fsFailureReason(error: unknown): string | undefined` in `node-fs.ts`,
  applied to every rejection of `realpath`, `lstat`, `stat`, `readdir`, `readFile`): `ENOENT`, `ENOTDIR` ->
  `missing`; `ELOOP` -> `symlink or outside the course root`; `EISDIR` -> `not a regular file`; any other
  `code` matching `^E[A-Z0-9]+$` (`EACCES`, `EPERM`, `EIO`, `EMFILE`, `ENAMETOOLONG`, ...) -> `unreadable
  (<code>)`, the code only, never the error's message (it holds the absolute path); an error without such a
  code returns `undefined` and is rethrown unchanged, because it is a programming error, not a file state
  (`loadOrError` rethrows it too, so it stays a 500). So every fs failure the designed states promise
  (ADR-0009 item 7, 4.Q8 "unreadable") reaches the course-error or text-error state with a true reason.
- **`readCourse(fs, root)`**: finds the one subdirectory with a regular `course.yaml` (`CourseReadError`
  "expected exactly one course, found N" otherwise), parses `course.yaml`, each listed `module.yaml`, each
  listed `lesson.yaml` through `parseYamlFile` and the schema; duplicate lesson ids fail. It maps every
  `CourseFileError` to `CourseReadError { file, reason, courseId? }`. It never opens a Markdown file.
- **`learnerFiles(tree)`** (`files.ts`, pure): `<course>/course.yaml`; for each module `<module>/module.yaml`;
  for each listed lesson `<lesson>/lesson.yaml`, `<lesson>/theory.md`, `<lesson>/task.md`. The export copies
  these (a missing Markdown file is skipped; any other `CourseFileError` is `CourseExportError`, exit 1); the
  server opens only paths on this list (`readCourse` the YAML ones, `readLessonText` the two Markdown names of a
  visible lesson), which U-leak checks on every opened path. That is ADR-0009 item 2's "same listing".
- **`readLessonText(fs, root, lessonDir, kind)`** maps `CourseFileError` to `LessonTextReadError { file, reason }`.

### 5.2 Visibility and statuses (S1, S3, ADR-0009 item 5)
Unchanged: visible iff module and lesson are `ready`; module "Доступен" iff it has a visible lesson; every
lesson "Не начат"; prerequisites resolved to visible lessons in `lesson.yaml` order; "Чему научитесь" only with
outcomes; next lesson = first visible lesson in course order, `null` when none.

### 5.3 Views (explicit fields only; no spread of `Lesson`, `Module`, `Course`)
Unchanged: `CourseIdentity { id, title }`; `CatalogView`; `DashboardView { courseId, next, totalLessons, modules:
{ id, title, isAvailable, lessonCount }[] }`; `LessonView` plus, server-side only, `dir`. Labels from
`lessonTypeLabels: Record<Lesson["type"], string>`.

### 5.4 Errors (`lib/course/errors.ts`)
`CourseFileError { file, reason }` (internal, never reaches a page); `CourseReadError { file, reason, courseId? }`,
message `<file>: <reason>`; `LessonTextReadError { file, reason }`; `CourseExportError { file, reason }`. Reasons
are a closed set: the five of 5.1 (`unreadable (<code>)` included), `invalid YAML at line <n>` (from `LineCounter`, 4.Q12), `schema: <issue.path
joined by "."> <issue.code>` (never `issue.message`: the duplicate-check message echoes the id, V16),
`duplicate lesson id <id>` (ids are slugs), `expected exactly one course, found <n>` (file `.`), `missing` for
the course root itself (file `.`, `COURSE_ROOT_FILE` in `errors.ts`, so a wrong `COURSE_ROOT` logs `web: course read
failed: .: missing` and the export stops with `CourseExportError: .: missing`, never an empty name; judge_code
round 1, Arch 3 / Ops 1), `must be an
absolute path` (file `COURSE_ROOT`, so the message reads `COURSE_ROOT: must be an absolute path`; coder phase,
in place of a reason that repeated the variable). No `cause`. Rule: no error text and no log line contains file contents (U-read canaries and
channel spies).

## 6. Pages

### 6.1 Catalog `/courses/[courseId]` (`design/pages/catalog`)
`requireSession("/courses/<courseId>")`; `getCourse()`; `CourseReadError` -> course-error state; id differs ->
`notFound()`; else render. `<title>` and h1 = course title; course error -> "Не удалось загрузить курс"; unknown
id -> "Страница не найдена" (A1).
- `main#main[data-region][tabindex=-1]`, one column `max-w-3xl`, gap `space-8`.
- Header: h1 (`tabindex=-1`, id `course-title`), description (muted).
- Module list `ol`: per module `a href="#<moduleId>"` "<number>. <title>" + Badge ("Доступен" secondary;
  "Готовится" outline muted).
- Per module `section#<moduleId>` (`aria-labelledby`): Separator; h2 `#<moduleId>-heading` (`tabindex=-1`) +
  the same Badge; summary; "Чему научитесь" (h3 + `ul`) when outcomes exist; then Empty "Уроки модуля готовятся"
  or `ItemGroup` (`ul aria-labelledby="<moduleId>-heading"`, as the prototype's line 116; Arch A5) of rows: `li > a.item` (title, description "<type label>, около N мин", Badge "Не начат"
  outline muted), then, with prerequisites, `p.item-note` "Сначала пройдите: " + links joined by ", ".
- `FragmentFocus` (client): on mount, `hashchange` and a click of a module-list link, it takes
  `location.hash.slice(1)`, `decodeURIComponent` inside try/catch (a malformed escape does nothing), then
  `document.getElementById(id + "-heading")` (never `querySelector`, Sec N4), focuses and scrolls it into view.
- Course error: `main` holds only the destructive Alert whose title is the h1 "Не удалось загрузить курс"
  (`tabindex=-1`, id `course-error-title`) and `RetryButton` ("Повторить", secondary sm).

### 6.2 Lesson `/courses/[courseId]/lessons/[lessonId]` (`design/pages/lesson`, M0)
`requireSession(<path>[?tab=])`; `getCourse()`; `CourseReadError` -> course-error composition (D2); course id
differs, lesson unknown or not visible -> `notFound()` (metadata "Страница не найдена"); else render. `<title>` =
lesson title. DOM (prototype order, `#state-m0`):
`main#main[tabindex=-1]` > `section[data-region][aria-labelledby=lesson-region-heading]` > h2.sr-only "Урок";
`Breadcrumb aria-label="Навигация"` ("Курс" -> `/courses/<id>`, module title -> `/courses/<id>#<moduleId>`,
`BreadcrumbPage` lesson title); lesson header (h1; meta: Badge outline type label, "около N мин"; "Чему
научитесь" h2 + `ul`; with more than two outcomes the first item, a `ul#outcomes-more hidden` with the rest and
"Показать все"/"Свернуть", 8.4 Collapsible); M0 line (muted `text-sm`); prerequisite Alert (warning) when any;
`LessonTabs` (`aria-label="Разделы урока"`): Теория, Задание.
- Each panel reads its text in a `try`/`catch` that renders the text error only for `instanceof
  LessonTextReadError` and rethrows anything else, as `loadOrError` does, so a session or programming error is
  never shown as "Не удалось загрузить текст урока" (Arch A4).
- Теория panel: `LessonTextReadError` -> destructive Alert "Не удалось загрузить текст урока" + `RetryButton`
  (success target the panel, failure target the button); else "Содержание" `nav.toc` and `article.prose`. Then
  "Источники" (also in the error case), omitted when no source survives the URL filter.
- Задание panel: same error handling; `article.prose` (task rule), no toc.

### 6.3 Dashboard `/` (`design/pages/dashboard`, first-run state) **[#79]**
As revision 1: `CourseReadError` -> h1, destructive Alert + `RetryButton` (success target `next-lesson-heading`);
`next === null` -> Empty "В курсе пока нет готовых уроков" (+ `FocusOnMount` for `main`); else the Card and the
progress section: h2 `#progress-heading` (`tabindex=-1`) "Пока нет пройденных уроков"; `<Progress value={0}
max={M} valueText="0 из M" aria-labelledby="progress-heading" />`; `ItemGroup` rows, each `a.item` to
`/courses/<id>#<moduleId>`: available -> title, "0 из N уроков", `ModuleBar` (decorative, `aria-hidden`, 0 %);
else title + Badge "Готовится". Tab order: skip link, "Академия", "Главная", "Курс", user menu, ["Войти снова"],
"Начать", module rows.

### 6.4 Not-found (`app/(app)/not-found.tsx`) **[#79]**
As revision 1 (Q5). Reached by: unknown course id, unknown or invisible lesson id, any unmatched path.

### 6.5 States unreachable in #30 (and their owner)

| Page | State / element | Why unreachable | Owner |
|---|---|---|---|
| catalog | `#state-failed-lesson`, "Не пройден" (AC7) | checks cannot close | #34 |
| catalog | "В процессе", "Пройден" | S1 | #35 |
| catalog | `#state-progress-unavailable`, AC9 | no progress read | #35 |
| catalog | `#state-loading` | Q10 | #35 |
| catalog | `#state-ready-no-lessons` | content only; none today | U-view, T-vis |
| dashboard | `#state-in-progress`, "Продолжить", counts above 0, `#state-all-passed`, AC6, AC9 | S1 | #35 |
| dashboard | `#state-loading` | Q10 | #35 |
| dashboard | `#state-before-catalog`, AC14 | retired by #30 **[#79]** | none |
| lesson | `#state-outcomes-collapsed` / `-expanded` | every real lesson has 1 outcome | U-outcomes |
| lesson | `#state-no-theory` | `ready` requires theory.md; unreadable = text error | none |
| lesson | `#state-no-sources` | only if every URL is non-http(s) | U-view |
| lesson | `#state-text-error` | reachable by content only (none today) | T-err part 3 (13.4) |
| lesson | every environment, check, quiz state | S2 | #31, #32, #34, #36 |

## 7. Leak defence (issue I2): four layers, each watched red

1. **Unit canary, layer 1 (U-leak).** `test/course-fixture.ts` writes a fixture course into a temp dir: canaries
   `CANARY-CHECKS-<n>` in `checks/*`, `quiz.yaml`, `starter/*`, an unlisted `notes.md`, an unlisted lesson
   directory, and in `lesson.yaml` `checks[].run`, `.title`, `.file`, `workspace.image`; a positive marker
   `VISIBLE-MARKER` in `theory.md`. A recording `CourseFs` wraps `nodeCourseFs`. Build every view and read both
   texts of every visible lesson. Assert: `util.inspect(views, { depth: Infinity })` and the texts contain no
   `CANARY-`; the marker is present; every path **requested** through `readText` or `isRegularFile` (the
   recorder logs a request before delegating) is in `learnerFiles(tree)`; `listDirs` was called exactly once,
   with `rel` `""` (the course-root listing, the one allowed request that is not a file; Arch A3). Mutations: M-leak-view (`toLessonView` spreads `node.lesson`) ->
   inspect assertion; M-leak-read (`readCourse` also requests `<lesson>/quiz.yaml` and ignores the
   `CourseFileError` the N1 name rule raises; one edit, applicable alone) -> requested-paths assertion.
2. **e2e response scan, layer 2 (E-leak).** `e2e/leak-fragments.ts` reads `<repo>/course` (explicit path) and
   builds forbidden fragments: from every regular file of at least 64 bytes under each lesson's `checks/`,
   `starter/` and `quiz.yaml`, and from `lesson.yaml` `checks[]` values (`run`, `title`, `file`, `rubric`,
   `task`, `verify`, `answers`) and `workspace`, take each maximal run of `[\p{L}\p{N} ,.:/_-]{24,}`, **trim it,
   keep it if still at least 24 characters**, dedupe, drop any fragment in the allowed corpus (every theory.md,
   task.md and the rendered YAML fields), then drop the entries of `KNOWN_COLLISIONS` (a literal list, each with
   its reason; today one: `abcdefghijklmnopqrstuvwxyz0123456789`, a generic id alphabet that also occurs in Next's
   server output, V17). Assert at least 1,000 fragments remain (print the count; 6,029 today). Before writing the
   list, the coder runs the fragment set once against the `t30` image's served `/_next/static/**` and records any
   further collision with its reason in the step report; a new entry needs the judge's agreement.
   **Scanner:** a map from the first 24 characters of each fragment to the fragments; for every body offset look
   up `body.slice(i, i + 24)` and confirm with `startsWith` (V17: 4.9 MB in 308 ms). Bodies are deduped by
   sha256 before scanning; the spec prints scanned bytes, distinct bodies and milliseconds.
   **Capture:** `page.on("response")` for same-origin responses; for every non-3xx response whose content type
   is HTML, JS, JSON, plain text or `text/x-component`, push `response.text()` into a pending list. Coder
   phase: Chromium keeps no body for a streamed fetch the page has consumed, so every RSC request (request
   header `rsc: 1`, navigations and prefetches) goes through a `page.route` that fetches it, records the body
   and fulfils the page with the same response; those requests are skipped in the response handler. Before each
   navigation and at the end of each test: `waitForLoadState("networkidle")`, then `Promise.allSettled(pending)`;
   a rejected read of such a response fails the test naming its URL, with one exception (O N2): a response
   whose request carries `next-router-prefetch: 1` and was issued after the last settle (a viewport prefetch
   fired after `networkidle`, evicted by the next navigation) is printed as "ignored late prefetch <url>" and
   not failed. Coverage never relies on prefetch.
   **Visits (one test each):** the catalog (full load); per visible lesson (one test per lesson, from
   `e2e/course.ts`) `?tab=theory`, then a click on Задание; one client navigation catalog -> first lesson ->
   breadcrumb "Курс", asserting at least one captured response with request header `rsc: 1` or content type
   `text/x-component` (Sec S4; prints the count); an unknown lesson id (status 404, body scanned); from commit 9,
   `/` with a positive control (the next lesson's title from `e2e/course.ts` occurs in the HTML body).
   **Positive control per lesson:** at least one fragment taken the same way from its theory.md occurs in a
   captured body. Each test sets `test.setTimeout(60_000)`.
   **Mutations:** M-leak-rsc (lesson page: `LessonTabs` props gain `leak?: unknown`, the page passes
   `leak={node.lesson}`; builds; red at the fragment `ACADEMY_CHECKS_DIR/verify_routing.py` on lesson
   `intro-models-effort`); M-leak-dash (commit 9: `FocusOnMount` props gain `leak?: unknown`, the dashboard page
   renders a `FocusOnMount` with `leak={tree.modules[0].lessons[0].lesson}` next to its content; coder phase:
   a page-level one, because the Card's own `FocusOnMount` has no tree in scope; red on `/` at the same
   fragment). The `academy-web:t30` image is rebuilt for each and the tester records "build passed".
3. **Image check, layer 3 (`scripts/check-image-course.sh`, CI `e2e`).** Lines start `C1`..`C4`, never a bare
   verdict token. C1: `find /app/course -type f` in the image (`docker compose run --rm --no-deps --entrypoint sh
   web -c ...`), sorted, equals the host's `tsx scripts/export-course.ts list ../../course`. C2: the host computes
   with Node `crypto` the sha256 of every file of at least 64 bytes under `course/**/checks/**`,
   `course/**/starter/**` and `course/**/quiz.yaml` (minus hashes equal to an allowlisted file); none occurs
   among the hashes of every regular file of the image's root filesystem (`/proc`, `/sys`, `/dev` and the
   bind-mounted `/etc/hosts` etc. are other devices, skipped by `-xdev`). Revision 3 (O8): the runner is `USER
   node`, which cannot read `/root`, `/lib/apk/db/lock`, `/etc/crontabs/root` (V20), so C2 runs as root and
   proves it covered everything:
   `docker compose run --rm --no-deps --user root --entrypoint sh web -c '<C2-IN>'`, where `<C2-IN>` is
   `find / -xdev -type f -exec sha256sum {} + 2>&1; echo "C2-RC $?"; echo "C2-COUNT $(find / -xdev -type f
   2>&1 | wc -l)"`. The in-container stderr is merged into stdout on purpose, so compose's own progress output
   cannot be confused with it. C2 passes only when: compose exits 0; the `C2-RC` line is `C2-RC 0`; every
   other line is a hash line (`^[0-9a-f]{64}  /`) or the `C2-COUNT` line (an error line such as `find: /root:
   Permission denied` fails C2 and is printed: it holds a path, never content); the number of hash lines
   equals `C2-COUNT` and is above 0. Prints the host count (above 0), the image count and the hashed count.
   Seen red: the same command without `--user root` (V20: rc 1, 5 error lines, 4,031 of 4,036). C3: the image's
   `COURSE_ROOT` is `/app/course`. C4: `find /app/course \( -name checks -o -name starter -o -name quiz.yaml \)`
   prints nothing (Sec N2: covers grader files under 64 bytes and a listing bug C1 would mirror). The script
   first runs `pnpm exec turbo run build --filter=@academy/lesson-schema`; in CI it runs after the seed step.
   Mutation M-img-copy (the export replaced by `cp -R course /out/course`) -> C1, C2, C4.
4. **Build check, layer 4 (`scripts/check-build-course.sh`, CI `checks`, after `pnpm build`).** N1: no
   `apps/web/.next/**/*.nft.json` lists a file under `<repo>/course/` (prints how many nft files it read, above
   0). N2: `apps/web/.next/standalone/course` does not exist. Mutation M-trace (`outputFileTracingIncludes: {
   "/*": ["../../course/**/*"] }`) -> N1, N2. Evidence row: removing the `turbopackIgnore` comments, report
   whether N1 or the warning count changes (U-1).

## 8. Design conformance plan

### 8.1 Catalog ACs
AC1 (E-cat-1), AC2 (E-cat-2), AC3 (E-cat-1), AC4 (E-cat-1; U-view), AC5 (E-cat-3), AC6 (E-les-1), AC8 (U-retry,
T-err), AC10 (E-cat-4), AC11 (E-cat-4), AC12 (E-cat-4 at 375/768/1280, light and dark); AC7, AC9 unreachable.

### 8.2 Lesson ACs (M0)
AC2 (E-les-3 at 1280 and 375), AC3 M0 row (E-les-3), AC4 (E-les-2), AC6 M0 part (E-les-3), AC13 M0 part (E-les-3:
`scrollWidth` = viewport at 375x667, 320x500 and 1280x800), AC14 (E-les-4 label; T-sr), AC15 (tester: Copy table
vs `lib/copy.ts`), AC16 (tester: raw colour grep), AC17 (E-les-2), AC18 M0 subset (E-les-2; "Показать все" unit
only). **Not M0, marked N/A by the tester:** AC1 (two panes), AC5, AC7, AC8, AC9, AC10, AC11, AC12, and AC13's
check-bar clause.

### 8.3 Dashboard ACs
AC1, AC2 (E-dash-1), AC3 first-run (E-dash-1), AC4 as "0 из M" (E-dash-1), AC5 (E-dash-1, including "row ->
catalog heading focused"), AC7 (U-view; T-vis), AC8 (U-retry, T-err), AC10-AC12 (existing), AC13 (E-dash-1).

### 8.4 Vendored components: every class, every state (revision 2, Arch 6)

Source: the radix-nova registry files (V18), read class by class against `design/system/proto.css` and
`design/system/README.md`. Where they disagree the README wins (proto.css's own bugs are #80's; one new
conflict below is noted for #83). Common rules for all five files:
- **Delete every focus utility** the registry ships: `outline-none`, `focus-visible:outline-*`,
  `focus-visible:border-ring`, `focus-visible:ring-*`, `ring-*`. The global rule in `app/globals.css` (2px solid
  `ring`, offset 2px; `[tabindex="-1"]` inset) is the only focus style; a utility would win over the base layer.
- **Delete every `dark:` utility**: every colour is a token with a dark value; no component picks a colour by
  theme (README "Dark-mode rules"), except the selected tab's shadow, which follows the Card's existing pattern.
- **Delete what #30 does not use** (2.2): unused variants and sub-components are removed from the file, so a
  later page cannot pick up an unreviewed default.
- **Motion:** hover colour transitions use `duration-150 ease-[cubic-bezier(0.2,0,0,1)]
  motion-reduce:transition-none` (README "Motion": `duration-fast` for hover), as `button.tsx` does.
- Each file gets a header comment "Mirrors design/system/proto.css `.<name>`" with the reasons below, as
  `card.tsx` and `button.tsx` have.

**Links** (`components/ui/link-styles.ts`, plain module): `inlineLinkClassName = "text-foreground underline
underline-offset-[0.2em] hover:decoration-2"` (proto `a`, `a:hover`; Tailwind preflight removes the underline).
Used by `.item-note` links, sources, toc links, prerequisite links and `.prose a` (CSS rule with the same values).
The prerequisite links sit in an `AlertTitle`, so `alert.tsx` loses the registry's `[&_a]:underline
[&_a]:underline-offset-3 [&_a]:hover:text-foreground` on `AlertTitle` and `AlertDescription`: `.x a` (0,1,1) would
outrank `.underline-offset-[0.2em]` (0,1,0). No other Alert holds a link (judge_code round 1, Arch 1).

**Badge** (`components/ui/badge.tsx`; uses: module status, lesson status, lesson type; never interactive)

| Part / state | Registry | proto.css / README | App |
|---|---|---|---|
| base box | `inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5` | `.badge`: inline-flex, gap `space-1`, `fit-content`, padding `space-0-5 space-2`, 1px transparent border, `radius-md`; no fixed height (22px: 2 + 16 + 2 + 2) | `inline-flex w-fit shrink-0 items-center gap-1 rounded-md border border-transparent px-2 py-0.5`; `h-5`, `rounded-4xl`, `overflow-hidden`, `justify-center` deleted |
| text | `text-xs font-medium whitespace-nowrap` | `text-xs` / `text-xs-line`, 500, nowrap | kept (Tailwind `text-xs` line height is 1rem = `text-xs-line`) |
| motion, focus, invalid | `transition-all focus-visible:* aria-invalid:* dark:aria-invalid:*` | none (not interactive) | deleted |
| icon slots | `has-data-[icon=...]` `[&>svg]:pointer-events-none [&>svg]:size-3!` | `.badge .status-icon` 1rem (only for status icons, none in #30) | deleted |
| default variant | `bg-primary text-primary-foreground [a]:hover:bg-primary/80` | `.badge` primary | deleted (unused) |
| secondary ("Доступен") | `bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80` | `[data-variant="secondary"]` | `bg-secondary text-secondary-foreground` (hover deleted: never a link) |
| outline (type label) | `border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground` | `[data-variant="outline"]` transparent, `foreground`, border `border` | `border-border bg-transparent text-foreground` |
| outline + tone muted ("Готовится", "Не начат") | none | `[data-tone="muted"]` `muted-foreground` | new prop `tone?: "muted"` -> `data-tone="muted"` + `text-muted-foreground` |
| destructive, ghost, link | present | not used in #30 | deleted |
| hover, focus-visible | n/a | n/a | none |
| dark | only via destructive (deleted) | tokens | tokens only |

**Item** (`components/ui/item.tsx`; uses: catalog lesson rows, dashboard module rows)

| Part / state | Registry | proto.css / README | App |
|---|---|---|---|
| `ItemGroup` element | `div role="list"` `flex w-full flex-col gap-4 has-data-[size=sm]:gap-2.5 has-data-[size=xs]:gap-2` | `ul.item-group`: flex column, no gap, no margin, padding or bullets | `ul` (implicit list role; children are `li`), `flex flex-col`; gap and size selectors deleted (Tailwind preflight removes margin, padding, bullets) |
| `Item` base | `group/item flex w-full flex-wrap items-center rounded-lg border text-sm transition-colors duration-100` | `.item`: flex, centre, gap `space-4`, padding `space-3 space-4`, 1px transparent border, `radius-md`, `foreground`, no underline; title at body size | `flex w-full items-center gap-4 rounded-md border border-transparent px-4 py-3 text-foreground no-underline transition-[background-color,color] duration-150 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none`; `flex-wrap` (badge would drop under the title), `text-sm` (shrinks the title), `rounded-lg`, `duration-100` deleted; `transition-colors` replaced (it also animates `outline-color`, so the focus ring faded in; judge_code round 1, Arch 4) |
| size variants | `default`/`sm`: `gap-2.5 px-3 py-2.5`; `xs`: `gap-2 px-2.5 py-2 ...` | one size | variants deleted (padding in base) |
| `variant` | `default` border-transparent, `outline`, `muted` | one look | variants deleted |
| row separation | none | `.item-group > li + li > .item { border-top-color: border; border-radius: 0 }` | `[li+li>&]:rounded-none [li+li>&]:border-t-border` on `Item` |
| hover (link row) | `[a]:transition-colors [a]:hover:bg-muted` | `a.item:hover`: `accent` bg, `accent-foreground` | `[a]:hover:bg-accent [a]:hover:text-accent-foreground` |
| focus-visible | `outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50` | global ring, 2px solid `ring`, offset 2px outside | deleted; global rule (E-ring) |
| `ItemContent` | `div` `flex flex-1 flex-col gap-1 group-data-[size=xs]/item:gap-0 [&+[data-slot=item-content]]:flex-none` | `span.item-content`: flex column, gap `space-1`, `flex: 1`, `min-width: 0` | `span`, `flex min-w-0 flex-1 flex-col gap-1` (spans as in the prototype markup) |
| `ItemTitle` | `div` `line-clamp-1 flex w-fit items-center gap-2 text-sm leading-snug font-medium underline-offset-4` | `span.item-title` weight 500, body size | `span`, `font-medium`; `line-clamp-1` deleted (it would cut long Russian titles at 375), `text-sm`, `leading-snug` deleted |
| `ItemDescription` | `p` `line-clamp-2 text-left text-sm leading-normal font-normal text-muted-foreground [&>a]:*` | `span.item-description` `text-sm` / `text-sm-line`, `muted-foreground` | `span`, `text-sm text-muted-foreground`; `line-clamp-2` and `leading-normal` (would set 1.5) deleted |
| `ItemActions` | `div` `flex items-center gap-2` | `span.item-actions` flex, wrap, centre, gap `space-2` | `span`, `flex flex-wrap items-center gap-2` |
| `ItemMedia`, `ItemSeparator`, `ItemHeader`, `ItemFooter` | present (`ItemSeparator` imports `separator`) | not used | deleted |
| item note | none | `.item-note` padding `0 space-4 space-3`, `text-sm`, `muted-foreground` | app composition in `lesson-row.tsx`: `p` with `px-4 pb-3 text-sm text-muted-foreground`, links `inlineLinkClassName` |
| dark | none | tokens (`accent` dark) | tokens only |

**Tabs** (`components/ui/tabs.tsx`, client; uses: the lesson's Теория / Задание)

| Part / state | Registry | proto.css / README | App |
|---|---|---|---|
| `Tabs` root | `group/tabs flex gap-2 data-horizontal:flex-col` | `.tabs` flex column, gap `space-2`, `min-width: 0` | `flex min-w-0 flex-col gap-2` |
| `TabsList` | `inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground h-8 ...` + `bg-muted` / `line` variant | `.tabs-list` inline-flex, **wrap**, centre, gap `space-1`, `fit-content`, padding `space-1`, `radius-lg`, `muted` bg, `muted-foreground` | `inline-flex w-fit flex-wrap items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground`; `h-8`, `p-[3px]`, `justify-center`, variants deleted |
| `TabsTrigger` box | `relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap` | `.tabs-trigger` inline-flex, centre, gap `space-2`, `min-height: control-height-sm` (2rem), padding `space-1 space-3`, 1px transparent border, `radius-md`, transparent bg, `text-sm`, 500, pointer (30px content, so no #80 overshoot) | `inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-md border border-transparent bg-transparent px-3 py-1 text-sm font-medium` |
| unselected colour | `text-foreground/60` (translucent), `dark:text-muted-foreground` | `muted-foreground` (no opacity on text, README) | `text-muted-foreground` |
| hover | `hover:text-foreground dark:hover:text-foreground` | none | deleted |
| selected | `data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground` + `shadow-sm` (default list) | `[aria-selected="true"]`: `background`, `foreground`, 1px `muted-foreground` border, `shadow-sm` (README "Selected tab": dark `border-input` 2.757:1 rejected) | `aria-selected:border-muted-foreground aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-[0_1px_2px_0_color-mix(in_oklab,var(--foreground)_8%,transparent)] dark:aria-selected:shadow-[0_1px_2px_0_color-mix(in_oklab,var(--background)_60%,transparent)]` (the prototype `--shadow-sm`, as `card.tsx` writes it); the `dark:data-active:*` pair deleted |
| focus-visible | `focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring` | global 2px ring outside with 2px offset; the 1px selected border hugs the pill | deleted; global rule (E-ring) |
| disabled, icons, vertical, `line` variant, `after:` underline bar | present | not used; README "No underline or bottom bar" | deleted |
| `TabsContent` | `flex-1 text-sm outline-none` | `.tabs-content` `min-width: 0`; panel `tabindex="0"` is a Tab stop; prose is `text-base` | `min-w-0`; `outline-none` deleted (the focused panel must show the ring, WCAG 2.4.7; E-ring), `text-sm` deleted |
| dark | see selected | tokens; shadow per theme | as selected row |
| behaviour | Radix 1.2.1: automatic activation, roving tabindex, arrows, Home, End; inactive panel `hidden`, children unmounted (V18) | README "Tabs" same keys | kept |

**Breadcrumb** (`components/ui/breadcrumb.tsx`; uses: the lesson page)

| Part / state | Registry | proto.css / README | App |
|---|---|---|---|
| `Breadcrumb` nav | `aria-label="breadcrumb"` before `{...props}` | `nav.breadcrumb aria-label="Навигация"` | default label deleted (a forgotten label must not be English); the page passes `aria-label={breadcrumbLabel}` |
| `BreadcrumbList` | `flex flex-wrap items-center gap-1.5 text-sm wrap-break-word text-muted-foreground` | `.breadcrumb ol` flex, wrap, centre, gap `space-1-5`, `text-sm`/`-line`, `muted-foreground`, no bullets | kept; `wrap-break-word` kept so a long lesson title wraps at 320 (AC13) |
| `BreadcrumbItem` | `inline-flex items-center gap-1` | plain `li` | `inline-flex items-center` |
| `BreadcrumbLink` | `transition-colors hover:text-foreground` | `.breadcrumb a` `muted-foreground`, underlined (global `a`), hover `foreground` + 2px decoration | `text-muted-foreground underline underline-offset-[0.2em] transition-[background-color,color] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:text-foreground hover:decoration-2 motion-reduce:transition-none` (not `transition-colors`: the ring appears at once, as on Item) |
| `BreadcrumbPage` | `span role="link" aria-disabled="true" aria-current="page" font-normal text-foreground` | `span aria-current="page"` `foreground`; `ia.md`: the current crumb is not a link; lesson AC5: every `aria-disabled` control has a reason | `span aria-current="page"` `text-foreground`; `role` and `aria-disabled` deleted |
| `BreadcrumbSeparator` | `li role="presentation" aria-hidden="true"` with a chevron icon (`IconPlaceholder`) | `li + li::before` "/" , `margin-right: space-1-5`, `muted-foreground` | kept as the element, children "/" instead of the icon (the icon import deleted); `text-muted-foreground`; with the list's `gap-1.5` the spacing equals the prototype's; `aria-hidden` keeps "/" out of the reading |
| `BreadcrumbEllipsis` | present | not used | deleted |
| focus-visible | none (global) | global ring | global rule |
| dark | none | tokens | tokens only |

**Collapsible** (outcomes "Показать все" / "Свернуть"): **not vendored.** Radix 1.2.1's `CollapsibleTrigger`
sets `aria-controls` only while open and `CollapsibleContent` renders its children only while open (V18), while
the prototype keeps `ul#outcomes-more hidden` in the DOM and `aria-controls="outcomes-more"` on the button in both
states; the registry file carries no styles at all. `components/lesson/outcomes.tsx` (client) builds it:

| Part / state | proto.css / README | App |
|---|---|---|
| trigger | `button.button.collapsible-trigger[data-variant="link"]` with `aria-expanded`, `aria-controls` | existing `Button variant="link"` (already proto `.button[data-variant="link"]`), `aria-expanded={isExpanded}`, `aria-controls="outcomes-more"` always |
| chevron | `::after` `space-1-5` square, 2px right and bottom border in `currentColor`, `rotate(45deg)`, `transform` transition `duration-fast` | `inline-flex items-center gap-1.5 after:size-1.5 after:border-r-2 after:border-b-2 after:border-current after:rotate-45 after:transition-transform after:duration-150 after:ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:after:transition-none` |
| collapsed | `aria-expanded="false"`, label "Показать все", second list `hidden` | same |
| expanded | `aria-expanded="true"` -> `rotate(-135deg)`, label "Свернуть" | `aria-expanded:after:-rotate-[135deg]`, list shown |
| hover | link: 2px underline | Button link variant's `hover:decoration-2` |
| focus-visible | global ring | global rule |
| reduced motion | duration 0 | `motion-reduce:after:transition-none` |
| dark | tokens | tokens |

**Progress** (`components/ui/progress.tsx`, client; use: the dashboard course bar)

| Part / state | Registry | proto.css / README | App |
|---|---|---|---|
| root | `relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted` | `.progress` `height: 0.5rem`, full width, `overflow: hidden`, 1px `input` border, `radius-full`, `secondary` bg | `relative block h-2 w-full overflow-hidden rounded-full border border-input bg-secondary` |
| indicator | `size-full flex-1 bg-primary transition-all`, `style={{ transform: translateX(-(100 - value)%) }}` | `.progress-indicator` block, full height, `width: --progress-value`, `primary`, `width` transition `duration-normal` (200ms), 0 under reduced motion | `block h-full bg-primary transition-[width] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none`, `style={{ width: <value / max * 100>% }}` |
| accessible value | `aria-valuetext` from Radix `getValueLabel`, default "0%" (V18) | `aria-valuetext="0 из M"` | required prop `valueText: string`; inside the component `getValueLabel={() => valueText}`, because a function prop cannot cross the server/client boundary (Arch A6) |
| states | value 0..max | first-run 0 only in #30 | 0; `max` is the total lesson count, at least 1 whenever the bar renders (`next !== null`) |
| dark | none | tokens | tokens only |
| decorative row bars | n/a | `span.progress[aria-hidden]` inside the row link | `components/dashboard/module-bar.tsx` (server) renders `span aria-hidden` with the class strings from `components/ui/progress-styles.ts`; a plain module, because a constant exported from a `"use client"` file becomes a client reference, not a string, in a server component |

**Focus targets with `tabindex="-1"`** (headings, `main`): the global inset rule. proto.css draws
`.prose h2:focus-visible` and `.checks-panel h2:focus-visible` outside (`proto.css:691`, lesson prototype
line 31), against the README "Focus ring" exception "elements focused programmatically with `tabindex="-1"`
(`main`, headings) draw the ring inset". README wins: inset; the orchestrator appends this to #83.

**How the tables are checked:** E-ring (13.2) asserts the computed focus style of a catalog row link, a tab
trigger and the Теория panel; the tester's conformance run compares computed styles per state of each table at
375 and 1280, light and dark, against the prototypes, and lists every row as matched or as a named exception.

## 9. Design deviations, waivers, follow-ups

### 9.1 Deviations (PR body "Design deviations", ADR-0006 item 5), follow-up #83 (filed)

| Id | Deviation | Because |
|---|---|---|
| D1 | not-found built from the copy spec without a prototype | `ia.md` makes it an app-shell state; Next's 404 after #30 is a dead end |
| D2 | the lesson page's course-read failure uses the catalog AC8 composition; top bar without "Курс" when `course.yaml` is unreadable | the lesson design has no course-error state |
| D3 | task.md `###` renders as h4, styled one step below `.prose h3` | `proto.css` has no `.prose h4`; two task files use `###` |

For #83 (the orchestrator appends, no new issue): the `.prose h2:focus-visible` offset conflict of 8.4.

### 9.2 Not deviations, recorded
- Unreachable states (6.5): owned by #35 and later issues.
- "Навигация", "Разделы урока": from the lesson page's Copy table (Q7).
- The dashboard `#state-before-catalog` and AC14 end with #30 **[#79]**.
- The Collapsible and Progress implementation choices (8.4) change no rendered state of the prototype.

### 9.3 Copy (`lib/copy.ts`, each with its source comment), by the step that adds it
- Step 22 (commit 6, with the copy button): "Копировать", "Не скопировано, выделите текст вручную"; the header
  rule change (Q7).
- Step 26 (commit 7): "Курс", "Не удалось загрузить курс", "Открыть курс", "Страница не найдена", "Чему
  научитесь", "около N мин" (function), lesson type labels, "Доступен", "Готовится", "Уроки модуля готовятся",
  "<type>, около N мин" (function), "Не начат", "Сначала пройдите: ".
- Step 35 (commit 8): "Урок", "Навигация", "Разделы урока", "Теория", "Задание", "Окружение и проверки появятся в
  следующей версии платформы", "Содержание", "Источники", "проверено <date>" (function), "Не удалось загрузить
  текст урока", "Показать все", "Свернуть".
- Step 43 (commit 9): "Следующий урок", "Начать", "Пока нет пройденных уроков", "N из M уроков", "N из M"
  (functions).
- Existing kept: "Повторить", "В курсе пока нет готовых уроков". Nothing invented; nothing unused.

### 9.4 PR body texts (proposed)
```
Scope note: the issue body's "workspace stub on the right" is dropped. The lesson page follows
design/pages/lesson "M0 lesson" (one column: theory and task, no right pane, the line "Окружение и проверки
появятся в следующей версии платформы"), Stepan's decision of 2026-10-30. The environment arrives with #31/#32.

Progress: every lesson shows "Не начат" and every prerequisite is listed as not passed, with no database read
(Stepan, 2026-10-30); #35 replaces this with real progress. The dashboard shows the first-run state.

Isolation: ACADEMY_SKIP_ROOT_ENV=1 makes next.config.ts, playwright.config.ts and scripts/seed.ts skip the root
.env (lib/root-env.ts); isolated test runs export it together with COMPOSE_ENV_FILES=/dev/null.
```

### 9.5 Re-check against #79 once it merges
The orchestrator diffs `design/` on `main` against `1e51f71` and confirms, before the coder phase:
1. top bar from #30: "Академия", "Главная", "Курс", user menu on dashboard, catalog, lesson, not-found;
   `aria-current` rules (4, Top bar);
2. not-found ships with #30 with the top bar; `F6` `main` lands on "Открыть курс" (6.4);
3. dashboard "From #30: F4 and F18.1-F18.2 as designed", AC1-AC6, AC8, AC9 apply from #30 (Q3, 6.3);
4. dashboard tab order "from #30" (6.3);
5. AC14 / `#state-before-catalog` apply before #30 only (9.2);
6. no other change to catalog or lesson acceptance notes, `design/system/proto.css` or the README sections 8.4
   relies on (if any, the design is revised before the coder).

### 9.6 Text for #35's body (orchestrator appends)
```
From #30: the dashboard renders the first-run state with constants (course line "Пока нет пройденных уроков",
module rows "0 из N уроков", bar 0, catalog rows "Не начат", every prerequisite listed); #35 replaces them with
values read per ADR-0007 item 5. The Skeleton loading states of dashboard and catalog belong here, around the
progress read (see #30 design 4.Q10).
```

## 10. Failure modes

| Failure | Mitigation | Caught by (seen red) |
|---|---|---|
| `checks/`, `quiz.yaml`, `starter/` reach the image | export by structure; `course/` deleted before `next build` | C1, C2, C4 (M-img-copy) |
| tracing copies `course/**` into the standalone | build stage has no `course/`; `turbopackIgnore` in `node-fs.ts` | N1, N2 (M-trace) |
| a view or a client prop carries `checks`, `run`, file names | field-by-field views; server-only tree | U-leak (M-leak-view), E-leak (M-leak-rsc, M-leak-dash) |
| loader opens a grader file | listing from the tree; fs-level name allowlist | U-leak (M-leak-read), U-fs (M-fs-names) |
| symlink `theory.md -> ../checks/x` | realpath equality on every read and in the export | U-fs (M-link), U-text, U-export |
| quiz answers outside `checks/` | not in the allowlist; #36 owns the gap | C1, C2, C4, E-leak |
| a YAML warning or error prints a grader line to the log | `parseDocument` with `prettyErrors: false`, `logLevel: "error"`, warnings fail closed | U-read spies (M-yaml-log, M-yaml-silent, M-msg-yaml) |
| `toJS()` logs a collection key from `lesson.yaml` | `logLevel: "error"` (V15) | U-read collection-key case (M-yaml-level) |
| a course file exists but cannot be read (`EACCES`, `EIO`) | errno mapping to `unreadable (<code>)` (5.1) | U-fs, U-read, U-text (M-fs-unreadable) |
| C2 scans only what `node` can read | C2 as root, rc, error lines and count compared | C2 (without `--user root`, V20) |
| a schema message echoes a value | reason from `path` + `code` only | U-read (M-msg-schema) |
| raw HTML or `<script>` in a lesson | react-markdown default (text), no rehype-raw | U-md (M-skiphtml, M-raw) |
| a lesson image fetches a third-party URL | `disallowedElements: ["img"]` | U-md (M-img) |
| `javascript:` URL in a source or a link | http(s) filter; `defaultUrlTransform` | U-view, U-md |
| course error shown for a DB/session failure | typed `instanceof`, rethrow others | U-page-error (M-catch-all) |
| 404 turns into 200 | no `loading.tsx` | E-nf-1 status |
| text read failure invisible to the operator | logged once per request | T-err part 3 |
| a second course directory | `CourseReadError` "found 2" | U-read |
| `COURSE_ROOT` unset or relative | Dockerfile `ENV`; fallback; relative refused | U-root; C3 |
| content edited, image stale | README: `docker compose up -d --build` | documented |
| a role's build, dev server, seed or e2e reads Stepan's root `.env` | `ACADEMY_SKIP_ROOT_ENV=1` via `loadRootEnv`, turbo global passthrough, [D] before every run | U-env (M-env-flag), U-env-sites (M-env-site, M-env-walk), [D] and the scratch workspace (M-env-turbo, V19), skip line in [B]/[S] |
| a guard mutation makes a real entry point read the root `.env` | 13.6: such mutations never run in this checkout; M-env-flag/M-env-site only under `vitest run lib/root-env.test.ts` | protocol (13.6, 13.7) |
| a compose call reads the root `.env` | `COMPOSE_ENV_FILES=/dev/null`; the wrapper refuses without it | V13 rehearsal |
| an opt-out typo silently loads the file | any value other than `1` or unset throws | U-env |
| a vendored default overrides the focus ring | focus utilities deleted (8.4) | E-ring (M-ring-tabs, M-ring-item) |
| tester or coder touches Stepan's stack, image, DB or `.env` | 13.6 | before/after diff |

## 11. Rollout and rollback

After merge, on Stepan's machine, from the repository root: `pnpm install` (new dependencies for `pnpm dev`
and `pnpm test`), `docker compose up -d --build --wait` (no migration; the image now carries `/app/course`), sign
in, open `http://127.0.0.1:3080/courses/ai-for-developers`. Check: `bash apps/web/scripts/check-image-course.sh`
prints C1-C4 OK lines (it reads the current course, so it stays right when #42 adds lessons). Every later content
change: the same `up -d --build`. Rollback: revert the PR, `pnpm install`, rebuild; nothing persistent changes.
`.env` needs nothing new; `ACADEMY_SKIP_ROOT_ENV` is never put in it.

## 12. Risks

- RK1 `turbopackIgnore` behaves differently than the warning says (U-1): the build stage has no `course/`; N1
  guards the host build.
- RK2 shadcn 4.23 `add` rewrites `globals.css` or adds packages: U4 drift test; `git diff package.json`.
- RK3 a vendored default survives the edit: 8.4 tables plus E-ring and the tester's per-state comparison.
- RK4 #79 changes something listed in 9.5: re-check before the coder phase.
- RK5 Content work in parallel (#42): every e2e expectation is computed from `<repo>/course`; C1 compares
  against the host listing.
- RK6 E-leak collision on correct code: trimmed fragments, a named collision list, a pre-run against the served
  static files (7.2).
- RK7 Copy denial announcement unverified in screen readers: tester T-sr.
- RK8 Next changes its config loader: the `.ts`-extension import works in both of today's loaders (V11); a
  failure shows at the first `pnpm build`.

## 13. Tests (every row has a mutation that turns it red at the stated assertion)

Mutation protocol (#29 §13): each mutation alone, on a file backed up first to the scratchpad (`cp` then
`cmp` before mutating), restored from the backup and proven with `cmp`; never `git checkout` a file of this
diff; mutations written against formatted code; image mutations build only `academy-web:t30`, and the tester
records that the build passed before reading the red assertion.

### 13.1 Unit (Vitest, `pnpm test`)

| Id | File | Behaviour | Mutation -> red at |
|---|---|---|---|
| U-env | `lib/root-env.test.ts` | temp dir with a canary file `ACADEMY_ENV_CANARY_<random>=1`: flag `"1"` -> returns `"skipped"`, the injected `load` is never called, `log` got exactly the skip line; unset and `""` with the file -> real `process.loadEnvFile` sets the canary (deleted after), returns `"loaded"`, no log; no file -> `"absent"`, no load; `"true"` and `"0"` -> `InvalidRootEnvOptOutError` naming the variable and the value; a 40-character value -> the message holds `40 characters` and not the value (S N9). Never touches the root `.env` (temp dir only) | M-env-flag (ignore the flag) -> the "never called" assertion; M-env-echo (always print the value) -> the 40-character case |
| U-env-sites | same file | walking from the repository root the required roots `apps/` and `packages/` (a missing required root fails the test) and the optional root `services/` only if it exists (revision 4: it has no tracked file until the first service lands, so CI's checkout has no such directory; no other root is optional) (skipping `node_modules`, `dist`, `.next`, `.turbo`, `coverage`, `playwright-report`, `test-results`; files `.ts .tsx .mts .cts .js .mjs .cjs`): no file other than `apps/web/lib/root-env.ts` contains the loader name, and no file imports or requires `dotenv` (S N7); `next.config.ts`, `playwright.config.ts`, `scripts/seed.ts` each contain `loadRootEnv(`; the visited set includes `apps/web/next.config.ts` and `packages/db/src/vocabulary.ts` (one positive control per required root). Needles are built from parts (`["loadEnv", "File"].join("")`, the `dotenv` pattern from a `RegExp` of parts), so the test file holds none (Arch A1) | M-env-site (`next.config.ts` back to its direct `process.loadEnvFile`) -> the first assertion, naming the file; M-env-walk (walk only `apps/web`) -> the positive control |
| U-root | `lib/course/root.test.ts` | absolute `COURSE_ROOT` wins; unset or `""` -> `<cwd>/../../course`; relative -> `CourseReadError` naming `COURSE_ROOT` | accept relative -> error case |
| U-fs | `lib/course/node-fs.test.ts` | on the fixture: `readText` of a learner file returns it; missing -> `CourseFileError` `missing`; a directory -> `not a regular file`; `theory.md` symlinked to `checks/x`, a symlinked lesson dir, `a/../b` -> `symlink or outside the course root`; `<lesson>/quiz.yaml`, `<lesson>/checks/x.md`, `<lesson>/starter/task.md` -> `not a learner file`; a learner file with mode `000` -> `unreadable (EACCES)` (the case first asserts `process.getuid() !== 0` and fails, not skips, if run as root, since root reads mode `000`; CI's `checks` job and the coder run as non-root; an `afterEach` restores mode `0o644` on the recorded path, revision 4 A6); `fsFailureReason` on synthetic errors: `{ code: "EIO" }` -> `unreadable (EIO)`, `ENOTDIR` -> `missing`, `ELOOP` -> the symlink reason, a `TypeError` -> `undefined`; no reason contains the temp-dir path (Arch-2) | M-link (drop the realpath rule) -> symlink cases; M-fs-names (drop the name rule) -> `quiz.yaml` and `starter/task.md` cases; M-fs-unreadable (every non-`ENOENT` code mapped to `missing`) -> the `EACCES` and `EIO` cases |
| U-files | `lib/course/files.test.ts` | `learnerFiles(readCourse(fixture))` equals a **literal** list written in the test (course.yaml, two module.yaml, the listed lessons' three files), never `checks/`, `quiz.yaml`, `starter/`, `notes.md`, the unlisted lesson dir | M-list-all (also list every file of a lesson dir) -> exact-set assertion |
| U-read | `lib/course/read.test.ts` | every case runs with spies on `process.emitWarning`, `console.log/info/warn/error/debug` and `process.stderr.write`; asserts no captured argument contains `CANARY`. Cases: valid fixture -> numbers "00"/"01"; lesson.yaml with two checks of id `canary-dup` -> `<file>: schema: checks custom`, no `canary-dup`; broken flow sequence with `CANARY-YAML-E` on the bad line -> `invalid YAML at line 3`, no canary; unresolved tag `run: !weird CANARY-YAML-W` -> `invalid YAML at line <n>` (warning fails closed), no canary on any channel; two YAML documents -> `invalid YAML at line 2`; a `lesson.yaml` with a collection key `? [CANARY-KEY]` (S7): whatever the read result, no captured argument on any channel contains `CANARY-KEY`, and if it fails, the reason holds no canary; symlinked `lesson.yaml` -> `CourseReadError` `symlink or outside the course root`; `module.yaml` with mode `000` -> `CourseReadError` `unreadable (EACCES)`, `courseId` set (Arch-2; mode restored in `afterEach`, as in U-fs); missing `module.yaml` -> `missing`, `courseId` set; bad `course.yaml` -> `courseId` undefined; duplicate lesson id; zero and two courses | M-msg-schema (`issue.message`) -> `canary-dup` assertion; M-msg-yaml (`prettyErrors: true` and the error's `message`) -> `CANARY-YAML-E` assertion; M-yaml-log (`parse(text)` instead of `parseDocument`) -> the spy assertion on the tag case (and its "fails closed" assertion); M-yaml-silent (`logLevel: "silent"`) -> the two-documents case; M-yaml-level (`logLevel` removed, default `"warn"`) -> the spy assertion on the collection-key case; M-id (drop `courseId`) -> module case |
| U-view | `lib/course/view.test.ts` | as revision 1 (S3, prerequisites, next lesson, counts, `javascript:` source) | M-vis, M-prereq, M-src |
| U-text | `lib/course/text.test.ts` | missing theory.md -> `LessonTextReadError` `missing`; symlinked theory.md -> `LessonTextReadError` `symlink or outside the course root` (not `CourseReadError`, not `CourseExportError`); theory.md with mode `000` -> `LessonTextReadError` `unreadable (EACCES)` (mode restored in `afterEach`, as in U-fs) | M-map (rethrow `CourseFileError` unmapped) -> class assertion |
| U-leak | `lib/course/leak.test.ts` | layer 1 (7.1) | M-leak-view, M-leak-read |
| U-export | `scripts/export-course.test.ts` | `export` on the fixture: destination file list equals `list`; a symlinked theory.md -> exit 1, stderr names the file and `CourseExportError`, no fixture content | M-list-all (shared) |
| U-md | `components/markdown/lesson-markdown.test.tsx` | as revision 1 (headings, ids, `sectionsOf`, table, code block with "Копировать", `<actor>` as text, no `script`, no `javascript:` href, real-course html nodes) plus `![x](https://example.com/a.png)` renders no `img` | M-skiphtml, M-raw, M-head as revision 1; M-img (drop `disallowedElements`) -> image case |
| U-copy | `components/markdown/copy-button.test.tsx` | rejection -> denial label, focus stays; resolve -> label unchanged | ignore rejection -> label |
| U-tabs | `components/lesson/lesson-tabs.test.tsx` | initial tab from prop; Задание -> `replaceState` with `?tab=task`, other params and hash kept, `history.length` unchanged; arrows move selection | M-push -> length |
| U-outcomes | `components/lesson/outcomes.test.tsx` | 1 and 2 outcomes: all shown, no button; 3: first shown, `ul#outcomes-more` hidden, button `aria-expanded="false"` **and** `aria-controls="outcomes-more"`; click -> "Свернуть", `aria-expanded="true"`, list shown | M (threshold `> 1`) -> 2-outcome case; M-controls (`aria-controls` only when expanded, Radix's behaviour) -> collapsed `aria-controls` assertion |
| U-topnav | `components/top-bar-nav.test.tsx` | as revision 1; plus no `li` inside the nav | M (`startsWith`) -> lesson case |
| U-retry | `components/retry-button.test.tsx` | as revision 1 | M (no flag) -> success case |
| U-page-error | `lib/course/page-error.test.ts` | `CourseReadError` -> error view; `SessionReadError` rethrown | M-catch-all -> rethrow case |
| U-guard | existing `app/entry-points.test.ts` | the three new pages and the catch-all are scanned and guarded | M13 on the catalog page |
| U4 | existing `app/globals.test.ts` | token block unchanged after `shadcn add` | existing |

### 13.2 e2e (Playwright against the `t30` stack; `pnpm test:e2e`)
`e2e/course.ts` builds expectations from `path.join(import.meta.dirname, "../../../course")` through `readCourse`
and the views; never from `COURSE_ROOT`; no counts or titles hard-coded.

| Id | Spec | Behaviour (AC) | Mutation -> red at |
|---|---|---|---|
| E-cat-1 | catalog | as revision 1 (AC1, AC3, AC4); each module's lesson list has the accessible name of its h2 (`getByRole("list", { name: "<number>. <module title>", exact: true })`; the Badge sits outside the h2 as in the prototype, Arch A5) | M (Empty and list both rendered) -> "no list" |
| E-cat-2 | catalog | module link: heading focused, hash `#<moduleId>`; arrival with `#introduction` focuses that heading; `#%E0%A4` (malformed escape) loads without a page error (AC2). No dashboard part (Arch 2) | M (no FragmentFocus) -> focus assertion |
| E-cat-3 | catalog | as revision 1 (AC5) | M (note before the row) -> Tab order |
| E-cat-4 | catalog | as revision 1 (AC10-AC12) | M (`aria-current` on both) |
| E-ring | catalog + lesson | keyboard focus (Tab) on the first catalog row link, the Теория tab trigger, and the Теория panel (Tab from the tab list): each matches `:focus-visible` with computed `outline-style` `solid`, `outline-width` `2px`, `outline-offset` `2px`; the row link's `box-shadow` is `none` | M-ring-tabs (keep the registry's `outline-none` on `TabsContent`) -> panel `outline-style`; M-ring-item (keep `focus-visible:ring-[3px]` on `Item`) -> row `box-shadow` |
| E-nf-1 | not-found | unknown lesson id, unknown course id, `/no/such/path`: status 404, `<title>` and h1 "Страница не найдена", top bar with no `aria-current`, "Открыть курс" -> catalog; `F6` to `main` lands on "Открыть курс" | M (`loading.tsx` in the image) -> status 200 |
| E-les-1 | lesson | issue I3, as revision 1 (AC6) | M (row href `?tab=task`) -> tab |
| E-les-2 | lesson | `?tab=task` opens Задание; `?tab=checks`, `?tab=x` open Теория; selecting Задание: URL `?tab=task`, `history.length` unchanged, reload keeps it; **"Войти снова" follows the tab:** `get-session` is fulfilled `null` at once, the test waits for the "Войти снова" link (its `next` decodes to the lesson path without `?tab=task`), then selects Задание and asserts `next` decodes to `<lesson path>?tab=task`; "Содержание" and "Копировать" keep `?tab=` (AC4, AC17, AC18) | M-push -> length; M-notif (today's `notifications.tsx`, restored from the step-34 backup) -> the second `next` assertion |
| E-les-3 | lesson | as revision 1 (AC2, AC3, AC6, AC13 width at 375x667, 320x500, 1280x800); `F6` -> "Академия" -> "Курс" (crumb) -> "Академия"; after the second press `document.activeElement.closest("[data-region]")` is the `section` whose name is "Урок" | M-region-both (`data-region` on `main` and the section) -> third press lands on "Курс" again; M-region-moved (`data-region` on `main`, not the section) -> the `closest` assertion |
| E-les-4 | lesson | as revision 1 (AC14 label) | M ignore rejection |
| E-les-5 | lesson | as revision 1 (F6.2, F6.3) | M (alert removed) |
| E-leak | leak | layer 2 (7.2): catalog, every lesson, client navigation with an RSC body, not-found (commit 8); `/` with its positive control (commit 9) | M-leak-rsc; M-leak-dash |
| E-dash-1 | dashboard (edited, commit 9) | as revision 1 plus: a ready module row click lands on the catalog with that module's heading focused and hash `#<moduleId>` (dashboard AC5) | M (Card from the second lesson) -> title; M (rows link without hash) -> heading focus |

Existing specs (protection, sign-in, sign-out, dashboard E-dash-2..4) stay green at every commit; until commit 9
the old dashboard test (Empty, `listitem` 0) stays as it is (the top bar adds no list items, U-topnav).

### 13.3 Image and build checks
C1-C4 (7.3) in CI `e2e`; N1-N2 (7.4) in CI `checks`. Mutations M-img-copy, M-trace.

### 13.4 Tester-only runs (once, recorded in the test report)
- **T-err part 1 (AC8 catalog, dashboard, lesson D2), image:** under 13.6, after `lsof -nP -iTCP:3231
  -sTCP:LISTEN` prints nothing: `t30 run -d --rm --no-deps --name academy-t30-web-err --publish
  127.0.0.1:3231:3000 -e COURSE_ROOT=/app/course-missing web` (V13). With `E2E_BASE_URL=http://127.0.0.1:3231` and
  the storage state, visit `/`, the catalog and a lesson: designed error states, top bar works ("Курс" only per
  Q9). `docker logs academy-t30-web-err 2>&1 | grep -c "web: course read failed:"` is at least 1 and the log
  holds no line of any course file. Then `docker stop academy-t30-web-err` (before any teardown).
- **T-err part 2, broken `lesson.yaml` under `pnpm dev`:** scratch copy `cp -R course <scratchpad>/course-copy`
  (absolute paths written out, no shell variables across calls);
  `bash -c '. "<H>" && exec env PORT=3232 COURSE_ROOT=<scratchpad>/course-copy pnpm dev'` started with the Bash tool's
  `run_in_background` (no `set -m`); break one `lesson.yaml` in the copy, reload: error state; fix it, press
  "Повторить": the page recovers and the h1 / Card heading has focus. Before starting, record
  `pgrep -f 'turbo run dev|next dev' | sort > <scratchpad>/dev-pids-before.txt` (Stepan's own processes, if any, are in it
  and are never touched). Stop (O N4): stop the background task itself, then `lsof -tiTCP:3232 -sTCP:LISTEN |
  xargs kill` for a listener it left; afterwards `lsof` prints nothing and `pgrep -f 'turbo run dev|next dev' | sort | comm
  -13 <scratchpad>/dev-pids-before.txt -` prints nothing (no `turbo run dev` or `next dev` of this run is left).
- **T-err part 3, text error (Arch 8, O5):** same dev server, `mv` the first visible lesson's `theory.md` in the
  copy to `theory.md.off`: the Теория panel shows the destructive Alert "Не удалось загрузить текст урока" and
  "Повторить", "Источники" still shown, Задание renders its text; the dev server output has `web: lesson text read
  failed: <file>: missing` and no file content; move the file back, press "Повторить": the panel renders and
  has focus. Screenshots at 375 and 1280, light and dark, join the conformance set.
- **T-vis (I1, S3, AC7, ready-no-lessons):** as revision 1, with `pnpm dev` started as in part 2.
- **T-sr (AC14):** copy denial announced by VoiceOver (Safari) and NVDA (Chrome); also whether VoiceOver
  announces the `ul` lists (WebKit drops list semantics on `list-style: none`); a gap is a DESIGN follow-up.
- **Design conformance (ADR-0006 item 5):** screenshots of prototype and app at 375 and 1280, light and dark, for
  every reachable state of 6.1-6.4 and `#state-text-error`; every AC marked (8.2's N/A list included); token
  block diff; raw colour grep; every 8.4 table row matched or a named exception.

### 13.5 Check sets used in section 14 (every command runs as `bash -c '. "<H>" && ...'`, 13.6)
- **[D]** (revision 3, S6; from step 1, before the first real build, typecheck, seed or e2e, and first in every
  [U], [B], [S]) `pnpm exec turbo run build --filter=@academy/web --dry=json | node -e '<read stdin; print
  JSON.stringify(d.globalCacheInputs.environmentVariables.passthrough)>'` prints exactly
  `["ACADEMY_SKIP_ROOT_ENV=6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b"]` (sha256 of `1`,
  V12). A dry run executes no task, so no entry point runs; anything else (`null`, `[]`, another hash) stops the
  step before any process could read the file. Next to it, `grep -cE '^(ACADEMY_SKIP_ROOT_ENV|COURSE_ROOT)='
  .env.example` prints `0` (S N8).
- **[U]** `pnpm lint && pnpm typecheck && pnpm test`.
- **[B]** `env -u BETTER_AUTH_SECRET -u DATABASE_URL pnpm exec turbo run build --force 2>&1 | tee
  <scratch>/build.log` (`--force`, O N1: pass-through variables are not hashed, so a cache hit would replay an
  earlier unflagged log), then
  `grep -c "root .env not loaded: ACADEMY_SKIP_ROOT_ENV=1" <scratch>/build.log` is at least 1 (from step 1),
  `grep -c "Dynamic filesystem access" <scratch>/build.log` prints `0` (from step 2), then
  `bash apps/web/scripts/check-build-course.sh` (from step 15).
- **[C]** `pnpm content:validate`.
- **[G]** from the repository root, `rg -n "lib/(auth(/index)?|session|course/server)['\"]" apps/web --glob '**/*.test.*' --glob 'apps/web/test/**' --glob 'apps/web/scripts/**' --glob 'apps/web/e2e/**'`
  prints nothing.
- **[R]** `rg -l '[а-яА-ЯёЁ]' apps/web --glob '!apps/web/lib/copy.ts' --glob '!**/*.test.*' --glob '!apps/web/e2e/**'` prints nothing.
- **[S]** `t30 up -d --build --wait`, `bash apps/web/scripts/check-image-migrations.sh`,
  `bash apps/web/scripts/check-image-course.sh` (from step 14), `pnpm seed 2>&1 | tee <scratch>/seed.log`,
  `pnpm test:e2e 2>&1 | tee <scratch>/e2e.log`; `grep -c "root .env not loaded"` is at least 1 in each log
  (from step 1).
The last step of every commit runs [D][U][B][C][G][R][S]; every commit leaves all of them green.

### 13.6 Isolation (coder and tester)

**Who could read the root `.env`, and why it no longer does** (V9):

| Process | Reads it today because | Revision 2 |
|---|---|---|
| any `docker compose` (the `t30` wrapper, `check-image-migrations.sh`, `check-image-course.sh`) | compose loads `.env` of the project directory | `COMPOSE_ENV_FILES=/dev/null` exported (V13); the wrapper also passes `--env-file /dev/null` and refuses to run without the export |
| `next build`, `next dev`, `next typegen` (via `pnpm build`, `pnpm dev`, `pnpm typecheck`) | `next.config.ts:14-16` | `loadRootEnv` skips (flag via turbo `globalPassThroughEnv`); [D] before the run, skip line in [B] |
| `playwright test` (`pnpm test:e2e`) | `playwright.config.ts:7-9` | same; skip line in [S] |
| `pnpm seed` | `scripts/seed.ts:14-16` | same; skip line in [S] |
| Vitest, Next's own env loading, turbo, drizzle-kit, `shadcn add` | not readers (V9) | unchanged |
| the before/after record | revision 1 used `cksum` | `stat -f '%i %z %m'` (metadata only, V14) |

Rules (#29 §13.5, plus): nobody creates, edits or reads the root `.env`; no role runs `pnpm build`, `pnpm dev`,
`pnpm typecheck`, `pnpm seed` or `pnpm test:e2e` before step 1 is complete and [D] is green (until then the
flag is ignored); **no mutation that can disable the opt-out (the `globalPassThroughEnv` entry, `loadRootEnv`'s
flag check, a call site's use of `loadRootEnv`) is ever applied while a real entry point (`next`, `playwright`,
`tsx scripts/seed.ts`, any `pnpm`/`turbo` task) can run in this checkout, which holds a root `.env`**: M-env-flag
and M-env-site run only under `pnpm --filter @academy/web exec vitest run lib/root-env.test.ts` and are restored
(`cmp`) before the next command; M-env-turbo runs only in a scratch turbo workspace without any `.env` (13.7);
`turbo.json` in this checkout is never mutated (S6, Arch-1, O7);
`pnpm dev` runs on `PORT=3232`, never 3000 or 3080; ports 3230, 3231, 3232, 55430 are checked free with `lsof`
before use; the role's own containers carry fixed names and are stopped before teardown.

Setup, once per role session, in the role's scratchpad (`H` = absolute path of `t30-env.sh`; every call starts
`bash -c '. "<H>" && ...'`):
1. Write `t30-env.sh` with exactly (rehearsed in bash and zsh, V13):
   ```sh
   # Sourced at the start of every call (bash or zsh). The root .env is never created, edited or read:
   # COMPOSE_ENV_FILES=/dev/null stops every docker compose call (the wrapper and the image scripts) from
   # loading it, and ACADEMY_SKIP_ROOT_ENV=1 stops next.config.ts, playwright.config.ts and scripts/seed.ts.
   export COMPOSE_ENV_FILES=/dev/null
   export ACADEMY_SKIP_ROOT_ENV=1
   export COMPOSE_PROJECT_NAME=academy-t30
   export WEB_PORT=3230 DB_PORT=55430 WEB_IMAGE_TAG=t30
   export POSTGRES_USER=academy POSTGRES_PASSWORD=academy POSTGRES_DB=academy
   export DATABASE_URL=postgres://academy:academy@127.0.0.1:55430/academy
   export E2E_BASE_URL=http://127.0.0.1:3230
   export SEED_EMAIL=learner-t30@example.com
   t30() {
     if [ "${COMPOSE_PROJECT_NAME:-}" != academy-t30 ]; then echo "t30 REFUSED: COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-unset}"; return 97; fi
     if [ "${COMPOSE_ENV_FILES:-}" != /dev/null ]; then echo "t30 REFUSED: COMPOSE_ENV_FILES=${COMPOSE_ENV_FILES:-unset}"; return 97; fi
     for t30_arg in "$@"; do
       case "$t30_arg" in -p|-p*|--project-name|--project-name=*|-f|--file|--file=*|--env-file|--env-file=*) echo "t30 REFUSED: $t30_arg is fixed by the wrapper"; return 97;; esac
     done
     t30_name=$(docker compose --env-file /dev/null -p academy-t30 config --format json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).name))' 2>/dev/null) || { echo "t30 REFUSED: compose config failed"; return 97; }
     if [ "$t30_name" != academy-t30 ]; then echo "t30 REFUSED: resolved project $t30_name"; return 97; fi
     docker compose --env-file /dev/null -p academy-t30 "$@"
   }
   ```
   then append the generated values without printing them:
   `printf 'export BETTER_AUTH_SECRET=%s\nexport SEED_PASSWORD=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 16)" >> "<H>"`.
   Publishing a port in `t30 run` uses `--publish`, never `-p` (the wrapper refuses `-p`, V13).
2. Record the owner's state into `<scratchpad>/t30-before.txt` (from the repository root):
   `docker volume inspect -f '{{.CreatedAt}}' academy_db-data 2>/dev/null || echo absent`;
   `docker image inspect -f '{{.Id}}' academy-web:local 2>/dev/null || echo absent`;
   `docker inspect -f '{{.State.StartedAt}}' academy-web-1 academy-db-1 2>/dev/null || echo absent`;
   `stat -f '%i %z %m' .env 2>/dev/null || echo absent`.

Teardown: `docker stop academy-t30-web-err 2>/dev/null` (T-err); stop the dev server (13.4); `t30 down -v`;
`docker ps -aq --filter label=com.docker.compose.project=academy-t30` prints nothing; `docker image rm
academy-web:t30`; recompute step 2 and `diff` with `t30-before.txt`; any difference is reported to Stepan as an
incident, never "fixed".

### 13.7 How each named mutation was checked in this phase

| Mutation | Evidence that it goes red at its assertion on the real code path |
|---|---|
| M-notif (E-les-2) | `notifications.tsx:23-27`: the href is computed once, inside the `then` of the session read, from `window.location`; the effect has `[]` deps and never re-runs, so a later `replaceState` cannot change it. With `get-session` fulfilled before the tab change, today's code keeps `next` without `?tab=task`: red at the second `next` assertion. After step 39 the href is computed during render from `useSearchParams()`, which `replaceState` updates (V5) |
| M-region-both, M-region-moved (E-les-3) | `region-cycle.tsx:14-17` lists `[data-region]` in DOM order (top bar, notifications only while a region, then `main` and/or the section); `:49` takes the **first** region containing focus; `:20-25` focuses that region's first focusable element. Both: press 2 -> `main` -> crumb "Курс"; press 3 -> `findIndex` returns `main` again (it contains the crumb) -> next region is the section -> crumb "Курс" again, expected "Академия": red. Moved: presses land as on correct code, but the crumb's nearest `[data-region]` is `main`, not the section named "Урок": red at `closest` |
| M-msg-schema, M-msg-yaml (U-read) | run (V16, V15): `issue.message` of the duplicate-check case is `duplicate check id: canary-dup`; with `prettyErrors: true` the YAML error message quotes the line `run: [CANARY-YAML-E`; with the design's options neither appears |
| M-yaml-log, M-yaml-silent (U-read) | run (V15): `parse()` emitted `YAMLWarning ... run: !weird CANARY-YAML-W` through `process.emitWarning`; `parseDocument` emitted nothing on any channel; `"silent"` returned no `MULTIPLE_DOCS` error, `"error"` did |
| M-yaml-level (U-read) | run (V15, `<scratchpad>/r3/y5.cjs`): on `id: x\n? [CANARY-KEY]\n: v\n` with `logLevel` unset, `parseDocument` logs nothing and `toJS()` emits one warning containing `CANARY-KEY`; with `"error"` nothing. `parseYamlFile` calls `toJS()` (there is no error or warning to stop it), so the spy assertion goes red under the mutation and is green on the design's options |
| M-fs-unreadable (U-fs) | a mode-`000` file makes `readFile` reject with `EACCES` for a non-root user; under the mutation the reason is `missing`, so the `unreadable (EACCES)` assertion is red; the synthetic `EIO` case is red the same way without depending on the user |
| M-leak-rsc, M-leak-dash (E-leak) | the fragment `ACADEMY_CHECKS_DIR/verify_routing.py` is in today's kept set (V17) and appears verbatim inside the serialised `run` string (no character of the fragment is escaped by JSON or by Next's inline-flight escaping, which touches `& < > U+2028 U+2029`; Sec "What I checked"). The props type-check because `leak?: unknown` is declared. Runtime serialisation of an unused client prop is U-5: the tester records "build passed, E-leak red at that fragment" |
| M-env-flag, M-env-site, M-env-walk, M-env-echo | U-env asserts the injected loader is not called and works on a temp file only; U-env-sites scans source text. While applied, the mutated `root-env.ts` or `next.config.ts` would load the real root `.env` if any entry point ran, so these mutations run **only** under `pnpm --filter @academy/web exec vitest run lib/root-env.test.ts` (Vitest does not load `next.config.ts`, V9) and are restored with `cmp` before the next command (13.6) |
| M-env-turbo | **Never in this checkout** (revision 3, S6/Arch-1/O7: removing the entry here would make the next build load the real `.env`, and a cache hit could replay an old skip line). In a scratch turbo workspace without any `.env` (V19: a copy of the step-1 `turbo.json`, the repository's `pnpm-workspace.yaml`, a stub `@academy/web` whose five scripts print `flag=<value or UNSET>`, a minimal lockfile, `git init`, the repository's `node_modules/.bin/turbo`): with the entry, the [D] query prints the `sha256("1")` entry and `turbo run <task> --filter=@academy/web --force` prints `flag=1` for build, typecheck, seed, test:e2e, and dev (bounded with `perl -e 'alarm 20; exec @ARGV'`); entry removed, the query prints `null` (red at [D]) and every task prints `flag=UNSET`; restored with `cmp`. Rehearsed in revision 3. In this checkout the flag is shown by [D] before a run and by the skip line after it |
| M-ring-tabs, M-ring-item (E-ring) | Tailwind utilities are in a later cascade layer than `@layer base`, where `app/globals.css:222-225` draws the ring, so the registry's `outline-none` (outline-style none) and `ring-[3px]` (box-shadow) win over it |
| M-controls (U-outcomes) | Radix `react-collapsible/dist/index.mjs:66` (`aria-controls` only while open) is exactly the behaviour the mutation reproduces |
| rows unchanged from revision 1 | walked by the architecture judge against code and found to reach their assertions (Arch "Mutations walked against code") |

## 14. Implementation steps

LOC exclude generated files. Brackets name the checks beyond [U]. "Supplies" names constants, components and
routes a later step uses; nothing is used before the step that supplies it.

Commit 1, `build(web): let isolated runs skip the root .env`
1. `lib/root-env.ts` + U-env + U-env-sites; `next.config.ts`, `playwright.config.ts`, `scripts/seed.ts` call
   `loadRootEnv` (comments extended); `tsconfig.json` `allowImportingTsExtensions`; `turbo.json`
   `globalPassThroughEnv`; `.env.example` entry as comment lines (unset = the root `.env` loads exactly as
   before; `1` skips it with the stderr line; any other value stops startup naming the variable; isolated runs
   pair it with `COMPOSE_ENV_FILES=/dev/null`; never put it in `.env`). Before this step is complete no build,
   dev, typecheck, seed or e2e command runs. ~65 LOC. Order inside the step (revision 3):
   (a) `pnpm --filter @academy/web exec vitest run lib/root-env.test.ts` green;
   (b) M-env-flag, M-env-echo, M-env-site, M-env-walk, each alone, each run **only** through that command, each
   restored and `cmp`-checked before the next command;
   (c) M-env-turbo in the scratch turbo workspace (13.7), never on this checkout's `turbo.json`;
   (d) [D] in this checkout prints the expected entry;
   (e) only now [U], [B] (skip line, warnings still 3), [S] (skip lines in seed and e2e logs).
   Supplies: the opt-out, [D].

Commit 2, `build(lesson-schema): add a schema-only entry point for bundled consumers`
2. `./schema` export; `vocabulary.ts` imports from it. ~6 LOC. [B: warnings 3 -> 0; restoring the old import
   brings 3 back (watched red); `pnpm --filter @academy/db test`; C]. Supplies: `@academy/lesson-schema/schema`.

Commit 3, `feat(web): read the course through a structure-driven allowlist`
3. Dep `yaml` `^2.9.1`; `lib/course/errors.ts`. ~35 LOC.
4. `lib/course/root.ts` + U-root; `.env.example` `COURSE_ROOT` entry as comment lines only (absolute; unset =
   the repository's `course/`; the image sets `/app/course`; relative refused; a live line would reach
   `pnpm dev` and CI's copied `.env`). ~35 LOC. [D: the `.env.example` grep prints 0]
5. `test/course-fixture.ts` (temp-dir fixture, canaries, symlink variants). ~60 LOC.
6. `lib/course/files.ts` with `LEARNER_FILES` only (Arch-3); `lib/course/node-fs.ts` (`CourseFs`, realpath
   equality, name allowlist from `LEARNER_FILES`, `fsFailureReason` errno mapping, `turbopackIgnore` on every
   `fs` call) + U-fs. ~70 LOC.
   [M-link, M-fs-names, M-fs-unreadable]. Supplies: `LEARNER_FILES`, `CourseFs`, `fsFailureReason`.
7. `lib/course/yaml.ts` + `lib/course/read.ts`. ~60 LOC.
8. U-read. ~65 LOC. [M-msg-schema, M-msg-yaml, M-yaml-log, M-yaml-silent, M-yaml-level, M-id]
9. `learnerFiles(tree)` added to `lib/course/files.ts` + U-files. ~45 LOC. [M-list-all]
10. `lib/course/view.ts` part 1: visibility, module status, prerequisites, `toCatalogView`. ~55 LOC.
11. `view.ts` part 2: `toDashboardView`, `findLesson`, `toLessonView`. ~45 LOC.
12. U-view. ~60 LOC. [M-vis, M-prereq, M-src]
13. `lib/course/text.ts` + U-text + U-leak; `lib/course/page-error.ts` + U-page-error. ~60 LOC. [M-map,
    M-leak-view, M-leak-read, M-catch-all; B]. Supplies: the loader, `loadOrError`.

Commit 4, `build(web): ship only the learner-visible course files in the image`
14. `scripts/export-course.ts` (`export`, `list`) + U-export; Dockerfile build stage (deps build; export; `rm -rf
    /repo/course`; web build); runner `COPY --from=build /out/course ./course`, `ENV COURSE_ROOT=/app/course`;
    `.dockerignore` drops `course`; `scripts/check-image-course.sh` (C1-C4) + CI `e2e` step after "seed the e2e
    user". ~70 LOC (split at the Dockerfile if the coder's step exceeds 60). [S: `t30 run --rm --no-deps
    --entrypoint sh web -c 'find /app/course -type f | wc -l'` prints 46; M-img-copy -> C1, C2, C4 red]
15. `lib/course/server.ts` (`server-only`, `cache()`, both log lines); `turbo.json` `dev.passThroughEnv` +=
    `COURSE_ROOT`; `scripts/check-build-course.sh` + `scripts/nft-course-paths.mjs` (N1, N2) + CI `checks` step
    after `pnpm build`. ~55 LOC. [B; M-trace -> N1, N2 red; G]. Supplies: `getCourse`, `getLessonText`.

Commit 5, `feat(web): add badge, item, tabs, breadcrumb and progress components`
16. `pnpm dlx shadcn@4.23.0 add badge item tabs breadcrumb progress` in `apps/web`; U4 green (restore the block
    from `design/system/tokens.css` if touched, recorded); `git diff package.json` shows only expected deps.
    ~10 LOC by hand.
17. Badge, Item, Breadcrumb edited to their 8.4 tables; `components/ui/link-styles.ts`. ~55 LOC.
18. Tabs, Progress (`valueText`) edited to 8.4; `components/ui/progress-styles.ts`. ~55 LOC. Supplies: the five
    components, the class constants.

Commit 6, `feat(web): render lesson markdown on the server`
19. Deps (4, Markdown); `components/markdown/headings.ts` (`remarkLessonHeadings`, `sectionsOf`). ~55 LOC.
    [`pnpm why react-markdown unified remark-parse -r`: one copy each]
20. `components/markdown/lesson-markdown.tsx` (components map, `disallowedElements`) + `.prose` rules in
    `app/globals.css` outside the token block (headings, lists, blockquote, inline code, links, table, code
    block, h4 per D3). ~60 LOC. [U4]
21. U-md part 1 (headings, ids, `sectionsOf`, table). ~55 LOC. [M-head]
22. `lib/copy.ts`: "Копировать", "Не скопировано, выделите текст вручную", header rule (Q7);
    `components/markdown/copy-button.tsx` + U-copy; the code-block header uses it. ~60 LOC. [R]
23. U-md part 2 (code block with "Копировать", raw HTML literal, script, `javascript:`, image). ~55 LOC.
    [M-skiphtml, M-raw, M-img]
24. U-md real-course case (every mdast `html` node escaped; prints the count). ~30 LOC.
25. `turbo.json` `@academy/web#test.inputs` += `$TURBO_ROOT$/course/**`. ~1 LOC. [`pnpm exec turbo run test
    --filter=@academy/web --dry=json`: the `@academy/web#test` task's `inputs` map lists `course/` files (if the
    dry run does not show inputs, the coder reports the turbo output instead of claiming the check)]

Commit 7, `feat(web): add the course catalog, the course link and the not-found page`
26. `lib/copy.ts`: shared, top bar, catalog, not-found strings (9.3). ~40 LOC. [R]
27. `components/course-error.tsx`, `retry-button.tsx`, `focus-on-mount.tsx` + U-retry. ~55 LOC.
28. `components/top-bar-nav.tsx` + `top-bar.tsx` + `(app)/layout.tsx` (course identity read after the session
    check, `CourseReadError.courseId`) + U-topnav. ~60 LOC.
29. `components/catalog/{module-list,module-section,lesson-row}.tsx`. ~60 LOC.
30. `components/catalog/fragment-focus.tsx` + catalog `page.tsx` (`requireSession`, `generateMetadata` with the
    not-found title, `notFound`, course error). ~55 LOC. [U-guard: M13 on this page]
31. `app/(app)/not-found.tsx` + `app/(app)/[...missing]/page.tsx` (both export the title). ~40 LOC. [B]
32. `e2e/course.ts` + `e2e/catalog.spec.ts` E-cat-1, E-cat-2. ~60 LOC. [S]
33. E-cat-3, E-cat-4, E-ring (row link part) + `e2e/not-found.spec.ts` E-nf-1. ~60 LOC. [S; M-ring-item]

Commit 8, `feat(web): add the m0 lesson page`
34. Back up `components/notifications.tsx` to the scratchpad (`cp`, `cmp`): the M-notif negative of step 41.
35. `lib/copy.ts` lesson strings (9.3). ~25 LOC. [R]
36. `components/lesson/lesson-header.tsx`, `outcomes.tsx` (own collapsible, 8.4) + U-outcomes. ~60 LOC.
    [M-controls]
37. `components/lesson/lesson-tabs.tsx` + U-tabs. ~60 LOC. [M-push]
38. `components/lesson/{toc,sources,prerequisite-alert}.tsx`; lesson `page.tsx` (`requireSession` with tab,
    `generateMetadata`, `notFound`, course error D2, per-tab text error, M0 line). ~60 LOC. [B]
39. `components/notifications.tsx`: "session gone" state, href from `usePathname()` + `useSearchParams()`. ~20 LOC.
    [existing E-dash-3 green]
40. `e2e/leak-fragments.ts` + `e2e/leak.spec.ts` (catalog, lessons, client navigation with RSC count,
    not-found). ~60 LOC. [S; collision pre-run recorded; M-leak-rsc]
41. `e2e/lesson.spec.ts` E-les-1..E-les-3, E-ring (trigger and panel part). ~60 LOC. [S; M-notif with the step-34
    backup, M-region-both, M-region-moved, M-ring-tabs]
42. E-les-4, E-les-5. ~50 LOC. [S]

Commit 9, `feat(web): show the next lesson and module rows on the dashboard`
43. `lib/copy.ts` dashboard strings; `components/dashboard/next-lesson-card.tsx`. ~50 LOC. [R]
44. `components/dashboard/course-progress.tsx` (course line, `Progress`), `module-bar.tsx`. ~55 LOC.
45. `(app)/page.tsx`: AC8 error, AC7 empty when `next === null`, first-run otherwise. ~45 LOC. [B]
46. `e2e/dashboard.spec.ts` E-dash-1 rewritten (first-run, Tab order with "Курс", `F6` `main` -> "Начать", row ->
    catalog heading); E-leak `/` with its positive control. ~60 LOC. [S; M-leak-dash; then three consecutive
    green runs of the whole suite]

Commit 10, `docs: document course content in the image and the root .env opt-out`
47. README "Web app": content changes need `docker compose up -d --build`; `COURSE_ROOT`; what the image holds
    (ADR-0009); `ACADEMY_SKIP_ROOT_ENV` for isolated runs: unset (Stepan's normal flow) the root `.env` loads
    exactly as before, `1` skips it and prints `root .env not loaded: ACADEMY_SKIP_ROOT_ENV=1` on stderr, any
    other value stops startup naming the variable; `COMPOSE_ENV_FILES=/dev/null` is the compose counterpart
    (O N3). ~30 LOC. [lint]

## 15. Commits

Each body ends with `Refs #30`; the PR body says `Closes #30`, carries "Design deviations" (9.1, #83), the texts
of 9.4 and the unreachable-states table (6.5).

1. `build(web): let isolated runs skip the root .env` (1)
2. `build(lesson-schema): add a schema-only entry point for bundled consumers` (2)
3. `feat(web): read the course through a structure-driven allowlist` (3-13)
4. `build(web): ship only the learner-visible course files in the image` (14-15)
5. `feat(web): add badge, item, tabs, breadcrumb and progress components` (16-18)
6. `feat(web): render lesson markdown on the server` (19-25)
7. `feat(web): add the course catalog, the course link and the not-found page` (26-33)
8. `feat(web): add the m0 lesson page` (34-42)
9. `feat(web): show the next lesson and module rows on the dashboard` (43-46)
10. `docs: document course content in the image and the root .env opt-out` (47)

Step-by-commit supply walk: commit 1 needs nothing new; 2 needs 1's flag for [B]; 3 imports 2's entry point; 4
imports 3's loader; 5 is standalone; 6 imports 5's link styles; 7 imports 3-6 (catalog rows use Badge, Item,
link styles; course error uses the loader) and adds no e2e that follows a lesson link; between 7 and 8 the
lesson rows lead to the not-found page through the catch-all (E-nf-1's unknown-lesson row passes through it);
8 imports 5 (Tabs, Breadcrumb, Badge) and 6 (Markdown, "Копировать"); E-leak's `/` part waits for 9, where `/`
first renders course data; 9 imports 5 (Progress, Item, Badge).

## 16. Needs Stepan

1. Accept ADR-0009 (Proposed) in the PR, including its revision-2 Consequences: the image's `lesson.yaml` files
   carry check commands, titles and grader file names (never sent to the browser), and a YAML warning that
   `content:validate` tolerates makes the web show "Не удалось загрузить курс". Approve the
   `@academy/lesson-schema/schema` entry point (CODEOWNERS).
2. Before the coder phase: #79 (PR #82) on `main` and the 9.5 re-check done by the orchestrator.
3. Until #30 merges, no `docker compose up --build` of project `academy` from this checkout (an unreviewed image
   would replace `academy-web:local`). Roles never do it (13.6).
4. Later, for #36: the `quiz.yaml` gap against ADR-0001 item 5 (ADR-0009 Consequences).
