# #79 research: top bar before the catalog ships ("Курс" link, R6)

Phase: researcher, DESIGN tier. Facts only; every claim carries file:line. Line numbers are on branch
`docs/79-top-bar-before-catalog` at 7706f71.

## 1. Where `design/` names the top-bar "Курс" link, the Tab order, region "Верхняя панель"

### Rules (`design/flows/ia.md`)
- Action labels: "a hidden control appears only when its issue ships (rule R6)" (`ia.md:79`).
- R3, lesson page region 1: "Верхняя панель" (`banner`): "Академия", "Главная", "Курс", user menu
  (`ia.md:177`). The landing element of "Верхняя панель" is "Академия" in every row of the lesson
  landing table (`design/pages/lesson/acceptance.md:192-203`), not "Курс".
- R3, other pages: cycle "Верхняя панель", "Уведомления" (if non-empty), `main`; dashboard `main` lands on
  the Card button, "Повторить" or "Открыть курс", or `main` itself in "В курсе пока нет готовых уроков";
  sign-in has no top bar and no cycle (`ia.md:226-230`).
- R4: skip link first on every page; lesson Tab order "skip link; top bar; ..." (`ia.md:234-244`). R4
  does not enumerate the top bar's links.
- R6: lists the hidden v1 features (Редактор, Agent, Квиз, mentor, budget, #35 extras) and points to
  "Lesson page by release" for the lesson's release states (`ia.md:267-277`). It does not name the top
  bar link "Курс" or any page other than the lesson.
- Sitemap: dashboard -> catalog `/courses/[courseId]` "Курс" (`ia.md:281-290`).
- Navigation model: "Top bar on every page except sign-in (the not-found state included): ... "Главная",
  "Курс", and a user menu" (`ia.md:300-304`). Stated unconditionally, no release qualifier.
- Breadcrumb "Курс" on the lesson page (`ia.md:309-311`); it is a different control from the top-bar
  link but carries the same label and target (`design/pages/lesson/acceptance.md:248`).
- Page inventory: not-found is "an app-shell state ... prototyped with the app shell later" with a top
  bar (`ia.md:332`; `design/flows/catalog.md:36-40`).
- R1 (disabled actions with a reason) covers actions: `aria-disabled`, focusable, visible reason
  (`ia.md:114-125`); its table lists no navigation link.

### Dashboard (`design/pages/dashboard/`)
- Tab order: "К содержимому", "Академия", "Главная", "Курс", user menu, "Войти снова" (alert only), then
  `main` (`acceptance.md:83-85`). Unconditional.
- `F6` cycle: "Верхняя панель" ("Академия"), "Уведомления", `main` (`acceptance.md:86-88`); AC12
  (`acceptance.md:179`). Landing element "Академия" does not depend on "Курс".
- Copy: "top bar nav | Главная; Курс" (`acceptance.md:110`).
- States table (`acceptance.md:66-76`) has no release state; the top bar is the same in all nine states.
- Prototype draws "Курс" in every state: `prototype.html:25`
  (`<a href="../catalog/prototype.html">Курс</a>`, no `data-state`).
- Controls in `main` that route to the catalog: "Открыть курс" in `#state-all-passed`
  (`acceptance.md:70`, AC6 `:165-166`, `prototype.html:107`); module rows to
  `/courses/[courseId]#[moduleId]` (`acceptance.md:95-97`, AC5 `:163-164`). Both belong to data states
  #29 deferred (section 2); neither exists in #29's empty state.
- Flow side: `design/flows/dashboard.md:49` ("Открыть курс" in all-passed), `:53` (exit "the catalog via
  the top bar (F5)"), `:55-56` (keyboard path).

### Catalog and lesson
- Catalog prototype: "Курс" with `aria-current="page"` (`design/pages/catalog/prototype.html:25`);
  catalog Tab order "skip link, top bar, ..." (`design/pages/catalog/acceptance.md:83-85`); `F6` "Верхняя
  панель" ("Академия") (`:94-95`); AC11 "as on the dashboard" (`:162`).
- Catalog flow F5 entries: "Курс" in the top bar; "Открыть курс" on the dashboard; module crumb
  (`design/flows/catalog.md:16-17`).
- Lesson prototype: top-bar "Курс" (`design/pages/lesson/prototype.html:87`), breadcrumb "Курс" (`:137`),
  "Открыть курс" in `#state-rejected` (`:549`). Lesson acceptance: "Урок" lands on breadcrumb "Курс"
  (`acceptance.md:194-203`, `:239`); routes table (`:248`).

### Design system
- `design/system/README.md:206-212`: "Top bar rules, the same on every page"; `.topbar-nav` is the only
  `nav`, no label, links never wrap. Nothing about a link set per release.
- `design/system/README.md:287-288`: `data-region` order, top bar first.
- `design/system/components.html:271`, `:300`: gallery top bars with "Главная" and "Курс".
- `design/README.md`: no mention of the top bar or release states (grep for "release", "#30", "top bar"
  returned nothing).
- Sign-in: "No top bar, no "Уведомления" region" (`design/pages/sign-in/acceptance.md:54`).

## 2. What #29 shipped (PR #81, merged as 7706f71)

- Top bar: brand link "Академия" to `/`, `nav` with one link "Главная" (`aria-current="page"`), user menu;
  no "Курс" (`apps/web/components/top-bar.tsx:14-36`). Comment cites R6 and the PR deviation
  (`top-bar.tsx:11-12`).
- Skip link "К содержимому" to `#main` in the root layout, first in the DOM (`apps/web/app/layout.tsx:19-24`).
- Shell order: TopBar, Notifications, page `main`, RegionCycle (`apps/web/app/(app)/layout.tsx:15-20`).
- Dashboard page: h1 "Главная" and Empty "В курсе пока нет готовых уроков", shown unconditionally;
  `main#main` `tabIndex={-1}` `data-region` (`apps/web/app/(app)/page.tsx:11-27`). Nothing focusable in
  `main`.
- `F6`: regions are `[data-region]` (top bar, notifications only while `role="region"`, `main`); focus goes
  to the first focusable element or the region itself (`apps/web/components/region-cycle.tsx:13-30`).
  e2e asserts `F6` -> "Академия", `F6` -> `main#main`, Shift+`F6` -> "Академия"
  (`apps/web/e2e/dashboard.spec.ts:48-58`).
- Real Tab order as shipped: "К содержимому", "Академия", "Главная", user menu (email), "Войти снова"
  (only with the alert). `main` holds no control.
- Real `F6` regions: "Верхняя панель" (lands on "Академия"), "Уведомления" (only with the alert), `main`
  (itself).
- No `/courses/...` link anywhere in `apps/web`: the copy file has no "Курс" or "Открыть курс"
  (`apps/web/lib/copy.ts:1-43`); no not-found page (`apps/web/app` holds `(app)`, `api`, `sign-in` and
  root files only; no `not-found.tsx`). So the omission of "Курс" is the only catalog-bound control
  missing from the shown state; "Открыть курс" and module rows are absent because their states (all
  passed, data rows) are not built, not because of R6.
- Plan: `plans/29-sign-in-dashboard-design.md:591-667` (9.2): the deviation table row "top bar link
  "Курс" | omitted | design | DESIGN follow-up" (`:619`); the reasoning "rendering the link now would be a
  dead end (404) ... a disabled nav link exists nowhere in the design system (R1 covers actions with a
  reason, not navigation)" (`:645-650`). 9.4 components (`:681-686`): no badge, progress, item, skeleton.
  16 (`:1091-1105`): orchestrator filed this DESIGN issue (#79).
- PR #81 body, "Design deviations": row `top bar link "Курс" | **omitted** (R6: no dead link before #30)
  | design | DESIGN #79; #30 adds the link` (PR body line 36). Proto.css differences filed as #80 (line 38;
  out of scope here).

## 3. What #30 ships (`gh issue view 30`)

- One issue ships the catalog and the lesson page together ("A catalog of modules and lessons ...; the
  lesson page") and, in the appended dashboard block, "top bar link "Курс" to /courses/[courseId]; tab
  order as in the dashboard acceptance notes" plus AC1, AC5, AC7 conditional, AC8, loading.
- Pages with a top bar by release state:
  - Before #30 (now): dashboard only (sign-in has none; no not-found page exists in the app). Top bar:
    "Академия", "Главная", user menu.
  - From #30: dashboard, catalog, lesson (M0 lesson, `design/flows/lesson-environment.md:37-44`), and the
    not-found state if #30 builds it (catalog F5 error state routes an unknown or non-`ready` lesson to
    "Страница не найдена", `design/flows/catalog.md:36-40`; #30's AC "lessons not in status `ready` are
    not visible" implies it). Top bar: "Академия", "Главная", "Курс", user menu, i.e. the design as
    drawn.
- Consequence: the only page whose top bar is ever shipped without "Курс" is the dashboard (plus a
  hypothetical not-found page, which #29 did not build). Catalog and lesson never exist without the
  link, because the link's target and those pages arrive in the same issue.
- `/` stays the only route of the `(app)` group until #30; a Next default 404 for `/courses/...` today
  renders outside the `(app)` layout (no top bar) (inferred from `apps/web/app/(app)/layout.tsx` being
  the only shell and no `not-found.tsx`).

## 4. How release states are represented today

- Lesson page: `design/flows/lesson-environment.md:32-50` "Lesson page by release" (M0 lesson, M0 with
  environment, v1), referenced from R6 (`ia.md:276-277`). Prototype: a named state
  `<template data-state="m0" data-state-label="M0 lesson">` (`design/pages/lesson/prototype.html:46`),
  elements tagged `data-state="... m0 ..."` (`:148`, `:164`), JS list `NO_ENVIRONMENT_STATES = ["m0",
  "no-workspace"]` (`:649`); acceptance state row `#state-m0` (`design/pages/lesson/acceptance.md:154`),
  landing table row "M0 lesson" (`:201`), dev mapping "#30 (M0 lesson)" (`:18`, `:89`).
- Mechanism: proto.js shows `[data-state~="<name>"]` for `#state-<name>`; elements without `data-state`
  show in every state (`design/system/proto.js:74-90`, `:106`). State labels come from
  `[data-state-label]` (`proto.js:124-130`; dashboard labels `prototype.html:157-164`). It works on any
  element in the document, so the top bar's "Курс" link could carry `data-state` like any other node.
- The dashboard prototype has no release state today; its nine states are all "from #30/#35" data states
  (`acceptance.md:66-76`).
- Visible difference before #30: one nav link fewer, and the only reachable dashboard state is "no ready
  lessons" (`page.tsx:11-13`). In the prototype that state already exists (`#state-no-ready-lessons`,
  `prototype.html:76`), so a "before #30" state would equal `#state-no-ready-lessons` minus the "Курс"
  link. Whether one link warrants a prototype state is for the architect; the issue asks for a state
  "if it differs visibly" (issue #79 checklist item 2).

## 5. Prior art: hiding vs disabling a nav link

- HTML has no `disabled` for links; MDN: the `disabled` attribute is for "native HTML form controls", and
  `aria-disabled` "does not change the focusability" and needs JavaScript to stop activation
  (MDN, aria-disabled, https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-disabled,
  fetched 2026-10-30).
- In-project: R1 is the only disabled pattern and it requires a visible reason next to the control
  (`ia.md:114-125`); R6 hides controls whose feature is absent (`ia.md:267-270`). A disabled "Курс"
  would need a reason text in the one-row top bar, which `design/system/README.md:206-212` has no slot for.

## 6. Validator

`python3 -I scripts/design_tokens.py check design` on this branch: exit 0. 38 `contrast ok` lines
(19 `:root`, 19 `.dark`) and 2 INFO lines (`--border on --background: 1.260:1`, both themes); no flow-id
errors, no failures. The validator does not check acceptance states or Tab orders (grep for "state" /
"acceptance" in `scripts/design_tokens.py` finds only the docstring at `:37`), so the fix below is
judged by review, not by CI.

## Options observed (not a design)

- A. Release rule: R6 names the top-bar "Курс" link as hidden until #30; dashboard acceptance gets a
  "before #30" Tab order and `F6` landing (unchanged: "Академия"); the prototype either gains a state
  (e.g. tagging the link `data-state` with every state but the new one) or the notes state that the
  difference is one absent link and no state is drawn. Matches what #29 shipped.
- B. Disabled link per R1: needs a reason text and an R1 table row for navigation; contradicts #29's
  shipped markup and has no system slot.
- C. Keep "Курс" unconditional in the design and accept #29's deviation until #30: leaves the two
  design files in conflict, which is what #79 exists to close.
- Scope note for any option: only the dashboard (and a not-found page, if built before #30) ever ships
  without "Курс"; catalog and lesson arrive with their link in #30. The places to keep in sync are
  `ia.md:177`, `:267-277`, `:300-304`, dashboard `acceptance.md:83-88`, `:110`, `prototype.html:25`, and
  possibly `design/system/README.md:206-212` ("the same on every page").
