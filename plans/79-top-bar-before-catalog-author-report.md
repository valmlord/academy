# #79 author report: top bar before the catalog ships

Phase: author, DESIGN tier. Role: product-designer. Design of record:
`plans/79-top-bar-before-catalog-design.md` (revision 2), section 5 items 1-19, plus the folded-in notes of
`plans/79-top-bar-before-catalog.md`.

## What changed

W1 `design/pages/dashboard/acceptance.md`:
- Item 13: Flows note "F4.1-F4.3 and F18.1-F18.2: from #30 ..." after the Flows table.
- Item 14: Layout, the `main` content and the module rows qualified "from #30" / "before #30".
- Item 15 with usability N1 / consistency A1: after the Components table, "Card, Badge, Progress, Item,
  Skeleton and the Button uses in the table above ("Начать" / "Продолжить", "Открыть курс", "Повторить")
  appear from #30. Before #30 the page uses Empty, the session Alert with its action "Войти снова" (a
  Button) and the DropdownMenu of the user menu with its ghost Button trigger." No rendered component is
  left out.
- Item 1: States row `before #30 (no catalog)` / `#state-before-catalog`, text as specified.
- Item 18: the "no ready lessons" row unchanged.
- Item 2: release paragraph after the R5 note (before #30 only `before-catalog` ships; alert and user menu
  on top of it, not drawn as separate states).
- Items 3, 4: Tab order "From #30:" / "Before #30:"; `F6` "Before #30 the same cycle; `main` lands on `main`
  itself, as in "no ready lessons"."
- Item 16: "From #30:" on the "Начать" / "Продолжить", course error "Повторить", progress "Повторить" and
  module row bullets.
- Item 5 with consistency A2: `| top bar nav | Главная; Курс (from #30, ia.md R6, "Before the catalog
  ships"; before #30: Главная) |`.
