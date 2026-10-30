# #42 design review, round 2: assessment

Reviewer: judge-assessment. Object: `plans/42-module-agentic-patterns-design.md` revision 2 (sections 2.3-2.8, 5,
6, 11-14) and the architect's revision-2 prototypes. Work copy:
`/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-content-42-agentic-patterns-887a63/125c1dde-b820-4900-9718-4642a84705b5/scratchpad/judge-r2/`
(`arch2/` = copy of the architect's `arch2/` with harness paths repointed; `attacks/` = my round-1 attacks; `att/` =
round-2 attacks). Interpreter `/opt/homebrew/bin/python3.12` (3.12.13), `env -i PATH=<pybin python3 -> 3.12>:/usr/bin:/bin`,
`python3.12 -I <verifier>` on a fresh `mktemp -d` copy (`arch2/case.sh`, `arch2/n20.sh`, `arch2/l4/cases.sh`).
Threat model judged against: the orchestrator default (= design 2.8).

Verdict: FAIL, 3 blocking items. All three are round-1 findings (B2, B3, B4) whose revision-2 closure is incomplete.
Each closure lists forms instead of observing the effect. For each I prototyped a fix that is stricter by
construction and ran it green against the reference and every attack (paths below), so the next revision can be
checked mechanically.

Round-1 items B1 (`statement_line` probe and grader runner) and B5 (cap 3 and search table) are closed. So are
non-blocking items 1-8: parser-only forms 0/20, `__future__` first, rates, fingerprint, rule ids, no `.git`, answer
trimming. The only exception is the L3 timeout sum (N2 below).

## Blocking

### B1. L1 `rule-placement` stage 0: moved rule texts can still stay loaded as memory (round-1 B2 not closed)
s2-s5 close the round-1 forms: tags stripped, `CLAUDE.local.md`, `AGENTS.md`, `.claude/rules/`, plain `@docs/rules.md`,
verbatim texts. The forms below still pass. Base for every case: key-correct `placement.json`, then
`att/l1_md.py <form>`.

