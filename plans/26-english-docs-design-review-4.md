# #26 design review, round 4: 2/3 PASS (security PASS, architecture PASS, operations FAIL)

Live runs by the operations judge: V7 exit 0 `V7 OK`; V8 `V8 OK` (6 blocks, all three negative runs red);
V9 `V9 OK` (#22 headRefOid = cb50fbc). All runbook literals pass the real `bash-code-guard.sh`.

## Operations (FAIL)
1. :375-376 and :407-423, G0: composed from prose under `bash -uo pipefail -c` without `-e`; a failed snapshot
   write still gets `touch "$D/complete"` (live: `gh pr view 999999 > "$D/pr-24.json"; touch complete` left a
   0-byte file with `complete`). Reruns skip G0, G3 dies on `json.load`, F14 rollback has no source, no agent can
   repair (no `rm`). Fix: make G0 a prescribed literal (V8 count -> 7), or explicit checks before
   `touch complete`: every write `|| exit 1`; each `pr-<n>.json` parses with `.number == n`; `labels.json` a
   non-empty list; `milestones.json` holds numbers 1-5; `head` is 40 hex == `git rev-parse HEAD`;
   `main-backlog.list` line count == `git ls-tree` of main's backlog and every listed file exists under `$D/main`.

## Non-blocking (security, architecture)
- Add `--repo valmlord/academy` to `gh` writes in G1b, G2, G3, G8a.
- Do the stale-branch proof before `git worktree remove` (:768-770).
- 5.3: literals are run with the markdown indentation removed (heredoc `PY` terminator), as V8 does.
- V5 (:220-222): a command ends at "the `)` that closes a `$(`", not any `)`.
- 6.1 step 4 (:735-737 vs 722): add "switch the main checkout back to `main`".
