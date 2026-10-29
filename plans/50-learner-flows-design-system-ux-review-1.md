# #50 judge_ux round 1: usability FAIL (4), accessibility FAIL (2), consistency FAIL (3)

Sign-in, dashboard and catalog pass on their own for usability; most findings are the lesson page's
cross-page links and two system CSS defects.

## Blocking

### System (ui-designer)

- A1. `design/system/proto.css:298,301`, WCAG 2.4.7 / 1.4.11: `.dropdown-item:focus-visible` sets
  `outline: none` and only `background: var(--accent)`: 1.090:1 light, 1.185:1 dark on `popover`; also
  `aria-disabled` items (`muted` on `popover` 1.09:1). Keep a visible indicator of at least 3:1 (e.g.
  `outline: 2px solid var(--ring); outline-offset: -2px`).
- A2. `proto.css:494-526,579,609`, WCAG 2.4.11 / 1.4.10: in one-pane mode `.pane[data-pane="environment"]`
  has no overflow handling while `.terminal-frame` / `.terminal-placeholder` keep `min-height: 12rem`, so
  above the 30rem height breakpoint the pane paints over the check bar. Covered "Проверить" at 375x667
  (session-expired, api-key, idle-warning, after-run-stopped) and at 320x500 in 41 of 44 states. Make
  the environment pane body scroll like the lesson pane, or raise the document-mode breakpoint; verify at
  375x667 and 320x500 with both panes shown.
- C1 (gallery half). `components.html:179` labels the left-pane tab list "Урок"; must equal the page.

### Lesson page and cross-page anchors (product-designer)

- U1 / C3. `lesson/prototype.html:115`: "Войти снова" goes to `../sign-in/prototype.html` without
  `#state-with-next`; F2 never reaches F2.4. Lesson acceptance must state the destination
  (`/sign-in?next=<current path with tab>`, design "Controls and their v1 destinations").
- U2 / C3. `lesson/prototype.html:100`: "Выйти" without `#state-signed-out`; F3.3 "Вы вышли" not
  reached; lesson acceptance F3.2 row omits it.
- U3. The lesson prototype ignores `?tab=`: dashboard "Продолжить" (`?tab=task`) opens Теория (F4.3) and
  the sign-in `next` redirect does not restore the tab (F2.4). Honour `?tab=` (task -> `#state-task`,
  checks -> `#state-checks-before`) or link to the state anchor.
- U4 / C2. Module anchors: the lesson crumb links `catalog#introduction`, the catalog renders
  `id="module-introduction"`; dashboard acceptance :95 says `#module-<id>`, its AC6 and catalog
  Interactions say `#<moduleId>` (the route in `ia.md`). Pick the `ia.md` route scheme and make the
  catalog id, every link and every acceptance line agree.
- C1. `lesson/prototype.html:175`, `lesson/acceptance.md:250`: tab list `aria-label="Разделы урока"` is
  in no `ia.md` set; treat it like "Навигация" and "Область" (Stepan's decision: keep, list in Copy
  table, Open question for the D1 register update), and the gallery uses the same name.
- A2 (claim). `lesson/acceptance.md:321-325` and AC13 claim the check bar is never overlaid, verified
  only at 320x200; re-verify after the system fix at 375x667 and 320x500 and correct the text.

## Advisory

Usability: sample progress data disagrees between dashboard (2 of 6, lesson 03 started) and catalog
(01 passed, 02 in progress); "Открыть новый сеанс" goes to `#state-one-pane-env`; "Продолжить работу"
focus in one-pane mode should be the "Урок" switch tab; top bar `aria-label="Верхняя панель"` only on
the lesson page; catalog course description drops the last sentence of `course.yaml`.

Accessibility: sign-in message divs use `aria-labelledby` without a role (`role="group"`);
`p.dropdown-label` inside `role="menu"`; disabled menu items repeat the reason in name and description;
selected tab shown only by a subtle background; region h2s before the lesson h1; source links open a new
tab without saying so; tooltip persists after hover until Esc or blur; split handle box overlaps about
6 px of the lesson pane scrollbar.

Consistency: gallery top bar button has `aria-haspopup="menu"` with no menu, no `data-menu-trigger`, no
`data-region`; gallery warning Alert copy "Урок можно читать и сейчас." is in no set; gallery lacks
`.card-description`, `.lesson-meta`, `.lesson-header`, `.toc`, `.env-details`; check-status Badges shown
in the gallery are used by no v1 page (inventory still lists them); faked "Повторить" behaviour written
three ways (`data-goto-state` + `data-focus-after` + `replaceState`, `data-goto-focus` + `pushState`,
`data-focus`), should be one proto.js API; "Чему научитесь" indent differs (catalog `space-6` h3, lesson
`space-5` h2; README says `space-6`); values off the README scales (`.badge .status-icon` 0.5rem and
1.5px, chevron 0.4rem, `.progress` radius 999px, `.prose code` 0.875em, font-weight 700); course code
`http:&#47;&#47;localhost` entity-encodes slashes to pass the URL check (clean fix: an ADR exception for
course code text, out of scope here).
