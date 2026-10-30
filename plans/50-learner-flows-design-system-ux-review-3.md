# #50 judge_ux round 3: accessibility PASS, usability FAIL (1), consistency FAIL (2)

Round-2 items verified fixed live (`?tab=` write, reload, round trip through sign-in).

## Blocking

1. Usability (proto.js + lesson page). `design/system/proto.js:148-155` (`applyStateOpenings`
   re-applies `data-select-in-states` on every state change) and `design/pages/lesson/prototype.html:705-718`:
   every simulated action resets the left-pane tab to Теория and rewrites `?tab=theory`. From Проверки or
   Задание, "Проверить" -> `#state-check-running` with Теория; "Продолжить работу", "Открыть новый сеанс",
   "Переподключиться", "Запустить снова" the same. Contradicts A17, `lesson/acceptance.md:217` "No tab
   switch (A17)", AC7, AC17; breaks F13.1 -> F13.3. Fix: on a `data-goto-state` transition keep the
   selected left tab when the new state shows it; only the strip, a hash load or "Открыть результаты"
   choose a tab. Re-run "every simulated action from each tab".
2. Consistency (product-designer). `design/pages/catalog/prototype.html:17` `.module-section h3` overrides
   `.outcomes > :is(h2,h3,h4)` (16px vs 14px elsewhere). Delete the rule.
3. Consistency (ui-designer). `design/system/components.html:226-232` Collapsible section draws "Чему
   научитесь" in the old markup (`div.stack > h4 + ul`, UA indent and margins). Use `div.outcomes > h4 + ul
   + div.stack` as the lesson.

## Advisory

Dashboard and catalog "Войти снова" lack `?next=` (prototype falls back to the lesson); lesson outcomes
split across two `ul`s (8 px then 4 px gap, read as two lists): one `ul` with hidden extra `li`; redundant
`.toc h2` rule on the lesson page; `lesson/acceptance.md:14` formatting glue. Out of reach in this phase:
F9 flow "the terminal dims" vs dashed frame; design table line on source links (new tab vs same tab).
