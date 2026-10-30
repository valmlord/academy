# #79 judge_design, round 2: usability

Round: `judge_design` (pipeline state: DESIGN tier, issue 79, phase `judge_design`; my round 1 vote FAIL).

## Checked

- Read: issue #79; the design file in full incl. "Revision 2" and sections 5-6; `git diff` of
  `design/flows/ia.md`, `dashboard.md`, `catalog.md`, `progress.md`; `design/flows/dashboard.md` in full;
  `progress.md:1-45`; `ia.md` `:160-170`, R3 `:222-235`, R6 `:278-305`, Navigation model, inventory
  `:325-370`; `design/pages/dashboard/acceptance.md` in full; `dashboard/prototype.html` `:18-30`, `:72-80`,
  `:150-175` and every `data-state=` line; my round 1 review.
- Shipped #29: `apps/web/app/(app)/page.tsx:14-27` (h1 + Empty only, `main tabIndex=-1`, no course or
  progress read), `apps/web/components/top-bar.tsx:14-36` (brand, nav with only "Главная"
  `aria-current="page"`, user menu), `apps/web/e2e/dashboard.spec.ts` (shell + empty state, 0 listitems,
  no horizontal scroll at 375 = AC13; F6 brand -> `main#main` -> back = AC12; session alert fills the
  container without moving focus, "Войти снова" `/sign-in?next=%2F` = AC10; skip link -> `main`),
  `components/notifications.tsx:52-54`.
- Validator (orchestrator's output file, read): exit 0, 38 `contrast ok` lines, and only
  `INFO :root --border on --background: 1.260:1` and `INFO .dark --border on --background: 1.260:1`; no
  flow-id lines. `grep '^## F' design/flows` has no duplicate id; no flow added.

## B1 (round 1 blocker): fixed as a class

- Reran the three greps of design section 6 over `design/`. Hit lines per file for the files with
  release-relevant content (`ia.md`, `dashboard.md`, `progress.md`, `auth.md`, `dashboard/acceptance.md`,
  `system/README.md`) compared line by line with the disposition table: every hit is in a row
  (acceptance `:17-25, :34, :38-43, :52-56, :62, :68-78, :83-96, :109-110, :115-129, :138, :146, :157-172,
  :179-180, :184`; `ia.md` `:46-49 ... :366`; `dashboard.md` `:6 ... :78`; `progress.md` `:15-53`;
  `auth.md` `:69, :91, :101`; README `:64 ... :287`). Catalog, lesson, not-found files are from #30 only,
  correctly by the inventory release line `ia.md:367-368`.
- Wider grep of my own (`каталог`, `catalog`, `Card`, `Готовится`, `Все доступные уроки`, `Новые модули`,
  `Прогресс недоступен`, `Не удалось загрузить курс`, `next lesson`, `lesson page`) over the same files. New
  lines not named in the table: acceptance `:42, :54, :87, :94, :97, :119, :121-124, :131` are
  continuations or rows inside ranges the items cover (14, 15, 4, 16, 17); `:143-150` Accessibility notes
  describe from-#30 components (see N2); `dashboard.md:36, :39-49` are F4 as designed, scoped by `:78`;
  `progress.md:23, :31, :40` scoped by `:15-16`; `sign-in/acceptance.md:18` prototype chrome; README
  component inventory `:158-176, :248` makes no release claim. No unhandled hit.
- AC release split (item 6) against #29: AC1/AC2 (Card, button), AC3-AC5 (course line, module rows,
  `/courses/...`), AC6 ("Открыть курс") absent from `page.tsx`, so "from #30" is right; AC8/AC9 need a
  course/progress read that #29 does not do, so they cannot occur; AC7 matches `page.tsx` (h1 + Empty, F6
  to `main` per e2e); AC10-AC13 are exercised by `dashboard.spec.ts` on the before-#30 page; AC14 matches
  `top-bar.tsx` and `page.tsx`. Split correct.
