# #79 judge_ux round 1: usability

Round: `judge_ux` (read from `.claude/pipeline_state.json`, phase `judge_ux`), round 1. Role file
`.claude/agents/design/judge-usability.md`; loaded `judge_mistakes.md` and `_contract.md`.

## What I read

- `gh issue view 79`; `plans/79-top-bar-before-catalog-design.md` (rev 2), `plans/79-top-bar-before-catalog.md`,
  `plans/79-top-bar-before-catalog-author-report.md`.
- `git diff main -- design` in full: `design/flows/{catalog,dashboard,ia,progress}.md`,
  `design/pages/dashboard/acceptance.md` (whole file, 212 lines), `design/pages/dashboard/prototype.html`,
  `design/system/README.md`; `design/system/proto.js` state code (`:76-110`).
- Shipped #29: `apps/web/components/top-bar.tsx`, `apps/web/components/notifications.tsx`,
  `apps/web/app/(app)/layout.tsx`, `apps/web/app/(app)/page.tsx`, `apps/web/e2e/dashboard.spec.ts`.
- Validator output (orchestrator's `validator-ux.txt`): exit 0, 38 contrast ok, and only
  `INFO :root --border on --background: 1.260:1` / `INFO .dark --border on --background: 1.260:1`; no flow-id
  lines.

## Edit list items 1-19 against the diff

| Item | Where | Result |
|------|-------|--------|
| 1 | `acceptance.md:85` | row text verbatim |
| 2 | `acceptance.md:90-93` | as specified |
| 3 | `acceptance.md:97-100` | "From #30:" / "Before #30:" as specified |
| 4 | `acceptance.md:103-104` | verbatim |
| 5 | `acceptance.md:126` | as specified, R6 cited by section name (plan, consistency A2) |
| 6 | `acceptance.md:175-176` head line, `:204-207` AC14 | verbatim |
| 7 | `acceptance.md:33` | `Status: ready` unchanged |
| 8 | `prototype.html:25` | nine from-#30 states, label-span order |
| 9 | `prototype.html:77` | `no-ready-lessons before-catalog` |
| 10 | `prototype.html:167` | label span added last |
| 11 | prototype | no other change (diff has only items 8, 9, 10, 19) |
| 12 | `design/system/README.md:212-214` | verbatim, after "Pages add no top bar overrides." |
| 13 | `acceptance.md:25-26` | verbatim |
| 14 | `acceptance.md:41-46` | both edits |
| 15 | `acceptance.md:66-68` | widened per plan (usability N1 / consistency advisory 1): every rendered component named |
| 16 | `acceptance.md:105, :106, :108, :111` | four "From #30:" prefixes |
| 17 | `acceptance.md:150-152` | verbatim; I checked the split against the Copy table: rows `:131-141` and `:143-148` from #30, the before-#30 list equals rows `:123-130` plus `:142`, nothing left out |
| 18 | `acceptance.md:79` | unchanged |
| 19 | `prototype.html:75-76` | verbatim (wrapped) |

Plan extra, usability N2: `acceptance.md:169-170` prefixed "From #30:". Done.

## Before-#30 dashboard against what #29 ships

- Top bar: `top-bar.tsx:20-34` renders "Академия", nav with "Главная" (`aria-current="page"`) only, user menu.
  Acceptance `:85`, AC14 `:204`, `ia.md:297`: the same three.
- `main`: `page.tsx:17-24`, h1 "Главная" plus Empty `noReadyLessonsMessage`, `tabIndex={-1}`, nothing focusable;
  AC14 `:205-206` and `dashboard.md:66-74` say the same.
- Shell: `layout.tsx:16-19` top bar, Notifications, main; `notifications.tsx` ships the F2.1 alert with "Войти
  снова", so AC10 "both releases" (`acceptance.md:175`) is right; the user menu ships, so AC11 is right; e2e
  `dashboard.spec.ts:48-58` asserts the before-#30 `F6` cycle Академия -> `main` -> Академия (AC12, AC14);
  `:41-45` asserts no horizontal scroll at 375 (AC13).
- AC release split (`acceptance.md:175-176`): AC1-AC6 need the Card, course line, module rows or "Открыть курс";
  AC8-AC9 need course/progress reads that #29 does not do. Correctly from #30. AC7, AC10-AC13 hold on the shipped
  page. AC14 before #30 only. Each AC is a statement a tester can mark (AC14: count of top-bar links, absence of
  any `/courses/` href, `main` text, Tab and `F6` sequences).

