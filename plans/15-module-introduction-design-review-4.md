# #15 judge_design round 4 (design revision 3)

## judge-pedagogy: PASS

Checked: whole design rev 3 (1241 lines), review-3 E1-E3, learner/profile.md,
docs/learning-process.md sections 3-6, judge_mistakes.md; journal empty.

- E2/E3 in 2.5.6 (lines 284-293): mentor review after closure (Socratic walk, journal entry,
  re-assessment on unseen items, `passedVia: mentor-review`, reset cannot reopen); mentor between
  attempts at question/direction only; capped checks suggest mentor after 5 fails. Holding back
  skeleton/direct levels until closure is a justified exception.
- E1 still open in section 13 (student run records L4 time split).
- Rev-3 changes (L6 exec/shell form, L1 per-model effort, L5 four values) break no concept order.
- No regressions: outcomes, order, 335 min / 63% hands-on, A-D intact.

Work items (non-blocking):
- P1 (lesson-author, practice-designer; L6 task.md): E1 up front as "use this one"; full
  accepted/rejected list in a reference table after the steps, with one line on why quotes matter
  (sh splits a path with a space).
- P2 (lesson-author; L1 theory): per-model effort guidance as one dated, sourced table framed as
  "check this page before you choose", not prose to memorize.
- P3 (lesson-author; L5 theory): place the `instructionFiles` table after managed scope, auto memory,
  `.claude/rules/` and path-scoped rules are introduced.
- P4 (curriculum-architect / planner; 2.5.6 wording): mentor between attempts never reveals which
  question or report failed; say where unseen re-assessment items come from (author-written reserve
  pool or mentor-generated).

PASS

## judge-accuracy: PASS

Checked live 2026-10-27: code.claude.com/docs/en/hooks (exec/shell form, reference scripts by path,
exit codes and non-blocking errors, onFailure, security best practices, matcher table),
code.claude.com/docs/en/memory ("Choose which instruction files load", 4 values),
platform.claude.com/docs/en/build-with-claude/effort (per-model guidance incl. Opus 5.5 sweep).
Both round-3 blocking items fixed; all new claims correct; no regressions (old wording survives only in
rev-2 changelog entries marked superseded). Regex traced by hand against the 12 shell spellings, not run.

Non-blocking wording fixes (lesson author / practice-designer):
1. design.md:836: whitespace in `command` fails only for a bare name with extra tokens alongside `args`
   (e.g. `python3 script.py`); an absolute path with spaces is valid. Fix the reason text.
2. design.md:824-825: the `shell` field reason is "unsupported in this exercise", not a CC rejection.

PASS

## judge-assessment: FAIL (owner: curriculum-architect)

Checked: section 13, 2.1, 2.3-2.5, L1, L6, assessment map, section 10, research-l6 hooks.
`pnpm content:validate` 0 issues. Shell-form regex: 12 accepted match, 26 rejected fail. Grounding
(project dir with a space): all accepted forms exit 2; rejected forms fail to start. L1 random < 0.1%.
L1 adaptive (own bisect, 20k): within 10 submissions k=4 0%, k=6 0.005%, k=12 0.20%; median uncapped
67/49/31. Round-3 work items 1-3 covered.

Blocking:
1. 2.5.6 mentor between attempts may say which question/card/report is wrong. With per-item feedback a
   6-q quiz passes within 3 attempts at 19.9% (was 0.36%); L1 k=12 within 10 at 8.32%. Fix: mentor
   never says or implies which item is wrong or right; it does not receive the key or per-item results,
   only the learner's answers and reasoning.
2. Fail-open registrations still pass L6 `hook-blocks-generated` (a): `if` filter with a typo, tiny
   `timeout`, `disableAllHooks: true` in a workspace settings file, `async: true`, NBSP leading
   whitespace stripped by Python `str.strip()` (sh exits 127). Fix: allowlist hook-object keys (`type`,
   `command`, `args`, `timeout` absent or >= 5, `onFailure`, `statusMessage`), reject others naming the
   key; fail if any workspace settings sets `disableAllHooks`; trim only ASCII space/tab/CR/LF; add each
   to wrong solutions and the demo.

Non-blocking:
- Restate adaptive figures: "< 1% within 10 (0.13-0.20% for two simulated strategies)", "about 30-200
  submissions without a cap".
- 2.5.6: mentor review records a separate result and does not reopen the original check; a reopened
  L1/L3 check never resets its failed-submission counter.
- Practice-designer: local python3 is 3.9.6; 2.4 needs 3.10+, use /opt/homebrew/bin/python3.12 first
  on PATH.
- L6 task.md: hook is a single stdlib-only file (part (b) runs `python3 -I`).

FAIL
