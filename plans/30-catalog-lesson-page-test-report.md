# Issue #30 test report (tester phase)

Branch `feat/30-catalog-lesson-page` at `341266a` (10 commits on `origin/main`), main checkout, tier PROJECT.
Date 2026-10-31. Every line below comes from a command run in this phase; logs and scripts are in the tester
scratchpad `.../scratchpad/tst30/` (not committed). Product code was not changed.

```
TEST REPORT (#30)
lint/typecheck: ok (lint with explicit paths, see 1)
unit: 245 passed / 0 failed (web 199, db 34, lesson-schema 12)
content: ok (1 course, 6 modules, 13 lessons, 0 issues)
build: ok without secrets, 0 dynamic-fs warnings, N1/N2 OK
db: db:check ok, drift ok, migrations untouched
integration: db 41 passed, web 25 passed
stack: healthy (academy-t30 db + web)
image: I1-I3c OK, C1-C4 OK
e2e: 54 passed / 0 failed, twice
mutations: 8 of 8 red at the named assertion, restored by cmp, green again
T-err 1-3, T-vis: pass
design: conformant, with named exceptions (4) and two minor findings (6.3)
T-sr: partial (headless Chromium AX tree only; VoiceOver/NVDA not possible)
```

## 0. Isolation

- Every command ran as `bash -c '. <scratchpad>/t30-env.sh && ...'` (`COMPOSE_ENV_FILES=/dev/null`,
  `ACADEMY_SKIP_ROOT_ENV=1`, project `academy-t30`, ports 3230/55430, dev 3232). Compose only through `t30`.
- [D] before every build, typecheck, seed, e2e and image rebuild: `[D] passthrough
  ["ACADEMY_SKIP_ROOT_ENV=6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b"]`, `[D]
  env-example live lines 0`, `[D] OK`.
- Skip line "root .env not loaded: ACADEMY_SKIP_ROOT_ENV=1": build 1, seed 1, each e2e run 7, dev server 1.
- The root `.env` was never read, printed or hashed (stat only). `turbo.json` md5 identical before and after.
- Ports 3230, 3231, 3232, 55430 free before use (`lsof` 0 lines each).
- Before/after record (`REC.sh`: Stepan's volume CreatedAt, `academy-web:local` id, `academy-web-1`/`academy-db-1`
  StartedAt, `stat -f '%i %z %m' .env`): `diff before.txt after.txt` empty.
  ```
  2026-10-29T04:32:08Z
  sha256:a4a809b2ac0b2ca4036127a965eb5c57db7e8dc0056dbf4682c1021b096fa913
  2026-10-30T13:10:31.210477338Z
  2026-10-30T13:10:25.621489835Z
  56603218 184 1793365932
  ```
- Teardown: `academy-t30-web-err` stopped (`--rm`, gone); dev server task stopped, no listener on 3232, `pgrep -f
  'turbo run dev|next dev' | comm -13 dev-pids-before.txt -` empty; `t30 down` (no `-v`); `docker ps -aq --filter
  label=com.docker.compose.project=academy-t30` empty; no `academy.workspace` containers. Kept as asked: volume
  `academy-t30_db-data`, image `academy-web:t30` (rebuilt from the restored tree, `6abf192e21ab`).
- `git status --porcelain` before and after: only ` M .claude/feedback/architect_mistakes.md` (pre-existing,
  not mine) plus this report.

## 1. Check sets from a clean state

`rm -rf apps/web/.next`, `pnpm install --frozen-lockfile` (rc 0). Turbo replayed cached typecheck/test on the
first try, so both were rerun with `--force` (`Cached: 0 cached`).

