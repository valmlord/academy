# #26 plan: English repo text and GitHub metadata

Design: `plans/26-english-docs-design.md` revision 5 (design review round 5: 3/3 PASS). Research:
`plans/26-english-docs-research.md`. Reviews: `plans/26-english-docs-design-review-1.md` to `-4.md`.

## Owner decisions (Stepan, in chat)
- CLAUDE.md section 7 is rewritten SHA-free in this PR.
- #1 and #15 are edited in place; the other 18 issues are recreated; #21 edited in place.
- learner/ is translated: C6 is enabled.
- Design review rounds 3, 4 and 5 were granted explicitly.

## Work items (coder phase, one message, no commits by coders)
| Item | Coder | Files |
|------|-------|-------|
| W1 | C1 | `README.md`, `docs/learning-process.md` |
| W2 | C2 | `docs/architecture.md`, `docs/adr/0001`-`0004` |
| W3 | C3 | `backlog/01`-`14`, `.github/ISSUE_TEMPLATE/feature.yml` |
| W4 | C4 | `docs/course-reference.md`, `backlog/20`-`25` |
| W5 | C5 | `CLAUDE.md` section 7, `plans/26-english-docs-github.md` |
| W6 | C6 | `learner/profile.md`, `learner/journal.md` |

Non-blocking round 5 notes folded into the briefs:
- W5: every 6.2 stop path (entry check fails, pre-check fails, rebase aborted) in the main checkout ends with
  `git switch main`, like 6.1 step 4 (add to the 6.4 set only if V5 needs it; it is already there). Proof (b)
  in the CLAUDE.md text uses `gh pr list --repo valmlord/academy --head <branch> ...`.

## Tester (V1-V10)
- V10 variant 1 rerun check uses `find <dir> -mindepth 1 -newer <dir>/complete` (APFS directory mtime, measured
  by the operations judge in round 5). V10 variant files must not contain the real snapshot path and must
  contain the scratch path.

## Runbook (orchestrator, after `commit`, before `pr`)
G0-G8 as in design 5.3. When G0's list check fails on content with equal counts, report the differing lines,
not only the counts. Composed `gh` commands (G6 comment, F7/F14) also name `--repo valmlord/academy`.

## Out of scope / follow-ups
- CI Cyrillic check (design section 7): proposed as a separate issue.