(a) Import detection. s2 uses `(^|\s)@[^\s`]` after deleting backtick spans.
- `**Rules:**@docs/rules.md` -> `counted: PASS`.
- `<!-- rules -->@docs/rules.md` -> PASS.
- `@docs/rules.md` in its own paragraph, after a line with an unbalanced backtick (the stripper eats across lines)
  -> PASS.

In each case `docs/rules.md` holds all ten moved rule texts. The #41 accuracy and assessment reviews established that
Claude Code imports `@` glued to Markdown, because its regex runs on marked text tokens (judge_mistakes 2026-10-30).

(b) Tagged lines are unbounded, and s5 matches raw characters. Every case below puts all ten moved rules on extra
lines tagged `[R03]`:
- each word with a zero-width space -> PASS;
- Cyrillic а/е/о for Latin -> PASS;
- verbatim text with a `[R03]` token every 3 words -> PASS;
- one `[R03]` line paraphrasing all ten rules -> PASS.

The last case contradicts 12.2 ("s4 bounds it" to 3 rules): s4 counts untagged lines only. The cap-3 decision was
accepted on that bound.

Fix target, design L1 check 1, stage 0 (and task.md items 2-5):
- s2: reuse module 01 L2's import rule (`verify_skills.py` `IMPORT_TOKEN`). Any `@` that does not follow an
  alphanumeric and is followed by a non-space is an import. The whole file is scanned, code spans and fences
  included. It is already demonstrated against the marked corpus (0 missed).
- s3: each memory tag on exactly one line, at most one tag per line, and a tagged line at most its pristine word
  count + 10.
- s5: NFKC first. Any Unicode `Cf` character fails stage 0, and so does any word mixing ASCII letters with
  non-ASCII letters. Tags are removed before normalising.
- Add the seven forms above to "Must fail".
- Correct 12.2: the residual paraphrase is bounded by 3 untagged lines plus 10 words per memory line.

Prototype: `judge-r2/arch2/l1/verify_placement_fix.py`. All 7 forms fail. Key, key+R09 `memory`, one paraphrased
untagged line and a Russian untagged note all PASS. Strip, partial and plain import still fail.

### B2. L2 `arch-workspace-clean` (w1)/(w2): A1 evaded with `runpy` or `exec` of the file text (round-1 B3 not closed)
w1 bans `importlib`, `__import__`, `exec`, `eval`, `compile` as names. w2 checks that no `invoices*` key is in
`sys.modules`. Code that runs `src/invoices/money.py` without registering a module passes both. Base: reference,
`src/ledger/report.py` replaced:
- `att/runpy_report.py`: `import runpy`, then
  `format_cents = runpy.run_path(os.path.join(os.path.dirname(__file__), "..", "invoices", "money.py"))["format_cents"]`
  -> `PASS | exit=0`. Also PASS with the starter `money.py`, which holds the definition.
- `att/exec_report.py`: `vars(builtins)["ex" + "ec"](open(<…/invoices/money.py>).read(), ns)` -> `PASS`.
- For contrast, `__builtins__["__import__"]("invoices.money")` is caught by w2.

`runpy` is a plain stdlib import with no string tricks, and it costs the same as the honest A1 fix. That is exactly
the "make the linter green" evasion O2 excludes.

Fix target, design L2 check 2 (w2) and task.md item 5:
- Observe execution, not `sys.modules`. Install an audit hook, `sys.setprofile` and `threading.setprofile` before
  `import ledger`.
- While every `ledger` module is imported and `entry_lines` runs, fail on any of:
  - an `open` audit event whose real path is under `src/invoices/`;
  - an `exec` event whose code `co_filename` is under `src/invoices/`;
  - any executed frame whose `co_filename` is under `src/invoices/`.
- Reword item 5 as "importing every ledger module and calling it executes no code from `src/invoices/` and reads
  none of its files".
- Add `runpy.run_path` and string-built `exec` to "Must fail".

Prototype: `judge-r2/arch2/l2/verify_workspace_fix.py`. runpy, exec and `__builtins__[...]` fail; the reference PASS;
`format_cents` copied into ledger PASS.

### B3. L3 `deps-gate` (b): the vendored `fastjsonx` stub still passes in three forms (round-1 B4 not closed)
"No new `.py` under `src/`" is the letter of the rule, not its effect. Base: L3 reference.
- Sourceless `src/invoices/fastjsonx.pyc` (`py_compile` of a 3-line stub) + `from . import fastjsonx` in
  `export_json.py` -> `PASS`. The relative import is first-party, and `.pyc` is not `.py`.
- `class fastjsonx: dumps = staticmethod(json.dumps)` appended to the existing `src/invoices/money.py` +
  `from .money import fastjsonx` -> `PASS`.
- `sys.modules.setdefault("fastjsonx", json)` appended to `src/invoices/__init__.py`, and `export_json.py` reads
  `sys.modules["fastjsonx"]` -> `PASS`.

Each is the I02 anti-pattern (a stand-in for an invented package) that the entry's "Must fail" claims to reject. An
agent told "no new .py under src/" can produce exactly the second form.

Fix target, design L3 check 2 part (b) and task.md item 5:
- No new file of any extension under `src/` except `__pycache__/` (pristine list).
- The string `fastjsonx` (case-insensitive bytes) is in no file under `src/`.
- Runtime: in the probe, take a `sys.modules` baseline, import every first-party module, call `to_json`. No new
  top-level module name outside `sys.stdlib_module_names` ∪ {`invoices`, `ledger`, `shared`} may be added. The
  baseline matters: system site `.pth` hooks, such as `_distutils_hack`, load before the probe.
- Add the three forms (and the string-built alias `"fast" + "jsonx"`) to "Must fail".

Prototype: `judge-r2/arch2/l3/verify_deps_ws_fix.py`. All three forms and the string-built alias fail; the reference
PASS; the starter fails.

Attribution: curriculum-architect, as the design and prototype author; lesson appended to
`.claude/feedback/curriculum-architect_mistakes.md`. In part the fault is mine: round-1 B4 prescribed "no new
top-level module or package under `src/`", a form rule. I recorded that lesson in `.claude/feedback/judge_mistakes.md`.

## Non-blocking (practice-designer / architect)

1. **L2 `arch-linter` duplicate findings, and a message that misinforms.** The verifier fails on duplicate
   `(rule, path, line)` triples but reports `код 1, пропущено 0, лишних 0, строк не по форме 0`. A linter that prints
   one line per matching module name gives exactly that, 0/5 seeds (`att/per_name_linter.py`). The printed rules say
   only "two rules give two lines".
   - task.md: "one line per statement and rule, however many imported names match".
   - Message: add "повторов N".
2. **L3 timeout arithmetic.** `deps-gate` states "timeoutSec 120 (5 runs x 12 s + workspace probe 20 s + suite 45 s)".
   That sum is 125 s, which breaks 2.3's own rule. Use 150, or cut the suite to 40 s. It fails closed, so it is not a
   pass path.
3. **Suite runner details.** The L3 prototype suite does not record `skipped` or `unexpectedSuccesses`, while design
   2.3 requires both. None of the three prototypes counts `expectedFailures`. Reference + a pristine L2 test decorated
   `@unittest.expectedFailure` -> PASS. Count expected failures of pristine tests as failures. The behaviour probes
   cover today's graded behaviour, so this is defence in depth.
4. **w1 bans the attribute `compile`, so `re.compile` in `src/` fails (w1).** It is named in task.md item 4, so it is
   not a silent trap, but it is a needless false positive. Ban the builtin name `compile` and `builtins.compile` only.
   B2's runtime probe is the real closure.
5. **w2 sqlite3 attribution.**
   `ThreadPoolExecutor().submit(repository.sqlite3.connect, ":memory:", check_same_thread=False)` in `api.py` passes,
   because a worker thread has no `src/` frame (`att/thread_api.py`). It needs knowledge of the probe mechanism, so it
   is not cheap. Still, closing it costs one line: a connection with no `src/` frame on the stack also counts as bad.
6. **L4 forms the check accepts while the effect is wrong.** None gives a pass advantage, none is planted, and an
   honest learner is unlikely to write any of them.
   - Deny `"W*"` or `"*e*"` (also removes Write/Read/Edit): PASS. Accept only globs that match no built-in tool other
     than WebSearch and WebFetch.
   - `disableAllHooks: true` in local settings (the brief keeps the hooks): PASS. Add it to N4.
   - `UV_INDEX=https://pypi.org/simple` next to the mirror default: PASS. Optional, since the design lists `UV_INDEX`
     as not graded.
