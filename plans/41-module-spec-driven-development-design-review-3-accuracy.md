# #41 design review, round 3: judge-accuracy

Design: `plans/41-module-spec-driven-development-design.md` (revision 3). Scope: only what revision 3 changed or
added (section 15, 2.3, 2.6, 2.8, 2.10 items 7-9, L1, L2 chain rule, L4 sources, section 9). Reviewed
2026-10-29. Verdict: PASS. No blocking items, 4 non-blocking.

## Checked against primary sources (fetched live 2026-10-29)

- **`-I` and the hook child (L1 task.md "Что в рабочей папке", 2.8).** Python 3.12 cmdline docs: `-I` "Run
  Python in isolated mode. This also implies -E, -P and -s options ... All `PYTHON*` environment variables are
  ignored, too". `-E`: "Ignore all `PYTHON*` environment variables, e.g. PYTHONPATH". So "`-I` ignores every
  `PYTHONPATH` entry, so `invoices` under `src/` stops importing" is correct. Under `-P`, `python -m` does not
  prepend the cwd, but `discover -t .` inserts the top-level dir itself, so the `tests` package still imports
  and only `invoices` fails. That matches the observed "Ran 2 tests ... FAILED (errors=2)" (2.10 item 1, and
  `with_I.err` from round 2). "The checks and E3 run one known script that imports nothing from the project" is
  consistent with `-I` also dropping the script's directory from `sys.path`.
- **`-B`.** Docs: "If given, Python won't try to write `.pyc` files on the import of source modules". It holds
  for the server and bootstrap: the variant goes through `compile`+`exec` from memory, and the learner test file
  is imported under `-B`. See N2 for the hook probes.
- **Reconciling exit-code sentence (L1 theory, pedagogy N7 / accuracy B5).** H outcome table, "Any other exit
  code" column, valid JSON row: "Success. Claude Code ignores the exit code, and the fields alone decide. For
  hooks whose failure blocks the action, the run counts as a failure instead". Also "Exit code 1 without valid
  JSON output is a non-blocking error unless the hook is one whose failure blocks the action". `onFailure` "has
  no effect" on "`Stop`, `SubagentStop`, `TaskCompleted`, and `TeammateIdle` hooks". 00 L6 theory.md:95-97 says
  "Exit 1 ... не блокируют ... Хуки по умолчанию fail open. Fail closed даёт `"onFailure": "block"`". So "in 00
  L6, exit 1 не блокирует meant exit 1 without JSON; for this Stop hook, with a valid JSON `decision: "block"`,
  CC ignores the exit code and the fields alone decide" is correct. 00 L6's own "по умолчанию" covers the
  `onFailure` case. Optional: add "и без `onFailure: \"block\"`" to the 00 L6 half.
- **Stop missing-file exception.** It is re-read and unchanged: "when your hook exits 2 with nothing on stdout
  and its stderr says a file is missing, such as `No such file or directory`, Claude Code treats the run as a
  non-blocking error". The new 2.10 item 8 row (raw forward fails on every red probe) is consistent with every
  red P containing the fixture `FileNotFoundError`.
- **`PR_SET_DUMPABLE`, `/proc`, Yama (2.6, 2.10 item 7).**
  - man7 PR_SET_DUMPABLE(2const): values "0L (SUID_DUMP_DISABLE, process is not dumpable)"; "If a process is
    not dumpable, the ownership of files in the process's /proc/pid directory is affected".
  - ptrace(2), access mode checking: `environ` is a "read" operation; step 4 says "Deny access if the target
    process "dumpable" attribute has a value other than 1 (SUID_DUMP_USER" unless the caller has
    CAP_SYS_PTRACE.
  - So "`mem`, `fd/`, `environ` unreadable to a same-uid process" is correct. `cmdline` stays readable, which
    the design accounts for: argv carries nothing variant-specific.
  - Yama: ptrace(2) says value 1 restricts only `PTRACE_MODE_ATTACH` checks to descendants. So on a Yama=1
    kernel, `mem` would already be closed between the sibling processes, but `environ` (read mode) would not.
    `PR_SET_DUMPABLE` is needed either way.
  - The design claims only "Yama absent" for the Docker run and re-checks the image's settings in the demo.
    That is accurate and conservative.
  - I read `scratchpad/m3/nodump.py` (`prctl(4, 0, 0, 0, 0)`, error checked) and `linux_run.out`: `uid=1000
    yama=absent`, 12 identical views `environ:PermissionError`, `[]`, `mem:PermissionError`; `proc_forge` exit
    -9. See N3 on `[]`.
- **YAML typed-scalar rule (2.3, 2.10 item 9) vs YAML 1.1 and PyYAML.** yaml.org/type/bool: "y|Y|yes|Yes|YES|n|N|no|No|NO
  |true|...|on|On|ON|off|Off|OFF", so "the 1.1 booleans incl. `y`/`n`/`yes`/`on`" is correct. PyYAML's resolver
  omits `y`/`n`, so "PyYAML keeps them as strings" is correct. I read `scratchpad/m3/yaml_typed.py` and walked all of
  its values by hand against both its `TYPED` regex and PyYAML 6's implicit resolvers:
  - null, bool, int (incl. `017`, `0x1F`, `0b101`, `1_000`, `12:30`, `+1`), float (`1.0`, `.5`, `1.`, `.inf`,
    `.NaN`, `1:20:30.5`) and `2026-10-29` are all rejected.
  - `1e3`, `0o17`, `1.0.0`, `v1.0`, `None`, `nil` are strings in PyYAML and accepted by the rule.
  - `y`, `n`, `1.5e3` and `2026-1-2` are rejected on the strict side.
  - I found 0 misses. `1.5e3` is a string in PyYAML (its float regex needs a signed exponent) and a float in
    YAML 1.2, which is correct. SPEC's metadata example is `version: "1.0"` (agentskills.io/specification, quoted
    verbatim), so "`metadata: version: 1.0` must be written `"1.0"`, as SPEC's own example does" is correct.
  - See N1 and N4.
