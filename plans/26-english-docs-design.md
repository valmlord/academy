# #26 design: English repo text and GitHub metadata (revision 5)

Input: `plans/26-english-docs-research.md`, `plans/26-english-docs-design-review-1.md` (3/3 FAIL),
`plans/26-english-docs-design-review-2.md` (3/3 FAIL), `plans/26-english-docs-design-review-3.md` (3/3 FAIL,
all round 2 findings confirmed fixed, no round 1 regressions), `plans/26-english-docs-design-review-4.md`
(security PASS, architecture PASS, operations FAIL on G0) and the owner decisions relayed after round 1.
Stepan granted round 5 with "fix G0 and the non-blocking remarks from review-4; do not simplify, do not change
anything else". Facts checked against the worktree at e7c4b97: 20 backlog files, `.github/labels.yml:15`
defines `tier:pipeline` with a description that contains an apostrophe, CLAUDE.md has Cyrillic nowhere, its
only SHAs are in section 7 (lines 151-153 and 197-205), the worktree invocation of `pipeline-advance.sh` is at
CLAUDE.md:146, `lib/common.sh:44-45` refuses a CLI call through a worktree's copy, `learner/` holds
`profile.md` and `journal.md`, the journal entry format is defined in English at
`.claude/agents/dev/_learn-mode.md:21-24`, `pr-hygiene.yml:18` and `:24` hold the title and body regexes,
`scripts/github_bootstrap.py:46-52` (`parse_labels`) and `:30-43` (`parse_issue`) are importable without side
effects (`main()` is guarded at `:139`), `:101` prints `Repo: <nameWithOwner> | you: <login>` and the script
rewrites `@OWNER` in `.github/CODEOWNERS` only after every issue create (`:127-134`). Local branches of the main
repo (read from `.git/refs/heads`): `main`, `feat/1-web-bootstrap` (4cda2ba), `fix/21-pipeline-v2` (cb50fbc,
merged via the #22 merge commit), `chore/998-live-wt` (e678c4d, the #22 merge commit, in main), and
`docs/26-english-docs`; the only registered worktree is `.claude/worktrees/docs-26-english`. I have no shell.
In round 4 the operations judge ran revision 4's V7 (`V7 OK`), V8 (`V8 OK`, 6 blocks, three negative runs red)
and V9 (`V9 OK`, #22 `headRefOid` = cb50fbc), and every runbook literal passed the real `bash-code-guard.sh`.
The revision 5 additions (the G0 literal, the `--repo` arguments, the V8 update, V10) have not been run;
section 11 lists every line I traced only on paper and every assumption I could not verify. The orchestrator
runs V7, V8, V9 and the two negative variants of V10 (all read-only on the real repo and on GitHub) before the
judge round, per the round 3 lesson "an unrun check is not a deliverable"; V10's positive variant needs the
translated backlog and runs in the tester phase.

## 0. Round 4 changes

| Finding | Change |
|---------|--------|
| Ops 1: G0 composed from prose under `bash -uo pipefail -c` without `-e`; a failed write still gets `touch "$D/complete"` | G0 is now a prescribed literal (5.3) under the same quote rule (no `'` inside, absolute `cd`, `umask 077`, `: "${D:?}"`, no `rm`). Every snapshot write ends with `|| exit 1`. Before `touch "$D/complete"` a Python check verifies every artifact the marker vouches for: each `pr-<n>.json` parses with `.number == n` (and string title and body); `labels.json` is a non-empty JSON list; `milestones.json` holds numbers 1-5; `issues.json` holds #1-#20, each with a title and a `comments` list; `head` is 40 hex and equals `git rev-parse HEAD`; `main-backlog.list` equals `git ls-tree --name-only main backlog/` line for line (so the line counts are equal, and an empty list stops) and every listed file exists under `$D/main`. The revision 4 stop conditions are checked in the same Python block. Rerun semantics written into G0: with `complete` absent, rewriting all files is safe. `tar -x` became `tar -x -f -`, because without `-f` bsdtar does not promise to read stdin. |
| Ops 1, follow-up: V8 block count | V8 expects 7 blocks (V7, V9, G0, G1b, G2, G3, G8a), checks that every G0 line writing `> "$D/` ends with `|| exit 1` and that `touch "$D/complete"` appears once, right after the heredoc. Two negative runs added: G0's opening line changed to `bash -c '` (count 6), `|| exit 1` removed from G0's `pr-$n.json` line. |
| Ops 1, follow-up: the fix is code, so it is run | New V10 runs the G0 literal against a scratch directory: a positive run (`G0 OK`, then `G0 skip` on the rerun, no file touched), and two broken variants that must exit 1 without `complete` (a failing write: PR 999999; a content failure: `pr-<n>.json` without `number`). |
| Non-blocking: `--repo valmlord/academy` on `gh` writes | Added to every `gh` write in G1b, G2, G3 and G8a, and to every `gh` read in G0. I also added it to the reads inside G1b, G2, G3 and G8a, because each of them compares a read with what it is about to write, and a read from another repo would make that comparison meaningless. `gh api` in G0 already names the repo in its path. |
| Non-blocking: stale-branch proof before `git worktree remove` | 6.2 "Stale branches": proof (a) or (b) first; only then `pipeline-advance.sh parked` and `git worktree remove`, then `git branch -D`. A branch that fails both proofs keeps its worktree. |
| Non-blocking: 5.3, indentation | 5.3 "How a literal is run": the literal runs exactly as V8 extracts it, with the markdown indentation removed, because `<<"PY"` needs `PY` in column 0 and Python needs its own indentation. |
| Non-blocking: V5 `)` | A command ends at the `)` that closes a `$(`, not at any `)` (`--format='%(refname:short)'` holds one). |
| Non-blocking: 6.1 step 4 | Step 4 in the main checkout: `git switch main` first, then ask. 6.4 gains `git switch main`, because V5 compares the command set exactly; 6.3 row A says so. |
| Consequences | 5.3, section 7 and section 11 say G0 is a literal; new F29 (a G0 check fails); F2 names the rerun semantics. |

## 0a. Round 3 changes

| Finding | Change |
|---------|--------|
| Sec 1: `Stepan's` in G1b's `--description` ends the mandated single-quoted `bash -c` | G1b is now a prescribed literal (5.3) that reads name, color and description from `.github/labels.yml` inside the step through `scripts/github_bootstrap.py`'s own `parse_labels`, passed to `gh` as argv; no label value is retyped. New 5.3 rule: no `'` anywhere inside a step's `-c` literal, values with quotes are read from their source file inside the step. The same class of bug was also in G0 (`gh api 'repos/...milestones?...'`): now double-quoted. New V8 scans every fenced `bash -uo pipefail -c` block of this design for `'`, checks the block count, and syntax-checks each block (`bash -n`) and each Python heredoc (`py_compile`); negative runs included. |
| Sec 2: stale-branch `git branch -D` gated only on "PR merged on GitHub" | 6.2 "Stale branches": `git branch -D` only after a local proof, (a) `git merge-base --is-ancestor <branch> pre-squash` exits 0 while the tag exists, or (b) a merged PR of that head whose `headRefOid` equals `git rev-parse <branch>`; neither -> stop, ask. `git branch -d` is gone (it judges against HEAD or the upstream, not against main). Stale cleanup runs after the tag exists and before the tag cleanup. 6.4 updated. V7 rehearses (a) both ways (`stale` passes, `neg` with unmerged work is rejected); new V9 runs (a) and (b) read-only on the real branches, with `feat/1-web-bootstrap` as the negative. |
| Ops 1: V7 red (`git branch --contains` lists the detached HEAD on the tag) | V7: `g checkout -q main` right after the squash, so HEAD is a branch. The regression line keeps the literal round 2 rule (`git branch --contains pre-squash`) because that is what Stepan would type. |
| Ops 1 / Arch 1: rehearse "rebased, then main moved on" | V7 window D: after the recipe, a commit on main; `#1` then fails step 1, passes the step 2 conditions (shared history, no `-` in `git cherry`), `git merge main` succeeds, step 1 exits 0. While tracing this I found that the 6.2 pre-check alone does not protect that state: `pre-squash..<branch>` lists exactly two commits (the new root and the rebased plans commit), which looks like a valid pre-check. 6.2 now has an entry check (`git merge-base main <branch>` must exit 1), and V7 window D asserts the shared history that keeps the branch out of 6.2. |
| Ops 2: G8 calls `bash .claude/hooks/pipeline-advance.sh pr` from the worktree | G8 split: G8a (literal, push and PR) and G8b, the CLAUDE.md:146 worktree invocation as its own Bash call, with an absolute `cd` into the worktree first. |
| Ops 3: G8 has no push and no remote-head check | G8a: `git push -u origin docs/26-english-docs` (never forced), then `git ls-remote` head == `git rev-parse HEAD`, then create or edit the PR. F7 now reruns G8a after any HEAD change, so the push and the check repeat. New F25 (push rejected). |
| Arch 1: the #1 exclusion "in any window" never ends | Bring-up procedure rewritten (6.1) without a name check: step 2 merges only when history is shared AND `git cherry main HEAD` prints no `-` line; step 3 is "unrelated history (after the squash) -> 6.2"; step 4 (shared history with a `-` line) stops. `feat/1-web-bootstrap` hits step 4 before the squash (its v2 cherry-pick has a patch-id twin in main), step 3 after the squash, and step 2 after its 6.2 rebase. The end of the special case is detected by the procedure itself. Section text says the exclusion lasts "until its 6.2 rebase". 6.3 gets row D. V7 asserts the `-` count in window A (1) and in window D (0). |
| Minor (Sec): A4 "no course source -> translate" vs V1 "exactly four rows" | The table always has exactly four rows, one per locator line. A row is either sourced (string plus `course/` `file:line`) or the marker row `-` / `none` (that quote is not course text, C5 translated it and reported it). V1 checks the count of four, the locator set {5, 28, 29, 36}, and both checks on every sourced row. |
| Minor (Sec): `rg -nF '<string>'` | `rg -nF -e "$s" course/` in 2.4 and V1, so a string starting with `-` is never read as an option. |
| Minor (Sec): G2/G3 titles with `"` | G2 and G3 are prescribed literals; titles come from `parse_issue` or from fenced blocks in `plans/26-english-docs-github.md` (format fixed in 5.4) and reach `gh` as Python argv, bodies through `--body-file`. |
| Minor (Arch): V1 reruns after G3 read the live PR #24 body | V1 reads the original PR #24 body from `$D/pr-24.json` once `$D/complete` exists, and from the live PR only before G0. |
| Own find while tracing: `\|` in an ERE | V2 and G4 match the `Repo:` line with `[|]`, because `\|` in `grep -E` is alternation in GNU grep and undefined in POSIX. |
| Own find while tracing: steps rely on the cwd | Every runbook literal starts with an absolute `cd` into the worktree, because the Bash tool's cwd is not guaranteed to be the worktree. |

## 0b. Round 2 changes