7. **Prototype vs design drift for the demo.** The demo must use the design's key and order.
   - `arch2/l3/data/failure_key.json` has 10 incidents (I06 and I09 are reserve in the design), and I10 = `delete,
     code`, while the design has `delete, code, memory`.
   - `verify_lint_output.py` compares ordered lines; the design says multiset.
8. **L1 wording.** "An honest learner one card short passes most of the time" (84%) describes a learner sure of 10 of
   12. A learner sure of 11 passes on the first submission. Say "sure of 10 of 12".
9. **L1 s2 other context channels.** A SessionStart hook or an output style can also inject the rules, as
   `.claude/settings.json` hooks or `.claude/output-styles/`. Neither is cheaper than deleting the lines. Optional
   closure: `.claude/` must equal the pristine copy in L1, since L1 changes no settings.
10. **`pnpm content:validate`** is still not runnable in this worktree (`tsx: command not found`, no `node_modules`).
    `02-agentic-patterns/` holds only `module.yaml`, so the result does not bear on the design. The validate phase
    runs it.

## Residuals (out of scope per 2.8, not blocking)
- (iii) A learner linter importing the grader's `arch_rules.py` or `deps_rules.py` from the mount, or reading
  `roots.py` / `roots_deps.py`, passes L2 and L3. Not tried.