- **Round-2 non-blocking items, all applied correctly.**
  - N1: L1 theory line 614 and section 9 now say "used 8.50x / 2.96x / 4.89x the tokens; many were cache reads,
    so the dollar cost is likely lower than the ratio". That matches Böckeler.
  - N2: 2.3 says "same scalar text" and now also states the typing, which is accurate.
  - N3: 2.10 item 1 bullet 2 says "with `tests/__init__.py`".
  - N4: the L2 chain rule exempts files SKILL.md references directly. It is labelled "the exercise's reading",
    never a PBP quote. The near-miss "a.md also linking b.md" was added and the must-fail case was narrowed.
  - N5: L4 sources list alistairmavin.com/ears.
- **Numbers quoted in the changed text** (re-computed):
  - C(18,6) = 18564 and C(20,6) = 38760.
  - max_q q^6(1-q)^12 = 4096/3^18 = 1/94585, and 0.3^6 x 0.7^14 = 1/202255.
  - (1/6)^6 = 1/46656, 2^18 = 262144, C(12,6) = 924.
  - L1 runs: 6 + 12 + 1 = 19, so 190 s; probes: 20 x 20 = 400 < 480.

## Blocking
None.

## Non-blocking (practice-designer / lesson-author apply; no re-design needed)
1. **The typed-scalar rule now contradicts the L4 near-miss "the verbatim MADR-T template filled in".** MADR-T
   line 4 is `date: {YYYY-MM-DD when the decision was last updated}`. Filling it in as the template says gives
   `date: 2026-10-29`, a YAML 1.1 timestamp. 2.3 applies the typed rule to "MADR front matter in L4/L7" with
   exceptions only for the two CC boolean fields, so that line fails with "quote the value". Round 2's "the
   filled template passes the 2.3 subset" is no longer true. Resolve it before the demo, preferably this way:
   in MADR front matter the typed rule applies to `status` only (2.7 already says "other front-matter keys
   ignored"). Then add `date: 2026-10-29` unquoted to the L4 near-miss explicitly. The alternative is to keep
   the rule and say in L4 task.md that `date` must be quoted. That rejects the format the design calls "copied
   from MADR-T", so it is the weaker choice.
2. **`-B` scope in the hook probes.** 2.3 lists the hook among the processes run as `python3 -I -B` with "no
   bytecode cache is written anywhere", but 2.8 runs `python3 -I P/.claude/hooks/stop_tests.py` without `-B`.
   Even with `-B` on the hook, the flag binds only that interpreter. The hook's `python3 -m unittest` child is
   a fresh interpreter that writes `__pycache__` under `P/src` and `P/tests`, unless the probe env sets
   `PYTHONDONTWRITEBYTECODE=1` and the hook passes it on (the child runs without `-I`, so it honours the
   variable). P is grader-created and removed, so this is harmless. Write `-I -B` in 2.8 and scope 2.3's
   sentence to "the processes the grader starts".
3. **2.10 item 7 says "`fd/` empty".** The probe used `glob`, which swallows EACCES. After `PR_SET_DUMPABLE` 0
   the `/proc/<pid>` files change owner (PR_SET_DUMPABLE(2const), proc_pid(5)), so `fd/` is not listable,
   rather than empty. Write "`fd/` not listable (glob returned nothing)". 2.6 already says "unreadable", which
   is correct.
4. **2.10 item 9 and 2.3 wording.**
   - "`2026-1-2` ... (YAML 1.1 or 1.2 types them)" is wrong for that value. yaml.org/type/timestamp allows
     one-digit month and day only in the full form with a time (`[0-9][0-9][0-9][0-9]-[0-9][0-9]?-[0-9][0-9]?([Tt]|[ \t]+)...`).
     The date-only form needs two digits each, and the YAML 1.2 core schema has no timestamp. Write: "`y`,
     `n` (YAML 1.1 booleans), `1.5e3` (a YAML 1.2 float), `2026-1-2` (typed by neither; the rule's date
     pattern is broader)".
   - Separately, `yaml_typed.py` lists 40 values but the design says 37. The 38th value is `=`, which
     PyYAML's resolver tags `tag:yaml.org,2002:value`. `safe_load` has no constructor for that tag, so the
     run most likely aborted there before the script printed its mismatch counter. My hand walk of all 40
     values finds 0 misses, so the conclusion stands. Re-run with `safe_load` in a `try` and record the full
     count.

Attribution: none required (PASS). No feedback appended.

PASS