| Finding | Change |
|---------|--------|
| Sec 1 / Arch 1: tag cleanup condition (`git branch --contains pre-squash` prints nothing) is already true right after the squash | New condition in 6.2 and 6.4: no local branch shares history with the tag (`git for-each-ref ... refs/heads` piped into `git merge-base pre-squash "$b"`, prints nothing). Stale merged branches are deleted first (6.2 "Stale branches"). V7 asserts: the old rule is already true after the squash (regression premise); the new condition is false before the rebase (prints `feat/1-web-bootstrap` and `neg`), still false after the rebase while the stale `neg` exists, true after `git branch -D neg`. V5 negative run: `git branch --contains pre-squash` added back goes red. |
| Arch 2: window B claims `git merge main` works for `feat/1-web-bootstrap` | #1 is never merged with main. Bring-up step 2 (6.1) excludes it by name, 6.1 says so in the section text, 6.2 lists it as the only branch with own work, 6.3 window B says "not brought up" with the reason. No merge is rehearsed because none is prescribed. New F20 for a postponed squash. |
| Ops 1: `rm -rf "$V"` (V7) and `rm -rf "$D"` (G0) refused by the harness | V7: `V=$(mktemp -d "$S/v7.XXXXXX")`, clone into `$V/repo`. G0: `umask 077`, `: "${D:?}"`, `mkdir -p`, every file written with `>`, `complete` touched last; no `rm` anywhere in a script. |
| Ops 2: V3 file-set check red on day one | V3 allows `.claude/feedback/*_mistakes.md` and nothing else under `.claude/`; negative run with an extra `.claude/settings.json` line. |
| Sec hardening: F7 "removed file -> delete list" contradicts G7 | F7: issues orphaned by a removed backlog file are listed in the PR body under "Orphaned, Stepan decides" with no ready-made delete command; delete commands still come only from G6-verified rows. |
| Sec hardening: G0 `${D:?}` and `umask 077`; removal of `$D` | G0 as above; every G step sets and guards `D` itself (5.3 preamble). Cleanup point for the snapshot directory named in 5.5 (Stepan, after the deletes). |
| Sec hardening: V7 asserts any non-zero where exit 1 is meant | `expect_rc 1` helper for both `--is-ancestor` rejections, the unrelated-history `merge-base` and the too-old-tag `diff --quiet`; 128 (an error) now fails the run. |
| Sec hardening: G4 must check the `Repo:` line | G4 and V2 require exactly one line matching `^Repo: valmlord/academy \| you: [^ ]+$`. |
| Arch minor: 6.2 example names the deleted #15 worktree/branch | Example uses the real leftovers `fix/21-pipeline-v2`, `chore/998-live-wt` and, after this PR, `docs/26-english-docs` with its worktree. |
| Arch minor: pin the four PR #24 body strings in 2.4 | 2.4 pins them by locator (PR #24 body lines 5, 28, 29, 36) and C5 records the exact strings, each with its `course/` source `file:line`, in a table in `plans/26-english-docs-github.md`; V1 reads A4 from that table and checks it against the live body and the course file. Deviation: the strings are not copied into this design because it must stay free of Cyrillic beyond the three hint words (orchestrator rule); the table is in a `plans/26-*` file that may hold A4. |
| Ops minor: G5 partial failure leaves only `.github/CODEOWNERS` dirty | 5.3 start-of-run recovery: if the only dirt is CODEOWNERS and it equals `HEAD`'s version with `@OWNER -> @<login>`, `git restore` it; any other dirt stops (F21). |
| Ops minor: hardcoded 18 in G4/G6 | N = number of `backlog/*.md` files at HEAD minus 2 (the in-place #1 and #15); 18 today. G0, G4, G6, G7 use N. |
| Ops minor: PR body staging and order vs `pipeline-advance.sh pr` | G7 writes `$D/pr-body.md` (regenerated on every run, not part of the write-once snapshot); then G8 creates or edits the PR with `--body-file`, then `pipeline-advance.sh pr <url>`. |
| Ops minor: V7 `update-ref refs/heads/main origin/main` after the fetch | Added, after `git checkout --detach origin/main` so the moved ref is never the checked-out branch; clone uses `--branch main`. |
| Ops minor: snapshot cleanup point | 5.5. |

Revision 4 supersedes three cells of this table: the by-name exclusion of #1 (replaced by the `git cherry`
condition, 6.1), `neg` as the stale branch in V7 (now `stale`; `neg` is a second own-work branch), and the
`\|` in the `Repo:` regex (now `[|]`).

## 0c. Round 1 changes (confirmed fixed in round 2, unchanged)

| Finding | Change |
|---------|--------|
| Ops 1: `tier:pipeline` missing on GitHub, G4/V2/F5 say 0 label creates | New step G1b creates exactly that label (idempotent). G4 expects 0 label creates after G1b; V2 expects 1 (measured live in the same call). F5 corrected; label added to F14 rollback. |
| Ops 2: recovery contradicts stop rules, G0 can overwrite the snapshot | G0 writes a persistent snapshot once, guarded by a `complete` marker, never overwritten (5.3). Every step has an "already done -> skip" check. G4 expects `N - P` creates and `2 + P` exists, where the P present titles first pass the G6 checks. F2 is now "rerun from G0". |
| Ops minor: #22 listed as untouched issue | 5.1 fixed: untouched issues are #23 and #26; #22 and #25 are PRs. |
| Ops minor: F7 only mirrors text | F7 now covers title, body, milestone, labels, added and removed backlog files, rerun of G6 and the PR-body mapping. |
| Sec 1: `git merge-base main HEAD` passes a pre-v2 branch before the squash | Main-checkout rule is `git merge-base --is-ancestor main HEAD` (6.1). V7 proves it rejects `feat/1-web-bootstrap` both before and after the squash. |
| Sec 2: `pre-squash` tag timing | Tag `origin/main` after `git fetch`, before the first command that moves local `main`; checks: same SHA as `origin/main`, empty `git diff pre-squash main` after the squash, `git log --oneline pre-squash..<branch>` lists only the branch's commits, tag never pushed (6.2). V7 has negative runs for a tag on the new root and a tag one commit too old. |
| Sec 3a: in-place #1/#15/#21 not approved | Approved by Stepan in chat. 5.1 records it; the deviation text is removed. |
| Sec 3b: snapshot omits comments; deletes not tied to verified rows | G0 snapshots comments; first run stops if any of the N has a comment. G7 emits a delete only for a row G6 verified, and re-reads its comments right before (F18). |
| Arch 1: only one hint word kept | All three learner-typed words are allow-listed in `docs/learning-process.md` with pinned renderings (2.2, 2.4). |
| Arch 2: `git merge main` fails after the squash | Section 7 re-specified command by command (6.1-6.3); V5 asserts that the set of git commands in section 7 equals the list in 6.4. |
| Arch 3: rebase recipe never rehearsed | New V7: full rehearsal on a scratch clone with the real `feat/1-web-bootstrap`, exact commands, negative runs. CLAUDE.md gets the pre-rebase check. |
| Arch 4: `learner/` excluded without reason | Optional item C6 (both files), enabled only on Stepan's yes (2.1, 3). |
| Arch minor: 29 vs 30 files; V1 set unnamed | Scope is 30 files (32 with C6); V1 scans those plus `plans/26-*.md` (4). |
| Arch minor: ADR-0002 status quotes backlog/05 across C2/C3 | Both strings pinned in 2.4. |
| Arch minor: V2 label count | V2 counts label creates live (4). |
| Orchestrator: `plans/26-*` without Cyrillic outside course quotes | V1 scans `plans/26-*.md` with the same allow-list; this design contains only the three allow-listed hint words. |

## 1. Solution design

- **Translate in place, disjoint file sets, five parallel coders plus optional C6** (section 3). File names,
  front matter keys, heading order and numbers, code spans, link targets and issue numbers stay
  byte-identical. Only prose changes.
- **One rule set and a pinned-string table** (section 2), so parallel coders never need each other's output.
- **Mechanical verification** (section 4): Cyrillic scan with a per-file allow-list, backlog parse and live
  dry run, invariance checks, CLAUDE.md git-command inventory, CI, a scratch-clone rehearsal of the
  post-squash recipe including the tag cleanup, the stale-branch proof and the "main moved on" state (V7), a
  quote-safety and syntax scan of every prescribed `-c` literal (V8), a read-only run of the stale-branch
  proofs on the real branches (V9), and a scratch-directory run of the snapshot step with two broken variants
  (V10).
- **Resumable GitHub runbook**, run by the orchestrator after `commit` and before `pr` (section 5): persistent
  write-once snapshot that checks every file before it sets its marker, milestone renames in place, one label
  create with values read from `labels.yml`, in-place edits of #1, #15, #21 and PR #24 with titles passed as
  argv, bootstrap creates the other N, mapping built from GitHub, delete commands for Stepan, branch pushed and
  checked, PR opened from the staged body, `pr` advanced with the worktree invocation. Every `gh` call in a
  literal names `valmlord/academy`.
- **CLAUDE.md section 7 rewritten SHA-free** and correct in four states: before this PR merges, between merge
  and squash, after the squash, and after a 6.2 rebase once main has moved on (section 6). A branch carrying a
  copy of a commit main already has is never merged with main; `feat/1-web-bootstrap` is rebased only after the
  squash, stale branches are force-deleted only after a local proof, and the `pre-squash` tag outlives every
  branch that needs it.

## 2. Translation rules

1. **Scope, 30 files**: `README.md`, `CLAUDE.md` (section 7 only, per section 6), `docs/architecture.md`,
   `docs/learning-process.md`, `docs/course-reference.md`, `docs/adr/0001`-`0004` (4), `backlog/*.md` (20),
   `.github/ISSUE_TEMPLATE/feature.yml`. **Optional, C6, only if Stepan says yes:** `learner/profile.md`,
   `learner/journal.md` (32 files). Out of scope: `course/`, `plans/` other than `plans/26-*` (historical
   record), `.claude/feedback/*`, quotes in `.claude/agents/*`, ADR-0005 (already English).
   `learner/` is in C6 rather than in the base scope because `profile.md` is Stepan's own text ("updated by
   Stepan") and he has not decided yet; it is not course text, so it is not excluded on principle.
2. **Allow-list (the only Cyrillic that may remain)**, always inside straight double quotes, always after the
   English equivalent: `<English> ("<Russian>")`. Never in any title (backlog `title:`, issue, PR, heading
   text before the parenthesis).
   - **A1** the program name, equal to `course/ai-for-developers/course.yaml` `title`. Files:
     `docs/course-reference.md`, `learner/profile.md` (C6).
   - **A2** the five Cyrillic module titles, character-equal to `course/ai-for-developers/*/module.yaml`
     `title` (module 01 is English already). Files: module headings of `docs/course-reference.md`; once in the
     body (never the title) of `backlog/20`, `22`, `23`, `24`, `25` as the learner-facing name.
   - **A3** the three words the learner types and the lessons quote: "подсказка", "скелет", "скажи прямо"
     (research decision 3, all three; six lessons quote "скелет" and "скажи прямо", mentor.md:35 quotes
     "подсказка"). Files: `docs/learning-process.md`; "скажи прямо" also in `learner/profile.md` (C6).
     Deviation from the orchestrator's "C6: course-title quotes only": profile.md:19 names the command the
     learner types, and translating it would point the mentor at a command that does not exist.
   - **A4** the quoted course-text strings in PR #24's body, pinned as in 2.4 (row "PR #24 body quotes").
     Files: `plans/26-english-docs-github.md`.
   - `plans/26-*.md` may hold any of A1-A4 and nothing else.
3. **Glossary**: the research glossary is binding (learner, never "student"; workspace; check; attempt; hint
   ladder; ...). Style: no em/en dashes, straight double quotes, `->` for arrows.
4. **Pinned strings** (exact; every coder that writes one of them copies it from here):

   | Key | String | Used by |
   |-----|--------|---------|
   | Milestones | `M0 Foundation`, `M1 Workspace`, `M2 Learning loop`, `M3 Course`, `M4 Comfort` | C3, C4, runbook G1 |
   | Program | `AI for developers` | C1, C4, C6 |
   | Modules 00-05 | `Introduction to AI-assisted development`, `Spec Driven Development`, `Agentic development patterns`, `Subagent orchestration and multi-agent pipelines`, `Final project: call scheduling calendar`, `Working with legacy code` | C1, C4, C5 |
   | backlog/20-25 titles | `content: module \"<module name>\"` (JSON-escaped inner quotes) | C4 |
   | backlog/05 title | `learn(workspace): workspace service, one container per lesson` | C3 |
   | backlog/05 last criterion | `ADR-0002 moved to Accepted with refinements` | C3 |
   | ADR-0002 status line | `- Status: Proposed (to be refined in the LEARN task "workspace service")` | C2 |
   | Hint ladder | question -> direction -> skeleton -> direct explanation | C1, C6 |
   | Learner commands | `hint ("подсказка")`, `skeleton ("скелет")`, `direct explanation ("скажи прямо")` | C1, C6 |
   | PR #24 title | `content(intro): add module "Introduction to AI-assisted development"` | C5 |
   | PR #24 body quotes (A4) | The double-quoted course-text spans on lines 5, 28, 29 and 36 of the original PR #24 body (research: a hint level name, a hint command name, an outcome phrase, a lesson phrase). C5 writes a table "A4 pinned strings" at the top of `plans/26-english-docs-github.md` with columns `PR body line`, `string`, `course source file:line` and **exactly four rows, one per locator line**. For each locator, C5 takes the quoted string `s` and runs `rg -nF -e "$s" course/`: an exact source gives a sourced row (string and its first `file:line`); no exact source means the quote is not course text, so the row is the marker `<line> | - | none`, C5 translates that quote in the English body and reports it. The English body keeps each sourced string as `<English> ("<string>")`. The original body is the live `gh pr view 24 --json body --jq .body` before G0 and `$D/pr-24.json` (`.body`) after it. | C5 (writes the table), V1 (reads it) |
   | Journal entry heading | `### YYYY-MM-DD: Short description (#issue)` (equal to `_learn-mode.md:21`) | C6 |