- (iv) Reading `checks/data/` (placement key, statement grid, pristine sets). Not tried.
- `-I` keeps `usercustomize` out (starter run below), while a system `sitecustomize` still loads (00/01 convention).
- Caps, close-on-reveal, the mentor rule and prerequisite gating are platform residuals (#08/#10/#11).

## Checked (every run, Python 3.12.13)
Re-run of round-1 attacks on revision 2:
- r1 B1, L1 swap + test expectation edited -> `hidden: statement_line считает пеню неверно`, exit 1. Closed.
- r1 B1, swap + root `unittest/` stub -> same message, exit 1. Closed.
- r1 B2, tags stripped -> `stage0 ... 10 строк без метки`. Texts to `CLAUDE.local.md` / `AGENTS.md` -> stage0 s2.
  Closed for these forms (B1 above for the rest).
- r1 B3, `importlib.import_module` + `__import__("sqlite3")` -> `(w1) ... api.py:14`. Closed for this form (B2 above).
- r1 B4, `src/fastjsonx.py` -> `(b) новый файл .py`. Closed for this form (B3 above).
- r1 B5: `placement_adaptive.py` re-run -> 84.0% / 31.2% / 8.2% within 3; certain after 5 / 14 / 68. Hand check for
  sure-of-10: 9/25, 16/25, 21/25 = 0.84.
- r1 NB1: line-regex linter 0/20 (L2) and line-regex gate 0/20 (L3).
- r1 NB2: `compile()` gate 20/20.

Section 11 rows re-run:
- Rows 1-3, L1 placement:
  - starter: s1;
  - key: PASS; R09 `memory`: PASS;
  - R08 `check` + R07 `code`: "не пройдено"; all `memory`: "не пройдено";
  - strip: s4; `CLAUDE.local.md`, `AGENTS.md`: s2; plain import: s2; 4 untagged: s4; R04 phrase: s5;
  - untouched CLAUDE.md: s3; R05 tag kept: s3;
  - one paraphrased line: PASS.
- Rows 6-9, L1 poka-yoke:
  - starter: signature; reference: PASS;
  - nocallers: 11 places; varargs, default: sig; `**` unpack: 1 place;
  - swapbug: "считает иначе"; old_api emptied: "удалён"; renamed: remnant; renamed both: fingerprint `rows.py`;
  - test renamed: 1 test; test skipped: "не все стартовые";
  - keepswap: `statement_line`; keepswap + shadow: `statement_line`;
  - `os._exit(0)`: "не выполнились"; reference + shadow: PASS;
  - usercustomize on the starter (`-I`): stage0, exit 1.
- Row 12, L2 `verify_arch.py`, 20 seeds each:
  - ref 20/20;
  - stub, w1 regex, w2 no-relative, w3 filename, w4 noqa, w5 end_lineno, w6 tree.body, w8 syntax exit 1, w9 no Fix,
    judge's line-regex linter: each 0/20.
- L2 `verify_lint_output.py`: generated -> PASS; reference without the file, line dropped, stub linter -> fail.
  `verify_make_check.py`, reference -> PASS.
- Rows 14-16, L2 `verify_workspace.py`:
  - starter: (a) 3; reference: PASS;
  - r1 dyn: w1; `getattr(builtins,"__imp"+"ort__")`: w2; `import _sqlite3`: w2; `repository.sqlite3.connect` in
    api: w2;
  - statement on `money_str`: (a); `report.py` deleted: (b);
  - `check: test`, `|| true`, `-` prefix, `check: true`: (d) violation probe 0;
  - `os._exit(0)`: (b); root `unittest/` shadow: (d) red-test probe 0.
- Rows 19 and 21, L3:
  - `verify_deps.py` ref 20/20; w1-w7 each 0/20; compile gate 20/20; line-regex 0/20;
  - `verify_deps_ws.py`: starter D1; reference PASS; `src/fastjsonx.py`, `src/fastjsonx/__init__.py`,
    `src/invoices/fastjsonx.py`: new file; allowlist + fastjsonx: D1; try/except fallback: D1; no `sort_keys`: (b);
    `os._exit(0)`: (b); a new `.json` file under `src/`: PASS.
- Row 23, rates recomputed exactly for keys (2,2,1,2,2,1,1,3)/36, >= 7 of 8: blind 3.1477e-9, per-item-oracle over
  10 = 1.0208%. Matches. L1 blind 2.00704e-7, 6.02e-7 over 3. The hill-climb figure was not re-run.
- Row 24, L4 `cases.sh cases.txt`: 70/70 as expected.

New attacks, revision 2:
- L1 (`att/l1_md.py`), each on the original verifier (O) and on the prescribed `verify_placement_fix.py` (F):

  | Attack | O | F |
  |---|---|---|
  | zwsp | PASS | fail Cf |
  | homoglyph | PASS | fail mixed script |
  | tagsplit (3) | PASS | fail one tag per line |
  | paraphrase tagged | PASS | fail +10 words |
  | `**Rules:**@` | PASS | fail import |
  | backtick-spanning import | PASS | fail import |
  | `<!-- -->@` | PASS | fail import |
  | nbsp | fail s5 | |
  | `.claude/CLAUDE.md` | fail s2 | |

  F also: key PASS, R09 `memory` PASS, paraphrased untagged line PASS, Russian note PASS.
- L2 (`att/`), on the original verifier (O) and on `verify_workspace_fix.py` (F):

  | Attack | O | F |
  |---|---|---|
  | `runpy_report.py` | PASS | fail w2 |
  | `runpy_report.py`, starter `money.py` | PASS | |
  | `exec_report.py` | PASS | fail w2 |
  | `builtins_sub_report.py` | fail w2 | fail w2 |
  | `thread_api.py` | PASS (N5) | |
  | `re.compile` in `accounts.py` | fail w1 (N4) | |
  | `expectedFailure` | PASS (N3) | |

  F also: reference PASS, `format_cents` copied into ledger PASS.
- L2 `per_name_linter.py`: 0/5, message all zeros (N1).
- L3 on the original verifier (O) and on `verify_deps_ws_fix.py` (F):

  | Attack | O | F |
  |---|---|---|
  | `.pyc` | PASS | fail |
  | `money.py` class stub | PASS | fail |
  | `sys.modules` alias | PASS | fail |
  | string-built alias | | fail |

  F also: starter fails, reference PASS.
- L4 (`att/l4att.txt` via `cases.sh`), 16 cases:
  - fail as expected: empty URL in local env (G1); local `NODE_EXTRA_CA_CERTS` (N1); local provider on (N2);
    local `sandbox.enabled false` (G7); local helper (G2); local token (G2); user `WebFetch(domain:pypi.org)` allow
    (G7); WEB_FETCH overridden to 0 by project (G6); launcher BOM (N3);
  - pass as expected: launcher provider on with project env 0; WEB_FETCH env in user only; hooks `{}` in local
    (hooks merge, my expectation was wrong);
  - pass where the effect is wrong (N6): `W*`, `*e*`, `disableAllHooks`, `UV_INDEX` public.
- `pnpm content:validate`: `tsx: command not found` (N10).

FAIL
