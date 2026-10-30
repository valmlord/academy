# #79 judge_design, round 1: usability

Round: `judge_design` (pipeline state, DESIGN tier, issue 79, branch `docs/79-top-bar-before-catalog`).

## Checked

- Read: issue #79; `plans/79-top-bar-before-catalog-research.md` is cited via the design file; the design
  file in full; `git diff` of `design/flows/ia.md`, `dashboard.md`, `catalog.md`; `design/flows/dashboard.md`
  in full; `ia.md` registers (`:25-100`), R3 (`:225-231`), R6 (`:281-299`), Sitemap, Navigation model and
  inventory (`:311-363`); `design/pages/dashboard/acceptance.md` in full; `dashboard/prototype.html`
  (top bar, states, label spans); `design/system/proto.js` state mechanism (`:76-150`);
  `design/system/README.md:206-212`; `sign-in/acceptance.md:14-18`.
- Shipped #29: `apps/web/components/top-bar.tsx:14-36` (brand, nav with only "Главная" `aria-current`,
  user menu), `apps/web/app/(app)/layout.tsx:15-20` (top bar, notifications, main, in that DOM order),
  `apps/web/app/(app)/page.tsx:14-27` (h1 + Empty, `main tabIndex=-1`), `components/notifications.tsx`
  (region only with the alert, "Войти снова" `href` `/sign-in?next=%2F`), `components/region-cycle.tsx`
  (cycle skips the notifications wrapper unless `role="region"`; lands on first focusable or the region),
  `e2e/dashboard.spec.ts` (F6: brand link, then `main#main`, Shift+F6 back; Tab 1 = skip link; listitem
  count 0). The before-#30 Tab order and F6 landings in `ia.md:294` and `dashboard.md:68-71` match this
  code exactly.
- Validator (orchestrator's output): exit 0, 38 "contrast ok", 2 INFO
  (`INFO :root --border on --background: 1.260:1`, `INFO .dark --border on --background: 1.260:1`), no
  flow-id lines. `grep '^## F' design/flows` shows no duplicate ids; no flow was added.
- Reran both greps of design §6 plus a wider one (`/courses/`, "Начать") and compared hits to the
  disposition table.
- Edit list items 8-11 traced through proto.js: the nine-state list on the "Курс" link matches the States
  table order, `data-default-state="first-run"` keeps the default, the Empty tagged
  `no-ready-lessons before-catalog` plus the untagged h1 gives exactly #29's `main`; the label span makes
  `before-catalog` last in the index. Correct.

## Dead ends, per release

- Before #30: dashboard reachable after sign-in (F1.4) and from "Академия"/"Главная" (both to `/`);
  F2.1 "Войти снова" -> sign-in -> back to `/`; F3 "Выйти" -> sign-in. No control targets a missing route.
  No dead end in any reachable flow.
- From #30: unchanged design (F4, F5, F18 with "Курс"); not-found now ships with #30 and its `F6` `main`
  lands on "Открыть курс" (`catalog.md:40-41`).

## Vocabulary

UI terms in the change: "Академия", "Главная", "Курс", "Открыть курс", "К содержимому", "Войти снова",
"Уведомления", "Верхняя панель", "В курсе пока нет готовых уроков". One term per concept; all registered
(`ia.md:35`, `:71`, `:83-90`). "Курс" (nav/breadcrumb) and "Открыть курс" (button) are both "open the
catalog" rows but distinguished by their action column, consistent with the lesson page. Design-side terms
"before #30" / "from #30" / state `before-catalog` / label "before #30 (no catalog)" are used consistently.

## Heuristic walkthrough (Nielsen)

- F4 before #30: H1 visibility, one message, nothing pretends to load; H3 user control, nothing to undo,
  bar works; H4 consistency, same bar rule on every page of a release (`ia.md:290-291`); H5 error
  prevention, no dead link (the point of the change); H7 flexibility, F6 and Tab identical to #29.
  H2 match with the real world: see open point below.
- F2.1 / F3 before #30: unchanged, verified against `notifications.tsx` and the user menu.
- F5 from #30: H4, not-found takes the from-#30 bar, no per-page variant.

## Open point: "В курсе пока нет готовых уроков" before #30

Acceptable, not a blocker: the state lives until #30 only, the sole learner cannot open a lesson either way
(no action is lost), #29 already ships the string from the register, and new copy would need an app change
for a state about to vanish. But the stated reason is wrong: `dashboard.md:66-67` calls it "what the page
can truthfully say", while with module 00 `ready` the sentence is literally false (H2). Reword the
justification to an accepted, temporary inaccuracy (see N1). A precedent for honest copy exists
("Окружение и проверки появятся в следующей версии платформы", `ia.md:73`), so if Stepan prefers accuracy
that is the pattern; I do not require it.

## Blocker

1. [plans/79-top-bar-before-catalog-design.md:114, :147-148, :168-169; design/pages/dashboard/acceptance.md:155-173]
   The hidden class in R6 (`ia.md:281-286`) includes the Card button "Начать"/"Продолжить" and module rows,
   but the grep covers only "Курс" and "Открыть курс", so the acceptance checks that describe those
   controls are neither edited nor listed. AC1 ("the Card shows the first `ready` lesson..."), AC2, AC4
   ("the course line counts..."), AC5 (module row opens `/courses/...`) and AC9 are unconditional
   statements; against #29's build with module 00 `ready` a tester marks them FAIL, and they contradict
   the planned AC14 ("no link to a `/courses/...` route appears anywhere"). Item 2's States-table paragraph
   scopes states, not checks. Fix: add to the edit list one line at the head of "Acceptance checks":
   "AC1-AC9 apply from #30; before #30 AC3, AC10-AC14 apply" (or per-AC prefixes), and the same "from #30"
   qualifier for the Flows table (`acceptance.md:14-23`, F4.x/F18.x) and Layout `:38` (Card, progress
   section); extend the §6 grep with `Начать`, `Продолжить`, `/courses/`, `F4.`, `F18.` and dispose of
   the hits.

## Non-blocking

- N1. [design/flows/dashboard.md:66-67] "truthfully" is inaccurate (see open point).
- N2. [design/flows/dashboard.md:72] "F4.2-F4.3 and F18 are not reachable": F4.1 (the Card) is not shown
  either; say "F4.1-F4.3".
- N3. [design/flows/ia.md:360-363] Before #30 an unknown URL renders Next's default 404 (no not-found
  page, no top bar, English; #29 has no `not-found` file). Reachable only by typing a URL, browser Back
  exits, so not a flow dead end; one sentence in R6 would record it.

FAIL - 1 issue found
