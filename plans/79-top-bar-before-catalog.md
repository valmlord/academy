# #79 plan: top bar before the catalog ships

Design of record: `plans/79-top-bar-before-catalog-design.md` (revision 2, judge_design round 2: usability,
accessibility, consistency 3/3 PASS). Research: `plans/79-top-bar-before-catalog-research.md`.

## Author phase

No token or component changes, so the ui-designer is not spawned. One role: product-designer.

### W1. `design/pages/dashboard/acceptance.md`

Apply design section 5, items 1-7 and 13-18, exactly as written. Also fold in the round 2 non-blocking notes:
- usability N1 / consistency advisory 1 (item 15): before #30 the page uses Empty, the session Alert (whose
  action "Войти снова" is a Button) and the user menu (DropdownMenu with a ghost Button trigger); the other
  Button uses in the Components table appear from #30. Word it so no rendered component is left out.
- usability N2: the Accessibility notes on the Badge and the course Progress (around :149-150) get the
  "from #30" qualifier.
- consistency advisory 2 (item 5): cite R6 as "R6, Before the catalog ships".
- `Status: ready` stays.

### W2. `design/pages/dashboard/prototype.html`

Design section 5, items 8, 9, 10 and 19. No change to `design/system/proto.js` or `proto.css` (#80 is out of
scope).

### W3. `design/system/README.md`

Design section 5, item 12; insert after the top-bar sentence at :212 (consistency advisory 3).

### W4. Flow formatting and one sentence

Owned by the flows, not the pages: the over-long line at `design/flows/dashboard.md:74` and the default-404
note (accessibility N1: the root layout still renders the skip link with no `#main` target). These are
non-blocking; the product-designer does not edit `design/flows/`. Record them in the PR as follow-ups for #30's
not-found page rather than reopening the flows here.

## Evidence the product-designer returns (before judge_ux)

- `python3 -I scripts/design_tokens.py check design` exit 0, with the output.
- A headless run of the dashboard prototype (Playwright or equivalent, from the scratchpad) over every state in
  the "Prototype states" bar, each in light and dark: for each state, which top-bar links are visible, the Tab
  order from the top of the page (accessible names, in order), and where `F6` and Shift+`F6` land on each press
  until the cycle wraps. Counts per state. `#state-before-catalog` must show "Академия", "Главная", user menu,
  no "Курс", and in `main` only the h1 and the Empty; every other state still shows "Курс".
- Opening the user menu and the session-expired alert while `before-catalog` is the active state is described
  in the acceptance text only (design section 3); report what the prototype does there, do not add states.
- A grep showing no Russian outside UI copy and the Copy table in changed files, and no em dashes in them.
- Any system gap found is reported, not worked around.
