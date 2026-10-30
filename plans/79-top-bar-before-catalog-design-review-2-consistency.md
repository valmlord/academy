# #79 judge_design round 2: consistency

Round: `judge_design`, round 2 (`.claude/pipeline_state.json`: tier DESIGN, issue 79, phase `judge_design`,
round 1 votes accessibility PASS, consistency PASS, usability FAIL).
Loaded: `.claude/agents/design/judge-consistency.md`, `_contract.md`, `.claude/feedback/judge_mistakes.md`.

## Read

- `gh issue view 79`; `plans/79-top-bar-before-catalog-design.md` in full (Revision 2, sections 2-8);
  round 1 reviews (consistency, usability).
- `git diff` of `design/flows/ia.md`, `dashboard.md`, `catalog.md`, `progress.md`.
- `design/pages/dashboard/acceptance.md` in full (to check every line anchor in items 1-19);
  `design/pages/dashboard/prototype.html:15-175`; `lesson/prototype.html` `m0` tagging (`:46`, `:148`,
  `:164`, `:173`, `:186`); `design/system/README.md:204-212`.
- Shipped #29 for item 15: `apps/web/components/notifications.tsx:6,52`, `user-menu.tsx:4,38`.

## Validator

Re-run in the worktree: `python3 -I scripts/design_tokens.py check design`, exit 0. Non-`contrast ok` lines
of the orchestrator's saved output (38 `contrast ok` lines omitted):

```
INFO :root --border on --background: 1.260:1
INFO .dark --border on --background: 1.260:1
```

No flow-id errors.

## Checks

1. **A1 is in the edit list.** Item 19 rewrites the comment at `dashboard/prototype.html:75` (verified: that
   line is the "F4 empty: no ready lesson at all..." comment above the Empty at `:76`). The new text names
   both state ids that the Empty will carry after item 9 (`no-ready-lessons`, `before-catalog`), so comment
   and markup agree.
2. **Release qualifier wording.** `grep` over `design/flows`: 18 "before #30" / "from #30" / "From #30"
   occurrences; no variant ("after #30", "once #30", "pre-#30", "post-#30") anywhere. The two "until #30" /
   "ship with #30" hits (`ia.md:281`, `:286`) are prose of the rule itself, not qualifiers. The R6 anchor is
   cited by the same name "Before the catalog ships" in `ia.md:85, :90, :319, :343, :368`, `dashboard.md:64`,
   `progress.md:16` and in edit items 1, 2, 6, 12, 13; "Dashboard by release" (`dashboard.md:62`) is cited by
   its exact heading in item 2 and `progress.md:16`. Items 3 and 16 use the sentence-initial "From #30:",
   items 13-17 the inline "from #30" / "before #30": same words.
3. **Vocabulary.** The before-#30 Tab order ("К содержимому", "Академия", "Главная", user menu, "Войти
   снова" (only with the alert)) is word-for-word the same in `ia.md` R6 table, `dashboard.md:66-78`, design
   §3 and item 3. `F6` landings ("Верхняя панель" ("Академия"), "Уведомления", `main` itself) agree in
   `ia.md`, `dashboard.md`, items 4 and 6. Item 17's copy keys match the Copy table rows exactly (`:115`
   "card title" to `:125` "open catalog", `:127` "course line" to `:132` "lesson type"; before-#30 rows
   `:107-114` and `:126`), and the split leaves no row unassigned. Item 13's "elements only for F2.1, F3.1
   and F3.2" matches the `data-step`s left in `#state-before-catalog` (`:28`, `:33`, `:46`).
4. **README sentence (item 12)** says "Главная" before #30, "Главная" and "Курс" from #30, the same on every
   page, citing `ia.md` R6 "Before the catalog ships"; agrees with the `ia.md` R6 table and Navigation model.
   It sits after "Pages add no top bar overrides." (`README.md:212`), which it does not contradict.
5. **Prototype changes follow the `data-state` release pattern.** Items 8-10 only add word lists and one
   hidden label span: the same mechanism as the lesson's `m0` (one named state; existing elements tagged by
   word list, e.g. `lesson/prototype.html:148`). The label span copies the dashboard's own label-span form
   (`:157-165`). No `proto.js` / `proto.css` change, no page `<style>` change, no inline style, no new class
   (design §5 item 11, §7). Item 19 is a comment only.
6. **State ids and labels.** Label spans `:157-165` and States table `:68-76`: the same 9 ids in the same
   order (first-run, in-progress, all-passed, no-ready-lessons, loading, course-error, progress-unavailable,
   session-expired, user-menu). Item 8's list on the "Курс" link is exactly those 9, same order, without
   `before-catalog`. Item 9: `no-ready-lessons before-catalog`. Label "before #30 (no catalog)" identical in
   item 1 (States row) and item 10 (span); anchor `#state-before-catalog` identical in item 1, item 10,
   `dashboard.md:78` and design §3. Elements without `before-catalog` in their lists (`:58`, `:69`, `:81`,
   `:102`, `:111`) are hidden in it; h1 `:55` is untagged and shows.
7. **Line anchors of items 13-19** checked against the unedited `acceptance.md`: `:23` last Flows row, `:38-39`
   and `:41` Layout, `:60` end of Components table, `:89`, `:90`, `:92`, `:95` the four Interactions bullets,
   `:132` last Copy row, `:71` "no ready lessons" row. All correct.
8. **AC split (item 6)** checked against the AC texts: AC1-AC6, AC8, AC9 each describe the Card, course
   line, module rows, "Открыть курс" or course/progress reads, all absent before #30; AC7, AC10-AC13 hold in
   both; AC14 before #30 only. Every AC1-AC14 is assigned once.
9. **judge_design checklist.** Page inventory slugs and routes unchanged (`ia.md:360-364`); no new
   component; IA vocabulary equals the flows' (check 3).

## Advisory (not blocking)

- A1 (item 15, `plans/79-top-bar-before-catalog-design.md:174-175`). "Card, Button, ... appear from #30;
  before #30 the page uses Empty, the session Alert and DropdownMenu only." Read literally it is wrong:
  before #30 the page renders two Buttons, the user menu trigger (`prototype.html:28`, `user-menu.tsx:38`)
  and "Войти снова" (`prototype.html:49`, `notifications.tsx:52`). It is consistent with the Components
  table's own convention (the Button row lists only the Card/catalog/retry usages; the trigger and the
  alert action are counted under DropdownMenu and Alert), so not a defect. Clearer wording when applying:
  "the Button usages in the table above (Card, "Открыть курс", "Повторить")".
- A2 (item 5). The parenthesis "(from #30, ia.md R6; before #30: Главная)" cites R6 without the paragraph
  name used everywhere else; append "Before the catalog ships" for one citation form.
- A3 (item 12). The anchor is given as `:206` (start of the paragraph); the insertion point is after the
  sentence at `README.md:212`. The item names the sentence, so it is unambiguous.

No blockers found.

PASS - no consistency issues found
