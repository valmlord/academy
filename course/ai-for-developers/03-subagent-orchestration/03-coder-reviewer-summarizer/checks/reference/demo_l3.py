"""Demo of pipeline-chain (design #43 revision 6, sections 4.6, 5.L3 and 11): honest corpus first, then attacks.

Run with the pinned interpreter from a directory holding no `claude`:

    <python3.12> -I -B demo_l3.py --work <scratch dir> [--runs 20] [--quick-runs 5] [--jobs 8] [--only <text>]

Every line builds a workspace (the starter, or the starter with checks/reference/ laid over it, plus exactly one
change), grades it `runs` times through `drive_l3.py` (the check with the demo hooks: a fixed copy layout, a
planted `.git`) or through `verify_pipeline.py` itself, and prints `ok` or `XX`.
- must-pass: every run exits 0; for 4.6 lines also: no directory outside the run dir was expanded, every file
  read lies in the copy outside `.git` or is a run-dir file the line names, and reference detection took under
  0.2 s per call; for every driver line: each graded run held exactly one call of each role LONG_HOLD_SEC
  (hold-and-poll), and no other call;
- must-fail: every run exits 1 and the set of requirement ids printed is exactly the named set;
- recorded (RS16 / RS21, RS-C9a): the observed ids are printed; only the lines 4.6 states (`<run>/..` and
  `/tmp/stash/` are not expanded) assert anything.

During the whole corpus 1000 leftover try-fake run dirs sit in the real /tmp, each with an old coder.json, and a
same-uid writer keeps creating and changing files under the real /tmp and the real home. Everything the demo or
its variants create outside the scratch dir starts with `acw3-` and is removed at the end.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

REFERENCE = Path(__file__).resolve().parent
CHECKS = REFERENCE.parent
LESSON = CHECKS.parent
STARTER = LESSON / "starter"
MODULE = LESSON.parent
RUN_PY = Path("pipeline/run.py")
CALL_PY = Path("pipeline/claude_call.py")
ID_PATTERN = re.compile(r"^не выполнено: ([CH]\d+)")
DETECTION_LIMIT_SEC = 0.2
PREFIX = "acw3-"
HOME = Path(os.path.expanduser("~"))
# Stands in for /proc on a machine without it (the master selftest does the same): a directory the driver adds
# to the pseudo roots, holding `root` -> `/` like /proc/self/root. Set by main before any workspace is built.
PSEUDO_PLACEHOLDER = "@@PSEUDO_ROOT@@"
pseudo_root_dir: Path | None = None

Mutation = Callable[[Path], None]
# Values read from verify_pipeline by `static_lines` (it imports the check), used by the verdicts.
STATIC: dict[str, object] = {}


@dataclass
class Line:
    section: str
    name: str
    mutate: Mutation
    expect: set[str] | None  # None: must pass
    kind: str = "fail"  # pass | fail | record
    base: str = "reference"
    entry: str = "driver"  # driver | verify
    layout: str | None = None
    plant_git: bool = False
    run_reads: tuple[str, ...] = ()
    check_material: bool = False
    assert_no_outside_expansion: bool = False
    pseudo_root: bool = False
    simulate_fd: bool = False
    runs: str = "full"
    results: list[dict[str, object]] = field(default_factory=list)


# ---------------------------------------------------------------------------------------------------------
# Mutations
# ---------------------------------------------------------------------------------------------------------


def patch(*pairs: tuple[str, str], path: Path = RUN_PY) -> Mutation:
    def apply(workspace: Path) -> None:
        target = workspace / path
        text = target.read_text(encoding="utf-8")
        for old, new in pairs:
            if text.count(old) != 1:
                raise AssertionError(f"demo patch anchor not unique in {path}: {old!r} ({text.count(old)})")
            text = text.replace(old, new)
        target.write_text(text, encoding="utf-8")
    return apply


def chain(*mutations: Mutation) -> Mutation:
    def apply(workspace: Path) -> None:
        for mutation in mutations:
            mutation(workspace)
    return apply


def append_to(path: str, text: str) -> Mutation:
    def apply(workspace: Path) -> None:
        target = workspace / path
        target.write_text(target.read_text(encoding="utf-8") + text, encoding="utf-8")
    return apply


def nothing(_: Path) -> None:
    return None


def with_pseudo_root(mutation: Mutation) -> Mutation:
    """Apply `mutation`, then write the demo's pseudo root into run.py where the placeholder stands."""
    def apply(workspace: Path) -> None:
        mutation(workspace)
        if pseudo_root_dir is None:
            raise AssertionError("pseudo root not set up")
        target = workspace / RUN_PY
        target.write_text(target.read_text(encoding="utf-8").replace(PSEUDO_PLACEHOLDER, str(pseudo_root_dir)),
                          encoding="utf-8")
    return apply


# Anchors in checks/reference/pipeline/run.py and the starter's pipeline/claude_call.py.
R_CALL = 'review = call("reviewer", reviewer_prompt(str(change["diff_path"]), arguments.acceptance), run_dir, log)'
S_CALL = 'summary = call("summarizer", summarizer_prompt(findings), run_dir, log)'
C_CALL = 'change = call("coder", coder_prompt(arguments.task), run_dir, log)'
CALL_INNER = "answer, message = call_role_with_result(role, prompt, ROLES_PATH, PROJECT)"
PARSE = "def parse_arguments(argv: list[str]) -> argparse.Namespace:"
REPORT = ('report = {"summary": summary["summary"], "finding_ids": summary["finding_ids"],\n'
          '              "total_cost_usd": log.total_cost_usd()}')
TOTAL = 'return sum(float(str(entry["total_cost_usd"])) for entry in self.entries)'
EXCEPT_MAIN = ('    except RoleCallError as error:\n        print(f"pipeline stopped: {error}", file=sys.stderr)\n'
               '        return 1\n')
RAW_WRITE = ('(run_dir / f"{role}.json").write_text(json.dumps(message, ensure_ascii=False, indent=2), '
             'encoding="utf-8")')
SUBPROCESS = "completed = subprocess.run(command, input=prompt, capture_output=True, text=True, cwd=workdir,"
CONTRACT_FLAG = '"--append-system-prompt-file", str(CONTRACTS_DIR / f"{role}.md"),'
ROLE_FLAG_TAIL = "*ROLE_FLAGS[role]]"
READER_FLAGS = '"reviewer": ["--tools", "Read,Grep,Glob", "--disallowedTools", "mcp__*"],'
IMPORT = "from claude_call import RoleCallError, call_role_with_result"

# Helpers the variants use inside run.py. Everything they create outside the scratch dir starts with acw3-.
PRELUDE = '''
import os as _os, json as _json, secrets as _secrets, tempfile as _tempfile, pwd as _pwd


def _tmp() -> str:
    path = "/tmp/acw3-" + _secrets.token_hex(5)
    _os.makedirs(path)
    return path


def _coder(run_dir) -> str:
    return (run_dir / "coder.json").read_text(encoding="utf-8")


def _put(path, text) -> str:
    _os.makedirs(_os.path.dirname(str(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)
    return str(path)


def _mv(run_dir, name) -> str:
    target = run_dir / name
    _os.makedirs(target.parent, exist_ok=True)
    _os.rename(run_dir / "coder.json", target)
    return str(target)


def _stash_coder(run_dir, directory) -> str:
    """Move the raw coder output into `directory` (outside or inside the run dir) as c.json."""
    path = _put(_os.path.join(directory, "c.json"), _coder(run_dir))
    _os.remove(run_dir / "coder.json")
    return path


def _link(target, name) -> str:
    _os.makedirs(_os.path.dirname(str(name)), exist_ok=True)
    _os.symlink(target, name)
    return str(name)
'''


def reviewer(body: str) -> Mutation:
    """Replace the reviewer's prompt by `body`, a Python expression or block ending in `return`.

    Names available: base (the reference prompt), d (diff_path), R (run dir), C (project), A (acceptance path),
    run_dir, change, and the PRELUDE helpers.
    """
    code = body if "return" in body else f"return {body}"
    function = (PRELUDE + "\n\ndef demo_reviewer_prompt(run_dir, change, acceptance):\n"
                "    base = reviewer_prompt(str(change['diff_path']), acceptance)\n"
                "    d, R, C, A = str(change['diff_path']), str(run_dir), str(PROJECT), str(acceptance)\n"
                + "".join(f"    {line}\n" for line in code.splitlines()) + "\n\n")
    return patch((R_CALL, 'review = call("reviewer", demo_reviewer_prompt(run_dir, change, arguments.acceptance), '
                          'run_dir, log)'), (PARSE, function + PARSE))


def summarizer(body: str) -> Mutation:
    """Replace the summarizer's prompt; names: base, findings, R, C, run_dir and the PRELUDE helpers."""
    code = body if "return" in body else f"return {body}"
    function = (PRELUDE + "\n\ndef demo_summarizer_prompt(run_dir, findings):\n"
                "    base = summarizer_prompt(findings)\n    R, C = str(run_dir), str(PROJECT)\n"
                + "".join(f"    {line}\n" for line in code.splitlines()) + "\n\n")
    return patch((S_CALL, 'summary = call("summarizer", demo_summarizer_prompt(run_dir, findings), run_dir, log)'),
                 (PARSE, function + PARSE))


# Hold-and-poll round (student L3 re-run 2, X1 and X3): `with _during(delay, write, restore):` around a call runs
# write() `delay` s after the call starts, only if the call is still running, and restore() when it returns, only
# if write() ran: the student's thread, as a helper.
DURING = '''
import threading as _threading, contextlib as _contextlib


@_contextlib.contextmanager
def _during(delay, write, restore):
    done, lock, wrote = _threading.Event(), _threading.Lock(), []

    def worker():
        if done.wait(delay):
            return
        with lock:
            if not done.is_set():
                write()
                wrote.append(1)

    _threading.Thread(target=worker, daemon=True).start()
    try:
        yield
    finally:
        with lock:
            done.set()
            if wrote:
                restore()
'''


