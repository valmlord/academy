# #26 design review, round 1: 3/3 FAIL

## Operations (FAIL)
1. G4 (lines 145-147), V2 (89-90), F5 (226) require 0 label creates, but `.github/labels.yml:15` defines
   `tier:pipeline`, absent on GitHub; the live dry-run plans `gh label create tier:pipeline`. State exactly one
   expected label create (created in G5 or its own step), add it to the F14 rollback, correct F5.
2. Recovery contradicts the stop rules: F2 "rerun G4+G5" is blocked by G4's exact "18 creates"; rerunning G0
   is blocked by its own preconditions and would overwrite the rollback snapshot. Fix: G0 snapshot written once,
   never overwritten; each step has an idempotent "already done" check (G1: title already English -> skip;
   G2/G3: title and body equal target -> skip); G4 expects `18 - already-present English titles` creates, and
   the present ones are verified with the G6 checks first.
Minor: 5.1 lists "#22" as an untouched issue, but #22 is a PR (issues: #21, #23, #26). F7 must also mirror
milestone/label/file add-remove changes after review (`gh issue edit --milestone/--add-label`, rerun G6,
update the PR mapping).

## Security (FAIL)
1. Section 6 replacement rule "`git merge-base main HEAD` prints a commit" is wrong between merge and squash:
   pre-v2 `feat/1-web-bootstrap` (4cda2ba on 5ad27f4 on 5c4d853) passes it and could be checked out in the
   main checkout running v1 hooks (#21 R5, plans/21-pipeline-v2-design.md:1158-1167). Use
   `git merge-base --is-ancestor main HEAD` (branch contains main): no SHA, correct before and after the squash.
2. `pre-squash` tag timing: a local squash moves `main` before the push, so `git tag pre-squash main` would land
   on the new root and the rebase would replay all old history. Tag `origin/main` right after the merge, before
   anything moves main; pre-rebase check `git log --oneline pre-squash..<branch>` lists only the branch's own
   commits (for #1: 5ad27f4 and 4cda2ba; 5ad27f4 is dropped only via patch-id match with a58679d, otherwise
   `git rebase --abort`); the tag is local only and never pushed (no `push --tags`).
3. (a) In-place edits of #1/#15/#21 deviate from the owner's "recreate" rule: must be approved before G2.
   RESOLVED: Stepan approved in chat (#1 and #15 edited in place, the other 18 recreated; #21 was always an
   in-place edit). (b) G0 snapshot omits `comments`, which `gh issue delete` destroys: add comments, stop if any
   of the 18 has comments (or carry them over). Emit `gh issue delete n` only for mapping rows G6 verified.

## Architecture (FAIL)
1. Design 2.2 keeps only "скажи прямо" while research decision 3 keeps "скажи прямо", "подсказка", "скелет".
   All six `course/.../00-introduction/*/task.md` quote "скелет" and "скажи прямо"; mentor.md:35 "подсказка".
   Allow-list all three in learning-process.md (or state a reasoned deviation).
2. Section 7 rewrite leaves `git merge main` instructions (CLAUDE.md:152-153 and 154-155) that fail after the
   squash ("refusing to merge unrelated histories") for pre-squash branches. Re-specify every git command in
   section 7 for post-squash history.
3. The rebase recipe is untested on the one branch it is for. Add V7: rehearse the full procedure on a scratch
   clone with the real `feat/1-web-bootstrap` (tag, squash to a root commit, rebase); assert
   `git log pre-squash..<branch>` lists the expected commits and `git diff --name-only main <branch>` is exactly
   `plans/1-*`. Give CLAUDE.md the pre-rebase check.
4. `learner/` is excluded without reason: `learner/profile.md` and `journal.md` are notes for methodologists,
   mentor and judges, not course text. Needs Stepan's decision (asked; see below).
Minor: scope count is 30 files with CLAUDE.md, not 29; V1 must say which set it scans. ADR-0002's status
quotes backlog/05's title across coders C2/C3: pin that string in the fixed-name table. V2 has the same label
count error as G4.

## Orchestrator notes
- `learner/` scope: pending Stepan. Design both: if translated, it is a separate coder item (C6) with no
  allow-list beyond course-title quotes.
- plans/26-* files must end up with no Cyrillic except the allow-listed course quotes (Stepan wants no Russian
  outside course text); the orchestrator rewrites the research glossary as English-only before commit.