5. **Structure kept**: same headings, same order and level. `docs/learning-process.md` keeps `## 1.` to
   `## 6.` (cited by number from `plans/15-*` and PR #24). ADR section order kept.
6. **ADRs: translation only.** Status words, dates, numbers and decisions unchanged; the literal tokens
   `ADR-0002`, `Proposed`, `Accepted` survive.
7. **Backlog files**: the conventional prefix before the first `:` of `title` stays byte-identical. Inner
   quotes stay `\"` (`parse_value` uses `json.loads`). Labels unchanged; `milestone` becomes the pinned name
   of the same milestone number. Titles unique (the bootstrap matches by title).
8. **Untouchable tokens**: code spans, fenced blocks, paths, commands, URLs, link targets, `#N`, `ADR-000N`,
   label names, YAML keys. `feature.yml` changes only the placeholder string.

## 3. Work split (parallel, no shared files)

| Coder | Files | Pinned strings it writes |
|-------|-------|--------------------------|
| C1 | `README.md`, `docs/learning-process.md` | program, modules, hint ladder, learner commands |
| C2 | `docs/architecture.md`, `docs/adr/0001`-`0004` | ADR-0002 status line |
| C3 | `backlog/01`-`14`, `.github/ISSUE_TEMPLATE/feature.yml` | milestones, backlog/05 title and criterion |
| C4 | `docs/course-reference.md`, `backlog/20`-`25` | program, modules, milestones, backlog/20-25 titles |
| C5 | `CLAUDE.md` section 7 (section 6), `plans/26-english-docs-github.md` (format in 5.4) | PR #24 title; #21 body; PR #24 body; A4 pinned-strings table |
| C6 (optional) | `learner/profile.md`, `learner/journal.md` | program, hint ladder, learner commands, journal heading |

C1-C5 (and C6 when enabled) are spawned in one message, each with this design, the research file and its
own file list; they do not commit. Disjoint sets plus the pinned table mean no coder needs another's output.
C6 is spawned only after Stepan's explicit yes; without it V1 drops the two learner files from its scope.

## 4. Verification (tester)

Shell rules for every check: one fresh zsh per Bash call, so each check is a single
`bash -uo pipefail -c '...'` call with its paths set inside it and guarded with `: "${S:?}"`; scratch
directories come from `mktemp -d` under the tester's scratchpad, and no check contains `rm`; no `'` inside any
`-c` literal (V8 enforces this for the literals below); negative runs mutate copies in the scratchpad only,
never worktree files (the diff under test is uncommitted). Where a check expects a command to report "no"
(exit 1), it asserts exactly 1: exit 128 is a git error, not a "no".

- **V1 Cyrillic with allow-list.** Set: the 30 scope files (32 with C6) plus every `plans/26-*.md`. For each
  file, remove the allow-listed strings of 2.2 that apply to that file (exact text including the surrounding
  `"`), with A1/A2 read live from the yaml files and A4 read from the sourced rows of the "A4 pinned strings"
  table; then `rg -n '\p{Cyrillic}'` must report zero hits. A4 table checks: exactly four rows; their
  `PR body line` values are exactly {5, 28, 29, 36}; each row is sourced or the marker `- | none`; each sourced
  string occurs on its stated line of the original PR #24 body (from `$D/pr-24.json` `.body` when
  `/Users/stepankorshukov/.local/state/academy/26-github/complete` exists, else the live
  `gh pr view 24 --json body --jq .body`, because after G3 the live body is the English one); each sourced
  string occurs (`rg -nF -e "$s"`) at its stated `course/` `file:line`. Separately, no backlog `title:` line
  and no markdown heading's text before `(` contains Cyrillic. Negative runs on scratch copies, each must go
  red: a Cyrillic word added to `README.md`; an A2 title without its quotes in `docs/course-reference.md`; an A2
  title in a backlog `title:` line; an A3 word, quoted, placed in `README.md` (allowed text in a file not
  listed for it); one character of a sourced A4 string changed (the body check fails); a fifth table row added
  (the count check fails).
- **V2 Backlog parse, pinned strings, live dry run.** `parse_issue` succeeds on all 20 files; titles distinct;
  each milestone is a pinned name mapping to the same number as the file's milestone on `main` (5.2); labels
  and title prefix equal `main`'s; backlog/05 title and criterion and the ADR-0002 status line equal 2.4.
  Live dry run, in one call: `gh label list --limit 200 --json name` gives the set L; then
  `python3 scripts/github_bootstrap.py --dry-run` must print exactly one line matching
  `^Repo: valmlord/academy [|] you: [^ ]+$`, one `label +` line per `labels.yml` name absent from L (today
  exactly `tier:pipeline`), 5 `milestone +` lines with the pinned names, 20 `issue +` lines and no
  `issue = (exists)`. Negative run: a scratch copy with a misspelled milestone fails the mapping check.
- **V3 Invariants per file versus `main`.** Equal multisets of backtick code spans, link targets, `#N`,
  `ADR-000N`, heading level sequence and `## N.` numbers. Exception: CLAUDE.md section 7 is checked by V5,
  and every CLAUDE.md diff hunk lies between `## 7.` and `## Completion block`. File set: the union of
  `git diff --name-only main` and the paths of `git status --porcelain --untracked-files=all` contains only
  scope files, `plans/26-*` and paths matching `.claude/feedback/*_mistakes.md` (judges and compound append
  lessons there on this branch); any other path under `.claude/` is red. The invariant checks do not apply
  to the feedback files. Negative runs: one changed code span in a scratch copy; the captured file list
  with an extra line `.claude/settings.json` appended goes red.
- **V4 Style.** No U+2014, U+2013, U+201C/D, U+2018/9 in the changed files (feedback files excluded, they
  are out of scope).
- **V5 CLAUDE.md section 7.** No match of `\b[0-9a-f]{7,40}\b` that contains a digit; no "One-time migration"
  heading. Inventory: collect every `git ...` command inside a backtick span of section 7. A command runs
  from a `git` token to the next `|`, `;`, `&&`, `||`, redirection (`>...`), or the `)` that closes the `$(`
  the command sits in, none of which is part of it; a `)` that closes no `$(` (as in
  `--format='%(refname:short)'`) is part of the command; a `$(...)` substitution counts as its own command;
  a span like `git -C <worktree> ...` is taken as written. The collected set must equal the list in 6.4
  exactly. Negative runs on scratch copies, each must go red: the span
  `git merge-base --is-ancestor <v2 commit> HEAD` added back; the old `5ad27f4` rebase line added back; the
  span `git branch --contains pre-squash` added back; the span `git branch -d <branch>` added back; the span
  `git cherry main HEAD` removed.
- **V6 CI.** `pnpm content:validate` and `tests/pipeline/run.sh` green (`run.sh:275` needs the unchanged
  ADR-0002 path).