def during(anchor: str, setup: str, write: str, restore: str, delay: float, call: str | None = None) -> Mutation:
    """Wrap the call at `anchor` (a line of run.py's main) in `_during(delay, write, restore)`.

    `setup` runs first (8-space lines); `write` and `restore` are expressions; `call` replaces the anchored line.
    The DURING and PRELUDE helpers are added before parse_arguments.
    """
    body = "".join(f"        {line}\n" for line in setup.splitlines())
    body += (f"        with _during({delay}, lambda: {write}, lambda: {restore}):\n"
             f"            {call or anchor}")
    return patch((anchor, body.lstrip()), (PARSE, PRELUDE + DURING + "\n\n" + PARSE))


def extra_flags_hook() -> Mutation:
    """claude_call gains EXTRA_FLAGS[role], appended to that role's call line (set by run.py variants)."""
    return patch(("ROLE_FLAGS: dict[str, list[str]] = {", "EXTRA_FLAGS: dict[str, list[str]] = {}\n"
                  "ROLE_FLAGS: dict[str, list[str]] = {"),
                 (ROLE_FLAG_TAIL, "*ROLE_FLAGS[role], *EXTRA_FLAGS.get(role, [])]"), path=CALL_PY)


def system_prompt_file() -> Mutation:
    """Contracts go in by --system-prompt-file instead of --append-system-prompt-file."""
    return patch((CONTRACT_FLAG, '"--system-prompt-file", str(CONTRACTS_DIR / f"{role}.md"),'), path=CALL_PY)


def positional_prompt() -> Mutation:
    return patch((SUBPROCESS, 'completed = subprocess.run(command + ["--", prompt], input="", capture_output=True, '
                              'text=True, cwd=workdir,'), path=CALL_PY)


ENGLISH_PROMPTS = (
    ('    return (f"Задача лежит в файле {task}. Внеси изменение в проект, запиши его diff в файл и верни путь "\n'
     '            "к нему в diff_path.")',
     '    return "Make the change below, write its diff to a file, return its path.\\n\\n" + task.read_text(encoding="utf-8")'),
    ('    return (f"Проверь изменение: его diff лежит в файле {diff_path}. Критерии приёмки лежат в файле "\n'
     '            f"{acceptance}. Перечисли находки по контракту.")',
     '    return f"Review the diff in {diff_path}.\\n\\nAcceptance criteria:\\n" + acceptance.read_text(encoding="utf-8")'),
    ('    return ("Находки ревью (JSON):\\n" + json.dumps(handed, ensure_ascii=False, indent=2) +\n'
     '            "\\n\\nНапиши тимлиду итог по этим находкам.")',
     '    return "Review findings (JSON):\\n" + json.dumps(handed, indent=2) + "\\n\\nSummarize them."'),
)


def english_inline(*extra: tuple[str, str]) -> Mutation:
    """The student's honest shape: English prompts, the task and the acceptance read and inlined."""
    return patch(*ENGLISH_PROMPTS, *extra)


def pool(method: str) -> Mutation:
    worker = ('def _pool_call(role, prompt):\n'
              '    try:\n'
              '        return ("ok", *call_role_with_result(role, prompt, ROLES_PATH, PROJECT))\n'
              '    except RoleCallError as error:\n'
              '        return ("error", error.role, error.kind, error.detail, error.result)\n\n\n')
    block = (f'import multiprocessing as _mp\n        from concurrent.futures import ProcessPoolExecutor as _Pool\n'
             f'        with _Pool(1, mp_context=_mp.get_context("{method}")) as _executor:\n'
             '            outcome = _executor.submit(_pool_call, role, prompt).result()\n'
             '        if outcome[0] == "error":\n            raise RoleCallError(*outcome[1:])\n'
             '        answer, message = outcome[1], outcome[2]')
    return patch((CALL_INNER, block), ("def call(role: str", worker + "def call(role: str"))


# ---------------------------------------------------------------------------------------------------------
# Corpus
# ---------------------------------------------------------------------------------------------------------


def honest_lines() -> list[Line]:
    lines: list[Line] = []

    def add(name: str, mutation: Mutation, **kw: object) -> None:
        lines.append(Line("honest", name, mutation, None, kind="pass", check_material=True, **kw))  # type: ignore[arg-type]

    for layout in ("nested", "flat"):
        add(f"reference ({layout} copy)", nothing, layout=layout)
    add("reference through verify_pipeline.py itself (drawn layout)", nothing, entry="verify")
    # 4.6 honest corpus: the diff and the acceptance criteria
    add("diff by ./<diff_path>", reviewer('f"Проверь diff ./{d} по критериям {A}."'))
    add("diff by absolute path", reviewer('f"Проверь diff {C}/{d} по критериям {A}."'))
    add("diff and acceptance by @path", reviewer('f"Проверь @{d} по @{A}."'))
    add("diff and acceptance in backticks", reviewer('f"Проверь `{d}` по `{A}`."'))
    add("diff inside a JSON prompt", reviewer('_json.dumps({"diff": d, "acceptance": A}, ensure_ascii=False)'))
    add("diff inline", reviewer('"Diff:\\n" + open(_os.path.join(C, d), encoding="utf-8").read() + f"\\nКритерии: {A}"'))
    add("acceptance inline (by text)", reviewer('f"Diff: {d}\\nКритерии приёмки:\\n" + open(A, encoding="utf-8").read()'))
    add("src/x.py:12 strings in prose", reviewer(
        'base + " Похоже, ошибка в src/invoices/late_fee.py:12, см. также src/invoices/money.py:3."'))
    for layout in ("nested", "flat"):
        add(f"'Project root: <copy>.' with a planted 5000-object .git ({layout})",
            reviewer('base + f" Project root: {C}."'), layout=layout, plant_git=True)
    add("'Only look under ./', src/, a lone '.', 'security / performance', a lone '/'",
        reviewer('base + " Only look under ./ and src/ . security / performance / ."'))
    contract_lines = "\nГраницы: ничего не пишешь, ни в проект, ни во /tmp.\nНикаких ../\nНе трогай ~/\n"
    for layout in ("nested", "flat"):
        add(f"contracts by --system-prompt-file naming /tmp, ../ and ~/ ({layout})", chain(
            system_prompt_file(), append_to("pipeline/contracts/reviewer.md", contract_lines),
            append_to("pipeline/contracts/summarizer.md", contract_lines),
            append_to("pipeline/contracts/coder.md", contract_lines)), layout=layout)
    add("nonexistent /tmp/nothing-here.json and \"/tmp/no such file.json\"",
        reviewer('base + \' see /tmp/nothing-here.json and "/tmp/no such file.json"\''))
    add("'ни во /tmp.' with 1000 leftover try-fake run dirs in /tmp", reviewer('base + " Ни во /tmp."'))
    for method in ("spawn", "forkserver"):
        add(f"every call in a ProcessPoolExecutor ({method}, __main__ guard)", pool(method))
    add("compact one-line JSON prompt (diff, absolute acceptance, note)", reviewer(
        '_json.dumps({"diff": d, "acceptance": A, "note": "ни во /tmp, никаких ../"}, separators=(",", ":"), '
        'ensure_ascii=False)'))
    add("compact JSON prompt with ensure_ascii escapes", reviewer(
        '_json.dumps({"diff": d, "acceptance": A, "rule": "ни во /tmp."}, separators=(",", ":"))'))
    add("markdown bullets with paths", reviewer(
        'base + "\\n- `src/invoices/late_fee.py` line 1.\\n- see ./src/invoices/late_fee.py.\\n"'))
    add("prose with ellipses and leading dots", reviewer('base + " ... .5 of cases . . . ./ ../ ~ ~/ / // ///"'))
    add("Russian contract line repeated 20 times", reviewer(
        'base + " " + " ".join(["правила: ни в проект / ни во /tmp / ни в ~/ / никаких ../ ."] * 20)'))
    add("prompt as one positional argument after --", positional_prompt())
    add("package import: from pipeline.claude_call import", patch((IMPORT, IMPORT.replace("from claude_call",
                                                                                          "from pipeline.claude_call"))))
    # 4.6 honest corpus: the summarizer's findings
    add("findings as a bullet list", summarizer(
        '"Находки ревью:\\n" + "".join(f"- {f[\'id\']}: {f[\'file\']}:{f[\'line\']} `{f[\'quote\']}` - {f[\'claim\']}\\n" '
        'for f in findings)'))
    add("findings as compact JSON", summarizer('"Находки: " + _json.dumps(findings, separators=(",", ":"))'))
    add("findings as JSON with the keys in reverse order", summarizer(
        '"Находки: " + _json.dumps([dict(reversed(list(f.items()))) for f in findings])'))
    add("findings by <run>/accepted.json", summarizer(
        '_put(run_dir / "accepted.json", _json.dumps(findings))\nreturn f"Находки ревью: {R}/accepted.json"'),
        run_reads=("accepted.json",))
    add("findings by '<run>/accepted.json (all accepted)'", summarizer(
        '_put(run_dir / "accepted.json", _json.dumps(findings))\nreturn f"Находки: {R}/accepted.json (all accepted)"'),
        run_reads=("accepted.json",))
    add("findings by a directory <run>/accepted/ holding only them", summarizer(
        'for i, f in enumerate(findings):\n    _put(run_dir / "accepted" / f"f{i}.json", _json.dumps(f))\n'
        'return f"Находки лежат в {R}/accepted/"'), run_reads=("accepted/",))
    add("'Only <run>/accepted.json; nothing else!'", summarizer(
        '_put(run_dir / "accepted.json", _json.dumps(findings))\nreturn f"Only {R}/accepted.json; nothing else!"'),
        run_reads=("accepted.json",))
    add("run-dir file names in the alphabet (accepted_1-a.v2.json)", summarizer(
        '_put(run_dir / "accepted_1-a.v2.json", _json.dumps(findings))\nreturn f"Находки: {R}/accepted_1-a.v2.json."'),
        run_reads=("accepted_1-a.v2.json",))
    add("compact JSON prompt naming the diff, the acceptance and <run>/accepted.json", summarizer(
        '_put(run_dir / "accepted.json", _json.dumps(findings))\n'
        'return _json.dumps({"acceptance": C + "/task/acceptance.md", "findings": R + "/accepted.json", '
        '"note": "ни во /tmp, никаких ../"}, separators=(",", ":"), ensure_ascii=False)'),
        run_reads=("accepted.json",))
    # 5.L3 honest corpus: the log and the report
    add("extra log fields and another key order", patch((
        '        entry = {\n            "role": role,',
        '        entry = {\n            "attempt": 1, "note": "extra",\n            "role": role,')))
    add("cost summed with math.fsum", patch((TOTAL, 'import math\n        return math.fsum(float(str(e["total_cost_usd"])) '
                                                    'for e in self.entries)')))
    add("cost summed with Decimal", patch((TOTAL, 'from decimal import Decimal\n        return float(sum(Decimal(str('
                                                  'e["total_cost_usd"])) for e in self.entries))')))
    add("model logged as the modelUsage key", patch(('"model": settings["model"],',
                                                    '"model": next(iter((message or {}).get("modelUsage") or '
                                                    '{settings["model"]: 0})),')))
    dump_log = '        log.path.write_text("".join(json.dumps(e) + "\\n" for e in log.entries), encoding="utf-8")\n'
    add("log written once at the end", patch(
        ('        self.entries.append(entry)\n        with self.path.open("a", encoding="utf-8") as handle:\n'
         '            handle.write(json.dumps(entry, ensure_ascii=False) + "\\n")', '        self.entries.append(entry)'),
        (EXCEPT_MAIN, EXCEPT_MAIN.replace("    except RoleCallError as error:\n",
                                          "    except RoleCallError as error:\n" + dump_log)),
        ("    report = {", dump_log[4:] + "    report = {")))
    # Student fix round: the drawn task and acceptance hold non-ASCII text; inline and JSON-escaped forms of the
    # required fields still count as received, and an all-English pipeline that inlines them logs bytes right.
    add("English prompts inlining the task and the acceptance (non-ASCII inside), bytes logged", english_inline())
    add("acceptance inlined as a JSON string with ensure_ascii escapes", reviewer(
        '_json.dumps({"diff": d, "acceptance": open(A, encoding="utf-8").read()})'))
    add("diff and acceptance inlined as one JSON object (\\n, \\u escapes)", reviewer(
        '_json.dumps({"diff": open(_os.path.join(C, d), encoding="utf-8").read(), '
        '"acceptance": open(A, encoding="utf-8").read()})'))
    add("findings JSON-encoded twice (a JSON string holding the findings JSON)", summarizer(
        '"Находки: " + _json.dumps(_json.dumps(findings))'))
    add("findings in <run>/accepted.json written as UTF-16", summarizer(
        '(run_dir / "accepted.json").write_text(_json.dumps(findings, ensure_ascii=False), encoding="utf-16")\n'
        'return f"Находки ревью: {R}/accepted.json"'), run_reads=("accepted.json",))
    add("report JSON without indent", patch(('(run_dir / REPORT).write_text(json.dumps(report, ensure_ascii=False, '
                                             'indent=2), encoding="utf-8")',
                                             '(run_dir / REPORT).write_text(json.dumps(report), encoding="utf-8")')))
    return lines


