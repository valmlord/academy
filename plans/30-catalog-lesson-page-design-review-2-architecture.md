# #30 judge_design round 2: architecture

Judge: judge-architecture, 2026-10-30. Reviewed: `plans/30-catalog-lesson-page-design.md` (revision 2, all 1,075
lines), `docs/adr/0009-course-content-in-the-web-app.md`, my round-1 review, `design/system/proto.css` (badge,
breadcrumb, tabs, progress, item, collapsible, focus, link and motion rules, lines 1-130 and 265-405),
`design/system/README.md` (Links, Radius, Motion, Focus ring, Selected tab, Dark-mode rules, component inventory,
Tabs and Collapsible behaviour), the catalog, dashboard and lesson prototypes (row, progress, breadcrumb, tab and
outcomes markup), and at `7706f71`: `apps/web/{next.config.ts,playwright.config.ts,scripts/seed.ts,tsconfig.json,
package.json}`, `tsconfig.base.json`, `turbo.json`, `app/globals.css` (base layer), `components/{notifications,
region-cycle}.tsx`, `components/ui/{alert,button,card}.tsx`, `e2e/dashboard.spec.ts`. Pipeline status: PROJECT,
`judge_design`, round-1 votes all `source: hook`.

## Verdict: FAIL, 3 issues (round-1 findings 1-8 fixed)

### 1. [design 13.6, 13.7 M-env-turbo, 14 step 1] The prescribed mutation runs make the coder's build read Stepan's root `.env`
Q11 and 13.6 say the root `.env` is never read by any role. M-env-turbo removes `ACADEMY_SKIP_ROOT_ENV` from
`globalPassThroughEnv` and expects `grep -c` of the skip line in [B] to print 0. Under that mutation turbo strict
mode drops the flag (the design's own premise), so `loadRootEnv` sees it unset, finds the file (V8: it exists in
the main checkout) and calls `process.loadEnvFile` on it: Stepan's `DATABASE_URL` and `BETTER_AUTH_SECRET` enter
the `next build` process, the exact incident of the round-1 isolation lesson. The red result is produced by the
read the design forbids. The same holds if M-env-flag ("ignore the flag") or M-env-site (`next.config.ts` back to
`process.loadEnvFile`) is left in place while anything beyond the unit file runs: step 1's bracket lists them
next to [B] and [S], and [U]'s `pnpm typecheck` runs `next typegen`, which loads the config (V9).
Fix: M-env-flag and M-env-site run only `pnpm --filter @academy/web exec vitest run lib/root-env.test.ts`, restored
before any other command (say so in step 1). M-env-turbo gets a negative that cannot load the file: either the
static one (`turbo run build --dry=json` lists the variable under `passThroughEnv`; with the entry removed it does
not, V12), with the positive skip line in [B]/[S] as the runtime proof; or a runtime negative in a scratch export
with no `.env` (`git archive HEAD | tar -x -C <scratchpad>/...`), never in the main checkout. Add the rule to
13.6: no mutation that can stop the flag from reaching a process is run in the main checkout.

### 2. [design 4.Q8, 5.1, 5.4; ADR-0009 item 7] "Unreadable" has no reason in the closed set
Q8 and ADR-0009 item 7 promise that an unreadable `course.yaml`/`module.yaml`/`lesson.yaml` gives the course-error
state and an unreadable `theory.md`/`task.md` the per-tab text error. 5.1 says every `CourseFs` failure is a
`CourseFileError` with one of four reasons (`missing`, `not a regular file`, `symlink or outside the course
root`, `not a learner file`), and 5.4 calls the set closed. An `EACCES` or `EIO` from `readFile` or `realpath`
fits none: the coder either reports it as `missing` (a misinforming message, code-style 5) or lets the raw
`SystemError` escape, which `loadOrError` rethrows (not a `CourseReadError`): a 500 instead of the designed
state, against the ADR. In the image this is a permissions mistake away (the runner runs as a non-root user).
Fix: add reason `unreadable (<errno code>)` for any other fs error (the code, never the message), list it in 5.1
and 5.4, and add a U-fs case (a file with mode `000`, or an injected `readFile` that rejects with `EACCES`) asserting
`CourseFileError` `unreadable (EACCES)`, plus the mapped class in U-read and U-text.

