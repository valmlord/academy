# #26 design review, round 2: 3/3 FAIL

All round 1 findings were confirmed fixed by all three judges. New defects in revision 2:

## Security (FAIL)
1. Design :327 and the 6.4 list (:345-346): tag cleanup "when `git branch --contains pre-squash` prints nothing,
   `git tag -d pre-squash`" is already true right after the squash (nothing descends from the tag), so the tag
   can be deleted before `feat/1-web-bootstrap` is rebased. Delete it only when no local branch shares history
   with it (`git merge-base pre-squash <b>` fails for every `refs/heads` branch), update 6.4, add a V7
   assertion: condition false before the rebase, true after the rebase and deleting `neg`.
Hardening: F7 "removed file -> delete list" conflicts with G7 "only G6-verified rows"; G0 `: "${D:?}"` and
`umask 077`, plus a removal step for `$D` after Stepan's deletes; V7 lines 164/177 must assert exit code 1,
not just non-zero (128 is an error); G4 asserts the `Repo:` line is `valmlord/academy`.

## Architecture (FAIL)
1. Same tag cleanup defect (alternative condition: `git branch --no-contains main` prints nothing after stale
   merged branches are deleted). Exercise it in V7 with a negative run.
2. Design :335, window B claims `git merge main` works for `feat/1-web-bootstrap`; it carries 5ad27f4 on pre-v2
   5c4d853 while main rewrote the same `.claude/hooks/` files (#23, #25): expected 3-way conflict, and a merged
   #1 breaks the 6.2 "two commits" pre-check. State that #1 is not brought up before the squash, or rehearse
   `git merge main` on `neg` in V7 window A and report it.
Minor: 6.2 :325 example uses the deleted #15 worktree/branch; use `fix/21-pipeline-v2`, `chore/998-live-wt`.
Pin the four PR #24 body strings in 2.4.

## Operations (FAIL)
1. V7 (:158) `rm -rf "$V"` and G0 (:226) `rm -rf "$D"` inside `bash -c` are refused by Claude Code's built-in
   removal check. V7: `V=$(mktemp -d "$S/v7.XXXXXX")`. G0: `mkdir -p`, overwrite files with `>`, `touch complete`
   last; no rm. With only the mktemp change V7 ran live and printed `V7 OK` (cherry `-` for 5ad27f4, `+` for
   4cda2ba; pre-check 2 commits; both negative tag runs red; diff after rebase = the two `plans/1-*` files).
2. V3 (:138-139) file-set check is red on day one: `.claude/feedback/architect_mistakes.md` is modified by
   judges. Allow `.claude/feedback/*_mistakes.md` explicitly, nothing else under `.claude/`.
Minor: G5 partial failure (dirty only `.github/CODEOWNERS` with `@OWNER -> @valmlord`: restore first);
hardcoded 18 in G4/G6 -> N = backlog files - 2; G7 output staged at `$D/pr-body.md`, `gh pr create
--body-file` before `pipeline-advance.sh pr <url>`; V7 adds `g update-ref refs/heads/main origin/main` after
the fetch; name the cleanup point for the snapshot directory.
