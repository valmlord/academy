# #41 design review, round 4: judge-accuracy

Design: `plans/41-module-spec-driven-development-design.md` (revision 5). Scope: only what revisions 4 and 5
changed (sections 16, 17 and the text they point to: 2.3, 2.5, 2.6, 2.7, 2.8 items 1-4 and the generator
guard, 2.10 items 7-10, L1/L5/L7 cap items, L1 `stop-hook-tests`, L4 near-miss, 11.13). Reviewed 2026-10-29.
Verdict: FAIL, 1 blocking item, 3 non-blocking.

No shell was available to this judge. Python behaviour was checked by reading the prototype sources
(`scratch/m3/probes/harness.py`, `hooks/template_eval_all.py`, `run_static.py`, `run_r5.sh`, `run_r5.out`,
`dist_check_r5.out`, `m3/grader.py`, `m3/linux_r4.out`, `m3/yaml_typed.py`) against CPython's unittest
semantics. The arithmetic was recomputed by hand.

## Round-3 non-blocking items: all applied correctly
- **N1 (MADR typed rule).** 2.3 lines 92-94 and 2.7 lines 363-364 now apply the typed rule only to `status`
  in MADR front matter. L4 near-miss lines 1154-1156 add `date: 2026-10-29` unquoted "as MADR-T writes it".
  The other MADR-T keys (`decision-makers`, `consulted`, `informed`) fit the key regex `[a-z][a-z0-9-]*`. Their
  filled values start with no indicator character. Correct.
- **N2 (`-B`).** 2.8 line 439 runs `python3 -I -B P/.claude/hooks/stop_tests.py`, and `harness.py:184` matches.
  2.3 lines 66-68 are scoped to "the processes the grader starts" and name the unittest child, which may write
  `__pycache__` inside P. That is accurate: `-B` binds one interpreter only, and the child runs without `-I`.
- **N3 (`fd/`).** 2.10 item 7 (line 630) says "`fd/` not listable (the probe's `glob` returned nothing)".
  Correct.
- **N4 (YAML wording and count).** 2.3 lines 110-112 and 2.10 item 9 now read: "`y`, `n` (YAML 1.1 booleans),
  `1.5e3` (a YAML 1.2 float) and `2026-1-2` (typed by neither; the rule's date pattern is broader)". That
  matches yaml.org/type/timestamp: the date-only form needs two digits for month and day. `yaml_typed.py` holds
  40 + 3 = 43 values, wraps `safe_load` in `try/except yaml.YAMLError`, and has `=` in `TYPED`, so "43 values,
  `=` rejected, raises `ConstructorError`" is consistent. (`ConstructorError` is a `YAMLError` subclass.)

## New claims verified
- **Trailing whitespace (2.3, assessment N6).** A plain scalar cannot end in white space; YAML excludes
  trailing spaces from the scalar. PyYAML's `scan_plain` stops at the spaces, so `k: 2026-10-29 ` resolves to
  a timestamp (`date`). `yaml_typed.py:23` applies `rstrip(" ")` before `TYPED`, which matches the stated rule.
  Tabs are rejected earlier by the "a tab" rule, so stripping only spaces is consistent. Correct.
- **`PR_SET_DUMPABLE` on the grader (2.3, 2.6, 2.10 item 7).**
  - `grader.py:3-6` calls `ctypes.CDLL(None).prctl(4, 0, 0, 0, 0)` before it imports or holds anything else,
    and checks the error. `PR_SET_DUMPABLE` is 4.
  - `linux_r4.out`: `uid=1000 yama=absent`; (A) `PermissionError ... '/proc/40/maps'`; (B) 12/12
    `PermissionError ... '/proc/45/mem'`; `cmdline=python3 grader.py A ...` readable; honest (B) and
    reference (A) PASS. This matches the design text word for word.
  - Mechanism, as in round 3: PR_SET_DUMPABLE(2const) says that "If a process is not dumpable, the ownership
    of files in the process's /proc/pid directory is affected". ptrace(2) access mode step 4 denies a non-root
    caller when "dumpable" is not 1. `cmdline` stays readable, as stated.
  - The design correctly has the server and the bootstrap set themselves non-dumpable as well. Children
    inherit nothing useful from the grader's flag, because an ordinary `execve` resets "dumpable" to 1.
- **The four probe templates (2.8 item 4) and unittest's output.** Read in `harness.py:42-145`.
  - **Import-time failures.** `TestLoader._find_test_path` wraps `_get_module_from_name` in a bare `except:`
    and turns any exception into `_make_failed_import_test`. So `AttributeError` (T1 `getattr`, T2 `getattr`),
    `ModuleNotFoundError` (T3, `importlib.import_module("invoices._m<n>")` with the parent package present, so
    "No module named 'invoices._m<n>'") and `KeyError` (T4 `vars(...)["_a<n>"]`) each become one error. It is
    shown as `ERROR: tests.test_<b> (unittest.loader._FailedTest.tests.test_<b>)` with "ImportError: Failed to
    import test module: tests.test_<b>" and the original traceback. That matches 2.10 item 2.
  - **Raised `AssertionError` (T3).** `_Outcome.testPartExecutor` catches it, and `_addError` routes it to
    `addFailure` because `issubclass(exc, test.failureException)` (`failureException = AssertionError`).
    So it is `FAIL:`, counted as a failure, the same as `assertEqual` (T1, T2) and `assertTrue` (T4).
  - **Fixture reads.** `open()` (T1-T3) and `Path.read_text()` (T4) on an absent file raise
    `FileNotFoundError: [Errno 2] No such file or directory: ...` (an error), so every red probe carries the
    missing-file phrase. The helper `tests/_x<hex>.py` (T2) and `tests/fixtures/d<hex>.json` (T3) do not match
    `test*.py` and are not collected.
  - **Counts.** Each red project has 1 failure + 2 errors, plus passing tests, so "FAILED (failures=1,
    errors=2)" for every template is correct. On green all pass ("OK").
  - **One hash function.** The four `h` spellings compute the same value (`digest()[:4]` big-endian equals
    `int(hexdigest()[:8], 16)`; the T3 loop is the same fold). This matters for blocking item 1.