### 3. [design 5.1, 14 steps 6 and 9] Step 6 uses `LEARNER_FILES`, which step 9 supplies
`node-fs.ts` (step 6) refuses a basename outside `LEARNER_FILES` (5.1, Sec N1), and U-fs's `not a learner file`
cases plus M-fs-names run at step 6. `LEARNER_FILES` lives in `lib/course/files.ts` (3.2), created at step 9.
Step 6 does not compile and its mutations cannot run, against section 14's "nothing is used before the step that
supplies it". Same commit, so the commit-level walk misses it; the step-level claim is what the coder follows.
Fix: create `files.ts` with `LEARNER_FILES` in step 6 (`learnerFiles(tree)` stays in step 9), and add "Supplies:
`LEARNER_FILES`" to step 6.

## Round-1 findings: verified

1. **Copy strings across commits: fixed.** Walked every step for strings: "Копировать" and the denial label arrive
   at step 22 (commit 6) with `copy-button.tsx`; step 20 renders the code block, step 21 (U-md part 1) asserts no
   copy text, step 23 asserts "Копировать" after step 22. Commit 7 strings (step 26) precede steps 27-33; "Повторить"
   and "В курсе пока нет готовых уроков" exist today. Commit 8 strings (step 35) precede 36-42; the prerequisite
   Alert reuses "Сначала пройдите: " from commit 7. Commit 9 strings (step 43) precede 44-46.
2. **E-cat-2 dashboard rows: fixed.** 13.2 E-cat-2 has no dashboard part; 8.3 AC5 and E-dash-1 (commit 9, step 46)
   carry "row -> catalog heading focused". `e2e/dashboard.spec.ts:33` (`listitem` 0) and `:48-57` (F6 -> brand ->
   `main#main`) stay green through commits 7-8: `TopBarNav` adds no `li` (U-topnav), `(app)/page.tsx` is unchanged
   until step 45.
3. **E-les-2: fixed.** `notifications.tsx:23-27` builds the href once, in the `then` of the session read, from
   `window.location`; effect deps `[]`. New order (null at once, wait for "Войти снова", then select Задание)
   leaves today's code at the tab-less `next`: red at the second assertion. The step-34 backup is the pre-step-39
   file, so M-notif is exactly today's code.
4. **E-les-3 region mutations: fixed.** Traced `region-cycle.tsx`: `regions()` in document order (top bar,
   notifications only while `role=region`, `main`, nested section), `cycleRegion` takes the first region
   containing focus, `focusInto` the first focusable. M-region-both: press 3 finds `main` (index 1), moves to the
   section, lands on "Курс" again: red. M-region-moved: same landings as correct code, `closest("[data-region]")`
   is `main`: red at the `closest` assertion. The dashboard's F6 test shows the skip link is outside the top-bar
   region, so press 1 lands on "Академия".
5. **M-msg schema half: fixed.** `canary-dup` duplicate-check message is the one zod message that echoes input
   (V16, matches my round-1 run); the reason is `schema: checks custom` from path and code. M-msg-schema reddens
   the `canary-dup` assertion, M-msg-yaml the `CANARY-YAML-E` one (V15). Each half named.
