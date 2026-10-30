# #79 judge_design round 1: consistency

Round: `judge_design` (read from `.claude/pipeline_state.json`, phase `judge_design`, tier DESIGN, issue 79).
Loaded: `.claude/agents/design/judge-consistency.md`, `_contract.md`, `.claude/feedback/judge_mistakes.md`,
`agent_roles_mandatory.md`.

Read in full or in the relevant ranges: issue #79; `plans/79-top-bar-before-catalog-design.md`; the
`git diff` of `design/flows/ia.md`, `dashboard.md`, `catalog.md`; `ia.md:278-302`;
`design/pages/dashboard/prototype.html` (whole file); `design/pages/dashboard/acceptance.md` (whole
file); `design/system/proto.js:74-200`; `design/system/proto.css:109`, `:471-500`;
`design/system/README.md` component inventory and top bar rules; the top bar markup of every prototype
and of `components.html`; the lesson `m0` pattern (`lesson/prototype.html:46`, `:148`, `:164`).

## Validator

Re-run in the worktree: `python3 -I scripts/design_tokens.py check design`, exit 0. Tail of the
orchestrator's saved output (matches the re-run exit code):

```
contrast ok .dark --input on --background: 3.606:1 (min 3.0:1)
contrast ok .dark --sidebar-ring on --sidebar: 3.781:1 (min 3.0:1)
INFO .dark --border on --background: 1.260:1
```

## Checks

1. **One top bar per release, same component and markup.** `grep topbar-nav|topbar-brand` over
   `design/pages` and `components.html`: dashboard `:24-25`, catalog `:24-25`, lesson `:84-88`, gallery
   `:270-271`, `:299-300` all use `header.topbar[data-region]` > `a.topbar-brand` + `nav.topbar-nav`
   (unlabelled, the bar's only `nav`) + `.topbar-end`; links "Главная", "Курс" in that order;
   `aria-current="page"` on "Главная" (dashboard), "Курс" (catalog), neither (lesson), as `ia.md:297` and
   design §3 say. The plan adds only a prototype-state attribute (`data-state`) to the dashboard's "Курс"
   link; no class, no style, no element is added or removed, so the from-#30 bar stays byte-identical in
   structure to catalog/lesson, and the before-#30 bar is the same element with one link hidden. Matches
   the new rule `ia.md:289-290`.
2. **Release-state pattern, no mechanism change.** proto.js hides every non-template `[data-state]`
   element whose word list lacks the active state (`proto.js:143-146`, `hasState` = `~=` semantics) via
   `el.hidden`; `proto.css:109` `[hidden] { display: none !important; }` beats `.topbar-nav a` (no
   `display` there anyway) and `.empty { display: flex }`. So tagging the link and the Empty is enough;
   no proto.js/proto.css edit, no page `<style>` change, no one-off style. Same shape as the lesson's
   `m0` (one named state, elements tagged by word list). The label goes on a `<span hidden data-state
   data-state-label>` in `.proto-chrome`, which is the dashboard's own existing label pattern
   (`prototype.html:157-165`); the lesson uses a `<template>` for its labels, both are read by the same
   `[data-state-label][data-state~=name]` lookup (`proto.js:127`).
3. **State lists vs existing ids.** Dashboard ids (label spans `:157-165`): first-run, in-progress,
   all-passed, no-ready-lessons, loading, course-error, progress-unavailable, session-expired, user-menu
   (9). Acceptance States table `:68-76`: the same 9 anchors, same order. Planned "Курс" list (item 8) =
   exactly these 9 in this order, without `before-catalog`. Planned Empty list (item 9) =
   `no-ready-lessons before-catalog`. No typo, no missing or extra id.
4. **What `#state-before-catalog` renders**, walked element by element: h1 (untagged) shows; loading
   `:58`, course-error `:69`, card `:81`, all-passed `:102`, progress-block `:111` lists lack
   `before-catalog`, so hidden; Empty shows; notification template stays on `session-expired` (empty
   alert); user menu `data-open-in-states="user-menu"` closed; page script `syncNextButton` handles an
   unknown state (start href, card hidden). Result = design §3 "`#state-no-ready-lessons` minus the
   link". Index order: the "Курс" link (`:25`) becomes the first `[data-state]` element in document order
   (before the template `:45`), so the "Prototype states" bar lists the 9 in table order and
   `before-catalog` last (first seen at the Empty `:76`), which matches the new States row being appended
   after `:76`. Default state stays `first-run` (`<html data-default-state>`).
5. **README sentence vs ia.md.** Planned `design/system/README.md:206` sentence: "Главная" before #30,
   "Главная" and "Курс" from #30, same on every page, citing `ia.md` R6. Agrees with `ia.md:292-295`
   (table), `ia.md:325-327` (navigation model) and `dashboard.md` "Dashboard by release". It sits after
   "Pages add no top bar overrides.", which it does not contradict (a release state is not a page
   override).
6. **Edit list completeness.** Grepped `design/` for "Курс", "top bar", `topbar-nav`, "Открыть курс":
   every hit is in design §6 with a disposition, and I agree with each. Acceptance items 1-6 cover the
   States table, the release paragraph, Tab order, `F6`, Copy row and a new AC14; Status stays ready.
   `components.html` keeps the full (from-#30) bar, consistent with the README "from #30" wording.
   `design/README.md` page table needs no change (status stays ready).
7. **judge_design checklist.** Page inventory slugs/routes unchanged (`ia.md:354-358`); no new component
   (top bar is an existing composition, Empty an existing primitive); IA vocabulary equals the flows'
   ("Верхняя панель", "Уведомления", "Академия", "Главная", "Курс", "Открыть курс" spelled identically in
   `ia.md`, `dashboard.md`, `catalog.md` and the planned acceptance edits). State label "before #30 (no
   catalog)" is identical in the planned States row (item 1) and label span (item 10).

## Advisory (not blocking)

- A1. `dashboard/prototype.html:75` comment "F4 empty: no ready lesson at all" will be inaccurate once
  the Empty also serves `before-catalog`. Suggest the product-designer extend it when applying item 9
  (e.g. "...; also the before-#30 state, ia.md R6").
- A2. The lesson prototype's `topbar-nav` is written over several lines (`lesson/prototype.html:85-88`)
  while dashboard/catalog/gallery put it on one line. Whitespace only, pre-existing, out of #79's scope;
  harmless today because `.topbar-nav` is flex (inter-element whitespace collapses).

No blockers found.

PASS - no consistency issues found