- Item 17: Copy note after the table (rows shown from #30, rows rendered before #30).
- Usability N2: Accessibility notes on the lesson-type Badge and the course Progress prefixed "From #30:".
- Item 6: AC release head line after the "Acceptance checks" heading, and AC14 after AC13.
- Item 7: `Status: ready` unchanged.

W2 `design/pages/dashboard/prototype.html`:
- Item 8: the top-bar "Курс" link carries the nine from-#30 states, in the label-span order.
- Item 9: the Empty carries `no-ready-lessons before-catalog`.
- Item 19: the comment above the Empty names both states.
- Item 10: label span `before-catalog` / "before #30 (no catalog)" after the nine existing spans.
- Item 11: nothing else changed; no `proto.js`, `proto.css`, page `<style>` or class change.

W3 `design/system/README.md`, item 12: after "Pages add no top bar overrides." (consistency A3 insertion
point): "The nav's links follow the release, the same on every page (`ia.md` R6, "Before the catalog
ships"): "Главная" before #30, "Главная" and "Курс" from #30."

W4: not edited (flows are not the product-designer's). Follow-ups for #30's not-found page, as the plan
says: the over-long line at `design/flows/dashboard.md:74`, and the default 404 before #30 rendering the
root layout's skip link with no `#main` target (accessibility round 2 N1).

Not touched: catalog and lesson pages, `components.html`, `proto.js`, `proto.css`, `design/flows/*`.

## Validator

`python3 -I scripts/design_tokens.py check design`: exit 0. 38 `contrast ok` lines (19 `:root`, 19 `.dark`)
and the two INFO lines:

```
INFO :root --border on --background: 1.260:1
INFO .dark --border on --background: 1.260:1
```

No flow-id error, no failure.

## Headless run

Tool: Playwright 1.64.1 (`node_modules/.pnpm/playwright@1.64.1`, chromium headless shell 1248), scripts in
the session scratchpad (`dashboard-run.js`, `narrow.js`), not in the repo. Page opened from `file://`, each
state by `#state-<id>` plus reload, 1280x900, `colorScheme` light and dark (`html.dark` checked: false /
true). Tab: from a blurred page, Tab until focus enters the prototype chrome (chrome excluded). `F6` and
Shift+`F6`: from a blurred page, pressed until the first landing repeats. Names are rendered text
(`innerText`).

"Prototype states" bar, both themes, 10 entries in this order: first run, in progress, all passed, no ready
lessons, loading, course load error, progress unavailable, session expired (F2.1), user menu open (F3.1),
before #30 (no catalog). The ordering side effect of item 8 holds: `before-catalog` is last.

Light and dark gave identical results for every state:

| State | Top-bar links (count) | Tab order (count) | `F6` landings, stops | Shift+`F6` landings, stops |
|-------|-----------------------|-------------------|----------------------|----------------------------|
| first-run | Академия, Главная, Курс, user menu (4) | К содержимому, Академия, Главная, Курс, user menu, Начать, 6 module rows (12) | Академия, Начать (2; 3rd press wraps) | Начать, Академия (2) |
| in-progress | same (4) | ... user menu, Продолжить, 6 module rows (12) | Академия, Продолжить (2) | Продолжить, Академия (2) |
| all-passed | same (4) | ... user menu, Открыть курс, 6 module rows (12) | Академия, Открыть курс (2) | Открыть курс, Академия (2) |
| no-ready-lessons | same (4) | К содержимому, Академия, Главная, Курс, user menu (5) | Академия, `main` itself (2) | `main` itself, Академия (2) |
| loading | same (4) | same as no-ready-lessons (5) | Академия, `main` itself (2) | `main` itself, Академия (2) |
| course-error | same (4) | ... user menu, Повторить (6) | Академия, Повторить (2) | Повторить, Академия (2) |
| progress-unavailable | same (4) | ... user menu, Начать, Повторить (7) | Академия, Начать (2) | Начать, Академия (2) |
| session-expired | same (4) | ... user menu, Войти снова, Продолжить, 6 module rows (13) | Академия, Войти снова, Продолжить (3; 4th wraps) | Продолжить, Войти снова, Академия (3) |
| user-menu | same + open menu item Выйти (4 links + Выйти) | ... user menu, Выйти, Продолжить, 6 module rows (13) | Академия, Продолжить (2) | Продолжить, Академия (2) |
| **before-catalog** | **Академия, Главная, user menu (3), no Курс** | **К содержимому, Академия, Главная, user menu (4)** | **Академия, `main` itself (2; 3rd press wraps)** | **`main` itself, Академия (2)** |

"user menu" is the trigger, accessible name "learner@example.com".

`before-catalog` in detail (both themes): `main` renders only h1 "Главная" and "В курсе пока нет готовых
уроков" (identical to no-ready-lessons); visible links to the catalog or lesson stand-ins (the prototype's
`/courses/...`): 0 (no-ready-lessons: 1, the top-bar "Курс"; the other from-#30 states: 1, 2 or 8). Every
other state shows "Курс". No horizontal scroll and the top bar on one row (`.topbar-end` top above the
brand's bottom, bar height 56px) at 375, 768 and 1280, light and dark, the same as first-run.

Not measured: the loading state's Tab and `F6` match no-ready-lessons because its skeletons are
`aria-hidden` and not focusable; that is existing behaviour, unchanged here.

## User menu and session alert while `before-catalog` is active

Described in the acceptance text only (design section 3); no state added. What the prototype does:
- User menu: clicking the trigger opens the menu (`aria-expanded="true"`, menu shown, focus on "Выйти"); the
  state stays `before-catalog` and the nav still shows only "Главная"; Esc closes it (`aria-expanded="false"`)
  and returns focus to the trigger. Both themes.
- Session alert: cannot be shown on top of `before-catalog` in the prototype. The alert template is tagged
  `session-expired` only, so in `before-catalog` the `role="alert"` container stays empty and the wrapper
  has no `role="region"` (so no "Уведомления" `F6` stop). The combination is specified in the acceptance
  notes (States paragraph, Tab order "Войти снова" (only with the alert), AC10 in both releases). Showing it
  would need a new state or a proto.js mechanism for combining states; the design chose not to draw it.

## Grep of changed files

Files: `design/pages/dashboard/acceptance.md`, `design/pages/dashboard/prototype.html`,
`design/system/README.md`.
- Em or en dashes in the whole files: 0. In added lines: 0.
- Curly quotes or guillemets in added lines: 0.
- Added lines: 44, of which 25 hold Cyrillic. After removing every double-quoted string, Cyrillic remains in
  6 lines, all UI copy: two are quoted UI strings that wrap across a line break ("N из / M уроков", "В
  курсе пока нет готовых / уроков"), one is the Copy table row "top bar nav", one is the prototype's nav
  link text "Главная" / "Курс". No Russian in English prose, comments or chrome.

## System gaps

None found. One observation, not a gap requiring a change in this issue: proto.js shows exactly one state
at a time, so "before-catalog + session alert" is not drawable without either a combined state or a
state-composition mechanism; the design of record accepts describing it in words.
