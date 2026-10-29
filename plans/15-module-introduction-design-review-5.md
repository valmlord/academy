# #15 judge_design round 5 (design revision 4)

## judge-pedagogy: PASS

Checked: whole design rev 4 (1396 lines), close reads 2.5.6 (293-326), section 10 items 10-13, L6
starter policy (800-814), `hook-blocks-generated` (a) (856-972), section 14; review-4, learning-process.md
(hint ladder line 50), profile.md, judge_mistakes.md. No regressions.

- Mentor information rule: still useful to an honest learner (check messages name fields, behaviours,
  probe categories). Partial conflict with hint ladder ("скелет", "скажи прямо") not visible to the
  learner; scope ambiguous for code checks; mentor after a pass unspecified.
- Reserve pool: sound; load fits MODULE; no pass bar defined for re-assessment.
- L6 task.md: P1-P3 not carried in the design; new lists must go into the reference section.

Work items (non-blocking):
- W1 (planner -> lesson-author, practice-designer; L6 task.md): steps show only E1 and minimal hook
  object `{type, command, args}` plus "one file, stdlib only"; reference section after the steps holds all
  accepted/rejected forms, key allowlist, rejected keys, `disableAllHooks`, each with a one-line reason.
  Carry P2 (L1 effort table) and P3 (L5 table placement).
- W2 (planner, 2.5.6): (a) information rule scoped to keyed, enumerable items (quiz questions, bug-hunt
  reports, L1 cards, L3 enum fields); for code/artifact checks the mentor may point at the learner's own
  code at direction level within shown feedback; (b) after a pass the mentor may use the key and
  per-item results; (c) "скелет"/"скажи прямо" before closure: mentor says those levels open after
  closure, and why. One line in task.md/UI; flag to Stepan as an exception to learning-process.md section 3.
- W3 (practice-designer, reserve pool): each reserve file states its pass bar (quiz same passScore; L1
  3/3; L3 same tolerance; second L4 excerpt explicit `minFound` and >= 1 decoy per planted category).

PASS

## judge-accuracy: PASS

Checked live 2026-10-27: code.claude.com/docs/en/hooks (field tables, exec/shell form, onFailure,
timeouts, background hooks, disableAllHooks), code.claude.com/docs/en/settings and settings-reference.
`if`, `async`/`asyncRewake`, `timeout` (600 default, no minimum), `onFailure` values (v2.1.295+),
`statusMessage`, `once` (skill frontmatter only), `shell` (bash/powershell, ignored with `args`),
`disableAllHooks` (scope any file; `--settings` overrides) all correct. Docs silent on unknown keys,
design does not depend on it. Docs contradict themselves on default shell (`sh -c` vs `bash`); design
wording holds under either; lesson-author must not state a single default shell as fact.
Round-4 fixes applied; no regressions.

Non-blocking wording fixes (architect -> practice-designer task.md):
1. design.md:965-968: `once: true` and `shell: "bash"` do not open the hook in CC; list them as "rejected
   as outside the exercise", not fail-open. Line 955: use a truly unknown key (`"foo": 1`) as the example.
2. design.md:946-947: `timeout: 1` "may time out and then fail open", not "never blocks".

PASS

## judge-assessment: PASS

Checked: section 14, 2.3-2.5 (whole 2.5.6), whole L6, assessment map, section 10 items 1-13; validate 0
issues (reserve files under `checks/` allowed by the contract). Own whitespace test (Python 3.12 -I,
project dir with a space, sh and bash): rule accepts only strings that run the hook; CR not trimmed is
correct; leading CRLF rejected though it runs (too strict, safe). JSON: Python accepts Infinity/NaN, Node
rejects. Blocker 1 (mentor) closed; blocker 2 (fail-open registrations) closed. Round-4 non-blocking
items applied, no regressions. Rulings: launch-time/user `disableAllHooks` accepted as residual (deny rule
enforces); sh vs bash grounding accepted.

Work items (non-blocking, before `ready`):
1. Architect/planner: keep `checks/data/reserve/` off the command-check mount (strip like `reference/` in
   2.5 item 2 and 2.4; 2.4 (4d) asserts it is absent); "lesson materials" for the mentor = theory.md,
   task.md, starter/, never checks/ or the quiz.yaml key.
2. Practice-designer: strict JSON (`parse_constant` raises on Infinity/-Infinity/NaN) in verify_hook.py
   and verify_permissions.py; add to wrong solutions.
3. Practice-designer: fail on `disableAllHooks` with any value other than false; Makefile static check
   fails on `disableAllHooks` or `--settings` in a `claude` invocation.
4. Practice-designer: ground all 12 shell spellings and whitespace cases under both `sh -c` and `bash -c`.
5. Practice-designer: `re.fullmatch` on the trimmed string for the shell-form pattern.

PASS
