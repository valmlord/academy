# #26 design review, round 3: 3/3 FAIL

All round 2 findings confirmed fixed; no round 1 regressions. New defects in revision 3, all in the CLAUDE.md
squash recipe or the runbook's shell plumbing, none in the translation rules:

## Security
1. :309 vs 5.3 :274: G1b's `--description "...Stepan's grant"` inside a mandated single-quoted `bash -c '...'`
   ends the quote; the rest runs in zsh outside the `umask`/`${D:?}` guards. Read label values from
   `labels.yml` inside the script (or `'\''`), and add a V-check that no `-c` literal contains `'`.
2. :422-427: `git branch -D` for stale branches gated only on "PR merged on GitHub"; no local proof of no
   unpushed commits, and branches without a PR (`chore/998-live-wt`) have no check. Require
   `git rev-parse <b>` == `gh pr view <n> --json headRefOid`, or `git merge-base --is-ancestor <b> pre-squash`.
Minor: A4 "no course source -> translate" fallback contradicts V1 "exactly four rows"; use `rg -nF -e "$s"`;
G2/G3 titles with `"` should come from a file or Python argv.

## Operations
1. :204 + :223: V7 is red as written (`V7 FAIL: B: regression premise ...`): `git branch --contains` lists the
   detached HEAD at `origin/main` == `pre-squash`. Fix: `g checkout -q main` after the squash, or
   `for-each-ref refs/heads --contains`. With that one line V7 ran to `DIAG V7 OK`.
2. :353: G8 calls `bash .claude/hooks/pipeline-advance.sh pr <url>` from the worktree; `lib/common.sh:44-45`
   refuses. Use the worktree invocation from CLAUDE.md section 7.
3. :350-352: G8 has no `git push -u origin docs/26-english-docs` and no remote-head == HEAD check.

## Architecture
1. :391-400, :438-444: the #1 "never `git merge main`, in any window" exclusion never ends: after the 6.2
   rebase, once main moves on, #1 has no valid bring-up path (step 3 sends it to 6.2, whose pre-check fails or
   the tag is gone). Limit the exclusion to before its 6.2 rebase, reword step 3 to "unrelated history", add a
   6.3 row for "rebased, then main moved", optionally rehearse in V7.
Minor: V1 reruns after G3 must read PR #24 from the `$D` snapshot, not the live body.
