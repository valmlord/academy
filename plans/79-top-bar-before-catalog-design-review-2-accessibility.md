# #79 judge_design round 2: accessibility

Round: `judge_design`, round 2 (`.claude/pipeline_state.json` of this worktree: tier DESIGN, issue 79, phase
`judge_design`; round 1 votes accessibility PASS, consistency PASS, usability FAIL). Loaded first:
`.claude/feedback/judge_mistakes.md`, the role file `.claude/agents/design/judge-accessibility.md`.

## What I read

- Issue #79; `plans/79-top-bar-before-catalog-design.md` in full (Revision 2, sections 2-6, the edit list
  for the author phase incl. AC14 and the AC release head line); my round 1 review.
- `git diff` of `design/flows/ia.md`, `dashboard.md`, `catalog.md`, `progress.md`; the R3 and R4 text of
  `ia.md:176-245`; `design/pages/dashboard/acceptance.md:64-100, :150-185` (states, Interactions, AC1-AC13).
- #29's shipped code: `apps/web/components/top-bar.tsx`, `apps/web/app/(app)/page.tsx`,
  `apps/web/app/(app)/layout.tsx`, `apps/web/app/layout.tsx`, `apps/web/components/region-cycle.tsx`,
  `apps/web/components/notifications.tsx`, `apps/web/proxy.ts`, `apps/web/e2e/dashboard.spec.ts:48-58`;
  `apps/web/app` tree (no `not-found.tsx` anywhere); Next 16.4.3's builtin
  `dist/client/components/builtin/not-found.js` (English "This page could not be found.").

## Validator

Re-ran `python3 -I scripts/design_tokens.py check design`: exit 0, 38 `contrast ok` lines, and

```
INFO :root --border on --background: 1.260:1
INFO .dark --border on --background: 1.260:1
```

No flow-id error; identical to the orchestrator's `validator-design-2.txt`. No colour is added or changed,
so no `pair` runs.

## Round 1 notes

- N1 fixed: `ia.md:300-301` "the lesson page and not-found put `aria-current` on neither top-bar link";
  dashboard "Главная", catalog "Курс". Matches `top-bar.tsx:26` for the dashboard.
- N2 fixed: `dashboard.md:55-58` qualifies the Card path "from #30" and adds the before-#30 path: skip link
  and `F6` focus `main` (`tabindex="-1"`), nothing focusable, next Tab leaves the content. True to
  `page.tsx:17-24` (`main` holds h1 and Empty only) and `layout.tsx` (nothing after `main` but the
  render-null `RegionCycle`).

## Checks

1. Tab order before #30 (2.4.3). DOM: skip link (`app/layout.tsx:19-24`), TopBar brand, nav "Главная",
   user menu (`top-bar.tsx:20-33`), Notifications "Войти снова" (`notifications.tsx:34-50`), `main` with
   nothing focusable. `dashboard.md:73-74`, `ia.md:297` and plan item 3 list the same order. From #30
   "Курс" slots between "Главная" and the user menu (`ia.md:298`); no other reordering.
2. `F6` stops and landings per release, against R3 (`ia.md:186-231`) and `region-cycle.tsx:13-30`:
   - dashboard before #30: "Верхняя панель" -> "Академия" (first focusable of the header);
     "Уведомления" only while `role="region"` (`region-cycle.tsx:16`, `notifications.tsx:38`) -> "Войти
     снова"; `main` -> `main` itself. e2e `dashboard.spec.ts:52-57` asserts brand -> `main` -> back.
     `dashboard.md:74-75`, `ia.md:297` agree.
   - dashboard from #30: unchanged `acceptance.md:83-88`.
   - catalog, lesson: from #30 only; unchanged tables (`ia.md:179`, R3 table "Академия" in every row).
   - not-found from #30: "Верхняя панель" ("Академия"), "Уведомления" (alert only), `main` -> "Открыть
     курс" (`catalog.md:40-41`), its first focusable element; consistent with R3's rule.
   - "Академия" is never hidden, so the "Верхняя панель" landing is release-independent (`ia.md:301-303`).
3. AC release split (plan §5 item 6). AC1-AC6, AC8, AC9 describe the Card, course line, module rows,
   "Открыть курс" and course/progress read failures, none of which render before #30 (`page.tsx` reads
   neither course nor progress). AC7 (no button, `F6` to `main` focuses `main`), AC10 (alert into the
   existing container), AC11 (user menu), AC12 (`F6` cycle as R3), AC13 (no horizontal scroll, one-row bar,
   `top-bar.tsx:13`) all hold on the shipped page; AC12 is the e2e test. No accessibility check is lost
   before #30: every AC that covers a keyboard or live-region behaviour present before #30 stays in force.
4. AC14 (before #30): bar "Академия", "Главная", user menu; no `/courses/...` link (the only other link,
   "Войти снова", is `/sign-in?next=%2F`); `main` only h1 and Empty, nothing focusable; Tab and `F6` as
   Interactions; `F6` top bar -> "Академия". Every clause is testable and true of #29's code; it fixes the
   `main`-itself landing (R3, `tabindex="-1"` set in markup, `page.tsx:17`) as a release requirement.
5. Default 404 before #30 (`ia.md:288-291`). Verified: no `not-found.tsx` in `apps/web/app`; the proxy
   redirects signed-out requests to sign-in (`proxy.ts:13`), so only a signed-in learner who types an
   unknown URL sees Next's builtin page. It has no top bar, so no bar-consistency claim applies; no flow
   links there (the only links before #30 point to `/` and `/sign-in`). See note N1 for two details the
   sentence leaves out; neither blocks.
6. 3.2.3 Consistent Navigation within a release. Before #30 the bar exists on one page (dashboard); sign-in
   and the default 404 have none, which is absence, not a different order. The skip link is first on every
   page of both releases (root layout). From #30 one bar on dashboard, catalog, lesson, not-found, same
   links and order (`ia.md:292-298`), and the rule binds later pages to the bar of their release.
7. 4.1.2 / 2.4.4: hiding rather than `aria-disabled` keeps every announced link working (`ia.md:281-287`),
   now covering the whole `/courses/...` class (Card button, module rows, "Открыть курс", crumbs).
8. Unchanged and not affected: 3.2.6 (no help entry moved), 3.3.7 / 3.3.8 (no input or auth change), 2.4.2
   (no new titled page), 2.4.5 (dashboard reachable by "Академия", "Главная", `/`), 2.1.2 (no new widget).
   Names "Академия", "Главная", "Курс" now in the Action labels register (`ia.md:84-85`).

## Non-blocking notes (no vote impact)

- N1 `ia.md:288-291`: the default 404 renders inside the root layout (`app/layout.tsx:14-25`), so it has
  the skip link "К содержимому" whose target `#main` does not exist there (activating it does nothing), and
  its English text sits in a `lang="ru"` document (3.1.2 Language of Parts). Both are #29's shipped
  behaviour, temporary, reached only by typing a URL, and closed by #30's not-found page; naming them in the
  sentence ("the root layout's skip link has no target there; English text under `lang="ru"`") would make
  the known gap explicit for #30's tester. Not a design defect to block on.
- N2 `dashboard.md:74`: one line runs well past the file's wrap width (prose formatting only).

## Blockers

None.

PASS - no accessibility issues found
