# #79 judge_ux round 1: accessibility

Round: `judge_ux` (read from `.claude/pipeline_state.json`, phase `judge_ux`), round 1. Judge: design/judge-accessibility.
Inputs read: issue #79; `plans/79-top-bar-before-catalog-design.md` (rev 2); `plans/79-top-bar-before-catalog.md`;
`plans/79-top-bar-before-catalog-author-report.md`; `git diff main -- design/` (flows `catalog.md`, `dashboard.md`,
`ia.md`, `progress.md`; `design/pages/dashboard/acceptance.md`, `prototype.html`; `design/system/README.md`);
`design/system/proto.js` (state mechanism) and `proto.css:109`; #29's shipped `apps/web/components/top-bar.tsx`,
`apps/web/app/(app)/page.tsx`, `apps/web/app/(app)/layout.tsx`, `apps/web/app/layout.tsx`,
`apps/web/components/region-cycle.tsx`, `apps/web/components/notifications.tsx`, `apps/web/e2e/dashboard.spec.ts`.

## Validator

`python3 -I scripts/design_tokens.py check design`, run by me: exit 0, 38 `contrast ok`, plus

```
INFO :root --border on --background: 1.260:1
INFO .dark --border on --background: 1.260:1
contrast ok :root --muted-foreground on --background: 5.251:1 (min 4.5:1)
contrast ok :root --ring on --background: 4.742:1 (min 3.0:1)
contrast ok .dark --muted-foreground on --background: 7.663:1 (min 4.5:1)
contrast ok .dark --ring on --background: 7.663:1 (min 3.0:1)
contrast ok .dark --input on --background: 3.606:1 (min 3.0:1)
```