def inscope_lines() -> list[Line]:
    """4.6 in-scope must-fail corpus plus the 5.L3 attacks; the expected ids are the only ids printed."""
    lines: list[Line] = []

    def fail(name: str, mutation: Mutation, ids: set[str], section: str = "must-fail 4.6", **kw: object) -> None:
        lines.append(Line(section, name, mutation, ids, **kw))  # type: ignore[arg-type]

    h2 = {"H2"}
    fail("coder summary pasted into the reviewer prompt (stdin)", reviewer('base + "\\nКодер пишет: " + change["summary"]'), h2)
    fail("coder summary in the positional prompt", chain(positional_prompt(), reviewer(
        'base + "\\nКодер пишет: " + change["summary"]')), h2)
    fail("coder summary in an --append-system-prompt value", chain(extra_flags_hook(), reviewer(
        'import claude_call as _cc\n_cc.EXTRA_FLAGS["reviewer"] = ["--append-system-prompt", change["summary"]]\n'
        'return base')), h2)
    fail("coder result narrative (from the raw message) in the prompt", reviewer(
        'base + "\\n" + _json.loads(_coder(run_dir))["result"]'), h2)
    fail("reviewer given <run>/coder.json", reviewer('base + f" {R}/coder.json"'), h2)
    fail("reviewer given <run>/", reviewer('base + f" context: {R}/"'), h2)
    fail("reviewer given <run>.", reviewer('base + f" context in {R}."'), h2)
    fail("reviewer given <run>/.", reviewer('base + f" context in {R}/."'), h2)
    fail("reviewer given <run>/raw/ holding the output", reviewer('_mv(run_dir, "raw/coder.json")\nreturn base + f" {R}/raw/"'), h2)
    fail("two hops: <run>/handoff.md names <run>/coder.json", reviewer(
        '_put(run_dir / "handoff.md", f"ctx {R}/coder.json")\nreturn base + f" {R}/handoff.md"'), h2)
    fail("N5: <run>/reviewer/brief.txt says 'context.txt next to this file', and <run>/reviewer/context.txt holds "
         "the coder answer", reviewer(
             '_put(run_dir / "reviewer" / "context.txt", _coder(run_dir))\n'
             '_put(run_dir / "reviewer" / "brief.txt", "Контекст изменения: context.txt рядом с этим файлом.\\n")\n'
             'return base + f" Прочитай {R}/reviewer/brief.txt"'), h2)
    fail("two hops: <run>/handoff.md names /tmp/x.json", reviewer(
        't = _tmp()\n_put(t + "/x.json", _coder(run_dir))\n_put(run_dir / "handoff.md", f"ctx {t}/x.json")\n'
        'return base + f" {R}/handoff.md"'), h2)
    fail("--append-system-prompt-file <run>/coder.json", chain(system_prompt_file(), extra_flags_hook(), reviewer(
        'import claude_call as _cc\n_cc.EXTRA_FLAGS["reviewer"] = ["--append-system-prompt-file", R + "/coder.json"]\n'
        'return base')), h2)
    fail("file://<run>/coder.json", reviewer('base + f" file://{R}/coder.json"'), h2)
    fail("a file written after the call (run-end re-read)", chain(
        reviewer('base + f" {R}/later.json"'),
        summarizer('_put(run_dir / "later.json", _coder(run_dir))\nreturn base')), h2)
    fail("coder output in tempfile.mkdtemp()/coder.json", reviewer(
        'p = _put(_tempfile.mkdtemp() + "/coder.json", _coder(run_dir))\nreturn base + f" see {p}"'), {"H2", "H7"})
    fail("coder output in ~/coder.json", reviewer(
        '_put(_os.path.expanduser("~/coder.json"), _coder(run_dir))\nreturn base + " see ~/coder.json"'), {"H2", "H7"})
    fail("coder output in /tmp/x.json", reviewer(
        'p = _put(_tmp() + "/x.json", _coder(run_dir))\nreturn base + f" see {p}"'), h2)
    fail("coder output in a passwd-home file named by absolute path", reviewer(
        'p = _put(_pwd.getpwuid(_os.getuid()).pw_dir + "/acw3-" + _secrets.token_hex(5) + ".json", _coder(run_dir))\n'
        'return base + f" see {p}"'), h2)
    fail("coder output in a volume file named by absolute path (/var/tmp)", reviewer(
        'p = _put("/var/tmp/acw3-" + _secrets.token_hex(5) + "/c.json", _coder(run_dir))\nreturn base + f" see {p}"'), h2)
    for layout in ("nested", "flat"):
        fail(f"../x.json relative to the project ({layout})", reviewer(
            '_put(_os.path.join(_os.path.dirname(C), "x.json"), _coder(run_dir))\nreturn base + " see ../x.json"'),
            {"H2", "H7"}, layout=layout)
    fail(".git/ctx/coder.json named as a relative file", reviewer(
        '_put(C + "/.git/ctx/coder.json", _coder(run_dir))\nreturn base + " see .git/ctx/coder.json"'), {"H2", "H7"})
    fail("<copy>/.git/ctx/coder.json named as an absolute file", reviewer(
        '_put(C + "/.git/ctx/coder.json", _coder(run_dir))\nreturn base + f" see {C}/.git/ctx/coder.json"'), {"H2", "H7"})
    fail("<run>/link -> /tmp/stash/coder.json, named <run>/link", reviewer(
        't = _tmp()\n_link(_stash_coder(run_dir, t), run_dir / "link")\nreturn base + f" {R}/link"'), h2)
    fail("/tmp/r -> <run>, named /tmp/r/", reviewer(
        'r = _link(R, "/tmp/acw3-r" + _secrets.token_hex(5))\nreturn base + f" ctx {r}/"'), h2)
    for ref, name in (("{R}/", "<run>/"), ("{R}/linkdir/", "<run>/linkdir/"), ("{R}/linkdir", "<run>/linkdir")):
        fail(f"<run>/linkdir -> /tmp/stash/, reviewer given {name}", reviewer(
            f't = _tmp()\n_stash_coder(run_dir, t)\n_link(t, run_dir / "linkdir")\nreturn base + f" ctx {ref}"'), h2)
    fail("<run>/raw/linkdir -> /tmp/stash/, given <run>/raw/linkdir/", reviewer(
        't = _tmp()\n_stash_coder(run_dir, t)\n_link(t, run_dir / "raw" / "linkdir")\nreturn base + f" ctx {R}/raw/linkdir/"'), h2)
    # revision 5: names holding the old delimiters
    for name, ref in (("coder out.json", 'f\' see "{R}/coder out.json"\''), ("coder,1.json", 'f" see `{R}/coder,1.json`"'),
                      ("coder(1).json", 'f" see {R}/coder(1).json"'), ("coder(1).json", 'f" (see {R}/coder(1).json)"'),
                      ("coder(1)", 'f" see {R}/coder(1)"'), ("a:b.json", 'f" see {R}/a:b.json"')):
        fail(f"rev5: {ref[2:-1]}", reviewer(f'_mv(run_dir, "{name}")\nreturn base + {ref}'), h2)
    fail('rev5: see "/tmp/my stash.json"', reviewer(
        't = _tmp()\n_put(t + "/my stash.json", _coder(run_dir))\nreturn base + f\' see "{t}/my stash.json"\''), h2)
    fail("rev5: see ~/my stash.json", reviewer(
        '_put(_os.path.expanduser("~/my stash.json"), _coder(run_dir))\nreturn base + " see ~/my stash.json"'), {"H2", "H7"})
    fail('rev5: ctx "<run>/raw out/"', reviewer('_mv(run_dir, "raw out/c.json")\nreturn base + f\' ctx "{R}/raw out/"\''), h2)
    fail("rev5: file://<run>/coder out.json", reviewer('_mv(run_dir, "coder out.json")\nreturn base + f" file://{R}/coder out.json"'), h2)
    # revision 6, B-R5-1: each form with the output in the run dir and in /tmp
    forms = (
        ("@<p> unquoted, spaced name", "a b.json", 'f" @{p}"'),
        ('compact JSON {"ctx":"<p>","diff":...}, spaced', "coder out.json",
         '_json.dumps({"ctx": p, "diff": d}, separators=(",", ":"))'),
        ('compact JSON {"ctx":"<p>","task":"review"}, spaced', "coder out.json",
         '_json.dumps({"ctx": p, "task": "review"}, separators=(",", ":"))'),
        ("см. «<p>», spaced", "coder out.json", 'f" см. «{p}»"'),
        ("см. «<p>», no space", "coder.json", 'f" см. «{p}»"'),
        ("see “<p>”, spaced", "coder out.json", 'f" see “{p}”"'),
        ("see **<p>**, spaced", "coder out.json", 'f" see **{p}**"'),
        ("see *<p>*, no space", "coder.json", 'f" see *{p}*"'),
        ("Is it in <p>?, spaced", "coder out.json", 'f" Is it in {p}?"'),
        ('see "<p>"!, spaced', "coder out.json", 'f\' see "{p}"!\''),
        ("Read <p>!, no space", "coder.json", 'f" Read {p}!"'),
        ("|ctx|<p>| on its own line, no space", "coder.json", 'f"\\n|ctx|{p}|\\n"'),
    )
    for label, name, ref in forms:
        returned = f"return {ref}" if ref.startswith("_json") else f"return base + {ref}"
        in_run = 'p = str(run_dir / "coder.json")' if name == "coder.json" else f'p = _mv(run_dir, "{name}")'
        fail(f"rev6 in run dir: {label}", reviewer(f"{in_run}\n{returned}"), h2)
        fail(f"rev6 in /tmp: {label}", reviewer(f'p = _put(_tmp() + "/{name}", _coder(run_dir))\n{returned}'), h2)
    fail('rev6: see "<run>/a b c d e f g h i.json" (8 whitespace runs)', reviewer(
        '_mv(run_dir, "a b c d e f g h i.json")\nreturn base + f\' see "{R}/a b c d e f g h i.json"\''), h2)
    fail("B-R5-2: /tmp/r -> <run>, <run>/linkdir -> /tmp/stash, given /tmp/r/linkdir/", reviewer(
        't = _tmp()\n_stash_coder(run_dir, t)\n_link(t, run_dir / "linkdir")\n'
        'r = _link(R, "/tmp/acw3-r" + _secrets.token_hex(5))\nreturn base + f" ctx {r}/linkdir/"'), h2)
    fail("B-R5-2: same links, output in /tmp/stash/sub/, given /tmp/r/linkdir/sub/", reviewer(
        't = _tmp()\n_stash_coder(run_dir, t + "/sub")\n_link(t, run_dir / "linkdir")\n'
        'r = _link(R, "/tmp/acw3-r" + _secrets.token_hex(5))\nreturn base + f" ctx {r}/linkdir/sub/"'), h2)
    # corpus5 group N neighbours
    tmp_spaced = 't = _tmp()\n_put(t + "/my stash.json", _coder(run_dir))\n'
    neighbours = (
        ("path=/tmp/a b.json", 't = _tmp()\n_put(t + "/a b.json", _coder(run_dir))\nreturn base + f" path={t}/a b.json"'),
        ('@"<run>/a b.json"', '_mv(run_dir, "a b.json")\nreturn base + f\' @"{R}/a b.json"\''),
        ("default-separator JSON, spaced path not last",
         '_mv(run_dir, "coder out.json")\nreturn _json.dumps({"ctx": R + "/coder out.json", "task": "review"})'),
        ('"/tmp/.../my stash.json". trailing', tmp_spaced + 'return base + f\' see "{t}/my stash.json".\''),
        ('("/tmp/.../my stash.json"), trailing', tmp_spaced + 'return base + f\' see ("{t}/my stash.json"), ok\''),
        ("| <run>/coder out.json | table cell", '_mv(run_dir, "coder out.json")\nreturn base + f"\\n| ctx | {R}/coder out.json |"'),
        ("spaced path at line start", '_mv(run_dir, "coder out.json")\nreturn base + f"\\n{R}/coder out.json"'),
        ("spaced directory component", '_mv(run_dir, "x y/coder.json")\nreturn base + f\' see "{R}/x y/coder.json"\''),
        ("a tab in a name", '_mv(run_dir, "coder\\tx.json")\nreturn base + f" see {R}/coder\\tx.json"'),
        ("/tmp/r -> <run>, /tmp/r/coder out.json", '_mv(run_dir, "coder out.json")\n'
         'r = _link(R, "/tmp/acw3-r" + _secrets.token_hex(5))\nreturn base + f\' see "{r}/coder out.json"\''),
        ("chain <run>/l1 -> /tmp/l2 -> /tmp/stash", 't = _tmp()\n_stash_coder(run_dir, t + "/stash")\n'
         '_link(t + "/stash", t + "/l2")\n_link(t + "/l2", run_dir / "l1")\nreturn base + f" ctx {R}/l1/"'),
        ("stash linking on to a second stash", 't = _tmp()\n_stash_coder(run_dir, t + "/stash2")\n'
         '_os.makedirs(t + "/stash")\n_link(t + "/stash2", t + "/stash/inner")\n_link(t + "/stash", run_dir / "linkdir")\n'
         'return base + f" ctx {R}/linkdir/"'),
        ("<run>/linkdir/sub/", 't = _tmp()\n_stash_coder(run_dir, t + "/sub")\n_link(t, run_dir / "linkdir")\n'
         'return base + f" ctx {R}/linkdir/sub/"'),
        ("<run>/linkdir/..", 't = _tmp()\n_stash_coder(run_dir, t)\n_link(t, run_dir / "linkdir")\n'
         'return base + f" ctx {R}/linkdir/.."'),
        ("spaced linkdir name", 't = _tmp()\n_stash_coder(run_dir, t)\n_link(t, run_dir / "link dir")\n'
         'return base + f\' ctx "{R}/link dir/"\''),
    )
    for label, body in neighbours:
        fail(f"neighbour: {label}", reviewer(body), h2)
    for layout in ("nested", "flat"):
        fail(f"neighbour: relative ../.../run-k/coder out.json ({layout})", reviewer(
            '_mv(run_dir, "coder out.json")\nrel = _os.path.relpath(R, C)\nreturn base + f" see {rel}/coder out.json"'),
            h2, layout=layout)
    # Student fix round (Stepan, 2026-11-04): the narrative in another letter case, JSON-escaped, in a UTF-16 or
    # UTF-32 file, behind a /proc/self/root alias; a stash that exists only while a call runs.
    st = "must-fail student"
    fail("coder summary upper-cased in the prompt", reviewer('base + "\\n" + str(change["summary"]).upper()'), h2,
         section=st)
    fail("coder summary title-cased in the prompt", reviewer('base + "\\n" + str(change["summary"]).title()'), h2,
         section=st)
    fail("coder summary with every character \\u-escaped", reviewer(
        'base + "\\nNotes: \\"" + "".join(f"\\\\u{ord(c):04x}" for c in str(change["summary"])) + "\\""'), h2,
        section=st)
    fail("coder summary \\u-escaped with upper-case hex", reviewer(
        'base + "\\nNotes: " + "".join(f"\\\\u{ord(c):04X}" for c in str(change["summary"]))'), h2, section=st)
    for encoding in ("utf-16", "utf-16-le", "utf-16-be", "utf-32", "utf-32-le"):
        fail(f"coder summary in <run>/notes.txt written as {encoding}, named by full path", reviewer(
            f'(run_dir / "notes.txt").write_text(str(change["summary"]), encoding="{encoding}")\n'
            'return base + f"\\nNotes: {R}/notes.txt"'), h2, section=st)
    fail("coder output in /tmp written as UTF-16, named by full path", reviewer(
        'p = _tmp() + "/c.json"\nopen(p, "w", encoding="utf-16").write(_coder(run_dir))\nreturn base + f" see {p}"'),
        h2, section=st)
    fail("<run>/handoff.md in UTF-16 naming <run>/coder.json (two hops)", reviewer(
        '(run_dir / "handoff.md").write_text(f"ctx {R}/coder.json", encoding="utf-16")\n'
        'return base + f" {R}/handoff.md"'), h2, section=st)
    fail("coder summary in <run>/notes.txt named as <proc>/self/root<run>/notes.txt", with_pseudo_root(reviewer(
        '_put(run_dir / "notes.txt", str(change["summary"]))\n'
        'pref = "/proc/self/root" if _os.path.isdir("/proc/self/root") else "' + PSEUDO_PLACEHOLDER + '/root"\n'
        'return base + f"\\nNotes: {pref}{R}/notes.txt"')), h2, section=st, pseudo_root=True)
    fail("coder output stashed in <copy>/notes/ before the reviewer call, removed after it", patch((
        R_CALL, 'stash = PROJECT / "notes" / "coder.json"\n        stash.parent.mkdir(exist_ok=True)\n'
                '        stash.write_text(json.dumps(change))\n        try:\n    ' + R_CALL.replace(
                    "review = ", "        review = ") + '\n        finally:\n            stash.unlink()\n'
                '            stash.parent.rmdir()')), {"H7"}, section=st)
    # Re-run fix round (student L3 re-run N3): the coder's own diff file changed during a later call or after it.
    fail("coder summary appended to the coder's diff file during the reviewer call, diff inlined, restored after", patch((
        R_CALL, 'diff_file = PROJECT / str(change["diff_path"])\n        original = diff_file.read_bytes()\n'
                '        prompt = ("Проверь изменение:\\n" + original.decode("utf-8") + "\\nКритерии приёмки лежат в файле "\n'
                '                  + str(arguments.acceptance) + ". Перечисли находки по контракту.")\n'
                '        diff_file.write_bytes(original + b"\\n# coder notes: " + str(change["summary"]).encode("utf-8") + b"\\n")\n'
                '        try:\n            review = call("reviewer", prompt, run_dir, log)\n'
                '        finally:\n            diff_file.write_bytes(original)')), {"H7"}, section=st)
    fail("coder summary appended to the coder's diff file during the reviewer call, path given, restored after", patch((
        R_CALL, 'diff_file = PROJECT / str(change["diff_path"])\n        original = diff_file.read_bytes()\n'
                '        diff_file.write_bytes(original + b"\\n# coder notes: " + str(change["summary"]).encode("utf-8") + b"\\n")\n'
                '        try:\n    ' + R_CALL.replace("review = ", "        review = ") +
                '\n        finally:\n            diff_file.write_bytes(original)')), {"H2", "H7"}, section=st)
    # Hold-and-poll round (student L3 re-run 2): the same stashes written a while after the call starts, so a
    # snapshot taken as the request arrives misses them. LONG_HOLD_SEC is 3 s; 0.5 s and 1.5 s are inside it.
    hp = "must-fail hold-and-poll"
    diff_setup = ('diff_file = PROJECT / str(change["diff_path"])\noriginal = diff_file.read_bytes()\n'
                  'notes = b"\\n# coder notes: " + str(change["summary"]).encode("utf-8") + b"\\n"')
    inline_call = ('review = call("reviewer", "Проверь изменение:\\n" + original.decode("utf-8") + "\\nКритерии '
                   'приёмки лежат в файле " + str(arguments.acceptance) + ".", run_dir, log)')
    for delay in (0.5, 1.5):
        fail(f"X1: coder summary appended to the coder's diff file {delay} s into the reviewer call, diff inlined, "
             "restored after", during(R_CALL, diff_setup, "diff_file.write_bytes(original + notes)",
                                      "diff_file.write_bytes(original)", delay, inline_call), {"H7"}, section=hp)
        fail(f"X3: reviewer given <run>/reviewer-context.md (diff and acceptance), rewritten with the coder summary "
             f"{delay} s into the call, restored after", during(
                 R_CALL, 'context = run_dir / "reviewer-context.md"\n'
                         'innocent = ("## Change\\n\\n" + (PROJECT / str(change["diff_path"])).read_text(encoding="utf-8")'
                         ' + "\\n\\n## Acceptance criteria\\n\\n" + arguments.acceptance.read_text(encoding="utf-8"))\n'
                         'context.write_text(innocent, encoding="utf-8")',
                 'context.write_text(innocent + "\\n\\nCoder notes: " + str(change["summary"]), encoding="utf-8")',
                 'context.write_text(innocent, encoding="utf-8")', delay,
                 'review = call("reviewer", f"Review the change described in {context}.", run_dir, log)'),
             {"H2"}, section=hp)
    fail("X1p: the same append 0.5 s into the reviewer call, the reviewer given the diff file's path", during(
        R_CALL, diff_setup, "diff_file.write_bytes(original + notes)", "diff_file.write_bytes(original)", 0.5),
        {"H2", "H7"}, section=hp)
    fail("X2: <copy>/notes/coder.json created 1.5 s into the reviewer call, removed after", during(
        R_CALL, 'stash = PROJECT / "notes" / "coder.json"',
        '(stash.parent.mkdir(exist_ok=True), stash.write_text(json.dumps(change)))',
        '(stash.unlink(), stash.parent.rmdir())', 1.5), {"H7"}, section=hp)
    fail("coder output in $TMPDIR 0.5 s into the reviewer call, removed after", during(
        R_CALL, 'stash = __import__("pathlib").Path(__import__("tempfile").gettempdir()) / "acw3-late.json"',
        'stash.write_text(json.dumps(change))', 'stash.unlink()', 0.5), {"H7"}, section=hp)
    fail("<copy>/NOTES.md written 1.5 s into the coder call, removed after", during(
        C_CALL, 'stash = PROJECT / "NOTES.md"', 'stash.write_text("draft notes")', 'stash.unlink()', 1.5),
        {"H7"}, section=hp)
    fail("reviewer given <run>/ctx/; <run>/ctx/notes.txt with the coder summary appears 0.5 s into the call", during(
        R_CALL, 'ctx = run_dir / "ctx"\nctx.mkdir()\n'
                '(ctx / "change.diff").write_bytes((PROJECT / str(change["diff_path"])).read_bytes())\n'
                '(ctx / "acceptance.md").write_bytes(arguments.acceptance.read_bytes())\nnote = ctx / "notes.txt"',
        'note.write_text(str(change["summary"]), encoding="utf-8")', 'note.unlink()', 0.5,
        'review = call("reviewer", f"Изменение и критерии приёмки лежат в {ctx}/", run_dir, log)'),
        {"H2"}, section=hp)
    fail("summarizer given <run>/accepted.json, rewritten with the reviewer's result text 0.5 s into the call, "
         "restored after", during(
             S_CALL, 'handed = summarizer_prompt(findings).split("\\n", 1)[1].rsplit("\\n\\n", 1)[0]\n'
                     'accepted = run_dir / "accepted.json"\naccepted.write_text(handed, encoding="utf-8")\n'
                     'narrative = json.loads((run_dir / "reviewer.json").read_text(encoding="utf-8"))["result"]',
             'accepted.write_text(handed + "\\n" + str(narrative), encoding="utf-8")',
             'accepted.write_text(handed, encoding="utf-8")', 0.5,
             'summary = call("summarizer", f"Находки ревью: {accepted}", run_dir, log)'), {"H3"}, section=hp)
    fail("coder's diff file deleted after the summarizer call", patch((
        S_CALL, S_CALL + '\n        (PROJECT / str(change["diff_path"])).unlink()')), {"H7"}, section=st)
    # Re-run fix round (student L3 re-run N2, N2b): /proc/<pid>/fd/<n> of an unlinked file or a memfd. On Linux the
    # real forms; elsewhere the master self-test's simulation (a pseudo root plus `--simulate-fd`).
    fd_alias = (
        'if _os.path.isdir("/proc/self/fd"):\n'
        '    if KIND == "memfd":\n'
        '        fd = _os.memfd_create("notes")\n'
        '    else:\n'
        '        fd = _os.open(R + "/notes.txt", _os.O_RDWR | _os.O_CREAT)\n'
        '        _os.unlink(R + "/notes.txt")\n'
        '    _os.write(fd, str(change["summary"]).encode("utf-8"))\n'
        '    globals().setdefault("_KEEP", []).append(fd)\n'
        '    link = f"/proc/{_os.getpid()}/fd/{fd}"\n'
        'else:\n'
        '    target = _put(_tmp() + ("/memfd-notes" if KIND == "memfd" else "/notes.txt"), str(change["summary"]))\n'
        '    link = f"' + PSEUDO_PLACEHOLDER + '/{_os.getpid()}/fd/5"\n'
        '    _os.makedirs(_os.path.dirname(link), exist_ok=True)\n'
        '    if _os.path.lexists(link):\n'
        '        _os.remove(link)\n'
        '    _os.symlink(target, link)\n'
        'return base + f"\\nCoder notes: {link}"')
    for kind, label in (("unlinked", "an unlinked <run>/notes.txt"), ("memfd", "a memfd")):
        fail(f"coder summary behind /proc/<pid>/fd/<n> of {label}", with_pseudo_root(reviewer(
            fd_alias.replace("KIND", repr(kind)))), h2, section=st, pseudo_root=True, simulate_fd=True)
    fail("raw outputs staged in <copy>/.pipeline-tmp/ and moved into the run dir at the end", patch(
        (RAW_WRITE, '(PROJECT / ".pipeline-tmp").mkdir(exist_ok=True)\n    (PROJECT / ".pipeline-tmp" / f"{role}.json")'
                    '.write_text(json.dumps(message), encoding="utf-8")'),
        ("    report = {", '    import shutil as _sh\n    for _p in (PROJECT / ".pipeline-tmp").iterdir():\n'
                         '        _sh.move(str(_p), str(run_dir / _p.name))\n    (PROJECT / ".pipeline-tmp").rmdir()\n'
                         '    report = {')), {"H7"}, section=st)
    fail("findings stashed in <copy>/findings.json for the summarizer call, removed after it", summarizer(
        'p = C + "/findings.json"\n_put(p, _json.dumps(findings))\n'
        'import atexit as _ae\n_ae.register(_os.remove, p)\nreturn f"Находки: {p}"'), {"H7"}, section=st)
    fail("coder output stashed in $TMPDIR during the reviewer call, removed after it", patch((
        R_CALL, 'stash = __import__("pathlib").Path(__import__("tempfile").gettempdir()) / "acw3-stash.json"\n'
                '        stash.write_text(json.dumps(change))\n        try:\n    ' + R_CALL.replace(
                    "review = ", "        review = ") + '\n        finally:\n            stash.unlink()')),
        {"H7"}, section=st)
    fail("reviewer narrative upper-cased in the summarizer prompt", summarizer(
        'base + "\\n" + str(_json.loads((run_dir / "reviewer.json").read_text())["result"]).upper()'), {"H3"},
        section=st)
    fail("prompt_bytes counted in characters, English prompts inlining task and acceptance", english_inline(
        ('"prompt_bytes": len(prompt.encode("utf-8")),', '"prompt_bytes": len(prompt),')), {"H5"}, section=st)
    # the summarizer
    fail("summarizer given <run>/reviewer.json with the narrative", summarizer('base + f" {R}/reviewer.json"'), {"H3"},
         section="must-fail 5.L3")
    fail("everything given to the summarizer", summarizer(
        'base + "\\n" + _coder(run_dir) + "\\n" + (run_dir / "reviewer.json").read_text()'), {"H3"}, section="must-fail 5.L3")
    fail("summarizer inline text over 16 KB", summarizer('base + "\\n" + "я" * 8200'), {"H3"}, section="must-fail 5.L3")
    fail("summarizer given only the finding ids", summarizer(
        '"Находки: " + ", ".join(str(f["id"]) for f in findings)'), {"H3"}, section="must-fail 5.L3")
    # H3 location: the same JSON and bullet forms as the honest lines, with `file` and/or `line` left out.
    without = '[{k: v for k, v in f.items() if k not in %r} for f in findings]'
    fail("summarizer given findings as JSON without file and line", summarizer(
        '"Находки: " + _json.dumps(' + without % (("file", "line"),) + ', indent=2)'), {"H3"}, section="must-fail 5.L3")
    fail("summarizer given findings as JSON without line", summarizer(
        '"Находки: " + _json.dumps(' + without % (("line",),) + ')'), {"H3"}, section="must-fail 5.L3")
    fail("summarizer given findings as JSON without file", summarizer(
        '"Находки: " + _json.dumps(' + without % (("file",),) + ')'), {"H3"}, section="must-fail 5.L3")
    fail("summarizer given findings as a bullet list without file:line", summarizer(
        '"Находки ревью:\\n" + "".join(f"- {f[\'id\']}: `{f[\'quote\']}` - {f[\'claim\']}\\n" for f in findings)'),
        {"H3"}, section="must-fail 5.L3")
    fail("summarizer given <run>/accepted.json without file and line", summarizer(
        '_put(run_dir / "accepted.json", _json.dumps(' + without % (("file", "line"),) + '))\n'
        'return f"Находки ревью: {R}/accepted.json"'), {"H3"}, section="must-fail 5.L3")
    return lines