## Headless walkthrough (my own run)

Script `judge-usability-ux.js` in the session scratchpad (Playwright 1.64.1, chromium, `file://`, 1280x900):

- `#state-before-catalog`: active state `before-catalog`; non-chrome focusables: "К содержимому" (`#main`),
  "Академия", "Главная", user menu button, and `main` (`tabindex=-1`). No link to catalog or lesson. Visible
  `data-step`: F3.1 only (F3.2 inside the closed menu; F2.1 template tagged `session-expired`), matching
  `acceptance.md:25-26`. `main` text: "Главная" / "В курсе пока нет готовых уроков".
- Tab: К содержимому, Академия, Главная, user menu, then prototype chrome. Matches `acceptance.md:99-100`.
- Skip link from `before-catalog`: focus on `main`, state stays `before-catalog` (proto.js keeps the state on a
  non-state hash).
- `F6`: Академия, `main`, Академия (wraps). Matches `:103-104`, AC14, `ia.md:297`.
- All ten states in the "Prototype states" bar open via `#state-<name>`; "Курс" visible in the nine from-#30
  states, hidden only in `before-catalog`.
- No dead end: from `before-catalog` the learner can go home ("Академия", "Главная"), open the user menu and
  sign out (F3.1 -> F3.2 -> sign-in `#state-signed-out`). The F2.1 path is specified in words
  (`acceptance.md:90-93`), as the design decided (design §3).

## Vocabulary and copy

- Russian strings added or re-scoped: "Академия", "Главная", "Курс", "Открыть курс", "В курсе пока нет готовых
  уроков", "Войти снова", "К содержимому", "Уведомления", "Верхняя панель". All present in `ia.md` registers
  (`:84-85`, `:90`, the dashboard page copy row, region row). One term per concept; no new copy.
- Copy table `acceptance.md:126` "top bar nav" agrees with `ia.md:84-85` (Главная every page; Курс from #30).
- Release vocabulary is consistent: "before #30" / "from #30", rule cited as R6 "Before the catalog ships"
  everywhere; prototype label "before #30 (no catalog)" is English chrome.
- Added lines: no em or en dashes, no curly quotes or guillemets (grep of `git diff main -- design`).

## Blockers

None.

## Non-blocking notes

1. `design/flows/ia.md:89` "open the next lesson" ("Начать" / "Продолжить") keeps v1 "yes" without "from #30",
   while `:90` "Открыть курс" got the qualifier and R6 (`ia.md:281-285`) and the Copy note
   (`acceptance.md:150`) hide the Card button before #30. Not a contradiction (v1 includes #30, and the design
   disposition table records it as "no change"), but the register is asymmetric. Could take the same qualifier
   when the flows are next touched.
2. `design/pages/dashboard/prototype.html:24-25`: "Академия" and "Главная" link to `prototype.html`, so from
   `#state-before-catalog` they reload into the default `first-run`, which shows "Курс". Every non-default state
   behaves this way (pre-existing proto pattern) and the acceptance notes are unambiguous, so it does not mislead
   dev; only a reviewer walking the before-#30 page by clicking will leave the release state.
3. Pre-existing, outside this diff: AC10 (`acceptance.md:199`) says `/sign-in?next=/`, while Interactions
   (`:116`) and the shipped app (`dashboard.spec.ts:86`) use `/sign-in?next=%2F`. A tester comparing the href
   literally would mark AC10 failed. Worth a one-word fix in a follow-up.
4. `acceptance.md:70` (Compositions) and `:163-168` name the "Прогресс недоступен" composition without "from
   #30"; it is scoped by the States paragraph `:90-93`, so no reader can misapply it.

PASS - no usability blockers; items 1-19 applied, before-#30 state matches #29, every AC testable and assigned
