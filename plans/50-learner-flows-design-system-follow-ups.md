# #50 follow-ups

The deferred DESIGN issues D1-D6 and the dev proposals P1-P3 are in
`plans/50-learner-flows-design-system-design.md` §3. Items decided or found after judge_design, which the
ux-researcher could not fix in this task (its phase window ends at judge_design):

## Into D1 (check panel detail)

- Check kind in the check row: the v1 row omits it (Stepan's decision, author phase). The ux-researcher
  decides whether the row shows a kind and registers the label set in `design/flows/ia.md`.
- Accessible names "Навигация" (breadcrumb), "Область" (one-pane switch) and "Разделы урока" (left-pane tab
  list) are used by the lesson page and the gallery but are not in the `ia.md` page-copy register (Stepan's
  decision: keep them, register them in D1).
- F9 flow text says "the terminal dims" on errors; the lesson acceptance draws a dashed frame and never uses
  opacity. Align the flow with the acceptance notes.
- The design table line on source links still says "a new browser tab"; the lesson acceptance chose the same
  tab. Align the design file.

## Polish (any later DESIGN task)

- Collapsible outcomes are two `ul` elements (8 px between lists, 4 px between items; read as two lists).
  One `ul` with the extra `li` hidden would fix both.
- Back after a simulated action drops focus to `body` in the prototype (hash simulation only; in the app Back
  is a route change).
- The gallery's forced two-pane demo scrolls sideways at 320 px (desktop-only composition).
- Lesson AC18 carries prototype run counts; move them out of the acceptance check.
