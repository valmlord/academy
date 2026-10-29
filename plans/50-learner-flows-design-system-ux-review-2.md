# #50 judge_ux round 2: consistency PASS, accessibility PASS, usability FAIL (1)

All round-1 items verified fixed live by every judge.

## Blocking (usability, product-designer, lesson page)

1. `lesson/acceptance.md:178-236` and AC4 (:367); `lesson/prototype.html:178-180`; `ia.md:317-318`;
   `auth.md:71-73` (F2.2, F2.4); design controls table row "tabs Теория, Задание, Проверки: that tab
   panel; `?tab=` updated". The acceptance notes only cover reading `?tab=` on arrival; nothing says that
   selecting a left-pane tab writes `?tab=`, no AC checks it, and the prototype keeps `?tab=task` after
   clicking Проверки. "Войти снова" carries `next=<current path with ?tab=>`, so a learner on Проверки
   who loses the session returns to Задание (breaks F2.4); a reload loses the tab too. Fix: Interactions
   line "selecting a left-pane tab replaces `?tab=` (`history.replaceState`, no new entry)"; an AC
   "select Проверки, URL reads `?tab=checks`, 'Войти снова' carries it"; optionally the prototype
   rewrites the query keeping the `#state-` hash.

## Advisory

Usability: design table (`plans/50-...-design.md:236`) still says source links open a new tab (lesson
now: same tab, deliberate); `components.html:290` note claims the lesson page adds `aria-label="Верхняя
панель"` (no longer true); `proto.js:85,674` and README :210, :228 say `#module-<id>`; outcome collapse
threshold "more than two" not in lesson acceptance (2 outcomes undefined); F9 flow says "the terminal
dims" while acceptance draws a dashed frame (flow out of date, D1 follow-up); `#state-one-pane-env` after
"Открыть новый сеанс" reuses old scrollback (should be a fresh prompt); sign-in prototype drops `next` on
"Повторить" and after an empty-field error.

Accessibility: handle tooltip not hoverable (8 px gap; pointer cannot reach the tip; `proto.js:362-367`,
`proto.css:450`); bridge the gap and correct "(verified)" at `lesson/acceptance.md:330`. Region sr-only
h2s before the lesson h1; menu and group both named by the email.

Consistency: spinner `border-radius: 50%` vs `--radius-full`; `.outcomes` / `.column` defined on two
pages each (promote to proto.css or rename); underline offset and hover thickness not on README lists;
sign-in `replaceState` vs `data-goto-state` push, document it.