| Check | Command | Result |
|---|---|---|
| lint | `pnpm lint` | rc 1, only on two git-ignored local files (`.claude/pipeline_state.json`, `.claude/settings.pipeline-grant.json`, format), which CI never has. With explicit paths (`scratchpad/lint.sh`: every top-level entry plus the tracked `.claude` paths): rc 0, "Checked 227 files ... No fixes applied". No nested worktrees exist (`git worktree list`: one) |
| typecheck | `turbo run typecheck --force` | rc 0, 5/5 tasks, 0 cached |
| unit | `turbo run test --force` | rc 0; lesson-schema 12, db 34, web 199 (30 files) passed |
| content | `pnpm content:validate` | "content: 1 course(s), 6 module(s), 13 lesson(s), 0 issue(s)" |
| build | `env -u BETTER_AUTH_SECRET -u DATABASE_URL pnpm exec turbo run build --force` | rc 0, 3/3, 0 cached; skip lines 1; "Dynamic filesystem access" 0 |
| N1/N2 | `bash apps/web/scripts/check-build-course.sh` | `N1 OK nft-files=22 course-files=0`, `N2 OK no standalone course directory` |
| db | `pnpm --filter @academy/db run db:check`; `check-drift.sh` | "Everything's fine"; "No schema changes, nothing to migrate", "migrations match the schema" |
| append-only | `check-append-only.sh` | CI-only (needs the PR merge commit); local substitute `git diff --name-status origin/main HEAD -- packages/db/drizzle` prints 0 lines |
| integration | `turbo run test:integration --force` | rc 0; db 41 passed (3 files), web 25 passed (4 files) |
| [G] | design 13.5 grep | 0 lines |
| [R] | Cyrillic grep outside `copy.ts`, tests, e2e | empty |
| stack | `t30 up -d --build --wait --wait-timeout 300` | rc 0; db and web healthy |
| image migrations | `check-image-migrations.sh` | `I1 OK applied=2`, `I2 OK rc=1`, `I3 OK rc=1`, `I3b OK rc=1`, `I3c OK rc=1` |
| image course | `check-image-course.sh` | `C1 OK files=46`; `C2 OK host=287 image=4065 hashed=4065 grader-hashes-found=0`; `C3 OK COURSE_ROOT=/app/course`; `C4 OK no checks, starter or quiz.yaml under /app/course` |
| seed | `pnpm seed` | rc 0, "seed: updated" |
| e2e run 1 | `turbo run test:e2e --force` | rc 0, **54 passed (17.6s)** |
| e2e run 2 | same, right after | rc 0, **54 passed (17.1s)** |