6. **Vendored drift: fixed, checked class by class**, not by example. Each table's App column is a complete class
   string, so any registry class not listed is deleted by construction. Against proto.css:
   - Badge: inline-flex, centre, `gap-1` = `space-1`, `w-fit`, `px-2 py-0.5` = `space-2`/`space-0-5`, 1px
     transparent border, `rounded-md` (same 0.8x in `globals.css:203`), `text-xs` (1rem line = README
     `text-xs-line`), 500, nowrap; secondary, outline, outline + `data-tone="muted"` match `:276-278`; no hover
     (never a link).
   - Item: `.item-group` `ul` flex column, no gap (`:376`); `.item` gap-4, `px-4 py-3`, transparent border,
     `rounded-md`, foreground, `no-underline` (`:377-381`); `[li+li>&]` border-top and radius 0 = `:383`; hover
     `accent`/`accent-foreground` (`:382`); content, title, description, actions, note = `:384-394`. The added
     colour transition follows README Motion ("`duration-fast` (hover)") and `button.tsx`; proto.css has none on
     `.item`, README wins.
   - Tabs: list `inline-flex w-fit flex-wrap items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground` =
     `:342-345`; trigger `min-h-8` (2rem = `control-height-sm`), `px-3 py-1`, `gap-2`, transparent border,
     `rounded-md`, `text-sm`, 500, pointer = `:346-352`; selected background, foreground, `muted-foreground`
     border, the `--shadow-sm` pair as `card.tsx:13` writes it = `:357-360` and README "Selected tab"; the
     `dark:data-active:border-input` pair deleted; `TabsContent` `min-w-0` = `:361`, `outline-none` deleted.
   - Breadcrumb: list = `:329-333`; link muted, underline 0.2em, hover foreground + 2px = `:334-335` and `a`
     (`:117-118`); separator "/" as an `aria-hidden` `li` with list `gap-1.5` reproduces `li + li::before` plus
     `margin-right: space-1-5` (`:336`); page `aria-current` foreground, no `role="link"`/`aria-disabled` = `:337`.
   - Progress: `h-2` = 0.5rem, `border-input`, `bg-secondary`, `rounded-full`, overflow hidden = `:365-368`;
     indicator width transition 200ms standard easing = `:369-372`; decorative row bars are blockified in the
     flex column in both.
   - Collapsible (own component): `gap-1.5`, `size-1.5` chevron, 2px right/bottom `currentColor`, rotate 45 /
     -135, transform transition `duration-fast` = `:397-403`; `button.tsx:28` already is the proto link variant.
   - Focus: `globals.css` base `:focus-visible` 2px/2px and `[tabindex="-1"]` inset match README "Focus ring";
     E-ring's mutations hold (Tailwind v4 `outline-none` sets `outline-style: none` and `ring-[3px]` a box-shadow,
     both in a layer after `base`). The Theory trigger is the roving tab stop (`tabIndex 0`), so the 2px offset
     assertion applies to it; the panel is `tabIndex 0` (V18).
7. **Error-class contract: fixed** (apart from issue 2). One internal `CourseFileError`, mapped per caller; the
   listing is a pure `learnerFiles(tree)`; ADR-0009 items 2 and 7 now say exactly that; U-fs asserts the internal
   error, U-read/U-text/U-export the mapped classes.
8. **Text-error state: fixed.** T-err part 3 renders it (dev server with `PORT` and `COURSE_ROOT`, both in
   `dev.passThroughEnv` after step 15), checks the log line, retry focus and the screenshots; 6.5 points at it.

## New in revision 2: checked
- **`lib/root-env.ts` as a change to #29 code.** The three call sites today (`next.config.ts:14-17`,
  `playwright.config.ts:7-10`, `scripts/seed.ts:14-17`) are the same `existsSync` + `loadEnvFile` block with
  different relative paths; one helper taking `file` keeps each site's path and comment, changes nothing when the
  flag is unset, and the typed `InvalidRootEnvOptOutError` follows the repo's error-class pattern. The standalone
  server does not execute `next.config.ts`, so the image is unaffected; the Docker build stage has no `.env`
  (`"absent"`). Sound, apart from how its mutations are run (issue 1).
- **`allowImportingTsExtensions`.** `apps/web/tsconfig.json` already has `noEmit: true`, which TS requires for it;
  `verbatimModuleSyntax` from the base config fits Node's strip-only loader. Lint is Biome (no import-extension
  rule). Sound.
- **Error type mapping.** Closed reason set, no `cause`, mapping per caller; gap in issue 2.
- **Commit supply walk.** Every commit and step re-walked; only issue 3 found. Separator, Empty, Alert (`warning`
  variant at `alert.tsx:17`), Card and Button already exist.

## Advisory (not blocking)
- A1 U-env-sites: the test file holds the needle `loadEnvFile(` itself, so "no file other than `lib/root-env.ts`"
  goes red on correct code. Exclude the test file by name or build the needle from parts.
- A2 `lib/root-env.ts` is loaded by Node's strip-only TypeScript loader (V11): no enums, namespaces or parameter
  properties in it, or Next falls back to the legacy loader with a warning. Say so in a comment, or enable
  `erasableSyntaxOnly` for that file's checks.
- A3 U-leak "every path requested from the fs is in `learnerFiles(tree)`": `listDirs(root, "")` is a request whose
  path is not a file on the list. State that the recorder logs `readText` and `isRegularFile` only, or that the
  root listing is the one allowed extra.
- A4 The per-tab `LessonTextReadError` catch on the lesson page: state `instanceof` with rethrow, as `loadOrError`
  does, so a session or programming error is not shown as "Не удалось загрузить текст урока".
- A5 The catalog prototype's lesson `ul.item-group` carries `aria-labelledby="<moduleId>-heading"`; 6.1 does not
  list it.

FAIL
