# #30 judge_code round 2: architecture

Reviewer: judge-architecture. Branch `feat/30-catalog-lesson-page` at `c86ff9e`, 10 commits on `6871f93` (compared
against `6871f93`; `origin/main` has moved with #84). Inputs: my round-1 review, the range-diff
`f3a5afd..341266a` vs `0cea8e5..c86ff9e`, the tester's "Re-test after judge_code round 1", the current tree.
Verdict: **PASS**.

## Round-1 findings

| # | Fix | What I checked | Status |
|---|---|---|---|
| R1 prerequisite links | `prerequisite-alert.tsx` gives each link `inlineLinkClassName`; `alert.tsx` drops `[&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground` from `AlertTitle` and `AlertDescription`, with a why-comment (specificity) | Range-diff hunks in commit 8 (the commit that first puts a link in an Alert). `rg '\[&_a\]' components`: only the comment. Every `<Alert` in the app (`lesson-text`, `prerequisite-alert`, `notifications`, `sign-in-form`, `course-error`): only `prerequisite-alert` holds a link, so removing the utilities changes no other page. New E-les assertions: offset `2.8px` (0.2em at text-sm), hover thickness `2px`; tester mutation (old utilities back) red at `lesson.spec.ts:252`; prototype comparison 0 differing properties in 8 cases. Design 8.4 Links row updated (design.md:647). | fixed |
| R2 `useOwnBucket` atomicity | Hunks moved: catalog and not-found specs plus the `fixtures.ts` docstring into commit 7 (`334147f`), lesson and leak specs into commit 8 (`c449e3b`); commit 9 keeps only the dashboard spec's own block | Range-diff for 7, 8, 9; `git show 49e44eb -- e2e/leak.spec.ts`: only the dashboard leak test and its import, no bucket hunk. Commit 9 body no longer claims the session read is new. Commit 7 and 8 bodies explain the block. Tester ran e2e twice back to back at commit 7 (27 x2) and commit 8 (51 x2), 0 lines with 429: the fix now lives where the load starts. | fixed |
| R3 empty file field | `COURSE_ROOT_FILE = "."` in `errors.ts`, used by `node-fs.ts` `withReason` (`rel === "" ? COURSE_ROOT_FILE : rel`) and by `read.ts` for the "exactly one course" case | One constant, two call sites, one vocabulary with the existing `.` convention. Two new tests (U-fs at the fs layer, U-read at the mapped `CourseReadError` with `message ".: missing"`), both red under the tester's mutation. T-err part 1 in the image: log line `web: course read failed: .: missing`, no content. Design 5.4 row added (design.md:460). | fixed |
| R4 ring transition | `item.tsx` and `breadcrumb.tsx`: `transition-[background-color,color]` | `rg transition components app`: no `transition-colors` or `transition-all` left on a focusable element (`button` `[background-color]`, `progress` `[width]`, `outlines` `transform`; `tabs.tsx` has none). Tester measurement: with the fix t0 = t500 = `--ring` and `transition-property: background-color, color`; with the mutation t0 is `foreground`, `--ring` only at t500. Design 8.4 Item and BreadcrumbLink cells updated (design.md:672, 709). | fixed |

## Notes

- N1 fixed: `rg LessonTextKind apps/web`: one definition, `lib/course/text.ts:4`; `headings.ts`, `lesson-markdown.tsx`,
  its test, `server.ts` import it, `LessonTab` aliases it with a reason. Commit order holds: `text.ts` lands in commit
  3, its importers in 6 and 8.
- N2 resolved by narrowing: `lib/routes.ts` header now says return paths built from route params are already
  percent-encoded and why encoding again would double escapes. Tester probe: `/courses/a%3Fb` -> 307
  `next=%2Fcourses%2Fa%253Fb`, which decodes once to the original path. Accepted; the catch-all's double-encoded
  `next` is the same mechanism and harmless (`safeNextPath` bounds it).
- N3 fixed: `useOwnBucket` docstring names both the sign-in limit and the per-page-load `get-session` read; it lands in
  commit 7 with the first spec that needs it.

## G1 ruling: non-blocking note

No test guards R4 (E-ring asserts style, width, offset and shadow, not colour). Not blocking: the fix is verified both
ways by measurement, the cost of a regression is a 150 ms fade of an otherwise correct ring (no WCAG failure, the
final state is right), and the class string now carries the why-comment that names `outline-color`, which is what
would stop the next editor. Recommended follow-up (cheap, the tester already has the probe): add `outlineColor`
compared with a probe element styled `outline-color: var(--ring)`, read right after the Tab, to E-ring's `toEqual`.
Fine in this PR if the coder is touched again, otherwise list it under #83 with F3.

## Regression check

- Range-diff: commits 1, 2, 4 unchanged (`=`); 3, 5, 6, 7, 8, 9 change only the hunks above; no unrelated code moved.
- No `course/`, `design/` or `packages/lesson-schema/src` path in `git diff --name-only 6871f93 HEAD`.
- `rg -c '[а-яА-ЯёЁ]'` over every file touched in this round (course lib and tests, `alert`, `item`, `breadcrumb`,
  `routes`, `fixtures`, all e2e specs, `components/lesson`, `components/markdown`): 0 matches. The new comments say
  why, not what.
- Tester, from a clean state: lint 227 files, typecheck 5/5, unit 247 passed (+2), content 0 issues, build without
  secrets, image checks I1-I3c and C1-C4, e2e 54 passed twice; commit messages checked (no attribution, `Refs #30`).
- Working tree: only feedback and plan files modified or untracked, no product file outside the commits.

## PR body

Round 1's list stands, with these changes: R1 and F2/R4 are fixed and leave the deviations list; G1 joins F3 as an
observation for #83 if not fixed here.

PASS
