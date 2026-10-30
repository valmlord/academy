# #79 design: top bar before the catalog ships ("Курс" link, R6)

Phase: architect, DESIGN tier. Research: `plans/79-top-bar-before-catalog-research.md` (cited as
"research §n"). Line numbers are on `docs/79-top-bar-before-catalog` after this phase's flow edits.

## Revision 2 (after judge_design round 1)

Round 1: accessibility PASS, consistency PASS, usability FAIL (one blocker). Fixed:

| Finding | Fix | Where |
|---------|-----|-------|
| usability B1: the grep covered only "Курс" and "Открыть курс", so the dashboard checks and tables describing the other hidden controls (Card button, module rows, course line) stayed unconditional | grep extended to the whole hidden class (labels, routes, flow step ids, component words); every hit has a disposition; release qualifiers for the Flows table, Layout, Components, Interactions, Copy and the Acceptance checks of the dashboard added to the product-designer edit list; AC numbers verified against the shipped #29 page | section 6 (commands and hit table); section 5 items 6, 13-18 |
| usability N1: "truthfully" for "В курсе пока нет готовых уроков" | reworded as an accepted, temporary inaccuracy with its reasons | `dashboard.md:66-77`; section 2 |
| usability N2: "F4.2-F4.3" | "F4.1-F4.3 and F18 are not shown" | `dashboard.md:76` |
| usability N3: unknown URL before #30 | one sentence in R6: the framework's default 404, no top bar, reached only by typing a URL | `ia.md:288-290` |
| accessibility N1: `aria-current` on lesson and not-found | "the lesson page and not-found put `aria-current` on neither top-bar link" | `ia.md:300-301` |
| accessibility N2: keyboard path is from #30 | marked "from #30", before-#30 path added | `dashboard.md:55-58` |
| consistency A1: prototype comment `:75` | product-designer item 19 | section 5 |

Found by the extended grep, also fixed in the flows: `ia.md:342-344` (primary action per page: the dashboard
has none before #30), `progress.md:15-16` (F18 entry from #30), and `dashboard.md:71-72` (loading, course
error and progress unavailable do not occur before #30, because #29 reads neither the course nor progress:
`apps/web/app/(app)/page.tsx:14-27`).

## 1. Scope

In scope: the top bar's release state before #30 (catalog route) and from #30, for every page with a top
bar; the dashboard's "before #30" state (acceptance notes and one prototype state); a general rule so a
future page cannot drift. Flows and IA are edited in this phase; page and system edits are listed in
section 5 for the product-designer (author phase).

## 2. Decision