No flow-id errors. Same result as `validator-ux.txt`. No colour, CSS or new component in this change, so no extra `pair`
run is needed (no new foreground/background pair; `proto.css` untouched, #80 out of scope).

## Headless run (my own, independent of the author's script)

Script and raw output (scratchpad, not repo):
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-docs-79-top-bar-6a98a3/52c3f837-a16b-4833-b813-4f6926ff2125/scratchpad/a11y/judge-a11y.js`, `judge-a11y.txt`, `skip.js`.
Playwright 1.64.1 from `node_modules/.pnpm`, `file://` prototype, `#state-<id>` + reload, 1280x900, light and dark
(`html.dark` false / true). Accessibility tree from `locator.ariaSnapshot()`. Light and dark identical.

| State | Top bar in a11y tree | `aria-current` | Tab (product part) | `F6` / Shift+`F6` / Ctrl+Shift+. |
|-------|----------------------|----------------|--------------------|-----------------------------------|
| before-catalog | banner: link Академия; navigation: link Главная; button learner@example.com. No "Курс" | Главная=page | К содержимому, Академия, Главная, user menu (4) | Академия -> main itself -> wraps; reverse main -> Академия; chord same as F6 |
| no-ready-lessons | ... navigation: Главная, Курс ... | Главная=page | К содержимому, Академия, Главная, Курс, user menu (5) | Академия -> main itself |
| session-expired | with Курс | Главная=page | ... user menu, Войти снова, Продолжить, 6 module rows | Академия -> Войти снова -> Продолжить |
| user-menu | with Курс, menu expanded | Главная=page | ... user menu, Выйти, Продолжить, 6 rows | Академия -> Продолжить |
| first-run (control) | with Курс | Главная=page | ... user menu, Начать, 6 rows | Академия -> Начать |

`before-catalog` details:
- Hidden "Курс": `hidden=true`, computed `display: none` (`proto.css:109` `[hidden] { display: none !important }`),
  absent from the ARIA snapshot and from the Tab sequence: really removed, not visually hidden.
- Visible links to catalog/lesson routes (outside prototype chrome): 0 (no-ready-lessons: 1, the "Курс").
- `main` ARIA: heading "Главная" level 1, paragraph "В курсе пока нет готовых уроков"; nothing focusable.
- Skip link: Tab 1 = "К содержимому", Enter focuses `main#main` and keeps `data-active-state=before-catalog` (the hash
  `#main` is not a state hash), next Tab leaves to the prototype chrome: matches `dashboard.md` "the next Tab leaves the
  page content".
- User menu opened on top of `before-catalog`: `aria-expanded=true`, focus on menuitem "Выйти", state stays
  `before-catalog`, nav still only "Главная"; Esc closes, focus returns to the trigger.
- No horizontal scroll at 375 and 320.
- The session alert cannot be drawn on top of `before-catalog` (template tagged `session-expired` only); the design of
  record accepts the combination in words (acceptance.md:90-93). Its Tab/`F6` are taken from the shipped code instead.

## Against #29's shipped code

- `top-bar.tsx:20-34`: brand link, nav with one link "Главная" `aria-current="page"`, user menu. Equals the
  before-#30 bar in `ia.md:289-291`, `dashboard/acceptance.md:85, :97-100`, AC14 (`:204-207`) and the prototype state.
- Root `layout.tsx:19-24` skip link first, then `(app)/layout.tsx:16-19` top bar, Notifications, main: Tab order
  "К содержимому", "Академия", "Главная", user menu, "Войти снова" (only with the alert; `notifications.tsx:52-54`),
  nothing in `main` (`page.tsx:17-25`). Matches acceptance.md:99-100.
- `region-cycle.tsx:13-30`: regions = header, notifications wrapper only while `role="region"` (with the alert), main;
  landing = first focusable or the region itself. So `F6`: "Академия"; "Войти снова" (alert only); `main` itself
  (`tabIndex={-1}`, `page.tsx:17`). Matches acceptance.md:101-104 and `ia.md:291`.
- `e2e/dashboard.spec.ts:48-57`: F6 -> brand link, F6 -> `main#main`, Shift+F6 -> brand link; `:104-117` skip link first
  and focuses main. Consistent with AC12/AC14.

## Checklist

1. Before-#30 and from-#30 Tab orders and `F6` regions/landings: acceptance.md:97-104, `dashboard.md:55-58, :62-78`,
   `ia.md:286-297` all agree with the prototype run above and with the shipped code. Verified.
2. Hidden link really absent from the a11y tree and Tab order: verified (display:none via `[hidden]`).
3. `aria-current`: dashboard "Главная" in every state including before-catalog (prototype `:25`, shipped
   `top-bar.tsx:26`); catalog prototype `:25` on "Курс"; lesson prototype `:85-88` on neither; `ia.md:300-301` states
   exactly this, and not-found is specified to put it on neither. Verified.
4. Release qualifiers in Accessibility notes: Badge and Progress notes prefixed "From #30" (acceptance.md:169-170);
   landmarks and live containers hold in both releases. See advisory A1.
5. 3.2.3 Consistent Navigation: within each release the bar is identical on every page (`ia.md:286-287`, README
   `:212-214`); the from-#30 bar only inserts "Курс" between "Главная" and the user menu, so the relative order of the
   repeated components is unchanged across releases and pages (dashboard, catalog, lesson prototypes all "Главная",
   "Курс"). 3.2.6 Consistent Help: no help entry is moved. Verified.
6. 2.4.3 Focus Order / 2.1.1: the before-#30 page has no dead stop; `main` reachable by skip link and `F6`. 2.4.1:
   skip link and landmarks unchanged. 4.1.2: menu trigger `aria-haspopup`/`aria-expanded` toggles in before-catalog.
7. 1.4.10 reflow: no scroll at 320/375; 2.4.7, 2.4.11, 2.5.8, 1.4.12, reduced motion: no CSS change in this diff
   (`proto.css` untouched), prior rounds' results stand.
8. `Status: ready` kept (acceptance.md:30); a ready page with all checks above green.

## Advisories (non-blocking)

- A1 `design/pages/dashboard/acceptance.md:160-166, :171`: the "Прогресс недоступен" composition note and "Focus never
  falls back to `body` after "Повторить"" carry no "From #30" prefix, although both describe from-#30 content. The
  design of record (section 6, row `:146`) accepts them as scoped by the release paragraph (`:90-93`) and they are
  vacuously true before #30, so no wrong behaviour can follow; a prefix would make the notes uniform with `:169-170`.
- A2 `design/pages/dashboard/acceptance.md:97-100`: the from-#30 Tab order omits "Выйти" which the `user-menu` state
  inserts after the trigger while the menu is open (prototype run). Pre-existing, unchanged by #79.
- Known, out of scope: #80 proto.css bugs; the default-404 skip link without a `#main` target (#30 follow-up).

Checked: validator exit 0 (38 contrast ok; text min 5.251:1 light / 7.663:1 dark for muted-foreground, ring 4.742:1 /
7.663:1, input 3.606:1 dark; INFO border 1.260:1 both themes), own headless run of before-catalog, no-ready-lessons,
session-expired, user-menu and first-run in both themes, ARIA snapshots, skip link, menu on before-catalog, 320/375
reflow, the shipped #29 top bar, layouts, region cycle, notifications and e2e. No blockers.

PASS - no accessibility issues found
