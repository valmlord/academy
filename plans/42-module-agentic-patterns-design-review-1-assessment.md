# #42 design review, round 1: assessment

Reviewer: judge-assessment. Object: `plans/42-module-agentic-patterns-design.md` revision 1 (all sections; checks,
assessment map, sections 2.3-2.8, 11, 12) and the architect's prototypes, copied to
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-content-42-agentic-patterns-887a63/125c1dde-b820-4900-9718-4642a84705b5/scratchpad/judge-r1/`
and re-run there with `/opt/homebrew/bin/python3.12` (3.12.13), `env -i PATH=<pybin symlink python3 -> 3.12>:/usr/bin:/bin`,
`python3.12 -I <verifier>` from a fresh copy (harness: `run1.sh`, `arch20.sh`, `deps20.sh`; attacks in `attacks/`).
Threat model judged against: the orchestrator default in the task (= design 2.8).

Verdict: FAIL, 5 blocking items (B1-B5).

## Blocking

### B1. L1 `poka-yoke-applied`: the R04 mistake itself passes (swapped named arguments in `statement.py`)
The check observes "меняет код так, чтобы ошибка стала невозможной", but behaviour is graded only on `late_fee`
itself (35-point grid). The callers are graded by AST form (named arguments) plus "the learner's suite is green".
The suite is learner-editable, and in the prototype it runs as `python3 -B -m unittest` without `-I` and with cwd
first on `sys.path`, so a workspace-root `unittest/` package replaces it.
- Repro: reference workspace, `statement.py` line 13 becomes `late_fee(amount_cents=days_late, days_late=balance)`:
  - alone: `hidden: ваши тесты красные`, exit 1 (correct);
  - plus `tests/test_statement.py` expectation `(1, 10_000, 10)` -> `(1, 10_000, 0)` (test names kept): `PASS`, exit 0;
  - plus, instead of the test edit, `unittest/__init__.py` + `unittest/__main__.py` printing `Ran 10 tests\nOK` at
    the workspace root (tests untouched): `PASS`, exit 0.
- Both are in scope (editing the tests the check reads; stub scripts).
- Fix target, design L1 check 2 "Hidden":
  - add a grader-side behaviour probe for every `src/` caller of `late_fee`: `statement_line` on a grid of invoices
    and dates against pristine expected values in `checks/data/`, in the learner-code subprocess (01 2.3 record);
  - state how the suite runs under `-I` (PYTHONPATH is ignored under `-I`): a `-I -B -c` bootstrap that puts the
    copy's `src` and root on `sys.path` after `unittest` is imported;
  - add both attacks to "Must fail".
- The same suite-run wording applies to L2 `arch-workspace-clean` (c) and L3 `deps-gate` (b).

### B2. L1 `rule-placement`: "убирает из памяти" is graded by tags only; keeping every rule's text passes
Stage 0 compares the set of `[Rnn]` tags with the `memory` set, and "other untagged lines may be added freely". So
a learner who deletes ten `[Rnn] ` prefixes and keeps all 12 rule texts passes.
- Repro: correct `placement.json`, CLAUDE.md = starter with tags stripped from the 10 non-memory lines (all 12 rule
  texts kept): `counted: PASS`, exit 0.
- Variant, same mechanism (reasoned, not run): moving the texts to another loaded memory file (`CLAUDE.local.md`,
  `AGENTS.md`, `.claude/rules/*.md`, an `@import`) is not read at all.
- The assessment map row "O1 убирает из памяти ушедшее" claims what the check does not observe.
- Fix target, design L1 check 1 stage 0:
  - no memory file of the workspace keeps the text of a rule placed elsewhere. Matching: the normalised pristine
    rule text from `checks/data/` (lower case, whitespace collapsed, tag removed), as a substring or by a
    distinctive-token overlap;
  - cap untagged non-heading lines in CLAUDE.md, for example <= 3;
  - name the memory files scanned in task.md;
  - add the strip-tags attack to "Must fail".

### B3. L2 `arch-workspace-clean` (a): violations evaded by dynamic import pass the grader's own linter
Task rules (and section 10) restrict the linter to import statements. The workspace check reuses the same rules,
so `importlib.import_module` / `__import__` hide A1 and A2 from (a). The behaviour tests (b) still hold. This is
suppression by other means, cheaper than the honest A2 fix, and exactly what an agent told "make the linter green"
tends to do. O2's "изменением кода, а не исключениями" is not observed.
- Repro (starter + reference linter as `arch_rules`): `report.py` uses
  `format_cents = importlib.import_module("invoices.money").format_cents`, `api.py` uses
  `__import__("sqlite3").connect(...)`, `statement.py` fixed honestly.
  - grader linter on the workspace: exit 0, no findings;
  - behaviour: `#7: 100.50 EUR + fee 0.05 EUR`, `/health` 200 `b'ok'`;
  - suite OK;
  - `invoices` modules are loaded after importing `ledger.report`.
- Fix target, design L2 check 2 (a), workspace-only (the learner's linter rules stay as printed):
  - the grader also rejects any call to `importlib.import_module`, `__import__`, `importlib.util.*` loaders, and
    `exec`/`eval` in workspace `src/` (the starter has none, checked by grep);
  - and/or a runtime probe in the learner-code subprocess: after importing every `ledger.*` module, no `invoices*`
    module is in `sys.modules`;
  - add the attack to "Must fail";
  - task.md "Готово, когда" names the rule (01 mistakes: task text equals the checks).

### B4. L3 `deps-gate` (b): vendoring a stub module, the I02 anti-pattern itself, passes
First-party is "a directory or a `.py` module directly under `<root>/src/`", computed from the workspace. A
learner (or their agent) who adds `src/fastjsonx.py` with `from json import dumps` turns `import fastjsonx` into a
first-party import. The grader's gate on the pristine allowlist finds nothing, and `to_json` output equals stdlib
`json`.
- Repro (L2 reference + empty allowlist + `src/invoices/export_json.py` with `import fastjsonx`):
  - grader gate (`ref_deps.py`): `D1 src/invoices/export_json.py:1: 'fastjsonx' ...`, exit 1;
  - after adding `src/fastjsonx.py`: exit 0;
  - `to_json(d) == json.dumps(d, sort_keys=True)`: `True`.
- The design's "Must fail" covers adding `fastjsonx` to the allowlist but not this.
- Fix target, design L3 check 2 part (b):
  - the grader's gate uses the pristine first-party set from `checks/data/` (`invoices`, `ledger`, `shared` per the
    L2 reference), not the workspace's;
  - and/or assert that `export_json.py` imports `json` and that no new top-level module or package appeared
    directly under `src/`;
  - add the vendored stub to "Must fail" and state the rule in task.md.

## Blocking, feedback channel and caps

### B5. L1 `rule-placement`: binary feedback with no cap is enumerable for a partially right learner
Section 2.5 treats every check whose message is binary as "nothing enumerable: no cap". That holds for randomised
roots. It does not hold for a fixed 12-card, 5-value key with a threshold of 11. Pass/fail is one bit per
submission, and near the threshold that bit is enough for a search. The design computes only the blind rate
(2.007e-7, reproduced). Greedy set-cover over the hypotheses still consistent with every failure
(`attacks/placement_adaptive.py`):
| Learner sure of | Certain pass after | P(pass) within 3 | within 10 |
|---|---|---|---|
| 10 of 12 | 5 submissions | 84.0% | 100% |
| 9 of 12 | 14 | 31.2% | 80.0% |
| 8 of 12 | 68 | 8.2% | 27.2% |
Uncapped, the effective bar is about 8 of 12 by persistence, not the stated 11 of 12.

Fix target, design 2.5 and L1 check 1:
- put `rule-placement` under the capped-check rule. It needs a never-reset failed-submission counter, a free stage 0,
  close as "не пройдено", the mentor rule, and a reserve of unseen cards with a key in
  `checks/data/reserve/rule-placement.yaml`.
- Choose the cap and record this table for it in the entry and the demo. I recommend 3, as for the quiz: it lets a
  learner sure of 10 of 12 pass most of the time and keeps 8 of 12 below 10%.
- Copy the stage-0 list into task.md, as for `failure-log`.

(This is the only feedback-channel finding. The L2/L3 per-theme counts run over randomised roots and cannot be
replayed as answers. The L4 messages name only values already in the visible brief. `failure-log` uses an aggregate
count plus a cap.)

## Non-blocking

1. L2 `arch-linter`: a line-anchored regex linter with no `ast` passes 20/20. The assessment map's claim that the
   near misses "only a resolved-import AST walk separates" is false today. O2 says "по AST". Repro:
   `attacks/line_regex_linter.py` (a `compile()` syntax gate, `^\s*import|from` regexes, relative resolution):
   `20/20 pass`. Adding four parser-only forms to `roots.py` (prototype `l2fix/roots.py`) makes it fail 20/20 while
   the reference still passes 20/20:
   - a multi-line string whose continuation lines are `import invoices` / `from invoices import models`;
   - `x = 1; import invoices`;
   - `import os, \` + newline + `sqlite3`;
   - `from invoices import (` newline `models,` newline `legacy_format,` newline `)`.

   Same for L3 `deps-gate`: `attacks/line_regex_deps.py` passes 20/20. Its roots also lack the 2.3 padding: the
   prototype pads with blank lines only. Treated as non-blocking because a careful regex linter is still a
   deterministic checker, and O3 does not say AST. I would make it blocking for L2 in round 2 if the map keeps the
   claim.
2. L3 hidden root `stdlib-and-first-party` puts `from __future__ import annotations` after `import json`. That is a
   SyntaxError for `compile()` but not for `ast.parse`. A linter that validates with `compile`/`py_compile` returns
   exit 2 on a root that should give 0. Put `__future__` first in the template, and define "does not parse" as
   `ast.parse` in task.md.
3. L3 `failure-log` arithmetic. The cap is "at most 10 counted failed submissions, then closed", so at most 10 scored
   submissions exist, not 11. The per-item-oracle bound for 8 incidents and >= 7 over 10 submissions is 0.81%, not
   1.39% (both recomputed exactly in `attacks/rates.py`). The 1.39% figure is conservative, but it drives the "only
   rate above 1%" risk (12.2) and the 10-incident fallback, which are then unnecessary. Correct 2.5, the L3 entry
   and 12.2. Blind 2.17e-9 is confirmed.
4. L1: the near miss "`old_api.py` renamed" fails only because `list_invoices_v0` is still defined. Renaming the file
   and the function passes (`PASS`, exit 0). It is not cheaper than deleting, so it is not a cheat, but it is a
   listed near miss. Also fingerprint the pristine `old_api` function bodies (normalised `ast.dump`) from
   `checks/data/`.
5. L4 prototype messages label `NODE_EXTRA_CA_CERTS` and `UV_DEFAULT_INDEX` failures as `K1` (one loop over
   `REQUIRED`). The design says messages name the rule, so these should say K3 and K4: an error message must not
   misinform. The accuracy review's L4 value changes (WEB_FETCH `true`, deny forms, `SSL_CERT_FILE`) will change the
   must-pass set. Re-run the 30 cases below after them.
6. L4 K6 leak scan reads files as text. If the workspace is a git repository with the starter committed, the token
   stays in compressed `.git/objects` and the scan cannot see it, which is the "committed and shared" lesson.
   Decide: ship the L4 starter without `.git`, or teach history and scan it.
7. Timeouts. L2 `arch-linter` runs 7 roots x 20 s plus the `lint-output` run (20 s), 160 s, against `timeoutSec 120`.
   L2 `arch-workspace-clean` runs 3 `make` probes x 120 s against 300. A slow learner script gets the runner's kill
   instead of a message. The check still fails closed, so this is not a pass path. Make the sum of per-run timeouts
   less than `timeoutSec`.
8. Answer artefacts ride forward into later starters. The L2 prototype starter ships L1's `placement.json`. Per
   section 5, L4's starter (the L3 reference) would ship `failure-log.json`, the answer to the capped check. This is
   safe only under the gating requirement of 2.5. Trim answer files that the next lesson does not use; it costs
   nothing. Also define "prerequisite done" as every check passed or closed.
9. `pnpm content:validate` was not run green: the worktree has no `node_modules` (`tsx: command not found`). At
   design stage there are no lesson files under `02-agentic-patterns/`, so the result would not bear on this review.
   The validate phase must run it.

Checked and fine:
- Rubrics: both have a blind demo plan (empty, reference, weak, borderline, injection), and no regex grades prose.
  The `Fix:` and `fix` field checks are form only.
- Every command check fails on its starter.
- Nothing from `checks/` is named in run strings or learner text.
- The quiz conventions match 01 2.1.
- The L5 bug-hunt rate is reproduced exactly.

## Residuals observed (out of scope, not blocking)
- (iii) per 2.8/12.1: the learner's linter can import the grader's `arch_rules.py` / `deps_rules.py` from the mount,
  found through the grader's argv, and pass `arch-linter` / `deps-gate`. It can also read `roots.py` /
  `roots_deps.py` and reproduce the expected sets. Closed only by runner isolation (00 2.5.3). Not tried, per the
  threat model.
- Usercustomize without `-I` is real (starter `verify_pokayoke.py`: exit 0 without `-I`, exit 1 with `-I`).
  The `-I` run string closes it.
- Caps, close-on-reveal and the mentor rule are platform residuals (#08/#10/#11), as in 00/01.

## Checked (every run, Python 3.12.13)
L1 `verify_placement.py`:
- starter: stage 0 fail, exit 1.
- reference: PASS.
- R09=memory: PASS.
- R08=check and R07=code: "не пройдено", exit 1.
- all values memory with tags kept: "не пройдено".
- R05 tag left: stage 0 fail.
- strip-tags attack: PASS (B2).
- blind rate: 2.007e-7, 2.0e-6 over 10.
- adaptive table: B5.

L1 `verify_pokayoke.py`:
- starter: stage 0 fail.
- reference: PASS.
- nocallers, varargs, default, kwunpack: stage 0 fail.
- arithmetic changed (swapbug): hidden fail.
- old_api emptied, renamed: fail. Test renamed to `_disabled_*`: fail.
- `os._exit(0)` atop `late_fee.py`: hidden fail.
- usercustomize: exit 0 without `-I`, exit 1 with `-I`.
- swap only: fail. Swap plus test edit: PASS (B1). Swap plus `unittest/` shadow: PASS (B1).
- old_api file and function renamed: PASS (non-blocking 4).

L2 `verify_arch.py`:
- stub (3 runs): every root fails.
- reference: 20/20 PASS.
- regex, no-relative, filename, noqa, end_lineno, tree.body, syntax-exit-1, no-Fix: each 0/20, with the counts the
  design records.
- line-anchored regex linter: 20/20 PASS. With the 4 added forms: 0/20, reference still 20/20 (non-blocking 1).

L2 `verify_make_check.py`:
- starter: fail (clean probe exit 2).
- reference with a `check` target: PASS.
- `check: test`, `|| true`, `-` prefix: fail (a1 probe exit 0). `check: true`: fail.
- reference without a >= 3.10 `python3` on PATH: fail (the 2.4 trap reproduced).

L2 workspace (a)/(b): the dynamic-import evasion passes the grader linter and the behaviour probes (B3).

L3 `verify_deps.py`:
- reference: 20/20.
- w1 handlist through w7 lenient allowlist: each 0/20, with the recorded counts.
- regex gate: 20/20 PASS (non-blocking 1). With `compile()`: exit 2 on the `__future__` root (non-blocking 2).
- vendored `src/fastjsonx.py`: grader gate exit 0, `to_json` equal (B4).

L3 `verify_failure_log.py` (prototype key, 10 incidents):
- starter: stage 0. Key: PASS. Alternative layers: PASS. One wrong: PASS.
- two wrong: "2 из 10 разборов неверны".
- empty fix: stage 0. NaN: stage 0.
- rates for the design's 8 incidents: blind 2.17e-9; oracle bound 0.81% over 10 (1.39% over 11).

L4 `verify_contour.py` (with `dotclaude/` paths, as the architect ran it):
- starter: fail. Reference: PASS.
- all 19 design must-fails fail with their rule.
- the 5 design must-passes pass.
- judge probes:
  - pass: allow+deny both, extra sandbox keys, CRLF, token split across comment lines;
  - fail: user `env` with `ANTHROPIC_BASE_URL`, duplicate allowedDomains.

L5: block enumeration re-derived: best allocation (1, 2, 2, 2), 0.3086% per attempt, 0.9231% over 3. Confirmed.

`pnpm content:validate`: not runnable in this worktree (no `node_modules`), non-blocking 9.

FAIL