Option A from the research (the orchestrator's direction, kept).

- **R6 hides every control whose target is a `/courses/...` route until #30 ships it**, the top-bar link
  "Курс" first among them, because a link to a missing route is a dead end (A15, `ia.md` R6) and a link
  has no disabled state: HTML `disabled` applies to form controls only and `aria-disabled` neither blocks
  activation nor removes focus (research §5); R1 is for actions and needs a visible reason, and the
  one-row top bar has no slot for one (`design/system/README.md:206-212`).
- Not option B (a disabled link per R1), because of the same reasons plus it contradicts what #29
  shipped (`apps/web/components/top-bar.tsx:14-36`, research §2). Not option C (keep "Курс"
  unconditional), because it leaves the design and the shipped app in conflict, which #79 exists to close.
- **The rule covers the whole class, not only the top-bar link** ("Открыть курс", the dashboard Card
  button, which opens a lesson route, module rows, the breadcrumbs), because the same dead-end argument
  applies to each and naming only one link would invite the next drift. In practice before #30 this leaves
  the dashboard with its "no ready lessons" content, which is exactly what #29 renders
  (`apps/web/app/(app)/page.tsx:11-27`).
- **The copy "В курсе пока нет готовых уроков" stays for the before-#30 state** as an accepted, temporary
  inaccuracy (with module 00 `ready` the sentence is not literally true), because #29 already ships the
  registered string, new copy would need an app change for a state that #30 removes, and the learner loses
  no action: no lesson can be opened before #30 either way.
- **The dashboard prototype gains the state `before-catalog`**, because the difference is visible (one nav
  link fewer, and `main` is the empty state whatever the course holds) and the issue asks for a state when
  it differs visibly. It follows the lesson's release-state pattern (`#state-m0`): one named state,
  elements tagged with `data-state`.
- **One top bar per release on every page; `F6` landing on "Верхняя панель" stays "Академия"**, because
  "Академия" is the bar's first focusable element in both releases and is never hidden, so no landing
  table changes when "Курс" arrives.

Recorded in `design/flows/ia.md` R6, paragraph "Before the catalog ships (#30)" (`ia.md:281-303`).

## 3. Per release state

Release states: **before #30** = the dashboard only, as #29 shipped; **from #30** = dashboard, catalog,
lesson, not-found, all with the top bar. Sign-in has no top bar in either (`sign-in/acceptance.md:54`).

| Release | Top bar, in Tab order after "К содержимому" |
|---------|---------------------------------------------|
| before #30 | "Академия", "Главная" (`aria-current="page"`), user menu |
| from #30 | "Академия", "Главная", "Курс", user menu; `aria-current="page"` on "Главная" on the dashboard, on "Курс" on the catalog, on neither on the lesson and not-found |

Per page:

| Page | Release | Tab order | `F6` regions (landing) |
|------|---------|-----------|------------------------|
| dashboard | before #30 (`#state-before-catalog`) | "К содержимому", "Академия", "Главная", user menu, "Войти снова" (only with the alert); nothing in `main` | "Верхняя панель" ("Академия"); "Уведомления" ("Войти снова", only with the alert); `main` (`main` itself, `tabindex="-1"`) |
| dashboard | from #30 (the nine existing states) | "К содержимому", "Академия", "Главная", "Курс", user menu, "Войти снова" (only with the alert), then `main` as `dashboard/acceptance.md:83-85` | unchanged: `dashboard/acceptance.md:86-88` |
| catalog | from #30 only | unchanged: `catalog/acceptance.md:83` ("top bar" = the from-#30 bar) | unchanged: `catalog/acceptance.md:94-95` |
| lesson | from #30 only | unchanged: `ia.md` R4, `lesson/acceptance.md:208` | unchanged: `lesson/acceptance.md:192-203` ("Академия" in every row) |
| not-found | from #30 only | "К содержимому", the from-#30 bar, "Войти снова" (only with the alert), "Открыть курс" | "Верхняя панель" ("Академия"); "Уведомления" (only with the alert); `main` ("Открыть курс") (`catalog.md:36-41`) |

General rule (`ia.md` R6): the bar is the same on every page of a release; a page added later takes the
bar of the release it ships in, never a variant of its own.

### The `before-catalog` state and the existing dashboard states

- `#state-before-catalog`: top bar without "Курс"; `main` = h1 "Главная" plus the Empty "В курсе пока нет
  готовых уроков", i.e. `#state-no-ready-lessons` minus the link.
- The nine existing states are the from-#30 states and keep "Курс".
- `#state-no-ready-lessons` stays: from #30 it is the real "no `ready` lesson" case (AC7) with "Курс" in
  the bar; `before-catalog` is the same `main` for a different reason.
- Session expired (F2.1) and the user menu (F3) also occur before #30. They are not drawn as extra states,
  because each part is already drawn: the bar of `before-catalog`, the alert of `session-expired`, the
  open menu of `user-menu`. The acceptance notes state the combination in words (section 5).

## 4. Flow and IA edits made in this phase

- `design/flows/ia.md:84-85`: Action labels rows "open the dashboard (top bar)" ("Академия", "Главная")
  and "open the catalog (top bar, lesson breadcrumb)" ("Курс", from #30); both were missing from the
  register. `ia.md:90`: "Открыть курс" marked "from #30".
- `ia.md:281-303`: R6 paragraph "Before the catalog ships (#30)" with the rule, the controls it covers, the
  default 404 before #30 (`:288-290`), the "Top bar by release" table and `aria-current` per page.
- `ia.md:318-319`: sitemap note (the sitemap is the from-#30 one).
- `ia.md:330-331`: Navigation model, "Курс" qualified "from #30".
- `ia.md:342-344`: primary action per page, the dashboard's "from #30".
- `ia.md:360`: page inventory, dashboard Flows "F5 (entry "Открыть курс", from #30)";
  `ia.md:367-368`: release per page under the inventory.
- `design/flows/dashboard.md:53`: Exit "the catalog via the top bar (F5, from #30)";
  `dashboard.md:55-58`: keyboard path by release; `dashboard.md:62-78`: section "Dashboard by release".
- `design/flows/progress.md:15-16`: F18 entry "from #30".
- `design/flows/catalog.md:40-41`: not-found ships with #30, with the from-#30 bar; its `F6` `main` lands
  on "Открыть курс".

Register check: the change renders or removes the strings "Академия", "Главная", "Курс", "Открыть курс",
"В курсе пока нет готовых уроков", "Войти снова", "К содержимому", "Уведомления", "Верхняя панель". All are
in `ia.md`'s registers: Action labels (`:83-90`), dashboard page copy (`:71`), the region vocabulary
(`:35`). The prototype state label "before #30 (no catalog)" is prototype chrome (`lang="en"`, not product
UI) and is not registered, like the existing nine labels. Against the page inventory: the "before #30"
state belongs to the dashboard row; catalog, lesson and not-found rows now carry "from #30".

## 5. Edit list for the product-designer (author phase)

`design/pages/dashboard/acceptance.md`:
1. States table, after `:76`: add the row
   `| before #30 (no catalog) | #state-before-catalog | top bar "Академия", "Главная", user menu, no "Курс" (ia.md R6, "Before the catalog ships"); main as "no ready lessons": h1 and Empty "В курсе пока нет готовых уроков", nothing focusable |`.
2. After the R5 note (`:78-79`), one paragraph: release states per `design/flows/dashboard.md` "Dashboard
   by release": before #30 only `before-catalog` ships; the nine other states are from #30. Before #30 the
   F2.1 alert and the user menu work on top of `before-catalog` (bar of `before-catalog`, alert of
   `session-expired`, menu of `user-menu`); not drawn as separate states.
3. Interactions, `:83-85`: prefix the Tab order with "From #30:"; add "Before #30: "К содержимому",
   "Академия", "Главная", user menu, "Войти снова" (only with the alert); nothing focusable in `main`."
4. Interactions, `:86-88`: add "Before #30 the same cycle; `main` lands on `main` itself, as in "no ready
   lessons"."
5. Copy, `:110`: `| top bar nav | Главная; Курс (from #30, ia.md R6; before #30: Главная) |`.
6. Acceptance checks, after `:180`: add AC14: "Before #30 the top bar shows "Академия", "Главная" and the
   user menu with no "Курс", and no link to a `/courses/...` route appears anywhere on the page; `main`
   shows only the h1 and "В курсе пока нет готовых уроков", nothing focusable, whatever the course holds;
   Tab order and `F6` as in Interactions (before #30); `F6` to the top bar lands on "Академия"."
   And at the head of "Acceptance checks", after `:153`, one line: "AC1-AC6, AC8 and AC9 apply from #30.
   AC7 and AC10-AC13 apply in both releases; before #30 AC7's `main` is shown whatever the course holds
   (AC14). AC14 applies before #30 only (`ia.md` R6, "Before the catalog ships")." Why these numbers,
   checked against #29's `apps/web/app/(app)/page.tsx:14-27`: AC1, AC2 describe the Card and its button;
   AC3, AC4, AC5 the course line, the module rows and their `/courses/...` links; AC6 "Открыть курс";
   AC8 and AC9 the course and progress read failures, which cannot occur before #30 because #29 reads
   neither. AC10 (session alert), AC11 (user menu), AC12 (`F6` cycle), AC13 (no horizontal scroll, one-row
   bar) hold on the before-#30 page as on every other.
7. `Status: ready` stays (`:30`).

`design/pages/dashboard/prototype.html`:
8. `:25`: the "Курс" link gets
   `data-state="first-run in-progress all-passed no-ready-lessons loading course-error progress-unavailable session-expired user-menu"`
   (every state except `before-catalog`; the lesson prototype tags elements the same way, e.g.
   `lesson/prototype.html:148`). Word order matches the label spans `:157-165`. Side effect: proto.js
   builds the state index in first-seen order (`proto.js:76-84`), and this link is now the first tagged
   element, so the "Prototype states" bar lists the states in table order, `before-catalog` last.
9. `:76`: the Empty gets `data-state="no-ready-lessons before-catalog"`.
10. After `:165`: `<span hidden data-state="before-catalog" data-state-label="before #30 (no catalog)"></span>`.
11. Nothing else changes: the h1 has no `data-state` and shows in every state; the card, progress section,
    "Открыть курс", skeletons and the course error carry state lists without `before-catalog`, so they
    are hidden there; the notifications template stays on `session-expired`.

`design/system/README.md`:
12. `:206`, top bar rules: after "Pages add no top bar overrides." add "The nav's links follow the
    release, the same on every page (`ia.md` R6, "Before the catalog ships"): "Главная" before #30,
    "Главная" and "Курс" from #30."

`design/pages/dashboard/acceptance.md`, release qualifiers for content hidden before #30 (B1):
13. Flows table, after `:23` (before the F18.3 note): "F4.1-F4.3 and F18.1-F18.2: from #30. Before #30
    the page has elements only for F2.1, F3.1 and F3.2 (`ia.md` R6, "Before the catalog ships")."
14. Layout, `:38-39`: "then `main` with h1, the Card, the progress section" becomes "then `main` with h1,
    the Card, the progress section (from #30; before #30 h1 and the Empty "В курсе пока нет готовых
    уроков", `ia.md` R6)"; `:41`: "module rows show" becomes "module rows (from #30) show".
15. Components, after the table (`:60`): "Card, Button, Badge, Progress, Item and Skeleton appear from
    #30; before #30 the page uses Empty, the session Alert and DropdownMenu only."
16. Interactions, the bullets at `:89` ("Начать" / "Продолжить"), `:90` (course error "Повторить"), `:92`
    (progress "Повторить") and `:95` (module row): prefix each with "From #30:".
17. Copy, after the table (`:132`): "Rows "card title" to "open catalog" and "course line" to "lesson
    type" are shown from #30; before #30 the page renders title and h1, skip link, top bar brand and nav,
    user menu item, the notifications heading, the session alert and action, and "no ready lessons"."
18. States table, `:71` ("no ready lessons"): no edit; it stays the from-#30 "no `ready` lesson" case,
    item 1 adds the before-#30 row next to it.

`design/pages/dashboard/prototype.html`, comment (consistency A1):
19. `:75`: "F4 empty: no ready lesson at all. Nothing focusable in main, so F6 lands on main (R3)." becomes
    "F4 empty: no ready lesson at all (no-ready-lessons), and every course before #30 (before-catalog,
    ia.md R6). Nothing focusable in main, so F6 lands on main (R3)."

No edit (checked): catalog and lesson prototypes and acceptance notes (they ship only from #30 and show
the from-#30 bar); `design/system/components.html:267-300` (the gallery shows the full, from-#30 bar);
`design/system/proto.css` and `proto.js` (no mechanism change; #80 untouched).

## 6. Grep for the hidden items

The hidden class (R6, "Before the catalog ships"): the top-bar "Курс", "Открыть курс", the Card and its
button "Начать" / "Продолжить", the progress section with its module rows, the lesson breadcrumbs ("Курс",
module crumb), and every `/courses/...` route. Commands (from the worktree root; run after this phase's
flow edits, so `ia.md`, `dashboard.md` and `progress.md` line numbers are the edited ones; `acceptance.md`
and `prototype.html` lines are unedited):

```
# 1. top bar and its link (round 1)
grep -rn -i -e '"Курс"' -e '>Курс<' -e 'Главная; Курс' -e 'top bar' -e 'topbar-nav' design
# 2. hidden controls, their routes and the flow steps they serve
grep -rn -e 'Открыть курс' -e 'Начать' -e 'Продолжить' -e '/courses/' -e 'F4\.' -e 'F5\.' -e 'F18\.' design
# 3. hidden content by name (module rows, crumbs, Card, course line, progress section)
grep -rn -i -e 'module row' -e 'module crumb' -e 'breadcrumb' -e 'Следующий урок' -e 'Пройдено уроков' \
  -e 'Пока нет пройденных' -e 'progress section' design
```

Hits per file (union of the three), with disposition. "From #30 only" means the file describes a page or
flow that ships with #30 (catalog, lesson, not-found), so every statement in it holds only from #30 by the
inventory's release line (`ia.md:367-368`) and needs no per-line qualifier.

| File: lines | Disposition |
|-------------|-------------|
| `ia.md:84-85, :90` | qualified / added this phase |
| `ia.md:46-49` (status and type sets: dashboard F4, F18, F18.3) | no change: vocabulary; where it renders is qualified elsewhere |
| `ia.md:56, :151, :335` ("Уведомления" on every page with the top bar) | no change: true in both releases |
| `ia.md:71` (dashboard copy register) | no change: the register lists strings, not releases; "no ready lessons" is the before-#30 string |
| `ia.md:89, :264, :267` ("Начать" / "Продолжить" rule, R5) | no change: the rule applies whenever the button is shown (from #30) |
| `ia.md:95, :159, :203` ("Продолжить работу") | no change: a different control (F10, lesson page) matched by the substring |
| `ia.md:168` (page-level "Повторить", dashboard card or progress section) | no change: the states that need it occur from #30 only (`dashboard.md:71-72`) |
| `ia.md:179, :181, :205, :213, :241-242, :248` (R3/R4 lesson page, breadcrumbs) | no change: lesson page, from #30 only |
| `ia.md:230-231` (R3 other pages; dashboard lands on the Card button or "Открыть курс"; "no ready lessons" on `main`) | no change: the before-#30 landing equals the "no ready lessons" landing, stated in R6 (`:296-303`) |
| `ia.md:281-303` | R6 paragraph, this phase (incl. N3 404 and `aria-current`) |
| `ia.md:310-311, :318-319, :321` (sitemap, A6 module sections) | sitemap qualified this phase (`:318-319`); A6 unchanged (catalog, from #30) |
| `ia.md:329-331` | qualified this phase |
| `ia.md:339` (breadcrumbs) | no change: lesson page, from #30 only |
| `ia.md:342-344` (primary action per page) | qualified this phase |
| `ia.md:360-362, :366-368` (inventory rows, release line) | dashboard row qualified; catalog, lesson, not-found rows are from #30 by `:367` |
| `dashboard.md:6, :13` (F18 pointer; entry via "Главная"/"Академия") | no change: both links exist in both releases |
| `dashboard.md:17-23, :31, :34, :40, :42, :47, :49` (F4 steps, rules, error and empty states) | no change: F4 as designed is the from-#30 flow; `:78` says so, `:76` says F4.1-F4.3 are not shown before #30 |
| `dashboard.md:53, :55-58, :62-78` | qualified / added this phase |
| `progress.md:15-16` | qualified this phase |
| `progress.md:20, :22, :24, :26, :35, :40, :42, :53` (F18 steps, module rows, F19 entry from F18.3) | no change: F18 entry is "from #30" (`:15-16`); F18.3-F18.4 and F19 are D4 |
| `catalog.md:3-91` (all hits) | no change: catalog and not-found, from #30 only; `:40-41` qualified this phase |
| `lesson-environment.md:3-287`; `checks.md:91, :155` (all hits) | no change: lesson page, from #30 only |
| `auth.md:69, :91, :101` | no change: user menu and alert exist in both releases |
| `dashboard/acceptance.md:17, :43, :62, :138, :179, :180` (top bar, user menu, regions) | no change: hold in both releases |
| `dashboard/acceptance.md:19-23, :25` (Flows table F4.x, F18.x) | item 13 |
| `dashboard/acceptance.md:34` (Purpose, F4 and F18.1-F18.2) | no change: the page's purpose; the release is stated in the Flows note (item 13) and States (item 2) |
| `dashboard/acceptance.md:38-39, :41` (Layout: Card, progress section, module rows) | item 14 |
| `dashboard/acceptance.md:52-53, :56` (Components: Card, Button, Item) | item 15 |
| `dashboard/acceptance.md:68-76, :78` (States rows, R5 note) | items 1-2 (`:71` stays, item 18) |
| `dashboard/acceptance.md:83-85, :88` (Tab order, `F6` landing) | items 3-4 |
| `dashboard/acceptance.md:89-90, :92-93, :95-96` (button, both "Повторить", module row) | item 16 |
| `dashboard/acceptance.md:109-110` | item 5 (`:109` brand: no change) |
| `dashboard/acceptance.md:115, :117-118, :125, :127-129` (Copy rows) | item 17 |
| `dashboard/acceptance.md:146` ("Прогресс недоступен" composition) | no change: describes a from-#30 state, scoped by item 2 |
| `dashboard/acceptance.md:157-172` (AC2-AC9) | item 6 (head line: AC1-AC6, AC8, AC9 from #30; AC7 both) |
| `dashboard/acceptance.md:184` (open question, progress heading) | no change: from-#30 content, no release claim |
| `dashboard/prototype.html:25` | item 8 |
| `dashboard/prototype.html:57, :68, :80-83, :96-97, :107, :110-116, :129` (skeletons, course error, Card, all-passed, progress section, module rows) | no change: each carries a state list without `before-catalog` (item 11), so it is hidden in that state |
| `dashboard/prototype.html:75` (comment above the Empty, not a grep hit: found by consistency A1) | item 19 |
| `dashboard/prototype.html:171` (script comment, F4.3 targets) | no change: page behaviour of the from-#30 button |
| `catalog/acceptance.md`, `catalog/prototype.html` (all hits) | no change: from #30 only |
| `lesson/acceptance.md`, `lesson/prototype.html` (all hits) | no change: from #30 only |
| `sign-in/acceptance.md:16-17`; `sign-in/prototype.html:52, :105` (sample `next=/courses/...`) | no change: prototype chrome and sample data; before #30 no page produces such a `next` ("Войти снова" sends `/`) |
| `sign-in/acceptance.md:54` | no change: sign-in has no top bar |
| `design/system/README.md:206-212` | item 12 |
| `design/system/README.md:64, :161-164, :186, :271, :287`; `components.html:42, :79, :107, :172-175, :200, :267-300`; `proto.css:327-337, :478-492` | no change: component docs, the gallery and styles show every component in full; they make no release claim; proto.css is #80's |
| `plans/50-learner-flows-design-system-design.md:156-160` (outside `design/`) | not edited: merged history of #50; `design/` is the source of truth |

## 7. What is NOT designed

- No new copy, no disabled-link pattern, no change to R1.
- No prototype for not-found (still "prototyped with the app shell later", `ia.md:358`); its from-#30 bar
  and landing are specified above.
- No change to catalog or lesson pages, to the system's components, tokens, `proto.css` (#80) or `proto.js`.
- No change to what #30 ships beyond what its issue already lists ("Курс" with the catalog).
- No release states for later issues (#31-#40); the lesson's are in `lesson-environment.md`.

## 8. Validator

`python3 -I scripts/design_tokens.py check design`: exit 0. 38 `contrast ok` lines (19 `:root`, 19
`.dark`), 2 INFO lines (`--border on --background: 1.260:1`, both themes); no flow-id error, no failure.
