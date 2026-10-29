# #26 test report (tester phase)

Run by the tester agent in the worktree; scripts in the session scratchpad (`tester/`).

- V1 OK (scope 32 files + plans/26-*; A1/A2 read live; A4 = module title line 5, "скелет" line 28; lines 29/36 have
  no course source and are translated). Six negative runs red.
- V2 OK: parse_issue on 20 files, unique titles, milestones map to the same numbers, prefixes and labels equal to
  main, pinned strings match. Live dry run: one `Repo: valmlord/academy` line, 1 `label + tier:pipeline`,
  5 `milestone +`, 20 `issue +`, 0 exists. `feature.yml` parses as YAML (ruby). Negative run red.
- V3: first run RED, a new inline span `student` in backlog/20-25 (coder C4 removed the backticks; span multisets
  now equal main in every file). Remaining V3 output: fenced blocks differ in README.md (tree comments, bash
  comments), docs/architecture.md (diagram labels), learner/journal.md (pinned heading template). Only prose
  inside them was translated, paths/commands/structure identical. Rule 2.8 (fenced blocks untouchable) vs V1
  (zero Cyrillic) contradict; judges confirm. Links, #N, ADR-000N, headings equal; CLAUDE.md byte-equal outside
  section 7; file set within the allowed set. Negative runs red.
- V4 OK (no em/en dashes, no curly quotes). V5 OK (26 commands == 6.4; no SHA; five negative runs red).
- V6: `pnpm content:validate` rc 0; `tests/pipeline/run.sh` 228 passed 0 failed; `pnpm test` 12 passed; lint clean
  on tracked files; compose stack healthy, then down.
- V7 OK, V8 OK (7 literals, five negative runs red), V9 OK, V10: variant 1 G0 OK then skip with nothing newer
  than `complete` (`-mindepth 1`), variants 2 and 3 exit 1 without `complete`. The real snapshot directory was
  never created.
- Remaining Cyrillic outside course/: allow-listed only, plus historical plans/15-*, .claude/feedback quotes,
  .claude/agents quotes. Unexpected: none.