- Edit list items 1-19: each names file, line (verified: acceptance `:23, :30, :38-41, :60, :71, :76,
  :78-79, :83-88, :89-95, :110, :132, :153, :180`; prototype `:25, :75, :76, :157-165`) and exact text.
  Item 8's nine-state list equals the label spans `:157-165`; item 9 + untagged h1 gives exactly #29's
  `main`; item 11 holds (every Card/progress/skeleton/error element's state list lacks `before-catalog`).
  Item 17's "card title" to "open catalog" range (`:115-125`) excludes "no ready lessons" (`:126`), which
  the before-#30 list includes. Complete and unambiguous.

## N1-N3 and the new flow edits

- N1 fixed: `dashboard.md:68-71` now states an accepted, temporary inaccuracy with its reasons.
- N2 fixed: `dashboard.md:76` "F4.1-F4.3 and F18 are not shown".
- N3 fixed: `ia.md:288-290` default 404 before #30, reached only by typing a URL, Back leaves it.
- `ia.md:342-344` primary action: dashboard has none before #30. Correct (nothing focusable in `main`).
- `progress.md:15-16` F18 entry from #30. Correct.
- `dashboard.md:71-72` loading, course error, progress unavailable cannot occur before #30: true,
  `page.tsx:14-27` reads neither.

## Fresh usability pass

- Dead ends, before #30: sign-in (F1.4) -> dashboard; "Академия"/"Главная" -> `/`; F2.1 "Войти снова" ->
  sign-in -> `/`; F3 "Выйти" -> sign-in "Вы вышли". No control targets a missing route. From #30: F4, F5,
  F18 as designed; not-found ships with #30, its `main` lands on "Открыть курс" (`catalog.md:40-41`), exit
  to the catalog. No dead end in either release.
- Step counts recounted: F4 3 steps (`dashboard.md:15-23`), F18 4 steps (`progress.md:18-27`). Unchanged.
- Vocabulary (UI): "Академия", "Главная", "Курс", "Открыть курс", "К содержимому", "Войти снова",
  "Выйти", "Уведомления", "Верхняя панель", "В курсе пока нет готовых уроков". One term per concept;
  release terms "before #30" / "from #30" / "Before the catalog ships" / state `before-catalog` consistent
  across ia, dashboard, progress, catalog and the edit list.
- Register coverage: "Академия"/"Главная" and "Курс" now in Action labels (`ia.md:84-85`), "Открыть курс"
  qualified (`:90`); h1/no-ready copy in the dashboard register (`:71`); region names (`:35`). No new copy.
- Nielsen: H1 visibility, before #30 one clear message, nothing pretends to load; H2 match with the real
  world, the accepted inaccuracy is documented and temporary; H4 consistency, one bar per release on every
  page (`ia.md:293-294`); H5 error prevention, no link to a missing route; H7 flexibility, F6/Tab identical
  to #29's e2e; H3 user control, the bar and user menu always work.

## Non-blocking

- N1. [plans/79-top-bar-before-catalog-design.md:174-175] Item 15 says Button appears from #30 and the
  before-#30 page uses "Empty, the session Alert and DropdownMenu only", but "Войти снова" is a Button
  inside the Alert (`apps/web/components/notifications.tsx:52-54`) and the user-menu trigger is a ghost
  Button. Suggest: "Card, Badge, Progress, Item, Skeleton and the Button uses in this table appear from
  #30". No tester-facing check depends on it.
- N2. [design/pages/dashboard/acceptance.md:149-150] Accessibility notes on the lesson-type Badge and the
  course Progress carry no release qualifier; scoped implicitly by item 15 (components from #30). Could be
  added to item 15's scope in the same sentence; not required.
- N3. [design/flows/dashboard.md:74] one over-long source line (formatting only).

## Blockers

None.

PASS - B1 fixed as a class, no usability blockers
