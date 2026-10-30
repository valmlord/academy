# #79 judge_design round 1: accessibility

Round: `judge_design` (pipeline status of this worktree: tier DESIGN, issue 79, phase `judge_design`).
Loaded first: `.claude/feedback/judge_mistakes.md` (in particular: check every WCAG 2.2 addition against
every flow touched in round 1).

## What I read

- Issue #79; `plans/79-top-bar-before-catalog-research.md` (by reference) and `-design.md` in full.
- `git diff` of `design/flows/ia.md`, `design/flows/dashboard.md`, `design/flows/catalog.md`, and the
  surrounding R1-R6 text of `ia.md` (`:160-300`), the region vocabulary (`ia.md:35`), the Action labels
  register (`ia.md:81-90`), `design/pages/dashboard/acceptance.md:80-88`.
- What #29 shipped: `apps/web/components/top-bar.tsx`, `apps/web/app/(app)/page.tsx`,
  `apps/web/app/(app)/layout.tsx`, `apps/web/app/layout.tsx` (skip link), `apps/web/components/notifications.tsx`,
  `apps/web/components/region-cycle.tsx`, `apps/web/e2e/dashboard.spec.ts` (AC12 F6 test).

## Validator

Re-ran `python3 -I scripts/design_tokens.py check design`: exit 0, 38 `contrast ok` lines, plus

```
INFO :root --border on --background: 1.260:1
INFO .dark --border on --background: 1.260:1
```

No flow-id error. No colour changes in this design, so no `pair` runs are needed (the prototype edit
planned for the author phase adds a state, not a colour).

## Checks

1. Hide vs disable (4.1.2, 2.4.4, A15/R6). A link has no native disabled state; `aria-disabled` on an
   `a href` leaves it focusable and activatable, and R1's pattern needs a visible reason the one-row bar
   has no slot for. Hiding removes the dead stop from the Tab order and the accessibility tree, so no
   control announces a name with no working target. `ia.md:281-287` states this and extends it to the
   whole `/courses/...` class (Card button, module rows, "Открыть курс", breadcrumbs). Correct, and it
   matches `top-bar.tsx:23-31` (one nav link).
2. Tab order before #30 (2.4.3), checked against DOM order. Root layout puts the skip link first
   (`app/layout.tsx:19-24`), then the app layout renders TopBar, Notifications, `main`
   (`(app)/layout.tsx:16-18`); in the bar: brand link, nav "Главная", user menu (`top-bar.tsx:20-33`); the
   alert's "Войти снова" is in Notifications; `main` has `tabIndex={-1}` and nothing focusable
   (`page.tsx:17-24`). `dashboard.md:69-70` lists exactly "К содержимому", "Академия", "Главная", user
   menu, "Войти снова" (only with the alert), nothing in `main`. Complete and in DOM order. From #30
   (`ia.md:295`, `dashboard/acceptance.md:83-85`) "Курс" sits between "Главная" and the user menu,
   relative order of the rest unchanged.
3. `F6` stops and landings. Before #30 (`ia.md:294`, `dashboard.md:71-72`): "Верхняя панель" lands on
   "Академия"; "Уведомления" only while it holds the alert, on "Войти снова"; `main` on itself. This
   matches R3 (`ia.md:186-187` empty "Уведомления" is no stop; `:229-231` `main` itself when nothing is
   focusable) and the shipped code: `region-cycle.tsx:13-18` skips the notifications wrapper unless it is
   a `region`, `:20-30` focuses the first focusable or the region itself, `notifications.tsx:36-39` sets
   `role="region"` only with the alert; e2e `dashboard.spec.ts:48-57` asserts brand link -> `main` ->
   back. From #30, not-found's `main` lands on "Открыть курс" (`catalog.md:40-41`), lesson unchanged (R3
   table, "Курс" breadcrumb).
4. Landing stability across releases: "Академия" is first in the bar and never hidden, so the
   "Верхняя панель" landing is the same in both releases (`ia.md:297-299`).
5. 3.2.3 Consistent Navigation. Within a release the bar is one component on every page with the same
   links in the same order (`ia.md:289-290`, rule for later pages too). Before #30 only one page has the
   bar, so the criterion is trivially met; from #30 all four pages share the from-#30 bar. Across releases
   one link is added without reordering the others.
6. 3.2.6 Consistent Help: no help entry is added or moved. 3.3.7 / 3.3.8: no input or authentication
   change. 2.4.11 / 2.5.7 / 2.5.8: no new controls or drag; nothing to check at the flow level.
7. 2.4.5 Multiple Ways: before #30 the only content page is the dashboard (reached by "Академия",
   "Главная", the root URL); from #30 unchanged. 2.4.2: no new page, titles unchanged.
8. Accessible names registered: "Академия", "Главная" and "Курс" are now in the Action labels register
   (`ia.md:84-85`), "Открыть курс" qualified (`ia.md:90`); region names come from `ia.md:35`; the user menu
   button's name is the email (Navigation model). The shipped strings come from `lib/copy`
   (`brandName`, `homeTitle`).
9. `aria-current`: "Главная" carries `aria-current="page"` on the dashboard in both releases (shipped at
   `top-bar.tsx:26`; `ia.md:297`).

## Non-blocking notes (for the author phase, no vote impact)

- N1 `ia.md:297`: says where `aria-current` goes on the dashboard and catalog but not that lesson and
  not-found carry it on neither link; the design file (§3) says so. One clause would close it.
- N2 `dashboard.md:55-56`: the "Keyboard path" is the from-#30 one (next Tab reaches the Card button);
  the release section at `:62-74` covers before #30, but qualifying the paragraph "from #30" would avoid
  a reader taking it for both.

## Blockers

None.

PASS - no accessibility issues found