- **V7 Post-squash rehearsal on a scratch clone** (read-only on the real repo). One call, with `S` replaced by
  the tester's scratchpad absolute path:

  ```
  bash -uo pipefail -c '
  S="<tester scratchpad absolute path>"; : "${S:?}"
  R=/Users/stepankorshukov/Documents/Projects/academy; B=feat/1-web-bootstrap
  fail(){ echo "V7 FAIL: $*"; exit 1; }
  expect_rc(){ want=$1; msg=$2; shift 2; "$@" >/dev/null; got=$?; [ "$got" = "$want" ] || fail "$msg (exit $got, expected $want)"; }
  V=$(mktemp -d "$S/v7.XXXXXX") || fail mktemp
  g(){ git -C "$V/repo" "$@"; }
  held(){ g for-each-ref --format="%(refname:short)" refs/heads | while read -r b; do g merge-base pre-squash "$b" >/dev/null && echo "$b"; done; }
  minus(){ printf "%s\n" "$1" | grep -c "^-"; }
  git clone -q --no-local --branch main "$R" "$V/repo" || fail clone
  g config user.name V7 && g config user.email v7@example.invalid || fail config
  g fetch -q origin && g checkout -q --detach origin/main && g update-ref refs/heads/main origin/main || fail "sync main"
  g branch "$B" "origin/$B" && g branch neg "origin/$B" && g branch stale "origin/main~1" || fail "branches"
  g tag pre-squash origin/main || fail tag
  [ "$(g rev-parse pre-squash)" = "$(g rev-parse origin/main)" ] || fail "tag is not origin/main"
  echo "window A (merged, not squashed)"
  expect_rc 1 "A: pre-v2 branch vs the main-checkout rule" g merge-base --is-ancestor main "$B"
  g merge-base main "$B" >/dev/null || fail "A: expected shared history"
  C=$(g cherry main "$B") || fail "A: cherry"
  printf "%s\n" "$C"
  [ "$(minus "$C")" = 1 ] || fail "A: bring-up step 4 does not see the copied v2 commit"
  g log --oneline pre-squash.."$B"
  [ "$(g rev-list --count pre-squash.."$B")" = 2 ] || fail "A: pre-check does not list exactly 2 commits"
  OLD=$(g rev-parse origin/main~1) || fail "no parent of main"
  NEW=$(g commit-tree "pre-squash^{tree}" -m squash) && g update-ref refs/heads/main "$NEW" && g checkout -q main || fail squash
  echo "window B (squashed)"
  g diff --quiet pre-squash main || fail "B: squash tree differs from the tag"
  expect_rc 1 "B: negative, a too-old tag is not detected" g diff --quiet "$OLD" main
  g tag wrong-tag main || fail wrong-tag
  [ "$(g rev-list --count wrong-tag..neg)" -gt 2 ] || fail "B: negative, a tag on the new root is not detected"
  expect_rc 1 "B: expected unrelated histories" g merge-base main "$B"
  expect_rc 1 "B: pre-squash branch vs the main-checkout rule" g merge-base --is-ancestor main "$B"
  [ -z "$(g branch --contains pre-squash)" ] || fail "B: regression premise, the round-2 rule is not already true here"
  [ "$(held)" = "$(printf "%s\n%s\n%s" "$B" neg stale)" ] || fail "B: cleanup condition is not false before the rebase"
  g merge-base --is-ancestor stale pre-squash || fail "B: stale proof (a) rejects a branch whose work is in main"
  expect_rc 1 "B: stale proof (a) accepts a branch with unmerged work" g merge-base --is-ancestor neg pre-squash
  g rebase -q --onto main pre-squash "$B" || { g rebase --abort; fail "B: rebase stopped"; }
  echo "after the recipe"
  [ "$(g rev-list --count main.."$B")" = 1 ] || fail "after: expected exactly 1 own commit"
  F=$(g diff --name-only main "$B"); echo "$F"
  [ -n "$F" ] || fail "after: empty diff"
  echo "$F" | grep -qv "^plans/1-" && fail "after: files outside plans/1-*"
  g merge-base --is-ancestor main "$B" || fail "after: rule still rejects the branch"
  [ "$(held)" = "$(printf "%s\n%s" neg stale)" ] || fail "after: cleanup condition is not false while neg and stale exist"
  g branch -D stale >/dev/null || fail "delete stale"
  [ "$(held)" = neg ] || fail "after: cleanup condition is not false while the own-work branch neg exists"
  [ "$(g rev-list --count pre-squash..neg)" = 2 ] || fail "after: neg pre-check"
  g rebase -q --onto main pre-squash neg || { g rebase --abort; fail "after: rebase of neg stopped"; }
  [ -z "$(held)" ] || fail "after: cleanup condition is not true once every branch is rebased or deleted"
  echo "window D (rebased, then main moved on)"
  g checkout -q main || fail "checkout main"
  printf "%s\n" "main moved on" > "$V/repo/moved-on.txt" && g add moved-on.txt && g commit -q -m "main moves on" || fail "commit on main"
  g checkout -q "$B" || fail "checkout the rebased branch"
  expect_rc 1 "D: step 1 must fail before the merge" g merge-base --is-ancestor main "$B"
  g merge-base main "$B" >/dev/null || fail "D: shared history expected, else step 3 would send the branch to 6.2"
  C=$(g cherry main "$B") || fail "D: cherry"
  [ "$(minus "$C")" = 0 ] || fail "D: step 4 still refuses the rebased branch"
  g merge -q --no-edit main || { g merge --abort; fail "D: git merge main stopped"; }
  g merge-base --is-ancestor main "$B" || fail "D: step 1 does not exit 0 after the merge"
  echo V7 OK
  '
  ```

  Expected: window A prints `git cherry` with `-` for the v2 cherry-pick (5ad27f4, patch-id twin of a58679d)
  and `+` for the plans commit, and the run ends with `V7 OK`. Built-in negative runs: a tag one commit too
  old (`diff --quiet "$OLD" main` must exit 1); a tag on the new root (`wrong-tag..neg` lists the whole old
  history); the round-2 cleanup rule (`git branch --contains pre-squash` prints nothing right after the
  squash; HEAD is the branch `main` there, so a detached HEAD cannot be listed, which was the round 3 red); the
  cleanup condition false before the rebase, still false with a stale branch and with an own-work branch
  left, true only at the end; stale proof (a) true for `stale` (an ancestor of the tag, plays the merged
  branches of 6.2) and exactly 1 for `neg` (a copy of #1, unmerged work); bring-up step 4 sees exactly one `-`
  before the squash and none after the rebase; window D is the state "rebased, then main moved on" and goes
  through step 2. `--branch main` plus the detached checkout make `refs/heads/main` a ref no worktree has
  checked out when `update-ref` moves it the first time; the squash moves it while HEAD is still detached and
  only then checks it out (same tree, so no file changes). `origin/main` in the clone is the main checkout's
  local `main` as of the tester run (e7c4b97 plus anything merged since). This PR does not touch what the #1
  branch carries, so the result transfers to the real squash. The `mktemp` directory is left in the tester's
  scratchpad (no `rm`). If any line fails, the tester reports the full output and the orchestrator routes it
  back to the architect; nobody edits the CLAUDE.md recipe to fit. If a hook or the harness blocks a command
  inside the scratch clone (the `printf ... >` in window D is the only redirect into the clone), the tester
  reports which one instead of working around it.
- **V8 Quote safety and syntax of every prescribed `-c` literal.** Input: this design file (in negative runs,
  a scratch copy). A prescribed literal is a fenced block whose first non-blank line, after leading spaces, is
  exactly `bash -uo pipefail -c '`; its last non-blank line must be exactly `'` (leading spaces allowed); the
  literal is everything between them. Checks: the number of such blocks is exactly 7 (V7, V9, G0, G1b, G2,
  G3, G8a); no literal contains `'`; each literal, with the common leading indentation removed and written to
  a scratch file, passes `bash -n`; each `python3 ... <<"PY"` heredoc inside a literal (lines after the
  `<<"PY"` line up to the line `PY`) passes `python3 -I -m py_compile` on a scratch file. G0 checks, on the
  literal that contains `touch "$D/complete"` (exactly one literal must): every line that contains `> "$D/`
  ends with `|| exit 1`, and `touch "$D/complete"` occurs exactly once, on the first non-blank line after the
  heredoc's closing `PY`. The scanner is a tester-written Python script in the scratchpad, run with
  `python3 -I <script> <design copy>`, so it needs no quoting of its own. Negative runs on scratch copies,
  each must go red: `Stepan's` inserted into the G1b block; the closing line of the G8a block changed to `x'`;
  a stray `)` added to a Python line of G2; the opening line of the G0 block changed to `bash -c '` (the count
  becomes 6); `|| exit 1` removed from the `pr-$n.json` line of the G0 block.
- **V9 Stale-branch proofs on the real branches** (read-only; `gh` reads only). The tag does not exist yet,
  so proof (a) is checked against `main`, which the tag will contain (`pre-squash` is `origin/main` after the
  last merge).

  ```
  bash -uo pipefail -c '
  R=/Users/stepankorshukov/Documents/Projects/academy
  fail(){ echo "V9 FAIL: $*"; exit 1; }
  tip(){ git -C "$R" rev-parse --verify -q "refs/heads/$1"; }
  heads(){ gh pr list --repo valmlord/academy --head "$1" --state merged --json headRefOid --jq ".[].headRefOid"; }
  for b in fix/21-pipeline-v2 chore/998-live-wt; do
    T=$(tip "$b") || { echo "SKIP $b: no such local branch"; continue; }
    git -C "$R" merge-base --is-ancestor "$T" main || fail "$b: proof (a) rejects a branch whose work is in main"
    H=$(heads "$b") || fail "$b: gh pr list"
    echo "$b: proof (a) holds; local tip $T; merged PR heads: ${H:-none}"
  done
  T=$(tip feat/1-web-bootstrap) || fail "no feat/1-web-bootstrap, the negative case cannot run"
  git -C "$R" merge-base --is-ancestor "$T" main; rc=$?
  [ "$rc" = 1 ] || fail "feat/1-web-bootstrap: proof (a) exit $rc, expected 1"
  H=$(heads feat/1-web-bootstrap) || fail "feat/1-web-bootstrap: gh pr list"
  printf "%s\n" "$H" | grep -qx -e "$T" && fail "feat/1-web-bootstrap: proof (b) accepts a tip no merged PR has"
  echo V9 OK
  '
  ```

  Expected: proof (a) holds for both stale branches (a missing branch prints `SKIP`, because deleting it is
  legitimate), `feat/1-web-bootstrap` fails both proofs, `V9 OK`. Proof (b) is reported for `fix/21-pipeline-v2`
  but not asserted, because whether #22's `headRefOid` is cb50fbc is not verified and (a) already covers that
  branch; (b) is the proof for `docs/26-english-docs` after this PR is squash-merged.
- **V10 G0 against a scratch directory** (GitHub reads only; writes only under the tester's scratchpad). The
  tester extracts the G0 literal exactly as V8 does (indentation removed) and builds three variants, each
  written to its own scratch file and run with `bash -uo pipefail <file>`. In every variant the `D=` value is
  replaced by a fresh `mktemp -d` directory under the scratchpad (so the real `$D` is never written) and the
  dirty-tree line is deleted (the diff under test is uncommitted, so that line would stop every run; G0's real
  run happens after `commit`, where the line holds). Variants and expectations:
  (1) nothing else changed, run twice on the same directory: the first run prints `G0 checks OK` and `G0 OK`
  and leaves `complete`; the second prints the `G0 skip` line and `find <dir> -newer <dir>/complete` prints
  nothing (no file rewritten);
  (2) `for n in 22 24 25` changed to `for n in 22 999999 25`: exit 1 (the failing write), and no `complete`;
  (3) `--json number,title,body` changed to `--json title,body`: exit 1 with `G0 STOP: pr-22.json is not
  PR #22`, and no `complete`.
  Variants (2) and (3) stop before any check that depends on the translation, so the orchestrator also runs
  them before the judge round. Variant (1) needs the translated backlog in the worktree (with the Russian
  titles at HEAD the check "a HEAD title already exists as an issue" stops, correctly), so it runs in the
  tester phase, before the runbook, while the milestones are still Russian and no English issue exists.

Judges (`judge_code`) also read the translations for meaning drift, ADRs first.

## 5. GitHub side

### 5.1 Which issues and PRs change

- **Edited in place (approved by Stepan in chat):** #1 and #15 (target text from `backlog/01`, `backlog/20`)
  and #21 (body from the plan file). The edit history keeps the Russian text; accepted, because #1 has a
  parked state keyed by number, a branch and `plans/1-*`, and #15/#21 are linked from merged PRs.
- **Recreated:** #2-#14 and #16-#20. Their count is N = number of `backlog/*.md` files at HEAD minus 2 (the
  files of #1 and #15); N = 18 today. No linked work on any of them.
- **Untouched issues:** #23, #26 (English). **PRs:** #24 edited; #22 and #25 edited only if a Cyrillic
  character is found in title or body (research: none; G3 stops if one is found).

### 5.2 Milestones: rename in place

1 -> `M0 Foundation`, 2 -> `M1 Workspace`, 3 -> `M2 Learning loop`, 4 -> `M4 Comfort`, 5 -> `M3 Course`,
because renaming keeps every assignment and leaves nothing to delete; GitHub keeps no milestone edit history.

### 5.3 Runbook (orchestrator; after `commit`, before `pr`)

Every step is its own `bash -uo pipefail -c '...'` call that starts with the preamble
`umask 077; D=/Users/stepankorshukov/.local/state/academy/26-github; : "${D:?}"` and
`cd /Users/stepankorshukov/Documents/Projects/academy/.claude/worktrees/docs-26-english || exit 1`, because
each Bash call is a fresh shell, the directory holds private issue bodies, and relative paths
(`scripts/`, `backlog/`, `plans/`) must resolve in the worktree whatever the tool's cwd is. The directory is
fixed and outside the repo so it survives a session restart and the scratchpad's per-session path. No step
contains `rm`. Resume rule: the whole runbook is always restarted from G0, and every step first checks whether
it is already done.

**Quote rule.** No `'` anywhere inside a step's `-c` literal, because the first `'` ends the literal and the
rest runs in the calling zsh outside the preamble's guards. Values that contain quotes (the `tier:pipeline`
description, PR #24's title, bodies) are never retyped into a step: Python inside the step reads them from
their source file and passes them to `gh` as argv or through `--body-file`. URLs and jq filters use double
quotes. G0, G1b, G2, G3 and G8a are prescribed literals below (V8 scans them); G1 and G4-G7 are composed by
the orchestrator from the prose under the same rule, and their values contain no `'` (the pinned milestone
names, the regexes, the fixed paths). Non-ASCII ranges in the literals are built with `chr()`, so the literals
stay ASCII and this design stays free of Cyrillic. Every `gh` call inside a literal names the repo
(`--repo valmlord/academy`, or the repo in the `gh api` path), because the literals compare what they read
with what they write, and both must address the same repo whatever `gh` would infer from the cwd.

**How a literal is run.** The orchestrator runs a prescribed literal exactly as V8 extracts it: the fenced
block from `bash -uo pipefail -c '` to the closing `'`, with the common leading indentation (two spaces in
this file, from the list nesting) removed. Because the heredocs use `<<"PY"`, not `<<-`, the terminator `PY`
must start in column 0, and the Python lines must start in column 0 to compile; pasted with the markdown
indentation, the heredoc never ends and the step fails.

**Start of every run, before the preconditions (CODEOWNERS recovery, F21).** If `git status --porcelain`
prints exactly ` M .github/CODEOWNERS` and
`git show HEAD:.github/CODEOWNERS | sed "s/@OWNER/@$(gh api user --jq .login)/g" | cmp - .github/CODEOWNERS`
succeeds, the file is exactly the bootstrap's rewrite from a G5 interrupted before its restore:
`git restore .github/CODEOWNERS`, then continue. Any other dirt stops the runbook.

Preconditions for every step: worktree tree clean (`git status --porcelain` empty), HEAD is the reviewed
commit, `gh auth status` succeeds; every step after G0 also requires `$D/complete`. Commit pinning: G0 records
`git rev-parse HEAD` in the snapshot; if HEAD later changes (F7), G2-G8 use the new HEAD and F7 applies. N is
recomputed from HEAD in every step. Equality of a GitHub body with a target body always compares after
normalizing CRLF to LF and stripping leading and trailing whitespace (G2, G3, G6), because GitHub may store a
body with a different line ending or without the trailing newline (unverified, so the tolerance is
deliberate and one-sided: it never makes two different texts equal apart from that whitespace).

- **G0 Snapshot (write once).** Reads GitHub and git, writes only under `$D`. If `$D/complete` exists: skip,
  never overwrite; it exists only if every check below passed when it was written. Otherwise every write ends
  with `|| exit 1`, because the preamble has no `-e` and a failed `gh ... > file` still leaves the (empty)
  file behind (round 4, run live). Files: `$D/issues.json` (all issues with comments), `$D/milestones.json`,
  `$D/labels.json`, `$D/pr-22.json`, `$D/pr-24.json`, `$D/pr-25.json`, `main`'s backlog extracted under
  `$D/main`, the file list `$D/main-backlog.list` from `git ls-tree --name-only main backlog/` (the mapping
  reads this list, never the directory, so a leftover file from an older partial run cannot enter it), and
  `$D/head`. Then a Python check, before the marker, verifies every artifact the marker vouches for:
  - each `pr-<n>.json` parses as an object with `.number == n` and a string title and body;
  - `labels.json` is a non-empty JSON list;
  - `milestones.json` is a JSON list holding numbers 1-5;
  - `issues.json` is a JSON list holding #1-#20, each with a string title and a `comments` list;
  - `head` is 40 lowercase hex plus a newline and equals `git rev-parse HEAD`;
  - `main-backlog.list` equals `git ls-tree --name-only main backlog/` line for line (so the line counts are
    equal) and is not empty, and every listed file exists under `$D/main`;
  and the stop conditions: a milestone 1-5 whose title does not start with the expected `M<k> ` prefix of 5.2
  or contains no Cyrillic; a listed backlog file that maps to no issue, or a list that does not map one to one
  onto #1-#20 (01-14 -> 1-14, 20-25 -> 15-20); an issue #1-#20 whose title differs from `parse_issue` of its
  mapped `main` backlog file; any of the N recreated issues with a non-empty `comments` (research: none;
  carrying comments over is not designed, so Stepan decides); a backlog title at HEAD that already exists as
  an issue. `touch "$D/complete"` is the last command and runs only after all of that passed.
  **Rerun:** if `complete` is absent, rewriting all files is safe, because no GitHub write has happened yet
  (every later step requires `complete`), every file is rewritten with `>` (and `tar` overwrites the names it
  extracts), and the checks read only this run's files and this run's list. If a check fails for a reason
  that a rerun cannot change (a PR deleted, a comment on an old issue), G0 keeps failing and the runbook stops
  for Stepan (F29).

  ```
  bash -uo pipefail -c '
  umask 077; D=/Users/stepankorshukov/.local/state/academy/26-github; : "${D:?}"
  cd /Users/stepankorshukov/Documents/Projects/academy/.claude/worktrees/docs-26-english || exit 1
  [ -z "$(git status --porcelain)" ] || { echo "G0 STOP: dirty tree"; exit 1; }
  gh auth status >/dev/null 2>&1 || { echo "G0 STOP: gh is not logged in"; exit 1; }
  if [ -f "$D/complete" ]; then echo "G0 skip: the snapshot is complete and never overwritten"; exit 0; fi
  mkdir -p "$D/main" || exit 1
  gh issue list --repo valmlord/academy --state all --limit 500 --json number,title,state,milestone,labels,body,comments > "$D/issues.json" || exit 1
  gh api "repos/valmlord/academy/milestones?state=all&per_page=100" > "$D/milestones.json" || exit 1
  gh label list --repo valmlord/academy --limit 200 --json name,color,description > "$D/labels.json" || exit 1
  for n in 22 24 25; do
    gh pr view "$n" --repo valmlord/academy --json number,title,body > "$D/pr-$n.json" || exit 1
  done
  git archive main backlog | tar -x -f - -C "$D/main" || exit 1
  git ls-tree --name-only main backlog/ > "$D/main-backlog.list" || exit 1
  git rev-parse HEAD > "$D/head" || exit 1
  python3 -I - "$D" <<"PY" || exit 1
  import glob, importlib.util, json, os, re, subprocess, sys
  D = sys.argv[1]
  CYRILLIC = "[" + chr(0x400) + "-" + chr(0x4FF) + "]"
  PREFIX = {1: "M0 ", 2: "M1 ", 3: "M2 ", 4: "M4 ", 5: "M3 "}

  def fail(message):
      sys.exit("G0 STOP: " + message)

  def git(*args):
      r = subprocess.run(["git", *args], capture_output=True, text=True, stdin=subprocess.DEVNULL)
      if r.returncode != 0:
          fail("git %s failed: %s" % (" ".join(args), r.stderr.strip()))
      return r.stdout

  def read(name):
      try:
          with open(D + "/" + name, encoding="utf-8") as f:
              return f.read()
      except OSError as error:
          fail("cannot read %s: %s" % (name, error))

  def load(name):
      try:
          return json.loads(read(name))
      except ValueError as error:
          fail("%s is not JSON: %s" % (name, error))

  for n in (22, 24, 25):
      pr = load("pr-%d.json" % n)
      if not isinstance(pr, dict) or pr.get("number") != n:
          fail("pr-%d.json is not PR #%d" % (n, n))
      if not isinstance(pr.get("title"), str) or not isinstance(pr.get("body"), str):
          fail("pr-%d.json has no title or no body" % n)

  labels = load("labels.json")
  if not isinstance(labels, list) or not labels:
      fail("labels.json is not a non-empty JSON list")

  milestones = load("milestones.json")
  if not isinstance(milestones, list):
      fail("milestones.json is not a JSON list")
  ms_titles = {m.get("number"): m.get("title") for m in milestones if isinstance(m, dict)}
  for k in sorted(PREFIX):
      title = ms_titles.get(k)
      if not isinstance(title, str):
          fail("milestones.json has no milestone %d" % k)
      if not title.startswith(PREFIX[k]) or not re.search(CYRILLIC, title):
          fail("milestone %d is not the expected Russian %s title: %s" % (k, PREFIX[k].strip(), title))

  issues = load("issues.json")
  if not isinstance(issues, list) or not all(isinstance(i, dict) for i in issues):
      fail("issues.json is not a JSON list of issues")
  by_number = {i.get("number"): i for i in issues}
  for k in range(1, 21):
      issue = by_number.get(k)
      if issue is None or not isinstance(issue.get("title"), str) or not isinstance(issue.get("comments"), list):
          fail("issues.json lacks #%d with a title and a comments list" % k)

  head = read("head")
  if not re.fullmatch("[0-9a-f]{40}\n", head) or head.strip() != git("rev-parse", "HEAD").strip():
      fail("head is not the 40-hex SHA of HEAD: %r" % head)

  listed = read("main-backlog.list").splitlines()
  expected = git("ls-tree", "--name-only", "main", "backlog/").splitlines()
  if not expected or listed != expected:
      fail("main-backlog.list has %d lines, git ls-tree of main has %d" % (len(listed), len(expected)))
  for path in listed:
      if not os.path.isfile(D + "/main/" + path):
          fail("%s is listed but not extracted under %s/main" % (path, D))

  spec = importlib.util.spec_from_file_location("bootstrap", "scripts/github_bootstrap.py")
  boot = importlib.util.module_from_spec(spec)
  spec.loader.exec_module(boot)

  old_number = {}
  for path in listed:
      prefix = os.path.basename(path)[:2]
      p = int(prefix) if prefix.isdigit() else 0
      if 1 <= p <= 14:
          old_number[path] = p
      elif 20 <= p <= 25:
          old_number[path] = p - 5
      else:
          fail("%s maps to no issue in #1-#20" % path)
  if sorted(old_number.values()) != list(range(1, 21)):
      fail("the main backlog does not map one to one onto #1-#20")

  for path, n in sorted(old_number.items()):
      if by_number[n]["title"] != boot.parse_issue(D + "/main/" + path)["title"]:
          fail("#%d title differs from %s on main" % (n, path))
      if n not in (1, 15) and by_number[n]["comments"]:
          fail("#%d has comments; carrying them over is not designed, Stepan decides" % n)

  present = {i.get("title") for i in issues}
  for path in sorted(glob.glob("backlog/*.md")):
      if boot.parse_issue(path)["title"] in present:
          fail("the title of %s at HEAD already exists as an issue" % path)
  print("G0 checks OK")
  PY
  touch "$D/complete" || exit 1
  echo "G0 OK"
  '
  ```

- **G1 Milestones.** Per number: title equals the pinned English name -> skip; equals the snapshot title ->
  `gh api -X PATCH repos/valmlord/academy/milestones/<n> -f "title=<English>"`; anything else -> stop. Verify
  by listing again.
- **G1b Label.** Values from `labels.yml` through `parse_labels`; idempotent; stops if any `labels.yml` name
  is still missing afterwards (the snapshot said only `tier:pipeline` was).

  ```
  bash -uo pipefail -c '
  umask 077; D=/Users/stepankorshukov/.local/state/academy/26-github; : "${D:?}"
  cd /Users/stepankorshukov/Documents/Projects/academy/.claude/worktrees/docs-26-english || exit 1
  [ -f "$D/complete" ] || { echo "G1b STOP: no complete snapshot"; exit 1; }
  [ -z "$(git status --porcelain)" ] || { echo "G1b STOP: dirty tree"; exit 1; }
  gh auth status >/dev/null 2>&1 || { echo "G1b STOP: gh is not logged in"; exit 1; }
  python3 -I - <<"PY" || exit 1
  import importlib.util, json, subprocess, sys
  REPO = "valmlord/academy"

  def gh(*args):
      r = subprocess.run(["gh", *args], capture_output=True, text=True, stdin=subprocess.DEVNULL)
      if r.returncode != 0:
          sys.exit("G1b STOP: gh %s failed: %s" % (" ".join(args), r.stderr.strip()))
      return r.stdout

  def live_names():
      return {l["name"] for l in json.loads(gh("label", "list", "--repo", REPO, "--limit", "200", "--json", "name"))}

  spec = importlib.util.spec_from_file_location("bootstrap", "scripts/github_bootstrap.py")
  boot = importlib.util.module_from_spec(spec)
  spec.loader.exec_module(boot)
  defined = boot.parse_labels(".github/labels.yml")
  want = [l for l in defined if l["name"] == "tier:pipeline"]
  if len(want) != 1:
      sys.exit("G1b STOP: tier:pipeline is not defined exactly once in .github/labels.yml")
  label = want[0]
  if label["name"] in live_names():
      print("G1b skip: tier:pipeline exists")
  else:
      gh("label", "create", label["name"], "--repo", REPO, "--color", label["color"], "--description", label["description"])
  missing = sorted({l["name"] for l in defined} - live_names())
  if missing:
      sys.exit("G1b STOP: labels still missing on GitHub: " + ", ".join(missing))
  print("G1b OK")
  PY
  '
  ```

- **G2 In-place issues.** Targets: #1 = `parse_issue(backlog/01-*.md)` title and body, #15 =
  `parse_issue(backlog/20-*.md)`, #21 = snapshot title (already English) and the block "Issue #21 body" of
  `plans/26-english-docs-github.md` (error strings verbatim). Per issue: equal to the target -> skip; equal to
  the snapshot -> edit with the title as argv and the body through a file in `$D`; else stop. Read back after
  the edit.

  ```
  bash -uo pipefail -c '
  umask 077; D=/Users/stepankorshukov/.local/state/academy/26-github; : "${D:?}"
  cd /Users/stepankorshukov/Documents/Projects/academy/.claude/worktrees/docs-26-english || exit 1
  [ -f "$D/complete" ] || { echo "G2 STOP: no complete snapshot"; exit 1; }
  [ -z "$(git status --porcelain)" ] || { echo "G2 STOP: dirty tree"; exit 1; }
  gh auth status >/dev/null 2>&1 || { echo "G2 STOP: gh is not logged in"; exit 1; }
  python3 -I - "$D" <<"PY" || exit 1
  import glob, importlib.util, json, subprocess, sys
  D = sys.argv[1]
  REPO = "valmlord/academy"
  TEXTS = "plans/26-english-docs-github.md"

  def gh(*args):
      r = subprocess.run(["gh", *args], capture_output=True, text=True, stdin=subprocess.DEVNULL)
      if r.returncode != 0:
          sys.exit("G2 STOP: gh %s failed: %s" % (" ".join(args), r.stderr.strip()))
      return r.stdout

  def norm(text):
      return text.replace("\r\n", "\n").strip()

  def block(heading):
      lines = open(TEXTS, encoding="utf-8").read().split("\n")
      head = "## " + heading
      if lines.count(head) != 1:
          sys.exit("G2 STOP: heading not found exactly once in " + TEXTS + ": " + head)
      i = lines.index(head)
      if i + 1 >= len(lines) or lines[i + 1] != "~~~~text" or "~~~~" not in lines[i + 2:]:
          sys.exit("G2 STOP: no ~~~~text block under " + head)
      return "\n".join(lines[i + 2:lines.index("~~~~", i + 2)])

  spec = importlib.util.spec_from_file_location("bootstrap", "scripts/github_bootstrap.py")
  boot = importlib.util.module_from_spec(spec)
  spec.loader.exec_module(boot)

  def from_backlog(prefix):
      paths = glob.glob("backlog/" + prefix + "-*.md")
      if len(paths) != 1:
          sys.exit("G2 STOP: expected one backlog/%s-*.md, found %d" % (prefix, len(paths)))
      meta = boot.parse_issue(paths[0])
      return meta["title"], meta["body"]

  def read(n):
      live = json.loads(gh("issue", "view", str(n), "--repo", REPO, "--json", "title,body"))
      return live["title"], norm(live["body"])

  snapshot = {i["number"]: i for i in json.load(open(D + "/issues.json", encoding="utf-8"))}
  targets = {1: from_backlog("01"), 15: from_backlog("20"), 21: (snapshot[21]["title"], block("Issue #21 body"))}
  for n, (title, body) in sorted(targets.items()):
      now = read(n)
      if now == (title, norm(body)):
          print("G2 skip #%d: already the target" % n)
          continue
      if now != (snapshot[n]["title"], norm(snapshot[n]["body"])):
          sys.exit("G2 STOP: #%d matches neither the target nor the snapshot" % n)
      path = "%s/g2-body-%d.md" % (D, n)
      with open(path, "w", encoding="utf-8") as f:
          f.write(body)
      gh("issue", "edit", str(n), "--repo", REPO, "--title", title, "--body-file", path)
      if read(n) != (title, norm(body)):
          sys.exit("G2 STOP: #%d does not read back as the target" % n)
      print("G2 edited #%d" % n)
  print("G2 OK")
  PY
  '
  ```

- **G3 Merged PRs.** #24: target title and body from the blocks "PR #24 title" and "PR #24 body" of
  `plans/26-english-docs-github.md`. The `pr-hygiene.yml` regexes are retyped once (they contain no `'`) and
  the step stops if either is no longer a substring of `pr-hygiene.yml`, so a CI change cannot leave a stale
  copy. #22 and #25: stop if their snapshot has Cyrillic (editing them is not designed; research: none).

  ```
  bash -uo pipefail -c '
  umask 077; D=/Users/stepankorshukov/.local/state/academy/26-github; : "${D:?}"
  cd /Users/stepankorshukov/Documents/Projects/academy/.claude/worktrees/docs-26-english || exit 1
  [ -f "$D/complete" ] || { echo "G3 STOP: no complete snapshot"; exit 1; }
  [ -z "$(git status --porcelain)" ] || { echo "G3 STOP: dirty tree"; exit 1; }
  gh auth status >/dev/null 2>&1 || { echo "G3 STOP: gh is not logged in"; exit 1; }
  python3 -I - "$D" <<"PY" || exit 1
  import json, re, subprocess, sys
  D = sys.argv[1]
  REPO = "valmlord/academy"
  TEXTS = "plans/26-english-docs-github.md"
  TITLE_RE = r"^(feat|fix|refactor|perf|test|docs|chore|ci|build|content|learn)(\([a-z0-9-]+\))?!?: .+"
  BODY_RE = r"(closes|fixes|resolves|refs) #[0-9]+"
  CYRILLIC = "[" + chr(0x400) + "-" + chr(0x4FF) + "]"

  def gh(*args):
      r = subprocess.run(["gh", *args], capture_output=True, text=True, stdin=subprocess.DEVNULL)
      if r.returncode != 0:
          sys.exit("G3 STOP: gh %s failed: %s" % (" ".join(args), r.stderr.strip()))
      return r.stdout

  def norm(text):
      return text.replace("\r\n", "\n").strip()

  def block(heading):
      lines = open(TEXTS, encoding="utf-8").read().split("\n")
      head = "## " + heading
      if lines.count(head) != 1:
          sys.exit("G3 STOP: heading not found exactly once in " + TEXTS + ": " + head)
      i = lines.index(head)
      if i + 1 >= len(lines) or lines[i + 1] != "~~~~text" or "~~~~" not in lines[i + 2:]:
          sys.exit("G3 STOP: no ~~~~text block under " + head)
      return "\n".join(lines[i + 2:lines.index("~~~~", i + 2)])

  def read():
      live = json.loads(gh("pr", "view", "24", "--repo", REPO, "--json", "title,body"))
      return live["title"], norm(live["body"])

  hygiene = open(".github/workflows/pr-hygiene.yml", encoding="utf-8").read()
  if TITLE_RE not in hygiene or BODY_RE not in hygiene:
      sys.exit("G3 STOP: pr-hygiene.yml regexes changed, update G3 and G8a")
  for n in (22, 25):
      pr = json.load(open("%s/pr-%d.json" % (D, n), encoding="utf-8"))
      if re.search(CYRILLIC, pr["title"] + pr["body"]):
          sys.exit("G3 STOP: PR #%d has Cyrillic; editing it is not designed, ask Stepan" % n)
  title = block("PR #24 title")
  body = block("PR #24 body")
  if "\n" in title or not re.match(TITLE_RE, title):
      sys.exit("G3 STOP: PR #24 target title fails pr-hygiene: " + title)
  if not re.search(BODY_RE, body, re.I):
      sys.exit("G3 STOP: PR #24 target body links no issue")
  old = json.load(open(D + "/pr-24.json", encoding="utf-8"))
  now = read()
  if now == (title, norm(body)):
      print("G3 skip #24: already the target")
  elif now != (old["title"], norm(old["body"])):
      sys.exit("G3 STOP: PR #24 matches neither the target nor the snapshot")
  else:
      path = D + "/g3-body-24.md"
      with open(path, "w", encoding="utf-8") as f:
          f.write(body)
      gh("pr", "edit", "24", "--repo", REPO, "--title", title, "--body-file", path)
      if read() != (title, norm(body)):
          sys.exit("G3 STOP: PR #24 does not read back as the target")
      print("G3 edited #24")
  print("G3 OK")
  PY
  '
  ```

- **G4 Dry run.** First compute P = the number of the N English backlog titles already present on GitHub,
  and run the G6 checks on each of them (exactly one issue per title, body equals `parse_issue`, milestone,
  labels); any failure stops. Then `python3 scripts/github_bootstrap.py --dry-run` must print exactly one
  line matching `^Repo: valmlord/academy [|] you: [^ ]+$` (a wrong repo or a logged-out `gh` stops here), 0
  `label +`, 0 `milestone +`, exactly `2 + P` `issue = (exists)` lines and exactly `N - P` `issue +` lines.
  Any other count stops the runbook.
- **G5 Create.** Skip if P = N. Otherwise run `python3 scripts/github_bootstrap.py`, tee the log to
  `$D/g5-<epoch>.log` (a new name per attempt, nothing overwritten). The script then rewrites `@OWNER` in
  `.github/CODEOWNERS`; restore with `git restore .github/CODEOWNERS` and prove it with
  `git show HEAD:.github/CODEOWNERS | cmp - .github/CODEOWNERS` and an empty `git status --porcelain`.
  Restoring from git is correct here because CODEOWNERS is not part of this PR's diff and the tree is
  committed, and it survives a restart where a scratch copy would not. An interruption between the rewrite
  and the restore is handled by the start-of-run recovery.
- **G6 Map and verify.** From a fresh `gh issue list --state all --limit 500 --json number,title,body,milestone,labels`:
  for each of the N backlog files, old number (from G0's verified mapping; `-` for a file absent from
  `$D/main-backlog.list`, F7) and new number (by English title). Each row is verified: exactly one issue with
  that title, body equals `parse_issue` (normalized as in the preamble), milestone and labels equal the
  file's. Duplicates stop the runbook; the extra numbers go to Stepan, agents never delete. On the new issues
  for backlog 08, 10, 11 and 13, post one English comment saying that `plans/15-module-introduction-design.md`
  records platform requirements for them under the old numbers (body through `--body-file`); idempotent
  through a first line `<!-- 26-plans15-note -->` (present -> skip).
- **G7 Hand-over text.** Write `$D/pr-body.md` with `>` (regenerated on every run; it is output, not part of
  the write-once snapshot). It holds `Closes #26`, the pipeline summary, the table
  `old # | backlog file | new #` (the single authoritative mapping; no #26 comment, so F7 has one place to
  update) and, generated only from rows G6 verified with an old number, the commands
  `gh issue delete <old> --repo valmlord/academy --yes  # backlog/<file>, now #<new>`. Right before writing
  them, re-read each old issue's comments; a row whose comment count is above the snapshot's is dropped
  from the delete list and flagged (F18). Never 1, 15 or 21-26. A section "Orphaned, Stepan decides" lists,
  without commands, issues created from a backlog file removed in review and old issues whose file was
  removed (F7). Check the file against `pr-hygiene.yml:24` with `grep -Eiq`. Stepan runs the deletes after
  the merge; until then an old-backlog bootstrap run still finds every Russian title and creates nothing.
- **G8a Push, check the remote head, open or update the PR.** Never a forced push: a rejected push stops
  (F25). Rerun after any HEAD change (F7), so the push and the remote-head check repeat. Replaces CLAUDE.md's
  "`--fill`, then edit the body" for this task, because the body must carry the mapping from the first
  revision; the outcome (PR with `Closes #26` before `pr`) is the same.

  ```
  bash -uo pipefail -c '
  umask 077; D=/Users/stepankorshukov/.local/state/academy/26-github; : "${D:?}"
  cd /Users/stepankorshukov/Documents/Projects/academy/.claude/worktrees/docs-26-english || exit 1
  BR=docs/26-english-docs; REPO=valmlord/academy; T="docs: translate repo text and GitHub metadata to English"
  RT="^(feat|fix|refactor|perf|test|docs|chore|ci|build|content|learn)(\([a-z0-9-]+\))?!?: .+"
  RB="(closes|fixes|resolves|refs) #[0-9]+"
  fail(){ echo "G8a STOP: $*"; exit 1; }
  [ -f "$D/complete" ] && [ -f "$D/pr-body.md" ] || fail "no snapshot or no pr-body.md, run G0-G7 first"
  gh auth status >/dev/null 2>&1 || fail "gh is not logged in"
  [ "$(git branch --show-current)" = "$BR" ] || fail "HEAD is not on $BR"
  [ -z "$(git status --porcelain)" ] || fail "dirty tree"
  grep -qF -e "$RT" .github/workflows/pr-hygiene.yml && grep -qF -e "$RB" .github/workflows/pr-hygiene.yml || fail "pr-hygiene regexes changed, update G3 and G8a"
  printf "%s\n" "$T" | grep -Eq -e "$RT" || fail "title fails pr-hygiene"
  grep -Eiq -e "$RB" "$D/pr-body.md" || fail "pr-body.md links no issue"
  git push -u origin "$BR" || fail "push rejected, never force-push (F25)"
  [ "$(git ls-remote --exit-code origin "refs/heads/$BR" | cut -f1)" = "$(git rev-parse HEAD)" ] || fail "remote head is not HEAD"
  if ST=$(gh pr view "$BR" --repo "$REPO" --json state --jq .state 2>/dev/null); then
    [ "$ST" = OPEN ] || fail "the PR of $BR is $ST"
    gh pr edit "$BR" --repo "$REPO" --body-file "$D/pr-body.md" >/dev/null || fail "pr edit"
  else
    gh pr create --repo "$REPO" --base main --head "$BR" --title "$T" --body-file "$D/pr-body.md" >/dev/null || fail "pr create"
  fi
  URL=$(gh pr view "$BR" --repo "$REPO" --json url --jq .url) || fail "pr view"
  echo "G8a OK $URL"
  '
  ```

- **G8b Advance.** Its own Bash call, with the worktree invocation of CLAUDE.md section 7 (line 146), because
  `lib/common.sh:44-45` refuses a CLI call through the worktree's own copy and the state is resolved from the
  current directory:
  `cd /Users/stepankorshukov/Documents/Projects/academy/.claude/worktrees/docs-26-english && bash "$(git rev-parse --path-format=absolute --git-common-dir)/../.claude/hooks/pipeline-advance.sh" pr <URL printed by G8a>`.
  It is not folded into G8a because the pipeline CLI should run exactly as CLAUDE.md prescribes, not nested
  in a `-c` literal that hooks would see as one opaque command.

### 5.4 Texts prepared in the repo

`plans/26-english-docs-github.md` (C5), committed so the judges review it; G2/G3 read it. Machine-read
format, fixed because G2 and G3 parse it: the "A4 pinned strings" table first (2.4), then three sections,
each a heading line exactly `## Issue #21 body`, `## PR #24 title`, `## PR #24 body`, each heading occurring
once, the very next line `~~~~text`, the text, and a closing line `~~~~`. The text inside contains no line
`~~~~` (a tilde fence, because PR #24's body itself may contain backtick fences); the title block is exactly
one line. Prose for the judges may follow the blocks under other headings. The mapping is not committed: it
exists only after G6 and lives in the PR body.

### 5.5 Snapshot directory lifetime

`$D` is the rollback source for F14 and is kept until all of: #26 merged, every delete command from the PR
body run by Stepan, `gh issue view <old>` fails for each deleted number, and Stepan decides no rollback of
milestones, #1, #15, #21 or PR #24 is wanted (their old texts stay in GitHub's edit history anyway). Then
Stepan removes it in his own terminal: `rm -r /Users/stepankorshukov/.local/state/academy/26-github`. Agents
never remove it.

## 6. CLAUDE.md section 7 (C5)

After this PR merges, Stepan squashes main into a fresh root commit and force-pushes. The section must be
correct in four states: A now, B between merge and squash, C after the squash, D after a 6.2 rebase once main
has moved on. The invocation paragraph (`git rev-parse --git-common-dir` inside the `bash "$(...)"` span) is
history-independent and stays.

### 6.1 Worktrees bullets

- Bullet 1 (`.claude/worktrees/` only): unchanged.
- **Main checkout rule:** the main checkout is only on a branch that contains main:
  `git merge-base --is-ancestor main HEAD` exits 0. Because main contains v2 in every window, a branch that
  contains main contains v2; a pre-v2 branch fails before the squash (it lacks the newer main commits) and
  after it (unrelated history). It is stricter than "contains v2" (an older post-v2 branch must merge main
  first), which is accepted because it also brings the latest hook fixes into the checkout that runs them.
  Switching the main checkout's branch is Stepan's, from his own terminal with no Claude session open in the
  main checkout, because hooks run only inside a session: `git switch <branch>`, run the bring-up procedure,
  check the rule, then start the session.
- **Bring-up procedure** (main checkout as above; a worktree runs it in its own directory before its
  pipeline continues, since its hook wiring comes from its own `settings.json`):
  1. `git merge-base --is-ancestor main HEAD` exits 0 -> nothing to do.
  2. Else, if `git merge-base main HEAD` prints a commit (shared history) and `git cherry main HEAD` prints no
     line starting with `-` -> `git merge main`. If the merge stops with a conflict: `git merge --abort`, do
     not resolve, ask.
  3. Else, if `git merge-base main HEAD` exits 1 (unrelated history: the branch was cut before the squash,
     and main has been squashed since) -> 6.2. Any other exit code is a git error: stop.
  4. Else (shared history, and `git cherry` prints a `-` line: the branch carries a copy of a commit main
     already has) -> do not merge. In the main checkout, `git switch main` first, then ask, because the rule
     above forbids leaving the main checkout on a branch that fails step 1 (the next session there would run
     that branch's hooks). In a worktree: ask.
  Check afterwards: step 1 exits 0.
  The section text says explicitly: `feat/1-web-bootstrap` is not brought up with `git merge main` until its
  6.2 rebase. Before the squash it reaches step 4 (its v2 cherry-pick has a patch-id twin in main), stays
  parked and is not checked out in the main checkout; after the squash it reaches step 3; after its 6.2
  rebase it no longer carries the copy and is an ordinary branch, so step 2 applies when main moves on. The
  procedure detects the end of the special case by itself (step 4's `-` line disappears with the rebase), so
  no name and no window has to be remembered. Because: before its rebase it carries the v2 cherry-pick on a
  pre-v2 base while main has since rewritten the same `.claude/hooks/` files (#23, #25), so a merge is
  expected to conflict, and a merge commit would break the 6.2 "two commits" pre-check that guards the rebase.
- Bullet `pipeline-advance.sh parked` before `git worktree remove`: unchanged.

### 6.2 "Branches cut before the squash" (replaces "One-time migration to v2")

- **Tag the old tip, once, Stepan.** After the last merge before the squash, and before any command that
  moves local `main` (pull, reset, the squash itself): `git fetch origin` then `git tag pre-squash origin/main`.
  Checks: `git rev-parse pre-squash origin/main` prints the same SHA twice; after the squash
  `git diff pre-squash main` is empty (proves the tag is the squashed tree, not an older commit). The tag is
  local only: no `--tags`/`--follow-tags` push; `git ls-remote --tags origin pre-squash` prints nothing.
- **Branches with own work** (no Claude session open in that checkout; today only `feat/1-web-bootstrap`):
  - Entry check: `git merge-base main <branch>` exits 1. If it prints a commit, the branch is already on the
    new history (rebased earlier, or cut after the squash): do not run this recipe, use the bring-up
    procedure. Because: on such a branch `pre-squash..<branch>` lists the new root plus the branch's own
    commit, two lines that pass the pre-check below by count, and the rebase would replay the root.
  - Pre-check: `git log --oneline pre-squash..<branch>` lists only the branch's own commits (for #1: two, the
    v2 cherry-pick and the plans commit). Many more lines, or a line that is not the branch's own work, mean
    the tag is wrong: stop.
  - `git rebase --onto main pre-squash <branch>`. Commits already in main by patch-id are dropped (V7 shows
    this for #1). If it stops: `git rebase --abort`, do not resolve, ask.
  - Post-check: `git diff --name-only main <branch>` lists only the branch's own files (#1: `plans/1-*`), and
    `git merge-base --is-ancestor main <branch>` exits 0.
  - #1: the rebase leaves the branch checked out in the main checkout; start a session and run
    `bash .claude/hooks/pipeline-advance.sh resume 1` (parked states are keyed by issue and branch name, not by
    commit, and the rebase does not touch ignored files).
- **Stale branches** (work already in main; deleted, not rebased; no session open on them). Done after the
  tag exists (before or after the squash) and before the tag cleanup. First, one local proof that the branch
  holds nothing that exists only here:
  - (a) `git merge-base --is-ancestor <branch> pre-squash` exits 0: every commit of the branch is in the old
    main (merged with a merge commit, or never committed to); or
  - (b) `git rev-parse <branch>` equals a line printed by
    `gh pr list --head <branch> --state merged --json headRefOid --jq '.[].headRefOid'`: a merged PR was
    built from exactly this tip (the squash-merge case, where (a) cannot hold).
  Neither proof holds: stop and ask, and leave the branch and its worktree as they are, because the branch may
  hold commits that exist nowhere else. Only after a proof holds: if the branch has a worktree, run
  `pipeline-advance.sh parked` there with the worktree invocation above, then `git worktree remove` it (it
  must go first, because `git branch -D` refuses a branch checked out in a worktree); then
  `git branch -D <branch>`. The proof comes before the worktree removal because the removal cannot be taken
  back by stopping later: it takes the worktree's parked states and untracked files with it. `git branch -d`
  is not used: it judges against HEAD or the branch's upstream, not against main, and refuses every
  squash-merged branch anyway. Today: `fix/21-pipeline-v2` (merged via the #22 merge commit) and
  `chore/998-live-wt` (at the #22 merge commit, no worktree registered) pass (a); after this PR merges,
  `docs/26-english-docs` with its worktree `.claude/worktrees/docs-26-english` passes (b) as long as no commit
  was added after the last G8a push.
- **Tag cleanup, last.** Delete the tag only when no local branch shares history with it, i.e. this prints
  nothing:
  `git for-each-ref --format='%(refname:short)' refs/heads | while read -r b; do git merge-base pre-squash "$b" >/dev/null && echo "$b"; done`
  then `git tag -d pre-squash`. It prints every branch that still needs the tag (not yet rebased) or is
  stale; right after the squash it prints at least `feat/1-web-bootstrap`, so following the rule cannot
  delete the tag before #1 is rebased. A forgotten stale branch only keeps the local tag longer (F22).
  CLAUDE.md does not mention `git branch --contains pre-squash`: it prints nothing right after the squash
  (V7 regression line) and V5 goes red if it appears.
- The `#15` migration bullet and the `plans/21-*` pointer are removed (#15 merged via #24).

### 6.3 Window walk

| Window | `feat/1-web-bootstrap` | Rule result | Correct? |
|--------|------------------------|-------------|----------|
| A: now (main = e7c4b97, has v2) | pre-v2 base, lacks main | step 1 exits 1; step 2 refused (`git cherry` prints one `-`); step 4: main checkout switched back to `main`, ask; #1 stays parked | yes, blocked (V7 window A) |
| B: #26 merged, not squashed | same | same as A: `-` line, step 4; a merge would conflict in `.claude/hooks/` and break the 6.2 pre-check. The tag is created at the end of this window. | yes, blocked (same commands as V7 window A) |
| C: squashed, not rebased | unrelated | step 1 exits 1; step 2 skipped (`merge-base` exits 1); step 3 -> 6.2 (entry check exits 1, pre-check two lines, rebase, post-check); tag kept until the cleanup condition is true | yes (V7 window B and "after the recipe") |
| D: rebased, then main moved on | on the new history, behind main | step 1 exits 1; step 2: shared history and no `-` line -> `git merge main`; step 1 then exits 0. Step 3 is not reached, and 6.2's entry check would refuse it (merge-base prints a commit) | yes (V7 window D) |

### 6.4 The complete set of git commands in section 7 (V5 compares against it)

`git rev-parse --path-format=absolute --git-common-dir` (inside the invocation span),
`git merge-base --is-ancestor main HEAD`, `git merge-base main HEAD`, `git cherry main HEAD`, `git merge main`,
`git merge --abort`, `git switch <branch>`, `git switch main`, `git fetch origin`,
`git tag pre-squash origin/main`, `git rev-parse pre-squash origin/main`, `git diff pre-squash main`,
`git ls-remote --tags origin pre-squash`, `git merge-base main <branch>`,
`git log --oneline pre-squash..<branch>`, `git rebase --onto main pre-squash <branch>`, `git rebase --abort`,
`git diff --name-only main <branch>`, `git merge-base --is-ancestor main <branch>`, `git worktree remove`,
`git merge-base --is-ancestor <branch> pre-squash`, `git rev-parse <branch>`, `git branch -D <branch>`,
`git for-each-ref --format='%(refname:short)' refs/heads`, `git merge-base pre-squash "$b"`,
`git tag -d pre-squash`.

(The `gh pr list` of proof (b) is not a git command and is not in the inventory; V5 counts only `git`.)

## 7. What NOT to build

- **No CI Cyrillic check in this PR**: it needs a maintained allow-list, scoping for the legitimate Russian in
  `course/`, `plans/`, `.claude/feedback` and agent quotes, a `ci.yml` change and negative tests, which turns a
  docs PR into a CI change. Follow-up issue suggested, seeded with V1's allow-list.
- No change to `scripts/github_bootstrap.py`: it already does the right thing; G4/G5 handle its CODEOWNERS
  side effect and G1b its label. G0, G1b and G2 import it read-only for `parse_labels` and `parse_issue`.
- No history rewrite, no `gh issue delete`, no branch or tag deletion by agents: the squash, the deletes and
  the 6.2 cleanup are Stepan's.
- No `git merge main` of `feat/1-web-bootstrap` before its 6.2 rebase and no rehearsal of one: the design
  never prescribes it (step 4 refuses it).
- No runbook literals for G1 and G4-G7: they carry no value with a quote and set no write-once marker, and
  every added literal is untraced code; the quote rule covers them. G0 is a literal although it carries no
  quoted value, because it sets the marker that every later step trusts (round 4).
- No translation of `plans/` (other than `plans/26-*`), `.claude/feedback/` or agent quotes; `learner/` only
  through C6. No file renames (`run.sh:275` and every cited path).
- No ADR: no costly-to-change decision; lesson contract, schema and routes untouched.

## 8. Alternatives rejected

- **Edit all 20 issues in place:** the owner wants no Russian edit history on recreatable issues.
- **Recreate #1 and #15 too:** Stepan chose in-place for them (5.1).
- **New English milestones:** five Russian ones left to delete and two issues to move (5.2).
- **Let G5's bootstrap create `tier:pipeline`:** G4's expected label count would then depend on resume state;
  a separate idempotent G1b keeps G4 at a constant 0.
- **Escape the apostrophe as `'\''` in G1b:** fixes one literal but keeps a retyped copy of `labels.yml` that
  can drift, and the next quoted value repeats the bug; reading the source through `parse_labels` removes the
  class.
- **G0 left as prose with the checks listed** (review-4's second option): the orchestrator would still compose
  the command, and a composed command cannot be scanned by V8 or run by V10 before the real run; a literal
  can be both.
- **`set -e` in the G0 preamble instead of `|| exit 1` per write:** `-e` is suspended inside `&&`/`||` lists,
  `if` conditions and functions called from them, so its coverage depends on how each line is written, and it
  would not catch a write that exits 0 with wrong content; explicit `|| exit 1` plus the content checks cover
  both, and match the other literals.
- **`git merge-base main HEAD` as the main-checkout rule:** passes a pre-v2 branch before the squash (6.3).
- **`git branch --contains pre-squash` prints nothing, as the tag cleanup condition:** already true right
  after the squash, before #1 is rebased (V7 regression line).
- **`git branch --no-contains main` prints nothing, as the tag cleanup condition** (architecture's
  alternative): also correct after the squash, but it tests "contains the new main" rather than the property
  the tag serves ("shares history with the tag"), so a post-squash branch cut from an older main would hold
  the tag for no reason; the `merge-base` loop tests the property directly.
- **Exclude `feat/1-web-bootstrap` by name from step 2** (revision 3): the exclusion has no end the procedure
  can see; after the 6.2 rebase and a new main commit, #1 has no valid path (Arch 1, round 3).
- **Exclude it by name "until its 6.2 rebase", ended by Stepan's memory:** works if remembered; the
  `git cherry` condition gives the same result and is checked by a command, which the round 3 lesson asks for.
- **`git branch -d` for stale branches before the squash:** judges against HEAD or the upstream, not main;
  a local proof against the tag or the merged PR's head is exact.
- **Stale-branch deletion on "PR merged on GitHub":** proves nothing about the local tip (round 3 Sec 2).
- **`pipeline-advance.sh pr` inside G8a:** the CLI would run nested in a `-c` literal; CLAUDE.md prescribes
  the worktree invocation as a command of its own.
- **Bring #1 up with `git merge main` in window B:** expected conflict in `.claude/hooks/` and a merge commit
  that breaks the rebase pre-check; waiting for the squash costs nothing because #1 is parked.
- **Copy the four A4 strings into this design:** would put non-allow-listed Cyrillic into the design; the
  table in `plans/26-english-docs-github.md` pins them where A4 is allowed and V1 checks them.
- **Snapshot in the session scratchpad:** lost on a session restart, which is exactly when it is needed.
- **`rm -rf` then rewrite, for G0 and V7:** the harness refuses `rm -rf` of a variable inside `bash -c`;
  overwrite-in-place with a last-written `complete` marker and `mktemp -d` give the same freshness.
- **Restore CODEOWNERS from a scratch copy:** same restart problem; git is valid here because the file is
  outside this PR's diff.
- **Run the GitHub side after the merge:** the mapping and delete list would not be in the reviewed PR; the
  cost of the chosen order is F7.
- **One coder for everything:** slower; disjoint sets with pinned strings give the same consistency.

## 9. Failure modes

| # | Failure | Handling |
|---|---------|----------|
| F1 | Bootstrap rerun creates duplicates | Title matching makes a rerun create only missing titles; G4 verifies present ones first; G6 asserts one issue per title, and extra numbers go to Stepan. |
| F2 | Partial run (crash, network, session restart, timeout after a server-side create) | Rerun from G0: G0 skips on `complete` (a snapshot that passed every G0 check), or, with `complete` absent, rewrites all its files, which is safe because no GitHub write has happened yet; every step skips what is done, G4 recomputes P. The mapping comes from GitHub, not from the log. |
| F3 | Rate limit | About 18 creates plus about 10 edits, sequential; the limit is from memory, unverified. On 403/429 the script raises; wait, then F2. |
| F4 | Milestone not renamed or misspelled | G4 requires 0 milestone creates; V2 maps names to numbers. |
| F5 | Label missing on GitHub (`tier:pipeline` today) | G1b creates it from `labels.yml`; G4 requires 0 label creates afterwards; V2 counts against the live list. |
| F6 | Two titles translate to the same string | V2 uniqueness check. |
| F7 | Review changes backlog text after G5 | Title/body: `gh issue edit <new> --title ... --body-file ...`, title as argv as in G2. Milestone: `--milestone`. Labels: `--add-label`/`--remove-label`. Added backlog file: rerun from G0 (bootstrap creates it, N and P grow, its row has old number `-`). Removed file: its new issue and its old issue go to G7's "Orphaned, Stepan decides" section, without delete commands, because only G6-verified rows produce commands. Then rerun G6, G7 and G8a (push, remote-head check, `gh pr edit --body-file`). |
| F8 | CODEOWNERS rewritten by the script | `git restore`, `cmp` and an empty `git status` in G5; the `pr` gate also catches a dirty tree. |
| F9 | Another session creates issues during G5 | Mapping is by title, not by number ranges. |
| F10 | Stepan deletes the wrong issue | Commands only from G6-verified rows, with backlog file and new number as the comment; 1, 15, 21-26 excluded; after merge only. |
| F11 | `gh` logged out, or pointed at another repo | Precondition `gh auth status`; every `gh` call in a literal names `valmlord/academy`; G4 requires the exact `Repo: valmlord/academy` line and stops otherwise. |
| F12 | Edit of PR #24, or this PR's body, fails pr-hygiene | Regexes of `pr-hygiene.yml:18/24` checked locally in G3, G7 and G8a before writing; G3 and G8a also stop if the CI regexes changed. |
| F13 | Meaning drift in an ADR | V3 invariants, pinned status line, judges read ADRs first. |
| F14 | Rollback | Repo: revert the PR. GitHub, from the G0 snapshot (kept per 5.5): PATCH milestones back; restore #1, #15, #21 and PR #24 title and body (title as argv, `--body-file`); `gh label delete tier:pipeline --yes` only if the snapshot shows it absent and `gh issue list --label tier:pipeline --state all` is empty; Stepan deletes the new issues from the mapping. The English revisions stay in the edit history. |
| F15 | Tag `pre-squash` on the wrong commit | `rev-parse` equality, empty `git diff pre-squash main`, and the pre-check line count (6.2); both wrong placements are V7 negative runs. |
| F16 | Rebase stops on the old v2 commit | `git rebase --abort`, no resolution, ask; V7 shows in advance whether it is dropped by patch-id. |
| F17 | A Claude session is open in the main checkout while it sits on a pre-v2 branch | The rule says to switch only with no session open; residual risk, Stepan's terminal only (ADR-0005 threat model). |
| F18 | Someone comments on an old issue between G0 and G7 | G7 re-reads comments and drops that row from the delete list. |
| F19 | Stepan says no to C6, or answers after the coders ran | Without a yes, C6 is not spawned and V1 omits `learner/`; a late yes is a separate C6 run plus V1 rerun before `commit`. |
| F20 | The squash is postponed or cancelled after #26 merges | #1 stays parked with nothing lost; step 4 refuses a merge. If Stepan cancels the squash, #1 needs its own plan (history unchanged, so the old cherry-pick-parent rebase in `plans/21-pipeline-v2-design.md` section 12 still describes it); out of scope here. |
| F21 | G5 interrupted after the CODEOWNERS rewrite, before the restore | The next run's start-of-run recovery restores the file only if it is exactly `HEAD`'s version with `@OWNER -> @<login>`; anything else stops for a human. |
| F22 | A stale branch is forgotten, so the tag cleanup condition never becomes true | The loop prints the branch name; the tag is local and harmless, it just stays. Deleting it early is the dangerous direction, and the condition cannot do that while any branch shares history with it (V7). |
| F23 | The tag is deleted by hand before #1 is rebased, against the rule | Not part of the procedure, so no recovery command goes into CLAUDE.md. Stop and do not improvise `git rebase main` (it replays the whole old history). The old tip is likely still in the main checkout's local reflogs of `main` and `origin/main` (default retention is from memory and unverified), so the architect designs the recovery then, from what is actually on disk. Residual risk accepted: Stepan's terminal only, and following the cleanup rule prevents it. |
| F24 | A hook or the harness blocks a runbook literal (Python heredoc, `cd`, push) or a V7 line | The orchestrator reports the blocked command and stops; no rewording to slip past a guard. The literals write only under `$D` and into the scratch clone. |
| F25 | `git push` in G8a is rejected (someone pushed the branch, or history was rewritten locally) | G8a stops; never `--force`. The orchestrator compares `git log origin/docs/26-english-docs..HEAD` and the reverse and asks Stepan. |
| F26 | A stale branch passes neither proof (a) nor (b) | Not deleted, and its worktree is not removed; Stepan decides (it may hold unpushed work). The tag stays until then (F22). |
| F27 | `plans/26-english-docs-github.md` does not follow the 5.4 format | G2/G3 stop with the missing heading or block; C5 fixes the file and the runbook reruns from G0 (F2). |
| F28 | A future branch carries a cherry-pick of a commit main already has | Step 4 stops and asks instead of merging. Conservative on purpose: such a branch may still merge cleanly, but asking costs one question and a wrong merge is what broke #1. |
| F29 | A G0 write fails, or a G0 content or stop check fails | G0 exits 1 before `touch "$D/complete"`; no later step runs (each requires `complete`) and nothing on GitHub has changed. Rerun G0 once for a transient cause (network, rate limit); a failure that repeats (a PR or issue missing, a comment on an old issue, a title already English) goes to Stepan with G0's `G0 STOP` line. |

## 10. Deploy awareness

No new module, dependency, directory or file rename in the repo. The snapshot directory
`/Users/stepankorshukov/.local/state/academy/26-github` is outside the repo, created with `umask 077`, so no
gate or `.gitignore` change is needed; its lifetime and removal are in 5.5. V7's clones, V8's scratch files and
V10's scratch snapshot directories live in the tester's scratchpad. The runbook literals use only `python3`
(3.9 on this Mac; the literals use no syntax newer than 3.5), `gh`, `git` and `tar`, all already required by
the bootstrap or part of macOS. CI reads none of the translated content. This PR's branch, title and body
satisfy `pr-hygiene.yml` (`docs/26-english-docs`, `docs: ...`, `Closes #26`), checked locally in G8a, which
also pushes the branch before the PR exists.

## 11. Trace record (revision 5, no shell)

Revision 4 lines were run in round 4 by the operations judge (V7, V8, V9 OK; all literals pass
`bash-code-guard.sh`). Revision 5 lines traced on paper, line by line:
- G0 literal, bash part: the preamble; the dirty-tree and `gh auth` checks; the skip branch (`exit 0` before
  any write); every write line with `|| exit 1`, including the one inside the `for` loop (`exit` there leaves
  the whole `-c` script, the loop runs in the same shell); `gh api` with a double-quoted path (`?` and `&`
  literal); the pipeline `git archive main backlog | tar -x -f - -C "$D/main"` under `pipefail` (either side
  failing fails the line), extracting `backlog/<file>` under `$D/main`; `git ls-tree --name-only main backlog/`
  run from the worktree root, so it prints `backlog/<file>` paths; `python3 -I - "$D" <<"PY" || exit 1`;
  `touch` only after the heredoc's exit 0. No `'` in the literal (checked character by character for
  apostrophes in messages, e.g. no "main's").
- G0 literal, Python part: `read` and `load` for a missing file (`OSError` -> STOP) and an empty or truncated
  file (`ValueError`, which `JSONDecodeError` is -> STOP); each PR check against a PR object, a wrong number
  and a `gh` error body; milestones with a missing number, an English title (no Cyrillic -> STOP) and the
  expected Russian title; issues without `comments`; `head` with and without the trailing newline and with a
  different SHA; the list against an empty `ls-tree` (STOP before any title check, so no vacuous pass), a
  shorter list, and a listed file absent under `$D/main`; the prefix mapping for `01`-`14`, `20`-`25`, an
  unmapped prefix and a duplicate (the sorted-values check); title and comment checks skipping comments for
  #1 and #15 only; the HEAD-title check with Russian and with English backlog titles. `parse_issue` of a file
  under `$D/main` computes a meaningless `relpath` for the body, which G0 never reads (titles only).
- `--repo` placement: after the subcommand's positional argument in every `gh issue|pr|label` call
  (`gh label create <name> --repo ...`, `gh issue edit <n> --repo ...`), accepted by `gh` as a flag anywhere.
- V8: the count of 7 blocks against this file (V7, V9, G0, G1b, G2, G3, G8a), the G0 write-line rule against
  every `> "$D/` line of G0 (6 lines, none in the heredoc), and each new negative run reaching its check.
- V10: each variant against the G0 literal, including that variants (2) and (3) stop before the HEAD-title
  check and so run before translation.
- 6.1 step 4, 6.2 stale order, 6.3 row A and 6.4 against each other: `git switch main` appears in 6.1 and in
  6.4; `git worktree remove` and `git branch -D` stay in 6.4.

Not traced, or resting on unverified behaviour (the tester run or the first runbook run shows them):
- Whether a hook in this repo blocks any of: the Python heredoc in G0/G1b/G2/G3, the absolute `cd` in the
  preambles, `tar -x -f -` or `touch` in G0, `git push` in G8a, or V7's `printf ... > "$V/repo/moved-on.txt"`
  (F24). Round 4 showed the revision 4 literals pass `bash-code-guard.sh`; G0 is new.
- That `gh api` exits non-zero on an HTTP error (assumed; if it exited 0 with an error object, the
  `milestones.json` list check still stops) and that `gh pr view <n>` exits non-zero for a missing PR (the
  round 4 live run showed a failing `gh pr view 999999`; V10 variant 2 repeats it).
- `gh pr view <branch> --repo ...` resolving a branch name like the repo-less form (assumed; G8a stops if it
  finds a PR in a state other than OPEN) and its behaviour for a closed or merged PR.
- That bsdtar on this Mac extracts a `git archive` stream from `-f -` and ignores its pax global header
  (standard libarchive behaviour, not run; V10 variant 1 runs it).
- Whether GitHub returns issue and PR bodies byte-equal to what was sent (the normalization in 5.3 assumes it
  may differ only in line endings and outer whitespace).
- Whether `gh issue edit --title --body-file` and `gh pr edit` apply title and body atomically (if not, a
  crash between them leaves a state equal to neither target nor snapshot, and G2/G3 stop for a human, which
  is safe).
- G1 and G4-G7 have no literals; the orchestrator's composed commands are checked only by the quote rule
  and the judges.