def attack_lines() -> list[Line]:
    lines: list[Line] = []

    def fail(name: str, mutation: Mutation, ids: set[str], **kw: object) -> None:
        lines.append(Line("must-fail 5.L3", name, mutation, ids, **kw))  # type: ignore[arg-type]

    placeholder = '{"diff_path": "work/none.diff", "summary": "", "findings": [], "finding_ids": [], "x": 0}'
    fail("continuing after a failure", patch(("        log.record(role, prompt, error.result, is_ok=False)\n        raise",
                                              f"        log.record(role, prompt, error.result, is_ok=False)\n"
                                              f"        return {placeholder}")), {"H4"})
    fail("retrying a failed call once", patch((
        "        log.record(role, prompt, error.result, is_ok=False)\n        raise",
        "        log.record(role, prompt, error.result, is_ok=False)\n"
        "        answer, message = call_role_with_result(role, prompt, ROLES_PATH, PROJECT)\n"
        "        log.record(role, prompt, message, is_ok=True)\n        return answer")), {"H4"})
    fail("report written on failure too", patch((EXCEPT_MAIN, EXCEPT_MAIN.replace(
        "        return 1\n", '        (run_dir / REPORT).write_text("{}", encoding="utf-8")\n        return 1\n'))), {"H4"})
    fail("exit 0 on failure", patch((EXCEPT_MAIN, EXCEPT_MAIN.replace("return 1", "return 0"))), {"H4"})
    fail("summarizer skipped", patch((S_CALL, 'summary = {"summary": "ok", "finding_ids": []}')), {"H1", "H4", "H6"})
    fail("fabricated session_id", patch(('"session_id": None if message is None else message.get("session_id"),',
                                         '"session_id": __import__("uuid").uuid4().hex,')), {"H5"})
    fail("fabricated cost (log and report)", patch(
        ('"total_cost_usd": 0 if message is None else message.get("total_cost_usd", 0),', '"total_cost_usd": 0.01,')),
         {"H5", "H6"})
    fail("rounded total round(x, 2)", patch((REPORT, REPORT.replace("log.total_cost_usd()",
                                                                    "round(log.total_cost_usd(), 2)"))), {"H6"})
    fail("hardcoded report", patch((REPORT, 'report = {"summary": "Изменение можно принимать.", "finding_ids": [], '
                                            '"total_cost_usd": 0.0}')), {"H6"})
    fail("failed calls not logged", patch(("        log.record(role, prompt, error.result, is_ok=False)\n", "")), {"H5"})
    fail("prompt_bytes counted in characters", patch(('"prompt_bytes": len(prompt.encode("utf-8")),',
                                                      '"prompt_bytes": len(prompt),')), {"H5"})
    fail("status always ok", patch(('"status": "ok" if is_ok else "failed",', '"status": "ok",')), {"H5"})
    fail("subtype null for failed calls", patch((
        '"subtype": None if message is None else message.get("subtype"),',
        '"subtype": message.get("subtype") if is_ok and message else None,')), {"H5"})
    fail("raw outputs in <copy>/pipeline/out/", patch((RAW_WRITE, RAW_WRITE + "\n    (PROJECT / 'pipeline' / 'out')"
                                                       ".mkdir(exist_ok=True)\n    (PROJECT / 'pipeline' / 'out' / "
                                                       "f'{role}.json').write_text('x')")), {"H7"})
    fail("raw outputs in the scratch tree next to the run dir", patch((RAW_WRITE, RAW_WRITE + "\n    (run_dir.parent / "
                                                                       "f'acw3-{role}.json').write_text('x')")), {"H7"})
    # No H3 since the student fix round: the findings reach the summarizer inline, and a quote JSON-escaped there
    # (`\"`) now counts as received; before, it was found only in the source file, which src/ does not resolve.
    fail("pipeline runs the calls from another directory", patch((CALL_INNER, CALL_INNER.replace(
        "PROJECT)", "PROJECT / 'src')"))), {"C9", "H2", "H7"})
    fail("reviewer without an MCP closure", patch((READER_FLAGS, '"reviewer": ["--tools", "Read,Grep,Glob"],'),
                                                  path=CALL_PY), {"C6"})
    fail("model hardcoded from the shipped roles file", patch(('str(settings["model"])', '"opus"'), path=CALL_PY), {"C3"})
    lines.append(Line("starter", "untouched starter (verify_pipeline.py)", nothing, {"H1", "H6"}, base="starter",
                      entry="verify"))
    lines.append(Line("attack", "usercustomize/sitecustomize in the workspace exiting 0", chain(
        lambda w: (w / "usercustomize.py").write_text("raise SystemExit(0)\n"),
        lambda w: (w / "sitecustomize.py").write_text("raise SystemExit(0)\n"),
        lambda w: (w / "pipeline" / "sitecustomize.py").write_text("raise SystemExit(0)\n")), {"H1", "H6"},
        base="starter", entry="verify"))
    lines.append(Line("attack", "a stub claude in the workspace answering success", chain(
        lambda w: (w / "pipeline" / "bin").mkdir(),
        lambda w: (w / "pipeline" / "bin" / "claude").write_text(
            "#!/bin/sh\ncat >/dev/null\necho '{\"type\": \"result\", \"subtype\": \"success\", \"is_error\": false, "
            "\"session_id\": \"s\", \"total_cost_usd\": 0, \"structured_output\": {\"diff_path\": \"x\", \"summary\": "
            "\"s\", \"findings\": [], \"finding_ids\": []}}'\n"),
        lambda w: os.chmod(w / "pipeline" / "bin" / "claude", 0o755),
        patch(('return ["claude", ', 'return [str(CONTRACTS_DIR.parent / "bin" / "claude"), '), path=CALL_PY)),
        {"H1", "H4", "H5", "H6"}, entry="verify"))
    return lines


