# #79 judge_ux round 1: consistency

Round: `judge_ux` (read from `.claude/pipeline_state.json`, phase `judge_ux`), round 1. Reviewer: design/judge-consistency.
Inputs read: issue #79, `plans/79-top-bar-before-catalog-design.md` (section 5 items 1-19, section 6, 7),
`plans/79-top-bar-before-catalog.md`, `plans/79-top-bar-before-catalog-author-report.md`, the full
`git diff main -- design/` (catalog.md, dashboard.md, ia.md, progress.md, dashboard acceptance.md and
prototype.html, system/README.md), the top bar blocks of every prototype and `components.html`,
`design/system/proto.js:74-150`.

## Validator

`python3 -I scripts/design_tokens.py check design`, run by me: exit 0; 38 "contrast ok" lines, 2 INFO
(`:root --border on --background: 1.260:1`, `.dark --border on --background: 1.260:1`), no error, no
flow-id error. Same as the orchestrator's `validator-ux.txt`.

## Checks

1. **Top bar is one component.** `git diff main --name-only` over `proto.css`, `proto.js`, `tokens.css`,
   `components.html`, `pages/catalog`, `pages/lesson`: empty. The `<header class="topbar">` blocks of
   dashboard, catalog, lesson and both `components.html` instances use the same classes and markup
   (`topbar`, `topbar-brand`, `topbar-nav`, `topbar-end`, `dropdown`, ghost sm `button` with
   `user-email`, `dropdown-menu` / `dropdown-label` / `dropdown-separator` / `dropdown-item`). The only
   diff is `data-state="..."` on the dashboard's "Курс" link (`dashboard/prototype.html:25`). No new
   class, no `style`, no `<style>` change. (The lesson's multi-line `<nav>` whitespace and per-page
   `href` / `aria-current` differences are pre-existing on main and not touched.)
2. **Release pattern.** The new state uses the existing mechanism: `data-state` lists on elements
   (`:25`, `:77`) and a hidden `data-state-label` span (`:167`), the same as the nine labels at
   `:158-166` and the lesson prototype's tagged elements. proto.js hides via `el.hidden` (`proto.js:143-146`),
   no mechanism change. Default state stays `first-run` (`<html data-default-state="first-run">`, `:2`).
3. **State ids and labels agree.** Id `before-catalog`, label "before #30 (no catalog)" in
   `prototype.html:167`, `acceptance.md:85` (row and anchor `#state-before-catalog`), `dashboard.md:77`,
   design file items 1 and 10. Rendered state bar (Playwright): 10 links in table order,
   `#state-before-catalog=before #30 (no catalog)` last, matching the States table order.
4. **Layout parity, measured** (script `judge-consistency-topbar.js`, output `judge-consistency-topbar.txt`
   in the session scratchpad). Light and dark, 375 and 1280 px, `before-catalog` vs `first-run` and vs
   `no-ready-lessons`: `.topbar`, `.topbar-brand`, the "Главная" link, `.topbar-end` and the user trigger
   have identical computed height, paddings, gaps, font size/line height/weight, colours, border and
   rects; the bar is 56 px high, one row at 375. The only difference is `.topbar-nav` width
   (121.3 -> 68.8 px), the removed link. Nav links in `before-catalog`: ["Главная"]; no visible link to
   catalog or lesson; 0 focusable elements in `main`; `scrollWidth` equals the viewport (no horizontal scroll).
5. **README vs ia.md R6.** `system/README.md:212-214` ("The nav's links follow the release, the same on
   every page ...: "Главная" before #30, "Главная" and "Курс" from #30") agrees with `ia.md:292-298`
   (bar the same on every page of a release; before #30 "Академия", "Главная", user menu; from #30 with
   "Курс").
6. **Release qualifiers.** Every added state qualifier in the changed files reads "before #30" /
   "Before #30" or "from #30" / "From #30:" (sentence-initial capital only). "until #30 ships" and
   "ship(s) with #30" (`ia.md:281, :286`, `catalog.md:40`) describe shipping, not a state, and do not
   compete with the qualifiers. No "after #30", "pre-#30" or similar.
7. **Acceptance notes.** Headings unchanged (Route ... Open questions, the `## ` lines in the diff are
   context only); `Status: ready` at `acceptance.md:33`. Copy row `acceptance.md` "top bar nav" and AC14
   use the same strings as the prototype.
8. **Edit list coverage.** Items 1-19 present. Item 15 is worded more precisely than the design text
   (it names the Button uses and the Alert/DropdownMenu Buttons), recorded in the author report; same
   meaning, no contradiction.
9. Named colour keywords, off-scale values: no CSS was added in this diff, so nothing new to scan.

## Blockers

None.

## Notes (non-blocking)

- None beyond item 1's pre-existing lesson `<nav>` whitespace, out of scope for #79.

PASS - no consistency issues found