E-leak output (run 1): "forbidden fragments: 6028"; catalog, all 13 lessons (both tabs), client navigation
("RSC bodies read: 14"), not-found and `/` each scanned (e.g. "scanned 689905 characters in 15 distinct bodies,
86 ms"). No "ignored late prefetch" line.

## 2. Issue criteria

| Criterion | Evidence | Result |
|---|---|---|
| only `ready` lessons visible | U-view (M-vis red, 3), T-vis (5): draft lesson, ready lesson in a planned module and a ready module without visible lessons are absent from catalog, dashboard, lesson URLs (404) and prerequisite notes | pass |
| `checks/` contents never sent to the browser | E-leak (6,028 fragments, every page and RSC payload), C1/C2/C4 on the image, N1/N2 on the build, each watched red (3) | pass |
| e2e: open a module, open a lesson, see the theory | `lesson.spec.ts:57` "open a module, open a lesson, see the theory (issue I3, AC6)" green in both runs; red under the E-les-1 mutation | pass |
| workspace stub on the right | superseded by Stepan's M0 decision (design 9.4); the M0 line is asserted by E-les-3 | n/a (scope note for the PR) |

## 3. Mutations (re-verified independently)

Helper `tst30/mut.py` (backup copy, exact-string edit asserting the occurrence count, run, restore, `cmp`).
Each alone. Image mutations rebuilt only `academy-web:t30`; "build passed" recorded before the red line.

| Mutation | Edit | Command | Red at | Restored |
|---|---|---|---|---|
| M-leak-rsc | `lesson-tabs.tsx` props gain `leak?: unknown`; lesson `page.tsx` passes `leak={found.node.lesson}` | [D], `t30 up -d --build --wait web` (rc 0), `playwright test e2e/leak.spec.ts -g intro-models-effort` | `leak.spec.ts:143` "grader fragments in served bodies": `.../intro-models-effort?tab=theory: ACADEMY_CHECKS_DIR/verify_routing.py`; 1 failed | cmp identical (both files) |
| M-img-copy | `Dockerfile`: export replaced by `mkdir -p /out && cp -R /repo/course /out/course` | `t30 build web` (rc 0), `check-image-course.sh` | `C1 FAIL ... (host 46 files)`, `C2 FAIL ... grader-hashes-found=499`, `C3 OK`, `C4 FAIL grader names under /app/course` | cmp identical |
| M-trace | `next.config.ts`: `outputFileTracingIncludes: { "/*": ["../../course/**/*"] }` | [D], `turbo run build --filter=@academy/web --force` (rc 0), `check-build-course.sh` | `N1 FAIL trace files list course files`, `N2 FAIL apps/web/.next/standalone/course exists` | cmp identical |
| M-vis | `view.ts`: visibility `node.lesson.status === "ready"` only (module status ignored) | `vitest run lib/course/view.test.ts` | 4 failed, incl. "does not find a ready lesson inside a module that is not ready" (`expected {...} to be undefined`) and the catalog case | cmp identical |
| M-yaml-level | `yaml.ts`: `logLevel: "error"` removed | `vitest run lib/course/read.test.ts` | `read.test.ts:119` "never prints a collection key": printed `... "[ CANARY-KEY ]" ...` | cmp identical |
| M-fs-unreadable | `node-fs.ts`: `unreadable (${code})` -> `MISSING` | `vitest run` node-fs, text, read tests | 4 failed: EACCES case "expected 'missing' to be 'unreadable (EACCES)'", EIO case, module.yaml case, theory.md case | cmp identical |
| E-les-1 (row href `?tab=task`) | `lesson-row.tsx`: row link to `<lesson>?tab=task` | [D], rebuild (rc 0), `playwright test e2e/lesson.spec.ts -g 'issue I3'` | `lesson.spec.ts:77` Expected "Теория", Received "Задание" | cmp identical |
| M13 on the lesson page | lesson `page.tsx`: both `await requireSession(` -> `await requireSessionX(` | `vitest run app/entry-points.test.ts` | "finds every entry point ...": `{ path: "app/(app)/courses/[courseId]/lessons/[lessonId]/page.tsx", problem: "no data access layer call" }` | cmp identical |

Green again after restoring: [D], `turbo run build --force` rc 0, 0 dynamic-fs warnings, `N1 OK nft-files=22
course-files=0`, `N2 OK`; `t30 up -d --build --wait` rc 0; C1-C4 OK (same counts as section 1); `vitest run
lib/course app/entry-points.test.ts` 52 passed; `playwright test e2e/leak.spec.ts e2e/lesson.spec.ts` 26 passed.

## 4. T-err

**Part 1 (image, `COURSE_ROOT=/app/course-missing`):** `t30 run -d --rm --no-deps --name academy-t30-web-err
--publish 127.0.0.1:3231:3000 -e COURSE_ROOT=/app/course-missing web` (3231 free before). Script `pw/terr1.mjs`
with the e2e storage state, 1280 light and 375 dark:
- `/`: h1 "Главная", destructive Alert "Не удалось загрузить курс" + "Повторить"; top bar "Академия", "Главная"
  (current), no "Курс" (D2/Q9). Retry that fails again: focus `button#course-error-retry`.
- catalog: `<title>` and h1 "Не удалось загрузить курс", Alert + "Повторить" only; retry fails again: focus
  `h1#course-error-title`.
- lesson: same composition (D2), no "Курс" link, "Главная" works (click -> `/`); retry: focus on the h1.
- Log: one `web: course read failed:` line per request (measured: +1 for each of `/`, catalog, lesson); the
  container log holds only Next's start lines, "web: database migrations applied" and those lines; no course
  file content. Container stopped before teardown.
- Status is 200 for the course-error state (the design specifies no other status). Screenshots
  `apps/web/test-results/tester30/terr1-{dashboard,catalog,lesson}-{1280-light,375-dark}.png`.
- Minor finding F1 (6.3): the line reads `web: course read failed: : missing` when the course root itself is
  missing: the file field is empty (the root listing has `rel ""`), so the log does not say what was missing.

**Part 2 (broken `lesson.yaml`, `pnpm dev` on 3232, scratch copy):** `cp -R course <tst30>/course-copy`;
dev server started with `run_in_background` as `bash -c '. H && exec env PORT=3232 COURSE_ROOT=<copy> pnpm
dev'` (skip line printed). For catalog, lesson and dashboard: append `tvis_broken: [CANARY-BROKEN-LINE` to
`00-introduction/01-models-and-effort/lesson.yaml`, reload -> error state; restore, press "Повторить":
- catalog recovered, focus `h1#course-title`; lesson recovered, focus `h1#lesson-title`; dashboard recovered,
  focus `h2#next-lesson-heading`. Pass.
- Log: `web: course read failed: ai-for-developers/00-introduction/01-models-and-effort/lesson.yaml: invalid
  YAML at line 48`; `CANARY` occurs 0 times in the dev log.
- Environment note: on `http://127.0.0.1:3232` the dev server blocks its dev resources ("Blocked cross-origin
  request to Next.js dev resource /_next/hmr from 127.0.0.1", `allowedDevOrigins`), the page never hydrates and
  "Повторить" does nothing. On `http://localhost:3232` (cookie copied to `localhost`) everything works. Not a #30
  defect (no product page is served by `next dev` in normal use), but a tester running T-err/T-vis must use
  `localhost`; worth a line in 13.4 for the next issue.

**Part 3 (text error):** `theory.md` -> `theory.md.off` in the copy. Теория panel: destructive Alert "Не удалось
загрузить текст урока" + "Повторить", "Источники" still shown, no article; Задание renders its text
("Задание: маршрутизация задач по моделям ...", URL `?tab=task`). File moved back, "Повторить": article and
"Содержание" render, focus `div#panel-theory`. Log: `web: lesson text read failed:
ai-for-developers/00-introduction/01-models-and-effort/theory.md: missing` (no content). Screenshots
`tester30/terr3-lesson-text-error-{375,1280}-{light,dark}.png` (they show Next's dev "1 Issue" badge, dev
only). Copy restored, `diff -r` with `course/` empty.

## 5. T-vis (I1, S3, AC7, ready-no-lessons), `pnpm dev` on the copy

Fixture in the copy: `intro-cost-economics` draft; all seven `01-spec-driven-development` lessons draft; a copy
of `01-models-and-effort` as `02-agentic-patterns/01-tvis` (id `tvis-hidden-ready`, status ready, module stays
`planned`). `content:validate` on the copy reports 8 issues ("module is ready but lesson status is draft"),
expected: the CI content rule forbids this, the runtime rule must still hold.
- Catalog: none of the hidden titles in the DOM or the raw HTML; module 00 "Доступен", 5 rows; module 01
  "Готовится", Empty "Уроки модуля готовятся", summary and outcomes kept (`#state-ready-no-lessons`); module 02
  "Готовится", no rows. `intro-context-planning`'s note lists only "Устройство агента: цикл, харнесс,
  инструменты, MCP" (hidden prerequisite dropped).
- `/lessons/intro-cost-economics`, `/lessons/tvis-hidden-ready`, `/lessons/sdd-verification`: 404, h1 "Страница
  не найдена", no hidden title in the body.
- Lesson `intro-context-planning`: prerequisite Alert lists only the visible lesson.
- Dashboard: Card = first visible lesson, `aria-valuetext` "0 из 5", rows "Введение ... 0 из 5 уроков", the
  others "Готовится"; no hidden title.
- All lessons draft (dashboard AC7): `main` = "Главная" + "В курсе пока нет готовых уроков", no link or button in
  `main`, no progressbar; catalog: every module "Готовится".
- Screenshots `tester30/tvis-catalog-ready-no-lessons-1280-light.png`,
  `tester30/tvis-dashboard-no-ready-lessons-1280-light.png`. Copy restored (`diff -r` empty). Pass.

## 6. Design conformance (ADR-0006 item 5)

### 6.1 Screenshots
`apps/web/test-results/design/<slug>/<prototype|app>-<375|1280>-<light|dark>.png` for `catalog` (default),
`lesson` (`#state-m0`, Теория), `lesson-task` (Задание selected in both), `dashboard` (first-run),
`lesson-text-error` (prototype; app in `tester30/terr3-*`), `not-found` (app only, D1: 404, h1 "Страница не
найдена", `scrollWidth` = viewport at 375 and 1280). Error and T-vis states in `apps/web/test-results/tester30/`.

### 6.2 8.4 tables: computed styles per state
Script `pw/conf.mjs` measures 30 properties (display, wrap, gaps, paddings, border width/style/colour, radius,
font size/line height/weight, colour, background, text decoration, underline offset, box-shadow, outline, min
height, height, white-space, cursor, `:focus-visible`) on prototype and app, per row and state, at 375 and 1280,
light and dark (172 rows). Colours normalised to sRGB through a canvas (the app's CSS is compiled to `lab()`,
the prototype keeps `oklch()`), tolerance 1/255. Output `tst30/conf-diff.txt`.

| Table row | Result |
|---|---|
| Badge secondary "Доступен"; outline muted "Готовится", "Не начат"; outline type label | matched (box, padding, radius, text, colours, both themes) |
| Item group, row, li+li separation, content, title, description, actions, note, note link | matched; differences only in X1, X2, X5 |
| Item hover | matched (accent bg/fg); X2 |
| Item focus-visible | matched after the transition settles (solid 2px, offset 2px, `ring`, box-shadow none); see F2 |
| Tabs root, list (wrap, gap, padding, radius, muted bg) | matched except height, X3 |
| Tabs trigger unselected / hover / selected / focus-visible | matched except line height, X3, and the selected shadow list, X4 |
| Tabs content (panel), focus-visible | matched (global ring) |
| Breadcrumb list, link, link hover, current, separator | matched in colour, size, decoration, hover; link-to-link distance equal at every width/theme; X6; separator "/" `aria-hidden="true"` |
| Progress root (course) | matched |
| Progress indicator, module row bar, indicator | matched; X1 |
| Collapsible "Показать все" / "Свернуть" | not reachable (every real lesson has one outcome, design 6.5); covered by U-outcomes |
| Focus targets `tabindex=-1` (h1) | app draws the inset ring (outline 2px, offset -2px) per README; the prototype's m0 h1 is not focusable, so not comparable |

Named exceptions (no rendered difference):
- X1 Tailwind preflight sets `border-style: solid` and `border-color: var(--border)` on every element; with
  `border-width: 0` (equal in both) nothing is drawn.
- X2 `text-underline-offset: 3.2px` / `text-decoration-thickness: 2px` inherited from the prototype's global
  `a` rule on non-underlined descendants; `text-decoration-line` equal (none).
- X3 Tab trigger height 32 vs 34px, list 40 vs 42px: `proto.css:350` sets `font: inherit; font-size:
  var(--text-sm)`, so the prototype keeps the body line height (24px); README type scale says `text-sm` is
  0.875rem / 1.25rem, which the app follows (20px). README wins (8.4); proto.css bug for #80/#83.
- X4 Selected tab `box-shadow`: the app's value is four transparent zero shadows (Tailwind ring/shadow stack)
  followed by the same `0 1px 2px 0` shadow and colour as the prototype in both themes.
- X5 Heights of item groups and rows differ by content (prototype sample data vs the real course).
- X6 Breadcrumb item `display: flex` and link `display: block` (flex items blockified) vs `list-item`/`inline`;
  the separator is its own `li` instead of `li + li::before` with margin; measured spacing equal.

### 6.3 Minor findings (not blocking; for the orchestrator to route)
- F1 (operations, `lib/course/server.ts:18`): with a missing course root the log line is `web: course read
  failed: : missing` (empty file field). Rule "error messages carry context". Suggest naming the root (for
  example `<course root>`) when `rel` is `""`.
- F2 (visual, `components/ui/item.tsx`): the row link's `transition-colors` (Tailwind v4 includes
  `outline-color`) animates the focus ring for 150 ms from `foreground` to `ring` (t0 `oklab(0.226 ...)`,
  t500 `lab(48.496 ...)` = `oklch(0.556 0 0)`); the prototype's ring appears at once. `motion-reduce` disables
  it. Candidate for #83 or a later coder pass (`transition-[color,background-color]`).
- F3 (upstream Radix Tabs): the trigger's `onMouseDown` calls `e.currentTarget.focus()`, so the first mouse
  click on a tab after load matches `:focus-visible` and shows the 2px ring (prototype: no ring); later clicks
  do not. Not a WCAG problem; record for #83.

### 6.4 ACs
Catalog (8.1): AC1, AC3, AC4 E-cat-1; AC2 E-cat-2; AC5 E-cat-3; AC6 E-les-1; AC8 U-retry + T-err 1/2; AC10, AC11,
AC12 E-cat-4 (and screenshots); all pass. AC4 "ready module with no ready lesson" also T-vis. AC7, AC9
unreachable (6.5).
Lesson M0 (8.2): AC2, AC3 (M0 row), AC6 (M0), AC13 (M0, 375x667, 320x500, 1280x800) E-les-3; AC4, AC17, AC18 (M0
subset) E-les-2; AC14 label E-les-4 + T-sr (partial); AC15: every Copy-table string used by M0 found in
`lib/copy.ts` (32 strings checked: skip link, brand, nav, Выйти, Уведомления, session alert/action, Урок,
Навигация, six type labels, duration, outcomes heading, toggle, M0 line, prerequisite prefix, Разделы урока,
Теория, Задание, Содержание, Копировать, denial, Источники, проверено, text error, Повторить); AC16: raw colour
grep `rg -n '#[0-9a-fA-F]{3,8}\b|oklch\(|rgb\(|hsl\(' apps/web --glob '!**/globals.css'` exit 1 (no match); all
pass. N/A (not M0): AC1, AC5, AC7, AC8, AC9, AC10, AC11, AC12, AC13's check-bar clause.
Dashboard (8.3): AC1, AC2, AC3 first-run, AC4 "0 из M", AC5 (incl. row -> catalog heading focused), AC13
E-dash-1/AC5 test; AC7 T-vis; AC8 U-retry + T-err 1/2; AC10-AC12 existing specs; all pass.

### 6.5 Tokens and contrast
- Token block: all 185 custom properties of `design/system/tokens.css` (`:root` and dark) occur with the same
  value in `apps/web/app/globals.css` (0 missing); U4 (`globals.test.ts`) green; `python3 -I
  scripts/design_tokens.py check design` ends with contrast ok lines.
- No destructive button in #30. Destructive text in use is the Alert title (`destructive` on `card`), from the
  app's computed colours: light `#cc2826` on `#ffffff` 5.386:1, dark `#fd686a` on `#171717` 6.287:1
  (`design_tokens.py pair`), equal to the token values (`oklch(0.55 0.2 27.325)` on `oklch(1 0 0)` 5.386:1,
  `oklch(0.704 0.182 22.216)` on `oklch(0.205 0 0)` 6.287:1).

## 7. T-sr (AC14)

Possible headless (Chromium CDP `Accessibility.getFullAXTree`, `pw/tsr.mjs`):
- Copy denial (clipboard `writeText` rejected): the focused AX node is `button "Не скопировано, выделите текст
  вручную"`; focus stays on it.
- Catalog lists are exposed as `list` (5, the module lessons lists named by their h2, e.g. "00. Введение в
  разработку с ИИ") with 31 `listitem`s; lesson tablist named "Разделы урока".
Not possible: VoiceOver (Safari) and NVDA (Chrome) announcements, and WebKit's list semantics with
`list-style: none` (only the Chromium headless shell is installed; no WebKit, no screen reader). Stepan checks
these by hand; a gap is a DESIGN follow-up (design 13.4).

## 8. Commits

All 10: subject 33-68 characters (limit 72), Conventional Commits, body's last line `Refs #30`, author
`Stepan Korshukov <korshukovstepan@gmail.com>`, 0 matches for Claude / Co-Authored / Generated with /
Anthropic / AI / assistant.

## 9. Bugs

None blocking. Minor findings F1-F3 (6.3) and the dev-server host note (4, part 2).

STATUS: DONE

## Re-test after judge_code round 1

Branch `feat/30-catalog-lesson-page` at `c86ff9e`, 10 commits on `6871f93` (compared against `6871f93`, not
`origin/main`, which has moved to `159fe90`). Phase judge_code, re-spawned to re-test; no phase advanced, no
product code changed. Scripts and logs: tester scratchpad `.../scratchpad/rt30/`.

```
RE-TEST (#30, judge_code round 1 fixes)
lint/typecheck: ok (lint with explicit paths: 227 files, rc 0; typecheck 5/5, 0 cached)
unit: 247 passed / 0 failed (web 201, db 34, lesson-schema 12; +2 for R3)
content: ok (1 course, 6 modules, 13 lessons, 0 issues)
build: ok without secrets (3/3, 0 cached), skip line 1, 0 dynamic-fs warnings, N1/N2 OK
stack: healthy (academy-t30 db + web); I1-I3c OK, C1-C4 OK; seed updated
e2e: 54 passed / 0 failed, twice back to back
per commit: commit 7 27 passed x2, commit 8 51 passed x2, 0 lines with 429
mutations: R1 red at lesson.spec.ts:252; R3 red (2 unit cases); R4 caught by measurement only (see below)
T-err part 1: log line now `web: course read failed: .: missing`, no content
prerequisite link vs prototype: 0 differing properties, 375/1280 x light/dark x default/hover
```

### Isolation
Same as section 0: every command under `t30-env.sh` (values never printed), compose only through `t30`, [D] OK
before every build, typecheck, seed, e2e and image rebuild (also in the scratch worktree, see below). Before/after
record (`rt30/REC.sh`: Stepan's volume CreatedAt, `academy-web:local` id, `academy-web-1`/`academy-db-1`
StartedAt, `stat -f '%i %z %m' .env`, `md5 -q turbo.json`): `diff before.txt after.txt` empty. Ports 3230, 3231,
55430 free before and after. `git status --porcelain` identical before and after (except this section).
Teardown: `t30 down` (no `-v`) rc 0, 0 `academy-t30` containers, 0 `academy.workspace` containers; kept volume
`academy-t30_db-data` and image `academy-web:t30`, rebuilt from `c86ff9e` before the down (`379f46779538`).

### Checks from a clean state
`rm -rf apps/web/.next`, `pnpm install --frozen-lockfile` rc 0; `scratchpad/lint.sh` rc 0 "Checked 227 files";
`turbo run typecheck --force` 5/5, 0 cached; `turbo run test --force` rc 0 (lesson-schema 12, db 34, web 201 in
30 files); `pnpm content:validate` "1 course(s), 6 module(s), 13 lesson(s), 0 issue(s)"; `env -u
BETTER_AUTH_SECRET -u DATABASE_URL pnpm exec turbo run build --force` rc 0, "Dynamic filesystem access" 0;
`check-build-course.sh` `N1 OK nft-files=22 course-files=0`, `N2 OK no standalone course directory`;
`t30 up -d --build --wait` rc 0; `check-image-migrations.sh` I1 `applied=2`, I2, I3, I3b, I3c OK;
`check-image-course.sh` `C1 OK files=46`, `C2 OK ... grader-hashes-found=0`, C3, C4 OK; `pnpm seed` "seed:
updated"; `turbo run test:e2e --force` twice: 54 passed (17.6s), 54 passed (16.8s), 7 skip lines each.

### Review notes N1, N2
- N1: `rg LessonTextKind apps/web`: one definition, `lib/course/text.ts:4`; `headings.ts`, `lesson-markdown.tsx`,
  `lesson-panels.ts`, `server.ts` and the test import it.
- N2: `lib/routes.ts` header now says only that ids are slugs and that return paths built from route params are
  already percent-encoded. Probe (no cookie): `/courses/a%3Fb` -> 307 `/sign-in?next=%2Fcourses%2Fa%253Fb`, the
  lesson and catch-all paths alike, so `next` decodes to the original path (single encoding at the proxy).

### Fixes and their mutations
Helper `tst30/mut.py` (backup, exact edit, run, restore, `cmp`); every file restored `cmp=identical`.

| Fix | Mutation | Command | Result |
|---|---|---|---|
| R1 prerequisite links | `alert.tsx`: old `[&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground` back on AlertTitle and AlertDescription (link keeps `inlineLinkClassName`) | `EMT.sh e2e/lesson.spec.ts -g 'prerequisite shows the warning'` (rebuild rc 0) | red: `lesson.spec.ts:252` Expected "2.8px", Received "3px" |
| R3 root naming | `node-fs.ts`: `rel === "" ? COURSE_ROOT_FILE : rel` -> `rel` | `vitest run lib/course` | red: 2 failed, "reports a missing root as the root itself" and "names a missing course root as the root, not as an empty file name", both `expected '' to be '.'` |
| R4 ring transition | `item.tsx` and `breadcrumb.tsx`: `transition-[background-color,color]` -> `transition-colors` | rebuild, E-ring specs, `rt30/pw/ring.mjs` | E-ring **green** (3 passed: it asserts style/width/offset/shadow, not colour). Measurement red: row t0 `oklab(0.145 ...)` (foreground), breadcrumb t0 `oklab(0.53 ...)`, both reach `lab(48.496 0 0)` (`--ring`) only at t500; `transition-property` lists `outline-color` |

With the fix (rebuilt from the restored tree): `ring.mjs` row and breadcrumb link t0 = t500 = `--ring`
(`lab(48.496 0 0)`), `transition-property: background-color, color`; `lesson.spec.ts` + `catalog.spec.ts` 15 passed.

Finding G1 (minor, tester or coder): R4 is not guarded by a test. E-ring could add `outlineColor` (compared with a
probe element styled `outline-color: var(--ring)`, read right after the Tab) to its `toEqual`; `ring.mjs` shows
that comparison is red with `transition-colors` and green with the fix. The judge called it optional.

### T-err part 1 (course root missing in the image)
`t30 run -d --rm --no-deps --name academy-t30-web-err --publish 127.0.0.1:3231:3000 -e
COURSE_ROOT=/app/course-missing web`; `rt30/pw/terr1.mjs`: `/` 200 h1 "Главная" + Alert "Не удалось загрузить
курс" + "Повторить"; catalog and lesson 200, h1 "Не удалось загрузить курс", "Повторить". Container log: Next
start lines, "web: database migrations applied", then exactly three `web: course read failed: .: missing` lines
(one per page), no course content. Container stopped, gone. F1 is fixed. Design 5.4 names the row (file `.`,
`COURSE_ROOT_FILE`); 8.4 Item and BreadcrumbLink cells say `transition-[background-color,color]`, and the Links
row says prerequisite links take `inlineLinkClassName` with the Alert `[&_a]:*` removed.

### Prerequisite link vs prototype `#state-prerequisite`
`rt30/pw/prereq.mjs`: prototype `.lesson-alert .alert-title a` vs app `[data-slot="alert-title"] a` on
`intro-context-planning`, 12 properties (colour, decoration line/style/thickness/colour, underline offset, font
size/weight, line height, cursor, outline style, background), colours normalised to sRGB, at 375 and 1280, light
and dark, default and after hover (400 ms): **0 differing properties** in all 8 cases. App values: offset 2.8px,
thickness auto -> 2px on hover, colour foreground (`#0a0a0a` light, `#fafafa` dark). Screenshots
`apps/web/test-results/design/lesson-prerequisite/{app,prototype}-{375,1280}-{light,dark}-{default,hover}.png`.
Visible differences that are not link styling: the app Alert is taller (two real prerequisites vs one sample)
and draws lucide `TriangleAlert` where the prototype has `.status-icon[data-status=warning]` (README: "the app
will use lucide icons with the same meaning").

### Commits 7 and 8 (R2)
`useOwnBucket` hunks: `334147f` (commit 7) adds them to `catalog.spec.ts` and `not-found.spec.ts`; `c449e3b`
(commit 8) to `lesson.spec.ts` and `leak.spec.ts`; `49e44eb` (commit 9) only to `dashboard.spec.ts`, and its body
no longer claims the session read is new ("The dashboard spec now loads more pages, so it gives each test its own
auth rate-limit bucket"). Per commit in a scratch worktree `.claude/worktrees/rt30-pc` (detached), script
`rt30/PC.sh`: checkout, `pnpm install --frozen-lockfile`, [D] OK, `t30 up -d --build --wait` rc 0, seed,
`turbo run test:e2e --force` twice back to back:
- `334147f`: 27 passed (6.7s), 27 passed (5.6s), 0 lines containing 429.
- `c449e3b`: 51 passed (17.1s), 51 passed (16.3s), 0 lines containing 429.
(A first commit-7 pass ran before [D] could run, since `turbo` is installed only by the install step; the
worktree has no `.env` and the skip line printed, and the pass was repeated with [D] OK first.) `pipeline-advance.sh
parked` in the worktree empty, worktree removed; image rebuilt from `c86ff9e` afterwards.

### Commit messages
All 10: subjects 33-68 characters, Conventional Commits, last body line `Refs #30`, author `Stepan Korshukov
<korshukovstepan@gmail.com>`, 0 matches for claude / co-authored / generated with / anthropic / AI / assistant.
No fix-up residue (no judge, round, fixup, squash, WIP, TODO wording; "its four review rounds" in commit 10
describes the committed design plans). Cosmetic: 7 body lines are 73-74 characters (`0cea8e5`, `25f7a8f`, `2828a29` x2, `334147f` x2, `49e44eb`);
the 72 limit is for the subject, but bodies elsewhere wrap at 72.

STATUS: DONE