def recorded_lines() -> list[Line]:
    lines: list[Line] = []

    def record(name: str, mutation: Mutation, **kw: object) -> None:
        lines.append(Line("recorded RS16/RS21", name, mutation, None, kind="record", runs="quick", **kw))  # type: ignore[arg-type]

    record("RS21: /tmp/stash/ referenced as a directory", reviewer(
        't = _tmp()\n_stash_coder(run_dir, t)\nreturn base + f" ctx {t}/"'), assert_no_outside_expansion=True)
    record("RS21: <run>/.. referenced as a directory", reviewer('base + f" ctx {R}/.."'), assert_no_outside_expansion=True)
    record("RS21: <copy>/.git/ctx/ referenced as a directory", reviewer(
        '_stash_coder(run_dir, C + "/.git/ctx")\nreturn base + " ctx .git/ctx/"'))
    record("RS21: $HOME/stash/ referenced as a directory", reviewer(
        '_stash_coder(run_dir, _os.path.expanduser("~/stash"))\nreturn base + " ctx ~/stash/"'))
    record("RS21: $TMPDIR/stash/ referenced as a directory", reviewer(
        'p = _os.path.join(_tempfile.gettempdir(), "stash")\n_stash_coder(run_dir, p)\nreturn base + f" ctx {p}/"'))
    record("RS21: a stash directory in a volume (/var/tmp)", reviewer(
        'p = "/var/tmp/acw3-" + _secrets.token_hex(5)\n_stash_coder(run_dir, p)\nreturn base + f" ctx {p}/"'))
    record("RS16: shell escape <run>/coder\\ out.json", reviewer(
        '_mv(run_dir, "coder out.json")\nreturn base + f" see {R}/coder\\\\ out.json"'))
    record("RS16: file://<run>/coder%20out.json", reviewer(
        '_mv(run_dir, "coder out.json")\nreturn base + f" file://{R}/coder%20out.json"'))
    record("RS16: a file named coder., given as <run>/coder.", reviewer('_mv(run_dir, "coder.")\nreturn base + f" see {R}/coder."'))
    record("RS16: a file named coder., given as <run>/coder..", reviewer('_mv(run_dir, "coder.")\nreturn base + f" see {R}/coder.."'))
    record("RS16: 16 boundary characters in a name", reviewer(
        '_mv(run_dir, "a b c d e f g h i j k l m n o p q.json")\n'
        'return base + f\' see "{R}/a b c d e f g h i j k l m n o p q.json"\''))
    record("RS16 r6: path followed by ..", reviewer('base + f" see {R}/coder.json.."'))
    record("RS16 r6: path followed by ...", reviewer('base + f" see {R}/coder.json..."'))
    record("RS16 r6: JSON-escaped \\/", reviewer('base + " " + _json.dumps({"ctx": R + "/coder.json"}).replace("/", "\\\\/")'))
    record("RS16 r6: JSON \\uXXXX escapes in a name", reviewer(
        '_mv(run_dir, "кодер.json")\nreturn base + " " + _json.dumps({"ctx": R + "/кодер.json"})'))
    record("RS16 r6: path glued to the end of a word", reviewer('base + f" ctx{R}/coder.json"'))
    record("RS16 r6: path followed directly by a name character", reviewer('base + f" see {R}/coder.json_"'))
    # Student fix round, out of scope by Stepan's decision (2026-11-04): encodings, reversal and stripping the
    # grader's markers by their format. Recorded, nothing asserted; a mentor reviews the diff for these.
    for name, body in (
            ("base64 of the coder summary", 'base + "\\nNotes (b64): " + __import__("base64").b64encode('
                                            'str(change["summary"]).encode()).decode()'),
            ("coder summary reversed", 'base + "\\nNotes reversed: " + str(change["summary"])[::-1]'),
            ("coder summary with the nt-markers stripped",
             'base + "\\nNotes: " + __import__("re").sub(r"nt[0-9a-f]{12}", "", str(change["summary"]))'),
            ("coder summary with the nt-markers split by a space",
             'base + "\\n" + __import__("re").sub(r"(nt)([0-9a-f]{12})", r"\\1 \\2", str(change["summary"]))'),
            ("coder summary gzip-compressed in <run>/notes.gz", '(run_dir / "notes.gz").write_bytes(__import__("gzip")'
                                                                '.compress(str(change["summary"]).encode()))\n'
                                                                'return base + f"\\nNotes: {R}/notes.gz"')):
        lines.append(Line("recorded residual (student)", name, reviewer(body), None, kind="record", runs="quick"))
    # RS-C9a for L3 (hold-and-poll round): a stash written later than LONG_HOLD_SEC into the call is never polled.
    rs = "recorded residual RS-C9a"
    lines.append(Line(rs, "X1 at 3.5 s: appended to the coder's diff file after the hold ends", during(
        R_CALL, 'diff_file = PROJECT / str(change["diff_path"])\noriginal = diff_file.read_bytes()',
        'diff_file.write_bytes(original + b"\\n# coder notes: " + str(change["summary"]).encode("utf-8"))',
        "diff_file.write_bytes(original)", 3.5), None, kind="record", runs="quick"))
    lines.append(Line(rs, "X3 at 3.5 s: <run>/reviewer-context.md rewritten after the hold ends", during(
        R_CALL, 'context = run_dir / "reviewer-context.md"\n'
                'context.write_text(reviewer_prompt(str(change["diff_path"]), arguments.acceptance), encoding="utf-8")',
        'context.write_text("Coder notes: " + str(change["summary"]), encoding="utf-8")', 'None', 3.5,
        'review = call("reviewer", f"Review the change described in {context}.", run_dir, log)'),
        None, kind="record", runs="quick"))
    # Authoring note (round 6 note 2): a run-dir name outside the alphabet makes a span that names the run dir.
    lines.append(Line("authoring note", "run-dir name '#1.json' given to the summarizer expands the whole run dir",
                      summarizer('_put(run_dir / "#1.json", _json.dumps(findings))\nreturn f"Находки: {R}/#1.json"'),
                      {"H3"}))
    return lines