- **Probabilities.**
  - 1 − 4(3/4)^19 + 6(1/2)^19 − 4(1/4)^19 = 0.9831, and for K = 8 = 0.478.
  - (5/8)^18 = 1/4722, (3/4)^18 = 1/177, (7/8)^18 = 0.090.
  - 19 templated probes (18 + the active one) agrees with `harness.rows()`.
  - Cap figures: 10/18564 = 0.0539%, 10/38760 = 0.0258%, 10/46656 = 0.0214%; after isolation 0.0106%,
    0.0049%, 0.0038%.
  - 1.07% / 18.3% / 86.5% follow from 1/926, 1/50, 0.182. On where those three come from, see blocking 1.
  - The 4 sd band 0.5 + 4·sqrt(0.25/2000) = 0.5447 is correct. `dist_check_r5.out` matches 2.10 item 10
    exactly (0.5225 / 0.5180 / 0.5185 / 0.5245; 440, 419, 578, 429 features).
  - `run_r5.out` matches 2.10 item 8: 54/54; R 9 / G 11; `static_off` 0/20, 182; `counter_grep` 2/2 and 0/20;
    `static_ast` 0/30, 75/540; k1-k3 0/100 0.6378, 2/100 0.7456, 28/300 0.8735; memory 0/300, 323/1800.
- **Cap wording vs module 00 2.5.6** (`plans/15-module-introduction-design.md` lines 281-306).
  - 00 says: "at most 10 failed scored submissions, then the check is closed as "не пройдено" with a mentor
    review; a run rejected for format errors before any key comparison does not count. The failed-submission
    counter is never reset"; "suggest the mentor after 5 failed submissions".
  - 41 2.5 and the L1 (item 6), L5 (item 6) and L7 (item 4) task items say the same thing. "Reached the hidden
    runs" plays the role of 00's "before any key comparison". "At most 10 ... after the 10th it closes" means
    10 counted attempts, which is what the 10x rates assume. Consistent.