# ---------------------------------------------------------------------------------------------------------
# Running
# ---------------------------------------------------------------------------------------------------------


def build(line: Line, work: Path, number: int) -> Path:
    workspace = work / f"ws-{number:03d}"
    shutil.rmtree(workspace, ignore_errors=True)
    shutil.copytree(STARTER, workspace, ignore=shutil.ignore_patterns("__pycache__"))
    if line.base == "reference":
        shutil.copytree(REFERENCE / "pipeline", workspace / "pipeline", dirs_exist_ok=True)
    line.mutate(workspace)
    return workspace


def run_once(line: Line, workspace: Path) -> dict[str, object]:
    if line.entry == "verify":
        command = [sys.executable, "-I", "-B", str(CHECKS / "verify_pipeline.py")]
    else:
        command = [sys.executable, "-I", "-B", str(REFERENCE / "drive_l3.py")]
        if line.layout:
            command += ["--layout", line.layout]
        if line.plant_git:
            command.append("--plant-git")
        if line.pseudo_root:
            command += ["--pseudo-root", str(pseudo_root_dir)]
            if line.simulate_fd:
                command.append("--simulate-fd")
    started = time.monotonic()
    completed = subprocess.run(command, cwd=workspace, capture_output=True, text=True, timeout=300)
    seconds = time.monotonic() - started
    if line.entry == "verify":
        printed = completed.stdout.splitlines()
        calls: list[dict[str, object]] = []
    else:
        try:
            data = json.loads(completed.stdout)
            printed, calls = list(data["lines"]), list(data["calls"])
        except (ValueError, KeyError):
            printed, calls = [completed.stdout + completed.stderr], []
    ids = {m.group(1) for m in map(ID_PATTERN.match, printed) if m}
    return {"code": completed.returncode, "ids": ids, "out": "\n".join(printed)[:800] + completed.stderr[-400:],
            "calls": calls, "seconds": seconds}


def lies_in(path: str, root: str) -> bool:
    return path == root or path.startswith(root.rstrip("/") + "/")


def material_problems(line: Line, calls: list[dict[str, object]]) -> list[str]:
    problems = []
    for call in calls:
        run_dir, copy = str(call["runDir"]), str(call["copy"])
        run_real = os.path.realpath(run_dir) if os.path.exists(run_dir) else run_dir
        for path in call["expanded"]:  # type: ignore[union-attr]
            if not (lies_in(str(path), run_dir) or lies_in(str(path), run_real)):
                problems.append(f"expanded outside the run dir: {path}")
        for path in call["files"]:  # type: ignore[union-attr]
            path = str(path)
            in_copy = lies_in(path, copy) and not lies_in(path, copy + "/.git")
            named = any(lies_in(path, os.path.join(run_dir, name).rstrip("/")) for name in line.run_reads)
            if not (in_copy or named):
                problems.append(f"read beyond the named files: {path}")
        if float(str(call["seconds"])) >= DETECTION_LIMIT_SEC:
            problems.append(f"reference detection {call['seconds']:.3f} s")
    return problems


def hold_problems(calls: list[dict[str, object]], long_hold_sec: float) -> list[str]:
    """Hold-and-poll wiring in one graded run: exactly one call of each role held `long_hold_sec`, none other."""
    held = sorted(str(c["role"]) for c in calls if float(str(c["holdSec"])) == long_hold_sec)
    other = [c for c in calls if float(str(c["holdSec"])) not in (0.0, long_hold_sec)]
    problems = [] if held == ["coder", "reviewer", "summarizer"] else [f"held calls {held}"]
    return problems + ([f"other hold {other[0]['holdSec']}"] if other else [])


def verdict(line: Line) -> tuple[bool, str]:
    codes = [int(str(r["code"])) for r in line.results]
    id_sets = [r["ids"] for r in line.results]
    seen = sorted({",".join(sorted(ids)) or "-" for ids in id_sets})  # type: ignore[arg-type]
    slowest = max(float(str(c["seconds"])) for r in line.results for c in r["calls"]) if any(
        r["calls"] for r in line.results) else 0.0
    detail = f"{codes.count(0)}/{len(codes)} pass, ids {seen}, slowest detection {slowest:.4f} s"
    if line.kind == "pass":
        problems = [p for r in line.results for p in (material_problems(line, r["calls"]) if line.check_material  # type: ignore[arg-type]
                                                      else [])]
        long_hold = float(str(STATIC.get("long_hold_sec", 0)))
        problems += [p for r in line.results if r["calls"] for p in hold_problems(r["calls"], long_hold)]  # type: ignore[arg-type]
        ok = all(code == 0 for code in codes) and not problems
        bad = next((str(r["out"]) for r in line.results if r["code"] != 0), "")
        if problems:
            detail += f" :: material {sorted(set(problems))[:3]}"
        if bad:
            detail += f" :: {bad.strip()[:600]}"
        return ok, detail
    if line.kind == "record":
        expanded = sorted({str(p) for r in line.results for c in r["calls"] for p in c["expanded"]})  # type: ignore[union-attr]
        outside = [p for r in line.results for p in material_problems(line, r["calls"]) if p.startswith("expanded")]  # type: ignore[arg-type]
        ok = not outside if line.assert_no_outside_expansion else True
        return ok, detail + f", expanded {[os.path.basename(p) for p in expanded][:4]}" + (
            f" :: {outside[:2]}" if outside else "")
    ok = all(code == 1 and ids == line.expect for code, ids in zip(codes, id_sets))
    if not ok:
        detail += " :: " + str(line.results[0]["out"]).strip()[:700]
    return ok, detail


# ---------------------------------------------------------------------------------------------------------
# Environment: leftover try-fake dirs and a concurrent same-uid writer
# ---------------------------------------------------------------------------------------------------------

WRITER = '''
import os, sys, time
roots = sys.argv[1:]
i = 0
while not os.path.exists(os.path.join(roots[0], "STOP")):
    for root in roots:
        for rel in ("claude-1/tool-results/x.txt", "projects/p/s/tool-results/x.txt",
                    "projects/p/s/subagents/agent-1.jsonl", "history"):
            path = os.path.join(root, rel)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "a") as handle:
                handle.write(f"{i}\\n")
    i += 1
    time.sleep(0.01)
'''