## Blocking
1. **[design 2.8 lines 466-467, 499-501; 11.13 row (iv) and line 1548-1549; section 17] "a static evaluator
   written for one [template] shares no parsing with another", "on a template it was not written for it is
   left with a guess", S = 1/2/3 rates 1/926, 1/50, 0.182 (1.07%, 18.3%, 86.5% within the cap) as the "best
   strategy", and "What the decisions buy: (iv) for a learner who copies one or two templates is 1.07% or
   18.3% within the cap instead of about 1".**
   What is actually true (`harness.py:42-145`):
   - All four templates evaluate the same `h(s) = int(sha256(s).hexdigest()[:8], 16) % 10**4`.
   - Every template's P holds `tests/fixtures/f<j>.json`, whose name carries `j` in plain digits
     (`render()` line 133, for every `t`).
   - Every template also holds seed `sb` as a 16-hex literal somewhere under `tests/` (T1/T4 `_h("<sb>"...)`,
     T2 helper `h("<sb>")`, T3 `d<hex>.json` `seeds`).
   - Green holds iff `h(sb) == j`; on red the sampler guarantees `h(sb) != j`.

   So a template-agnostic hook decides every template with no parsing and no unittest run:
   - Compute `h` over every `[0-9a-f]{16}` string in `P/tests`, and compare with the number in the single
     `tests/fixtures/f*.json` name.
   - Equal for some string means green, else red. Equivalently: some seed hashes to the `_a<m>` /
     `_m<m>` number in `src/invoices`.

   It is wrong only when another seed (`sa`, `sc`) happens to hash to `j`, about 2 in 10^4 per red probe, so a
   full pass is about 0.998 per submission (estimate; to be observed). It needs only `h` and the fixture
   naming, which any one copied template shows. One copying submission shows at least one template with
   probability 1, against 0.983 for all four.

   Hence:
   - Row (iv) is about 1 within the cap for any S >= 1 and any K.
   - The S = 1-3 rates describe only template-specific evaluators, not the best attacker.
   - "More templates only buy copying submissions" overstates even that: one copy suffices.
   - K = 4 raises no bar for this attacker. It only defeats attackers who write per-template parsers.

   Secondary point, in the same rows: the 1/926, 1/50, 0.182 labelled "exact, ... best strategy" equal
   `(Σ_k C(3,k) s^k (1−s)^{3−k} c_k)^6` with c = 1/6, 1/3, 2/3, 1. That is the non-causal bound: it assumes the
   hook sees the states of all three probes of a class before deciding the first. The hook decides
   sequentially, so the causal optimum is `((1+s)/2 · (s² + 4s(1−s)/3 + (1−s)²/3))^6` = 1/1074, 1/64 and 0.150
   for s = 1/4, 1/2, 3/4 (0.93%, 14.6%, 80.4% within the cap). Example: with probe 1 unknown and probes 2-3
   known, causal gives 1/2 and the bound gives 2/3. The stated figures are upper bounds (safe side), not exact.

   Required (curriculum-architect; this changes the basis of Stepan's revision-5 decision, so it goes back to
   him):
   - (a) Add the template-agnostic `hash_match` hook to 2.10 item 8 as an observed row on the K = 4
     generator, base EMPTY skeleton, so its rate is recorded, not estimated.
   - (b) Correct 2.8 ("left with a guess" holds only for evaluators keyed to a template's syntax; a hook that
     hashes every seed-shaped literal and compares with the plain-digit fixture or module number decides
     every template).
   - (c) Correct 11.13 row (iv) and its "What the decisions buy" sentence: about 1 within the cap for any
     learner who copies P once, for any K. Relabel the S-rates as rates against template-specific evaluators,
     and mark them as non-causal upper bounds (or replace them with the causal figures above).
   - (d) Re-present the K = 4 decision to Stepan with this. K = 1 gives the same protection against a copier
     at less grader code. Closing (iv) would need either runner isolation (no copy out of P), or a state that
     no static computation over P's files can decide, which a project whose tests are deterministic cannot
     have.

   No change to (iii), to the guessing rows, or to the conclusion that deliberate cheaters are about 1 until
   runner 2.5.3.

## Non-blocking
1. **[L1 `stop-hook-tests` lines 902-904] Stale figures.** The text says `static_off` "observed 0/40" and
   `static_ast` "observed 0/70, 0.488 of red/green probes right". Those are the revision-4 single-template
   runs. On the revision-5 generator they are 0/20 and 0/30 with 75/540 = 0.139 (2.10 item 8, `run_r5.out`).
   Label them by revision, or cite both.
2. **[2.10 item 8, section 17] Unrecorded runs.** "knowing all 4 (`template_eval_all`) VERDICT PASS 10/10,
   180/180" and the per-template smoke run ("FAILED (failures=1, errors=2)", "OK") appear in no output file.
   `run_r5.sh` does not run them, and nothing under `m3/` matches `template_eval_all` or `errors=2` in a
   `.out`. The hook source (`hooks/template_eval_all.py`) makes 10/10 plausible, and the unittest semantics
   above confirm the smoke-run text. Still, add both to `run_r5.sh` and record them in `run_r5.out`, as
   section 17 says "Runs recorded in 2.10".
3. **[2.8 item 2, line 458] Wording.** "`m` (the attribute `_a<m> = 1` in `src/invoices/__init__.py`)" holds
   for T1, T2 and T4. In T3, `m` names the submodule `src/invoices/_m<m>.py`, and `__init__.py` is empty
   (`harness.py:142`). Write "the import-time target named by `m` (attribute `_a<m>` or, in T3, submodule
   `_m<m>`)".

Attribution: blocking 1 is curriculum-architect (the design's claims and rates; the prototype was built to
the design and faithfully shows the shared `h` and plain-digit `j`). Lesson appended to
`.claude/feedback/curriculum-architect_mistakes.md`.

FAIL