def leftovers(count: int) -> list[str]:
    created = []
    for _ in range(count):
        directory = tempfile.mkdtemp(prefix=PREFIX + "left-", dir="/tmp")
        Path(directory, "coder.json").write_text(json.dumps({"summary": "nt" + secrets.token_hex(6) + " old run"}))
        created.append(directory)
    return created


def cleanup() -> list[str]:
    removed = []
    for root in ("/tmp", "/var/tmp", str(HOME)):
        for name in os.listdir(root):
            if name.startswith(PREFIX):
                path = os.path.join(root, name)
                if os.path.islink(path) or os.path.isfile(path):
                    os.remove(path)
                else:
                    shutil.rmtree(path, ignore_errors=True)
                removed.append(path)
    return removed


def static_lines() -> list[tuple[str, bool, str]]:
    sys.path.insert(0, str(CHECKS))
    sys.dont_write_bytecode = True
    import orchestra_runtime as rt
    import verify_pipeline as vp

    results = []
    same = (CHECKS / "launch.py").read_bytes() == (STARTER / "devtools" / "launch.py").read_bytes()
    results.append(("checks/launch.py and starter devtools/launch.py are identical", same, ""))
    shared = subprocess.run([sys.executable, "-I", "-B", str(MODULE / "shared_files.py"), "check"],
                            capture_output=True, text=True)
    results.append(("shared_files.py check", shared.returncode == 0, shared.stdout.strip()))
    shipped, data = STARTER / ".claude", CHECKS / "data" / "l1-reference-claude-config"
    same_config = all((shipped / rel).read_bytes() == (data / rel).read_bytes()
                      for rel in ("settings.json", "agents/code-reviewer.md", "agents/coder.md"))
    results.append(("starter .claude config equals the C9 data", same_config, ""))
    leaks = [str(p.relative_to(STARTER)) for p in STARTER.rglob("*") if p.is_file()
             and ("ACADEMY_CHECKS_DIR" in p.read_text(encoding="utf-8", errors="replace")
                  or "checks/" in p.read_text(encoding="utf-8", errors="replace"))]
    results.append(("no starter file names checks/ or ACADEMY_CHECKS_DIR", not leaks, str(leaks)))
    # Grader-generated text names no writable-root path, no `..`, and holds no drawn reply value (round 3, note 5).
    work = Path(tempfile.mkdtemp(prefix=PREFIX + "gen-", dir="/tmp"))
    try:
        copy = work / "copy"
        shutil.copytree(STARTER, copy)
        lines = vp.snapshot_lines(copy)
        bad: list[str] = []
        drawn = re.compile(r"nt[0-9a-f]{12}|F-[0-9a-f]{10}|/tmp|/var|~/|\.\.")
        ascii_lines = 0
        stub_texts = [(STARTER / "docs" / "pipeline-brief.md").read_text(encoding="utf-8")]
        stub_texts += [p.read_text(encoding="utf-8") for p in (STARTER / "pipeline" / "contracts").glob("*.md")]
        for _ in range(100):
            inputs = vp.write_run_inputs(copy, lines)
            texts = [inputs.diff_text, (copy / "task" / "acceptance.md").read_text(encoding="utf-8"),
                     (copy / "task" / "request.md").read_text(encoding="utf-8")]
            bad += [m.group() for text in texts for m in drawn.finditer(text)]
            # The diff stays printable ASCII (source lines); the task and the acceptance always hold non-ASCII
            # text (student fix round), so a log counting characters differs from one counting bytes.
            bad += [t for t in texts[:1] if not all(" " <= ch <= "~" or ch == "\n" for ch in t)]
            ascii_lines += sum(t.isascii() for t in texts[1:])
        for text in stub_texts:
            for candidate in rt.reference_candidates(text, "/home"):
                if candidate.startswith(("/tmp", "/var", "/home")) or ".." in candidate.split("/"):
                    bad.append(candidate)
        results.append(("100 generated diffs, acceptance and task texts, the brief and the contracts: no /tmp, "
                        "~/, .., run-dir path or drawn value; the diff is printable ASCII; every task and acceptance "
                        "text holds non-ASCII", not bad and ascii_lines == 0, f"{bad[:5]}, all-ASCII: {ascii_lines}"))
        import inspect
        params = list(inspect.signature(vp.write_run_inputs).parameters)
        results.append(("the run-input generator takes no run plan (same work whatever the scenario)",
                        params == ["copy", "lines"], str(params)))
        STATIC["long_hold_sec"] = vp.LONG_HOLD_SEC
        held_ok = True
        for _ in range(200):
            drawn_plans = vp.draw_plans()
            held_runs = vp.draw_held_runs(drawn_plans)
            held_ok &= sorted(held_runs) == sorted(vp.ROLES) and len(set(held_runs.values())) == len(vp.ROLES)
            for role, number in held_runs.items():
                plan = drawn_plans[[p.number for p in drawn_plans].index(number)]
                held_ok &= plan.failing_role is None or vp.ROLES.index(plan.failing_role) >= vp.ROLES.index(role)
        results.append(("200 hold draws: three different runs, each role's held run is a run whose plan reaches that role", held_ok, ""))
        # HoldTreeSnapshot caches digests by lstat signature; it must give rt.tree_snapshot's answer after each
        # kind of change a stash makes, including a same-size rewrite with the mtime set back.
        tree = work / "tree"
        (tree / "d").mkdir(parents=True)
        (tree / "d" / "a.txt").write_text("aaaa")
        os.symlink("a.txt", tree / "d" / "l")
        cached = vp.HoldTreeSnapshot([tree], lambda path: False)
        agree = [cached() == rt.tree_snapshot([tree], lambda path: False)]
        before = os.stat(tree / "d" / "a.txt")
        for change in (lambda: (tree / "d" / "a.txt").write_text("bbbb"),
                       lambda: os.utime(tree / "d" / "a.txt", ns=(before.st_atime_ns, before.st_mtime_ns)),
                       lambda: (os.remove(tree / "d" / "l"), os.symlink("b.txt", tree / "d" / "l")),
                       lambda: (tree / "d" / "new.txt").write_text("n"),
                       lambda: os.remove(tree / "d" / "new.txt")):
            change()
            agree.append(cached() == rt.tree_snapshot([tree], lambda path: False))
        results.append(("HoldTreeSnapshot equals rt.tree_snapshot after a rewrite, a same-size rewrite with the "
                        "mtime set back, a re-pointed symlink, a new file and a removal", all(agree), str(agree)))
        plans = [vp.draw_plans() for _ in range(200)]
        covered = all(sum(p.failing_role is None for p in ps) == 2 and {p.failing_role for p in ps} >= set(vp.ROLES)
                      and len({p.failure for p in ps if p.failure}) == 4 for ps in plans)
        results.append(("200 plan draws: 2 ok runs, failures at all three joints with 4 distinct kinds", covered, ""))
    finally:
        shutil.rmtree(work, ignore_errors=True)
    caches = [str(p) for p in LESSON.rglob("__pycache__")]
    results.append(("no __pycache__ in the lesson", not caches, str(caches)))
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--runs", type=int, default=20)
    parser.add_argument("--quick-runs", type=int, default=5)
    parser.add_argument("--jobs", type=int, default=8)
    parser.add_argument("--only", default="")
    parser.add_argument("--leftovers", type=int, default=1000)
    arguments = parser.parse_args()
    arguments.work.mkdir(parents=True, exist_ok=True)
    global pseudo_root_dir
    pseudo_root_dir = arguments.work / "pseudo-root"
    shutil.rmtree(pseudo_root_dir, ignore_errors=True)
    pseudo_root_dir.mkdir()
    os.symlink("/", pseudo_root_dir / "root")
    # A terminated demo still stops the writer and removes the acw3-* entries (the finally below).
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))
    failed = 0
    for name, ok, detail in static_lines():
        failed += not ok
        print(f"{'ok ' if ok else 'XX '}[static] {name} :: {detail}", flush=True)
    corpus = [line for line in honest_lines() + inscope_lines() + attack_lines() + recorded_lines()
              if arguments.only in f"{line.section} {line.name}"]
    created = leftovers(arguments.leftovers)
    writer_root = Path(tempfile.mkdtemp(prefix=PREFIX + "writer-", dir="/tmp"))
    home_root = HOME / f"{PREFIX}writer-home-{secrets.token_hex(4)}"
    home_root.mkdir()
    writer = subprocess.Popen([sys.executable, "-I", "-c", WRITER, str(writer_root), str(home_root)])
    started = time.monotonic()
    try:
        jobs = []
        for number, line in enumerate(corpus):
            workspace = build(line, arguments.work, number)
            count = arguments.quick_runs if line.runs == "quick" else arguments.runs
            jobs.extend((line, workspace) for _ in range(count))
        with ThreadPoolExecutor(max_workers=arguments.jobs) as executor:
            for (line, _), result in zip(jobs, executor.map(lambda job: run_once(*job), jobs)):
                line.results.append(result)
    finally:
        (writer_root / "STOP").write_text("")
        writer.wait(timeout=30)
        written = sum(1 for _ in writer_root.rglob("*")) + sum(1 for _ in home_root.rglob("*"))
        removed = cleanup()
    print(f"environment: {len(created)} leftover try-fake dirs in /tmp; the writer touched {written} paths under "
          f"/tmp and the home; cleanup removed {len(removed)} acw3-* entries", flush=True)
    for line in corpus:
        ok, detail = verdict(line)
        failed += not ok
        expect = "pass" if line.kind == "pass" else ("record" if line.kind == "record" else
                                                      "{" + ",".join(sorted(line.expect or set())) + "}")
        print(f"{'ok ' if ok else 'XX '}[{line.section}] {line.name} -> {expect} :: {detail}", flush=True)
    print(f"TOTAL {len(corpus)} lines, {len(corpus) - sum(not verdict(l)[0] for l in corpus)} ok, {failed} XX "
          f"(static included), {sum(len(l.results) for l in corpus)} graded runs, {time.monotonic() - started:.0f} s")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
