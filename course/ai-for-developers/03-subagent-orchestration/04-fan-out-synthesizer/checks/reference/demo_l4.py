"""Demo of fan-out (design #43 revision 6, sections 4.6, 5.L4 and 11): honest corpus first, then attacks.

Run with the pinned interpreter from a directory holding no `claude`:

    <python3.12> -I -B demo_l4.py --work <scratch dir> [--runs 20] [--form-runs 50] [--quick-runs 5] [--jobs 16]
                                  [--burners 4] [--only <text>] [--exclude <section text>]

Every line builds a workspace (the starter, or the starter with checks/reference/ laid over it, plus exactly one
change), grades it through `drive_l4.py` (the check with the demo hooks) or through `verify_fan_out.py` itself,
and prints `ok` or `XX`.
- must-pass: every run exits 0; for 4.6 lines also: no directory outside the run dir was expanded, every file
  read lies in the copy outside `.git` or is a run-dir file the line names, detection took under 0.2 s per call;
  fan-out form lines also print the widest start gap of the three section calls;
- must-fail: every run exits 1 and the set of requirement ids printed is exactly the named set;
- recorded (RS16 / RS21): the observed ids are printed; only `<run>/..` and `/tmp/stash/` assert anything.

The fan-out form lines run `--form-runs` times while `--burners` busy processes load the CPU ("50/50 under load").
During the whole corpus 1000 leftover try-fake run dirs sit in the real /tmp, and a same-uid writer keeps creating
and changing files under the real /tmp and the real home. Everything the demo or its variants create outside the
scratch dir starts with `acw4-` and is removed at the end.
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
ID_PATTERN = re.compile(r"^не выполнено: ([CFH]\d+)")
DETECTION_LIMIT_SEC = 0.2
PREFIX = "acw4-"
HOME = Path(os.path.expanduser("~"))

Mutation = Callable[[Path], None]


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
    runs: str = "full"  # full | form | quick | once
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


def write_file(path: str, text: str) -> Mutation:
    def apply(workspace: Path) -> None:
        (workspace / path).write_text(text, encoding="utf-8")
    return apply


def edit_schema(role: str, change: Callable[[dict[str, object]], None]) -> Mutation:
    """Load a contract schema as JSON, let `change` edit the item schema of its findings, write it back."""
    def apply(workspace: Path) -> None:
        target = workspace / "pipeline" / "contracts" / f"{role}.schema.json"
        schema = json.loads(target.read_text(encoding="utf-8"))
        change(schema)
        target.write_text(json.dumps(schema, indent=2), encoding="utf-8")
    return apply


def _items(schema: dict[str, object]) -> dict[str, object]:
    return schema["properties"]["findings"]["items"]  # type: ignore[index,return-value]


def nothing(_: Path) -> None:
    return None


# Anchors in checks/reference/pipeline/run.py and the starter's pipeline/claude_call.py.
PROMPTS = "prompts = {section: section_prompt(section, diff_path, acceptance) for section in SECTIONS}"
SECTIONS_CALL = ('findings, unreviewed = review_sections(str(change["diff_path"]), arguments.acceptance, run_dir, '
                 'log)')
SYN_CALL = 'synthesis = call("synthesizer", synthesizer_prompt(findings), run_dir, log)'
S_CALL = 'summary = call("summarizer", summarizer_prompt(synthesized), run_dir, log)'
CODER_CALL = 'change = call("coder", coder_prompt(arguments.task), run_dir, log)'
CALL_INNER = "answer, message = call_role_with_result(role, prompt, ROLES_PATH, PROJECT)"
PARSE = "def parse_arguments(argv: list[str]) -> argparse.Namespace:"
REPORT_ANCHOR = '"total_cost_usd": log.total_cost_usd(), "status": report_status(unreviewed, synthesized),'
EXCEPT_SECTION = ('            except RoleCallError as error:\n                print(f"section not reviewed: {error}", '
                  'file=sys.stderr)\n                unreviewed.append(section)\n                continue\n')
RAW_WRITE = ('(run_dir / f"{role}.json").write_text(json.dumps(message, ensure_ascii=False, indent=2), '
             'encoding="utf-8")')
SUBPROCESS = "completed = subprocess.run(command, input=prompt, capture_output=True, text=True, cwd=workdir,"
CONTRACT_FLAG = '"--append-system-prompt-file", str(CONTRACTS_DIR / f"{role}.md"),'
ROLE_FLAG_TAIL = "*ROLE_FLAGS[role]]"
IMPORT = "from claude_call import RoleCallError, call_role_with_result"
ALL_ROLES = ("coder", "security", "performance", "tests", "synthesizer", "summarizer")

# Helpers the variants use inside run.py. Everything they create outside the scratch dir starts with acw4-.
PRELUDE = '''
import os as _os, json as _json, secrets as _secrets, tempfile as _tempfile, pwd as _pwd


def _tmp() -> str:
    path = "/tmp/acw4-" + _secrets.token_hex(5)
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

_PRELUDE_ONCE = "\n_DEMO_PRELUDE = True\n"


def _function(name: str, header: str, setup: str, body: str) -> str:
    code = body if "return" in body else f"return {body}"
    return (f"\n\ndef {name}({header}):\n" + "".join(f"    {line}\n" for line in setup.splitlines())
            + "".join(f"    {line}\n" for line in code.splitlines()) + "\n\n")


def section(body: str, only: str | None = "security") -> Mutation:
    """Replace the prompt of section `only` by `body`, a Python expression or block ending in `return`; the other
    sections keep theirs. Names: base, section, d (diff_path), R (run dir), C (project), A (acceptance path),
    run_dir, change (the coder's answer) and the PRELUDE helpers. The prompts are built in the main thread before
    any section call starts, so a body runs once per run."""
    skip = "" if only is None else f"if section != {only!r}:\n    return base\n"
    setup = ("base = section_prompt(section, diff_path, acceptance)\n" + skip +
             "change = _DEMO_CHANGE['change']\n"
             "d, R, C, A = str(diff_path), str(run_dir), str(PROJECT), str(acceptance)")
    function = _function("demo_section_prompt", "section, run_dir, diff_path, acceptance", setup, body)
    return patch((PROMPTS, "prompts = {section: demo_section_prompt(section, run_dir, diff_path, acceptance) "
                           "for section in SECTIONS}"),
                 (SECTIONS_CALL, "_DEMO_CHANGE['change'] = change\n        " + SECTIONS_CALL),
                 (PARSE, PRELUDE + "\n_DEMO_CHANGE = {}\n" + function + PARSE))


def _ensure_prelude(text: str) -> str:
    if "_DEMO_CHANGE = {}" in text:
        return text
    return text.replace(PARSE, PRELUDE + "\n_DEMO_CHANGE = {}\n" + PARSE, 1)


def role_prompt(call_anchor: str, role: str, builder: str, argument: str, body: str) -> Mutation:
    def apply(workspace: Path) -> None:
        target = workspace / RUN_PY
        text = _ensure_prelude(target.read_text(encoding="utf-8"))
        setup = f"base = {builder}({argument})\nR, C = str(run_dir), str(PROJECT)"
        function = _function(f"demo_{role}_prompt", f"run_dir, {argument}", setup, body)
        new_call = call_anchor.replace(f"{builder}({argument})", f"demo_{role}_prompt(run_dir, {argument})")
        assert text.count(call_anchor) == 1 and text.count(PARSE) == 1, role
        text = text.replace(call_anchor, new_call).replace(PARSE, function + PARSE, 1)
        target.write_text(text, encoding="utf-8")
    return apply


def synthesizer(body: str) -> Mutation:
    """Replace the synthesizer's prompt; names: base, findings, R, C, run_dir and the PRELUDE helpers."""
    return role_prompt(SYN_CALL, "synthesizer", "synthesizer_prompt", "findings", body)


def summarizer(body: str) -> Mutation:
    """Replace the summarizer's prompt; names: base, synthesized, R, C, run_dir and the PRELUDE helpers."""
    return role_prompt(S_CALL, "summarizer", "summarizer_prompt", "synthesized", body)


def extra_flags_hook() -> Mutation:
    """claude_call gains EXTRA_FLAGS[role], appended to that role's call line (set by run.py variants)."""
    return patch(("ROLE_FLAGS: dict[str, list[str]] = {", "EXTRA_FLAGS: dict[str, list[str]] = {}\n"
                  "ROLE_FLAGS: dict[str, list[str]] = {"),
                 (ROLE_FLAG_TAIL, "*ROLE_FLAGS[role], *EXTRA_FLAGS.get(role, [])]"), path=CALL_PY)


def system_prompt_file() -> Mutation:
    return patch((CONTRACT_FLAG, '"--system-prompt-file", str(CONTRACTS_DIR / f"{role}.md"),'), path=CALL_PY)


def positional_prompt() -> Mutation:
    return patch((SUBPROCESS, 'completed = subprocess.run(command + ["--", prompt], input="", capture_output=True, '
                              'text=True, cwd=workdir,'), path=CALL_PY)


# ---------------------------------------------------------------------------------------------------------
# Fan-out forms: review_sections rewritten around `_fan_out(prompts, run_dir, log) -> {section: answer | error}`
# ---------------------------------------------------------------------------------------------------------

REVIEW_TEMPLATE = '''def review_sections(diff_path: str, acceptance: Path, run_dir: Path,
                    log: HandoffLog) -> tuple[list[dict[str, object]], list[str]]:
    prompts = {section: section_prompt(section, diff_path, acceptance) for section in SECTIONS}
    outcomes = _fan_out(prompts, run_dir, log)
    findings: list[dict[str, object]] = []
    unreviewed: list[str] = []
    for section in SECTIONS:
        outcome = outcomes[section]
        if isinstance(outcome, RoleCallError):
            unreviewed.append(section)
            continue
        findings.extend(outcome["findings"])
    if len(unreviewed) == len(SECTIONS):
        raise AllSectionsFailed("every section call failed")
    return findings, unreviewed


def _finish(role, prompt, code, stdout, stderr, run_dir, log):
    """What `call` does after the process ended, for forms that run `claude` themselves."""
    import claude_call as _cc
    message = _cc.last_result_message(stdout)
    try:
        answer = _cc.checked_answer(role, code, message, stderr)
    except RoleCallError as error:
        log.record(role, prompt, error.result, is_ok=False)
        return error
    (run_dir / f"{role}.json").write_text(json.dumps(message, ensure_ascii=False, indent=2), encoding="utf-8")
    log.record(role, prompt, message, is_ok=True)
    return answer


def _guarded(role, prompt, run_dir, log):
    try:
        return call(role, prompt, run_dir, log)
    except RoleCallError as error:
        return error


'''

FORMS: dict[str, str] = {
    "ThreadPoolExecutor with map": '''
def _fan_out(prompts, run_dir, log):
    with ThreadPoolExecutor(3) as pool:
        answers = pool.map(lambda s: _guarded(s, prompts[s], run_dir, log), SECTIONS)
        return dict(zip(SECTIONS, answers))
''',
    "manual threading.Thread": '''
def _fan_out(prompts, run_dir, log):
    outcomes = {}
    def work(section):
        outcomes[section] = _guarded(section, prompts[section], run_dir, log)
    threads = [threading.Thread(target=work, args=(s,)) for s in SECTIONS]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return outcomes
''',
    "asyncio.create_subprocess_exec + gather": '''
def _fan_out(prompts, run_dir, log):
    import asyncio
    import claude_call as _cc
    async def one(section):
        process = await asyncio.create_subprocess_exec(
            *_cc.build_command(section, ROLES_PATH), stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE, cwd=PROJECT)
        out, err = await process.communicate(prompts[section].encode("utf-8"))
        return section, _finish(section, prompts[section], process.returncode, out.decode("utf-8"),
                                err.decode("utf-8"), run_dir, log)
    async def every():
        return dict(await asyncio.gather(*(one(s) for s in SECTIONS)))
    return asyncio.run(every())
''',
    "Popen x3 with a positional prompt, then communicate() on each": '''
def _fan_out(prompts, run_dir, log):
    import subprocess
    import claude_call as _cc
    processes = {s: subprocess.Popen([*_cc.build_command(s, ROLES_PATH), "--", prompts[s]],
                                     stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     text=True, cwd=PROJECT) for s in SECTIONS}
    outcomes = {}
    for s, process in processes.items():
        out, err = process.communicate()
        outcomes[s] = _finish(s, prompts[s], process.returncode, out, err, run_dir, log)
    return outcomes
''',
    "Popen x3 on stdin: write and close stdin, then stdout.read() and wait()": '''
def _fan_out(prompts, run_dir, log):
    import subprocess
    import claude_call as _cc
    processes = {}
    for s in SECTIONS:
        process = subprocess.Popen(_cc.build_command(s, ROLES_PATH), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=subprocess.DEVNULL, text=True, cwd=PROJECT)
        process.stdin.write(prompts[s])
        process.stdin.close()
        processes[s] = process
    outcomes = {}
    for s, process in processes.items():
        out = process.stdout.read()
        process.wait()
        outcomes[s] = _finish(s, prompts[s], process.returncode, out, "", run_dir, log)
    return outcomes
''',
    "Popen x3 on stdin: write and close stdin, set p.stdin = None, then communicate()": '''
def _fan_out(prompts, run_dir, log):
    import subprocess
    import claude_call as _cc
    processes = {}
    for s in SECTIONS:
        process = subprocess.Popen(_cc.build_command(s, ROLES_PATH), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, text=True, cwd=PROJECT)
        process.stdin.write(prompts[s])
        process.stdin.close()
        process.stdin = None
        processes[s] = process
    outcomes = {}
    for s, process in processes.items():
        out, err = process.communicate()
        outcomes[s] = _finish(s, prompts[s], process.returncode, out, err, run_dir, log)
    return outcomes
''',
}
for _method in ("fork", "spawn", "forkserver"):
    FORMS[f"ProcessPoolExecutor ({_method}, __main__ guard)"] = f'''
def _pool_call(role, prompt):
    try:
        return ("ok", *call_role_with_result(role, prompt, ROLES_PATH, PROJECT))
    except RoleCallError as error:
        return ("error", error.role, error.kind, error.detail, error.result)


def _fan_out(prompts, run_dir, log):
    import multiprocessing
    from concurrent.futures import ProcessPoolExecutor
    with ProcessPoolExecutor(3, mp_context=multiprocessing.get_context({_method!r})) as pool:
        futures = {{s: pool.submit(_pool_call, s, prompts[s]) for s in SECTIONS}}
        results = {{s: f.result() for s, f in futures.items()}}
    outcomes = {{}}
    for s, result in results.items():
        if result[0] == "error":
            error = RoleCallError(*result[1:])
            log.record(s, prompts[s], error.result, is_ok=False)
            outcomes[s] = error
            continue
        (run_dir / f"{{s}}.json").write_text(json.dumps(result[2], ensure_ascii=False, indent=2), encoding="utf-8")
        log.record(s, prompts[s], result[2], is_ok=True)
        outcomes[s] = result[1]
    return outcomes
'''

SERIAL_FORMS: dict[str, str] = {
    "sequential: submit(...).result() inside the loop (the theory's bug)": '''
def _fan_out(prompts, run_dir, log):
    outcomes = {}
    with ThreadPoolExecutor() as pool:
        for s in SECTIONS:
            outcomes[s] = pool.submit(_guarded, s, prompts[s], run_dir, log).result()
    return outcomes
''',
    "2 + 1: two sections together, then the third": '''
def _fan_out(prompts, run_dir, log):
    with ThreadPoolExecutor(2) as pool:
        first = {s: pool.submit(_guarded, s, prompts[s], run_dir, log) for s in SECTIONS[:2]}
        outcomes = {s: f.result() for s, f in first.items()}
    outcomes[SECTIONS[2]] = _guarded(SECTIONS[2], prompts[SECTIONS[2]], run_dir, log)
    return outcomes
''',
    "threads, but a lock serialises the calls": '''
_SERIAL = threading.Lock()


def _fan_out(prompts, run_dir, log):
    def locked(s):
        with _SERIAL:
            return _guarded(s, prompts[s], run_dir, log)
    with ThreadPoolExecutor(3) as pool:
        futures = {s: pool.submit(locked, s) for s in SECTIONS}
        return {s: f.result() for s, f in futures.items()}
''',
    "Popen started and communicate(input=...) in the same loop": '''
def _fan_out(prompts, run_dir, log):
    import subprocess
    import claude_call as _cc
    outcomes = {}
    for s in SECTIONS:
        process = subprocess.Popen(_cc.build_command(s, ROLES_PATH), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, text=True, cwd=PROJECT)
        out, err = process.communicate(input=prompts[s])
        outcomes[s] = _finish(s, prompts[s], process.returncode, out, err, run_dir, log)
    return outcomes
''',
    "sequential, each section given the answers of the sections before it": '''
def _fan_out(prompts, run_dir, log):
    outcomes = {}
    seen = []
    for s in SECTIONS:
        prompt = prompts[s] + ("\\nУже найдено другими разделами: " + json.dumps(seen) if seen else "")
        outcomes[s] = _guarded(s, prompt, run_dir, log)
        if not isinstance(outcomes[s], RoleCallError):
            seen.extend(outcomes[s]["findings"])
    return outcomes
''',
}


def fan_out_form(code: str) -> Mutation:
    def apply(workspace: Path) -> None:
        target = workspace / RUN_PY
        text = target.read_text(encoding="utf-8")
        start, end = text.index("def review_sections("), text.index("def report_status(")
        text = text[:start] + REVIEW_TEMPLATE + code.lstrip("\n") + "\n\n" + text[end:]
        target.write_text(text, encoding="utf-8")
    return apply


def early_synthesizer() -> Mutation:
    """Wait for two sections, call the synthesizer, and only then collect the third section for the report: the
    log, the cost and `unreviewed` stay right, so the only fault is the synthesizer's start and its input."""
    code = REVIEW_TEMPLATE.replace("    outcomes = _fan_out(prompts, run_dir, log)\n",
                                   "    outcomes = _fan_out(prompts, run_dir, log)\n"
                                   "    late = outcomes.pop(SECTIONS[2])\n").replace(
        "    for section in SECTIONS:\n        outcome = outcomes[section]\n",
        "    for section in SECTIONS[:2]:\n        outcome = outcomes[section]\n").replace(
        "    if len(unreviewed) == len(SECTIONS):\n",
        "    _LATE.update(future=late)\n    if len(unreviewed) == 2 and isinstance(late.result(), RoleCallError):\n")
    code += '''
_LATE = {}


def _fan_out(prompts, run_dir, log):
    pool = ThreadPoolExecutor(3)
    futures = {s: pool.submit(_guarded, s, prompts[s], run_dir, log) for s in SECTIONS}
    outcomes = {s: futures[s].result() for s in SECTIONS[:2]}
    outcomes[SECTIONS[2]] = futures[SECTIONS[2]]
    pool.shutdown(wait=False)
    return outcomes
'''

    def apply(workspace: Path) -> None:
        target = workspace / RUN_PY
        text = target.read_text(encoding="utf-8")
        start, end = text.index("def review_sections("), text.index("def report_status(")
        target.write_text(text[:start] + code + "\n\n" + text[end:], encoding="utf-8")
        patch(("        synthesized = synthesis[\"findings\"]\n",
               "        synthesized = synthesis[\"findings\"]\n"
               "        if isinstance(_LATE[\"future\"].result(), RoleCallError):\n"
               "            unreviewed.append(SECTIONS[2])\n"))(workspace)
    return apply


# ---------------------------------------------------------------------------------------------------------
# Corpus
# ---------------------------------------------------------------------------------------------------------


def honest_lines() -> list[Line]:
    lines: list[Line] = []

    def add(name: str, mutation: Mutation, **kw: object) -> None:
        lines.append(Line("honest", name, mutation, None, kind="pass", check_material=True, **kw))  # type: ignore[arg-type]

    for layout in ("nested", "flat"):
        add(f"reference ({layout} copy)", nothing, layout=layout)
    add("reference through verify_fan_out.py itself (drawn layout)", nothing, entry="verify")
    for name, code in FORMS.items():
        add(f"fan-out form: {name}", fan_out_form(code), runs="form")
    add("fan-out form: package import from pipeline.claude_call",
        patch((IMPORT, IMPORT.replace("from claude_call", "from pipeline.claude_call"))))
    # 4.6 honest corpus on a section
    add("diff by ./<diff_path>", section('f"Проверь diff ./{d} по критериям {A}."'))
    add("diff by absolute path", section('f"Проверь diff {C}/{d} по критериям {A}."'))
    add("diff and acceptance by @path", section('f"Проверь @{d} по @{A}."'))
    add("diff and acceptance in backticks", section('f"Проверь `{d}` по `{A}`."'))
    add("diff inside a JSON prompt", section('_json.dumps({"diff": d, "acceptance": A}, ensure_ascii=False)'))
    add("diff inline", section('"Diff:\\n" + open(_os.path.join(C, d), encoding="utf-8").read() + f"\\nКритерии: {A}"'))
    add("diff by path, acceptance inline (by text)",
        section('f"Diff: {d}\\nКритерии приёмки:\\n" + open(A, encoding="utf-8").read()'))
    add("src/x.py:12 strings in prose", section(
        'base + " Похоже, ошибка в src/invoices/late_fee.py:12, см. также src/invoices/money.py:3."'))
    for layout in ("nested", "flat"):
        add(f"'Project root: <copy>.' with a planted 5000-object .git ({layout})",
            section('base + f" Project root: {C}."'), layout=layout, plant_git=True)
    add("'Only look under ./', src/, a lone '.', 'security / performance', a lone '/'",
        section('base + " Only look under ./ and src/ . security / performance / ."'))
    contract_lines = "\nГраницы: ничего не пишешь, ни в проект, ни во /tmp.\nНикаких ../\nНе трогай ~/\n"
    for layout in ("nested", "flat"):
        add(f"contracts by --system-prompt-file naming /tmp, ../ and ~/ ({layout})", chain(
            system_prompt_file(), *(append_to(f"pipeline/contracts/{role}.md", contract_lines) for role in ALL_ROLES)),
            layout=layout)
    add("nonexistent /tmp/nothing-here.json and \"/tmp/no such file.json\"",
        section('base + \' see /tmp/nothing-here.json and "/tmp/no such file.json"\''))
    add("'ни во /tmp.' with 1000 leftover try-fake run dirs in /tmp", section('base + " Ни во /tmp."'))
    add("compact one-line JSON prompt (diff, absolute acceptance, note)", section(
        '_json.dumps({"diff": d, "acceptance": A, "note": "ни во /tmp, никаких ../"}, separators=(",", ":"), '
        'ensure_ascii=False)'))
    add("compact JSON prompt with ensure_ascii escapes", section(
        '_json.dumps({"diff": d, "acceptance": A, "rule": "ни во /tmp."}, separators=(",", ":"))'))
    add("markdown bullets with paths", section(
        'base + "\\n- `src/invoices/late_fee.py` line 1.\\n- see ./src/invoices/late_fee.py.\\n"'))
    add("prose with ellipses and leading dots", section('base + " ... .5 of cases . . . ./ ../ ~ ~/ / // ///"'))
    add("Russian contract line repeated 20 times", section(
        'base + " " + " ".join(["правила: ни в проект / ни во /tmp / ни в ~/ / никаких ../ ."] * 20)'))
    add("prompt as one positional argument after --", positional_prompt())
    add("every section names the same diff path its own way (all three mutated)", section(
        'f"Раздел {section}. Diff: `{d}`."', only=None))
    # the synthesizer and the summarizer
    add("synthesizer: findings as a bullet list with the section", synthesizer(
        '"Находки разделов:\\n" + "".join(f"- [{f[\'section\']}] {f[\'id\']}: {f[\'file\']}:{f[\'line\']} '
        '`{f[\'quote\']}` - {f[\'claim\']}\\n" for f in findings)'))
    add("synthesizer: findings as compact JSON", synthesizer('"Находки: " + _json.dumps(findings, separators=(",", ":"))'))
    add("synthesizer: findings by <run>/accepted.json", synthesizer(
        '_put(run_dir / "accepted.json", _json.dumps(findings))\nreturn f"Находки разделов: {R}/accepted.json"'),
        run_reads=("accepted.json",))
    add("synthesizer: findings by a directory <run>/accepted/ holding only them", synthesizer(
        'for i, f in enumerate(findings):\n    _put(run_dir / "accepted" / f"f{i}.json", _json.dumps(f))\n'
        'return f"Находки лежат в {R}/accepted/"'), run_reads=("accepted/",))
    add("synthesizer: 'Only <run>/accepted.json; nothing else!'", synthesizer(
        '_put(run_dir / "accepted.json", _json.dumps(findings))\nreturn f"Only {R}/accepted.json; nothing else!"'),
        run_reads=("accepted.json",))
    add("synthesizer: findings JSON with indent=2 and every field", synthesizer(
        '"Находки:\\n" + _json.dumps(findings, indent=2, ensure_ascii=False)'))
    add("synthesizer: findings as JSON with the keys in reverse order", synthesizer(
        '"Находки:\\n" + _json.dumps([dict(reversed(list(f.items()))) for f in findings], ensure_ascii=False)'))
    add("summarizer: findings as JSON with the keys in reverse order", summarizer(
        '"Находки:\\n" + _json.dumps([dict(reversed(list(f.items()))) for f in synthesized])'))
    add("summarizer: findings as a bullet list", summarizer(
        '"Итоговые находки:\\n" + "".join(f"- {f[\'id\']}: {f[\'file\']}:{f[\'line\']} `{f[\'quote\']}` - {f[\'claim\']}\\n" '
        'for f in synthesized)'))
    add("summarizer: findings by '<run>/final.json (all accepted)'", summarizer(
        '_put(run_dir / "final.json", _json.dumps(synthesized))\nreturn f"Находки: {R}/final.json (all accepted)"'),
        run_reads=("final.json",))
    add("run-dir file names in the alphabet (synth_1-a.v2.json)", synthesizer(
        '_put(run_dir / "synth_1-a.v2.json", _json.dumps(findings))\nreturn f"Находки: {R}/synth_1-a.v2.json."'),
        run_reads=("synth_1-a.v2.json",))
    # 5.L4 / 5.L3 log and report variants
    add("extra log fields and another key order", patch((
        '        entry = {\n            "role": role,',
        '        entry = {\n            "attempt": 1, "note": "extra",\n            "role": role,')))
    add("log written once at the end, sections in reverse order", patch(
        ('            self.entries.append(entry)\n            with self.path.open("a", encoding="utf-8") as handle:\n'
         '                handle.write(json.dumps(entry, ensure_ascii=False) + "\\n")', '            self.entries.append(entry)'),
        ("    report = {", '    log.path.write_text("".join(json.dumps(e) + "\\n" for e in reversed(log.entries)), '
                          'encoding="utf-8")\n    report = {'),
        ('        print(f"pipeline stopped: {error}", file=sys.stderr)\n',
         '        print(f"pipeline stopped: {error}", file=sys.stderr)\n'
         '        log.path.write_text("".join(json.dumps(e) + "\\n" for e in log.entries), encoding="utf-8")\n')))
    add("cost summed with Decimal", patch((
        'return sum(float(str(entry["total_cost_usd"])) for entry in self.entries)',
        'from decimal import Decimal\n            return float(sum(Decimal(str(e["total_cost_usd"])) '
        'for e in self.entries))')))
    add("unreviewed sorted, status computed inline, report without indent", patch(
        (REPORT_ANCHOR, '"total_cost_usd": log.total_cost_usd(), "status": "incomplete" if unreviewed else '
                        '("findings" if len(synthesized) > 0 else "clean"),'),
        ('"unreviewed": unreviewed}', '"unreviewed": sorted(unreviewed)}'),
        ('(run_dir / REPORT).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")',
         '(run_dir / REPORT).write_text(json.dumps(report), encoding="utf-8")')))
    def one_value_enum(s: str) -> Callable[[dict[str, object]], None]:
        return lambda schema: _items(schema)["properties"].__setitem__(  # type: ignore[attr-defined]
            "section", {"type": "string", "enum": [s]})
    add("section schemas with an enum of one value instead of const",
        chain(*(edit_schema(s, one_value_enum(s)) for s in ("security", "performance", "tests"))), runs="quick")
    return lines


def inscope_lines() -> list[Line]:
    """4.6 in-scope must-fail corpus on a section (F2) and on the synthesizer and summarizer."""
    lines: list[Line] = []

    def fail(name: str, mutation: Mutation, ids: set[str], group: str = "must-fail 4.6", **kw: object) -> None:
        lines.append(Line(group, name, mutation, ids, **kw))  # type: ignore[arg-type]

    f2 = {"F2"}
    fail("coder summary pasted into the security prompt (stdin)", section('base + "\\nКодер пишет: " + change["summary"]'), f2)
    fail("coder summary in the positional prompt", chain(positional_prompt(), section(
        'base + "\\nКодер пишет: " + change["summary"]')), f2)
    fail("coder summary in an --append-system-prompt value", chain(extra_flags_hook(), section(
        'import claude_call as _cc\n_cc.EXTRA_FLAGS["security"] = ["--append-system-prompt", change["summary"]]\n'
        'return base')), f2)
    fail("coder result narrative (from the raw message) in the prompt", section(
        'base + "\\n" + _json.loads(_coder(run_dir))["result"]'), f2)
    fail("section given <run>/coder.json", section('base + f" {R}/coder.json"'), f2)
    fail("section given <run>/", section('base + f" context: {R}/"'), f2)
    fail("section given <run>.", section('base + f" context in {R}."'), f2)
    fail("section given <run>/.", section('base + f" context in {R}/."'), f2)
    fail("section given <run>/raw/ holding the output", section('_mv(run_dir, "raw/coder.json")\nreturn base + f" {R}/raw/"'), f2)
    fail("two hops: <run>/handoff.md names <run>/coder.json", section(
        '_put(run_dir / "handoff.md", f"ctx {R}/coder.json")\nreturn base + f" {R}/handoff.md"'), f2)
    fail("two hops: <run>/handoff.md names /tmp/x.json", section(
        't = _tmp()\n_put(t + "/x.json", _coder(run_dir))\n_put(run_dir / "handoff.md", f"ctx {t}/x.json")\n'
        'return base + f" {R}/handoff.md"'), f2)
    fail("--append-system-prompt-file <run>/coder.json", chain(system_prompt_file(), extra_flags_hook(), section(
        'import claude_call as _cc\n_cc.EXTRA_FLAGS["security"] = ["--append-system-prompt-file", R + "/coder.json"]\n'
        'return base')), f2)
    fail("file://<run>/coder.json", section('base + f" file://{R}/coder.json"'), f2)
    fail("a file written after the call (run-end re-read)", chain(
        section('base + f" {R}/later.json"'),
        synthesizer('_put(run_dir / "later.json", _coder(run_dir))\nreturn base')), f2)
    fail("coder output in tempfile.mkdtemp()/coder.json", section(
        'p = _put(_tempfile.mkdtemp() + "/coder.json", _coder(run_dir))\nreturn base + f" see {p}"'), {"F2", "H7"})
    fail("coder output in ~/coder.json", section(
        '_put(_os.path.expanduser("~/coder.json"), _coder(run_dir))\nreturn base + " see ~/coder.json"'), {"F2", "H7"})
    fail("coder output in /tmp/x.json", section('p = _put(_tmp() + "/x.json", _coder(run_dir))\nreturn base + f" see {p}"'), f2)
    fail("coder output in a passwd-home file named by absolute path", section(
        'p = _put(_pwd.getpwuid(_os.getuid()).pw_dir + "/acw4-" + _secrets.token_hex(5) + ".json", _coder(run_dir))\n'
        'return base + f" see {p}"'), f2)
    fail("coder output in a volume file named by absolute path (/var/tmp)", section(
        'p = _put("/var/tmp/acw4-" + _secrets.token_hex(5) + "/c.json", _coder(run_dir))\nreturn base + f" see {p}"'), f2)
    for layout in ("nested", "flat"):
        fail(f"../x.json relative to the project ({layout})", section(
            '_put(_os.path.join(_os.path.dirname(C), "x.json"), _coder(run_dir))\nreturn base + " see ../x.json"'),
            {"F2", "H7"}, layout=layout)
    fail(".git/ctx/coder.json named as a relative file", section(
        '_put(C + "/.git/ctx/coder.json", _coder(run_dir))\nreturn base + " see .git/ctx/coder.json"'), {"F2", "H7"})
    fail("<copy>/.git/ctx/coder.json named as an absolute file", section(
        '_put(C + "/.git/ctx/coder.json", _coder(run_dir))\nreturn base + f" see {C}/.git/ctx/coder.json"'), {"F2", "H7"})
    fail("<run>/link -> /tmp/stash/coder.json, named <run>/link", section(
        't = _tmp()\n_link(_stash_coder(run_dir, t), run_dir / "link")\nreturn base + f" {R}/link"'), f2)
    fail("/tmp/r -> <run>, named /tmp/r/", section('r = _link(R, "/tmp/acw4-r" + _secrets.token_hex(5))\nreturn base + f" ctx {r}/"'), f2)
    for ref, name in (("{R}/", "<run>/"), ("{R}/linkdir/", "<run>/linkdir/"), ("{R}/linkdir", "<run>/linkdir")):
        fail(f"<run>/linkdir -> /tmp/stash/, section given {name}", section(
            f't = _tmp()\n_stash_coder(run_dir, t)\n_link(t, run_dir / "linkdir")\nreturn base + f" ctx {ref}"'), f2)
    fail("<run>/raw/linkdir -> /tmp/stash/, given <run>/raw/linkdir/", section(
        't = _tmp()\n_stash_coder(run_dir, t)\n_link(t, run_dir / "raw" / "linkdir")\nreturn base + f" ctx {R}/raw/linkdir/"'), f2)
    for name, ref in (("coder out.json", 'f\' see "{R}/coder out.json"\''), ("coder,1.json", 'f" see `{R}/coder,1.json`"'),
                      ("coder(1).json", 'f" see {R}/coder(1).json"'), ("coder(1).json", 'f" (see {R}/coder(1).json)"'),
                      ("coder(1)", 'f" see {R}/coder(1)"'), ("a:b.json", 'f" see {R}/a:b.json"')):
        fail(f"rev5: {ref[2:-1]}", section(f'_mv(run_dir, "{name}")\nreturn base + {ref}'), f2)
    fail('rev5: see "/tmp/my stash.json"', section(
        't = _tmp()\n_put(t + "/my stash.json", _coder(run_dir))\nreturn base + f\' see "{t}/my stash.json"\''), f2)
    fail("rev5: see ~/my stash.json", section(
        '_put(_os.path.expanduser("~/my stash.json"), _coder(run_dir))\nreturn base + " see ~/my stash.json"'), {"F2", "H7"})
    fail('rev5: ctx "<run>/raw out/"', section('_mv(run_dir, "raw out/c.json")\nreturn base + f\' ctx "{R}/raw out/"\''), f2)
    fail("rev5: file://<run>/coder out.json", section('_mv(run_dir, "coder out.json")\nreturn base + f" file://{R}/coder out.json"'), f2)
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
        # The "task" form names no diff, but the coder output it names holds `diff_path`, so the diff is read
        ids = f2  # through it (4.6, transitive) and only F2 is reported
        fail(f"rev6 in run dir: {label}", section(f"{in_run}\n{returned}"), ids)
        fail(f"rev6 in /tmp: {label}", section(f'p = _put(_tmp() + "/{name}", _coder(run_dir))\n{returned}'), ids)
    fail('rev6: see "<run>/a b c d e f g h i.json" (8 whitespace runs)', section(
        '_mv(run_dir, "a b c d e f g h i.json")\nreturn base + f\' see "{R}/a b c d e f g h i.json"\''), f2)
    fail("B-R5-2: /tmp/r -> <run>, <run>/linkdir -> /tmp/stash, given /tmp/r/linkdir/", section(
        't = _tmp()\n_stash_coder(run_dir, t)\n_link(t, run_dir / "linkdir")\n'
        'r = _link(R, "/tmp/acw4-r" + _secrets.token_hex(5))\nreturn base + f" ctx {r}/linkdir/"'), f2)
    fail("B-R5-2: same links, output in /tmp/stash/sub/, given /tmp/r/linkdir/sub/", section(
        't = _tmp()\n_stash_coder(run_dir, t + "/sub")\n_link(t, run_dir / "linkdir")\n'
        'r = _link(R, "/tmp/acw4-r" + _secrets.token_hex(5))\nreturn base + f" ctx {r}/linkdir/sub/"'), f2)
    tmp_spaced = 't = _tmp()\n_put(t + "/my stash.json", _coder(run_dir))\n'
    neighbours = (
        ("path=/tmp/a b.json", 't = _tmp()\n_put(t + "/a b.json", _coder(run_dir))\nreturn base + f" path={t}/a b.json"'),
        ('@"<run>/a b.json"', '_mv(run_dir, "a b.json")\nreturn base + f\' @"{R}/a b.json"\''),
        ('"/tmp/.../my stash.json". trailing', tmp_spaced + 'return base + f\' see "{t}/my stash.json".\''),
        ('("/tmp/.../my stash.json"), trailing', tmp_spaced + 'return base + f\' see ("{t}/my stash.json"), ok\''),
        ("| <run>/coder out.json | table cell", '_mv(run_dir, "coder out.json")\nreturn base + f"\\n| ctx | {R}/coder out.json |"'),
        ("spaced path at line start", '_mv(run_dir, "coder out.json")\nreturn base + f"\\n{R}/coder out.json"'),
        ("spaced directory component", '_mv(run_dir, "x y/coder.json")\nreturn base + f\' see "{R}/x y/coder.json"\''),
        ("a tab in a name", '_mv(run_dir, "coder\\tx.json")\nreturn base + f" see {R}/coder\\tx.json"'),
        ("/tmp/r -> <run>, /tmp/r/coder out.json", '_mv(run_dir, "coder out.json")\n'
         'r = _link(R, "/tmp/acw4-r" + _secrets.token_hex(5))\nreturn base + f\' see "{r}/coder out.json"\''),
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
        fail(f"neighbour: {label}", section(body), f2)
    fail("neighbour: default-separator JSON, spaced path not last", section(
        '_mv(run_dir, "coder out.json")\nreturn _json.dumps({"ctx": R + "/coder out.json", "task": "review"})'),
        f2)
    for layout in ("nested", "flat"):
        fail(f"neighbour: relative ../.../run-k/coder out.json ({layout})", section(
            '_mv(run_dir, "coder out.json")\nrel = _os.path.relpath(R, C)\nreturn base + f" see {rel}/coder out.json"'),
            f2, layout=layout)
    return lines


def attack_lines() -> list[Line]:
    lines: list[Line] = []

    def fail(name: str, mutation: Mutation, ids: set[str], group: str = "must-fail 5.L4", **kw: object) -> None:
        lines.append(Line(group, name, mutation, ids, **kw))  # type: ignore[arg-type]

    for name, code in SERIAL_FORMS.items():
        expected = {"F1", "F2"} if "answers of the sections before" in name else {"F1"}
        fail(f"serial form: {name}", fan_out_form(code), expected)
    fail("a section given <run>/ while the others run (late files from the other sections)",
         section('base + f" context: {R}/"'), {"F2"})
    fail("a section given a /tmp path where another section's answer lands later", chain(
        section('p = _tmp() + "/peer.json"\n_DEMO_CHANGE["peer"] = p\nreturn base + f" see {p}"'),
        synthesizer('_put(_DEMO_CHANGE["peer"], "".join((run_dir / n).read_text() for n in ("performance.json", '
                    '"tests.json") if (run_dir / n).exists()))\nreturn base')), {"F2"})
    fail("a section given another section's findings by a run-dir file written later", chain(
        section('base + f" peers: {R}/peers.json"'),
        synthesizer('_put(run_dir / "peers.json", _json.dumps([f for f in findings if f["section"] != "security"]))\n'
                    'return base')), {"F2"})
    fail("synthesizer given <run>/security.json and <run>/tests.json (the raw answers)", synthesizer(
        'base + f" Сырые ответы: {R}/security.json {R}/tests.json {R}/performance.json"'), {"F3"})
    fail("synthesizer given everything inline", synthesizer(
        'base + "\\n" + "\\n".join((run_dir / n).read_text() for n in ("coder.json", "security.json", "performance.json", '
        '"tests.json") if (run_dir / n).exists())'), {"F3"})
    fail("synthesizer given only the finding ids", synthesizer('"Находки: " + ", ".join(str(f["id"]) for f in findings)'),
         {"F3"})
    fail("synthesizer given findings without the section", synthesizer(
        '"Находки: " + _json.dumps([{k: v for k, v in f.items() if k != "section"} for f in findings])'), {"F3"})
    def without(*names: str) -> str:
        return "[{k: v for k, v in f.items() if k not in " + repr(set(names)) + "} for f in findings]"
    for names in (("file", "line"), ("line",), ("file",)):
        fail(f"synthesizer given findings as JSON without {' and '.join(names)}",
             synthesizer('"Находки: " + _json.dumps(' + without(*names) + ')'), {"F3"})
    fail("synthesizer given a bullet list without file:line", synthesizer(
        '"Находки:\\n" + "".join(f"- [{f[\'section\']}] {f[\'id\']}: `{f[\'quote\']}` - {f[\'claim\']}\\n" for f in findings)'),
        {"F3"})
    fail("summarizer given findings as JSON without file and line", summarizer(
        '"Находки: " + _json.dumps([{k: v for k, v in f.items() if k not in ("file", "line")} for f in synthesized])'),
        {"H3"})
    fail("summarizer given <run>/final.json without file and line", summarizer(
        '_put(run_dir / "final.json", _json.dumps([{k: v for k, v in f.items() if k not in ("file", "line")} '
        'for f in synthesized]))\nreturn f"Находки: {R}/final.json"'), {"H3"})
    fail("synthesizer inline text over 16 KB", synthesizer('base + "\\n" + "я" * 8200'), {"F3"})
    fail("synthesizer called after two sections, before the third ended (the third is collected after it)",
         early_synthesizer(), {"F3"})
    fail("a failed section dropped from unreviewed", patch(('"unreviewed": unreviewed}', '"unreviewed": []}')), {"F4"})
    fail("status from the findings only (a failed section reported as reviewed)", patch(
        ("    if unreviewed:\n        return \"incomplete\"\n", "")), {"F4"})
    fail("a section failure stops the pipeline (no except around result())", patch(
        ("            try:\n                answer = future.result()\n" + EXCEPT_SECTION,
         "            answer = future.result()\n")), {"F4"})
    fail("a failed section retried once", patch((EXCEPT_SECTION, EXCEPT_SECTION.replace(
        "                unreviewed.append(section)\n                continue\n",
        "                answer = call(section, prompts[section], run_dir, log)\n"))), {"F4"})
    fail("all sections failed, synthesizer called anyway with no findings", patch(
        ('    if len(unreviewed) == len(SECTIONS):\n        raise AllSectionsFailed("every section call failed")\n', '')),
         {"F4"})
    fail("coder failure: the sections run anyway", patch((CODER_CALL, 'try:\n            ' + CODER_CALL +
                                                          '\n        except RoleCallError:\n            change = '
                                                          '{"diff_path": "work/none.diff", "summary": ""}')), {"F6"})
    fail("total cost without the failed calls", patch((
        'return sum(float(str(entry["total_cost_usd"])) for entry in self.entries)',
        'return sum(float(str(e["total_cost_usd"])) for e in self.entries if e["status"] == "ok")')), {"H6"})
    fail("status always findings when every section answered", patch(
        ('    return "findings" if synthesized else "clean"', '    return "findings"')), {"H6"})
    fail("failed calls not logged", patch(("        log.record(role, prompt, error.result, is_ok=False)\n", "")), {"H5", "H6"})  # the report total comes from the log
    fail("summarizer given the section findings, not the synthesized ones", patch(
        (S_CALL, 'summary = call("summarizer", summarizer_prompt(findings), run_dir, log)')), {"H3"})
    fail("summarizer given <run>/synthesizer.json with the narrative", summarizer('base + f" {R}/synthesizer.json"'), {"H3"})
    fail("summarizer skipped", patch((S_CALL, 'summary = {"summary": "ok", "finding_ids": []}')), {"F5", "H6"})
    fail("raw outputs in <copy>/pipeline/out/", patch((RAW_WRITE, RAW_WRITE + "\n    (PROJECT / 'pipeline' / 'out')"
                                                       ".mkdir(exist_ok=True)\n    (PROJECT / 'pipeline' / 'out' / "
                                                       "f'{role}.json').write_text('x')")), {"H7"})
    fail("a section without an MCP closure", patch((
        '"security": ["--tools", "Read,Grep,Glob", "--disallowedTools", "mcp__*"],',
        '"security": ["--tools", "Read,Grep,Glob"],'), path=CALL_PY), {"C6"})
    # schema stage (nothing runs; one run each is the whole verdict)
    def enum_all(schema: dict[str, object]) -> None:
        schema["title"] = "Section reviewer output"
        _items(schema)["properties"]["section"] = {"type": "string",  # type: ignore[index]
                                                   "enum": ["security", "performance", "tests"]}
    fail("three section schemas with one enum over all sections (identical files)",
         chain(*(edit_schema(s, enum_all) for s in ("security", "performance", "tests"))),
         {"F1"}, group="must-fail 4.5", runs="once")
    fail("a section schema without section", write_file("pipeline/contracts/tests.schema.json", json.dumps(
        {"type": "object", "required": ["findings"], "properties": {"findings": {"type": "array", "items": {
            "type": "object", "required": ["id", "file", "line", "quote", "claim", "severity"],
            "properties": {"id": {"type": "string"}, "file": {"type": "string"}, "line": {"type": "integer"},
                           "quote": {"type": "string"}, "claim": {"type": "string"},
                           "severity": {"type": "string", "enum": ["high", "medium", "low"]}}}}}})),
         {"F1"}, group="must-fail 4.5", runs="once")
    fail("a synthesizer schema without source_ids", write_file("pipeline/contracts/synthesizer.schema.json", json.dumps(
        {"type": "object", "required": ["findings"], "properties": {"findings": {"type": "array", "items": {
            "type": "object", "required": ["id", "file", "line", "quote", "claim"],
            "properties": {"id": {"type": "string"}, "file": {"type": "string"}, "line": {"type": "integer"},
                           "quote": {"type": "string"}, "claim": {"type": "string"}}}}}})),
         {"F3"}, group="must-fail 4.5", runs="once")
    fail("a synthesizer schema with source_ids optional",
         edit_schema("synthesizer", lambda schema: _items(schema)["required"].remove("source_ids")),  # type: ignore[attr-defined]
         {"F3"}, group="must-fail 4.5", runs="once")
    fail("a section contract left as the stub", lambda w: shutil.copy(STARTER / "pipeline/contracts/performance.md",
                                                                       w / "pipeline/contracts/performance.md"),
         {"F1"}, group="must-fail 4.5", runs="once")
    lines.append(Line("starter", "untouched starter (verify_fan_out.py)", nothing, {"F1", "F3"}, base="starter",
                      entry="verify", runs="once"))
    lines.append(Line("starter", "reference contracts with the starter's lesson-3 chain in run.py",
                      lambda w: shutil.copy(STARTER / RUN_PY, w / RUN_PY), {"F1", "F3", "F4", "F5", "H6"},
                      entry="verify"))
    lines.append(Line("attack", "usercustomize/sitecustomize in the workspace exiting 0", chain(
        lambda w: (w / "usercustomize.py").write_text("raise SystemExit(0)\n"),
        lambda w: (w / "sitecustomize.py").write_text("raise SystemExit(0)\n"),
        lambda w: (w / "pipeline" / "sitecustomize.py").write_text("raise SystemExit(0)\n")), {"F1", "F3"},
        base="starter", entry="verify", runs="once"))
    lines.append(Line("attack", "a stub claude in the workspace answering success", chain(
        lambda w: (w / "pipeline" / "bin").mkdir(),
        lambda w: (w / "pipeline" / "bin" / "claude").write_text(
            "#!/bin/sh\ncat >/dev/null\necho '{\"type\": \"result\", \"subtype\": \"success\", \"is_error\": false, "
            "\"session_id\": \"s\", \"total_cost_usd\": 0, \"structured_output\": {\"diff_path\": \"x\", \"summary\": "
            "\"s\", \"findings\": [], \"finding_ids\": []}}'\n"),
        lambda w: os.chmod(w / "pipeline" / "bin" / "claude", 0o755),
        patch(('return ["claude", ', 'return [str(CONTRACTS_DIR.parent / "bin" / "claude"), '), path=CALL_PY)),
        {"F1", "F3", "F4", "F5", "F6", "H5", "H6"}, entry="verify"))
    return lines


# ---------------------------------------------------------------------------------------------------------
# Student fix round (plans/43-student-l4.md B1, B2; Stepan's decision of 2026-11-04 on leak forms)
# ---------------------------------------------------------------------------------------------------------

LOG_OK = "    log.record(role, prompt, message, is_ok=True)\n    return answer\n"
NOTES_RUN = 'run_dir / "other-sections.txt"'
NOTES_PROJECT = 'PROJECT / ".review-notes.txt"'


def share_notes(line_expr: str, path_expr: str = NOTES_RUN, after_sections: str = "",
                encoding: str = "utf-8", reference: str | None = None) -> Mutation:
    """Every section's prompt names a notes file; as each section answers, `call` appends one line per finding
    (`line_expr`, names: f, role). `after_sections` runs once every section has ended (remove, truncate)."""
    hook = ("    if role in SECTIONS:\n"
            f"        with open({path_expr}, \"a\", encoding={encoding!r}) as _notes:\n"
            "            for f in answer[\"findings\"]:\n"
            f"                _notes.write({line_expr} + \"\\n\")\n")
    if reference is None:
        reference = "{R}/other-sections.txt" if path_expr == NOTES_RUN else "{C}/.review-notes.txt"
    tail = f"\n        {after_sections}" if after_sections else ""
    return chain(section(f'base + f" Что уже нашли другие разделы: {reference}"', only=None),
                 patch((LOG_OK, "    log.record(role, prompt, message, is_ok=True)\n" + hook + "    return answer\n"),
                       (SECTIONS_CALL, SECTIONS_CALL + tail)))


STOPPED = '        print(f"pipeline stopped: {error}", file=sys.stderr)\n'


def after_sections_always(statement: str) -> Mutation:
    """Run `statement` once the sections ended, also when the pipeline stops there (all sections failed), so
    that nothing the variant wrote into the project is left for the run-end snapshot."""
    return patch((SECTIONS_CALL, SECTIONS_CALL + "\n        " + statement),
                 (STOPPED, STOPPED + "        " + statement + "\n"))


def numbered_examples(workspace: Path) -> None:
    """Every section contract ends with an example finding for every line of late_fee.py (file, line, quote)."""
    source = workspace / "src" / "invoices" / "late_fee.py"
    examples = "".join(f"- `src/invoices/late_fee.py:{number}`: `{text}`\n"
                       for number, text in enumerate(source.read_text(encoding="utf-8").splitlines(), start=1)
                       if text.strip())
    for role in ("security", "performance", "tests"):
        target = workspace / "pipeline" / "contracts" / f"{role}.md"
        target.write_text(target.read_text(encoding="utf-8") + "\n## Примеры мест\n\n" + examples, encoding="utf-8")


def fix_round_lines() -> list[Line]:
    lines: list[Line] = []

    def add(name: str, mutation: Mutation, **kw: object) -> None:
        lines.append(Line("honest (fix round)", name, mutation, None, kind="pass", check_material=True, **kw))  # type: ignore[arg-type]

    def fail(name: str, mutation: Mutation, ids: set[str], **kw: object) -> None:
        lines.append(Line("must-fail (fix round)", name, mutation, ids, **kw))  # type: ignore[arg-type]

    def record(name: str, mutation: Mutation) -> None:
        lines.append(Line("recorded (out of scope)", name, mutation, None, kind="record", runs="quick"))

    # Honest first: what every section may share, and the synthesizer input the brief lists.
    add("synthesizer: the six listed fields, no severity", synthesizer(
        '"Находки разделов (JSON):\\n" + _json.dumps([{k: f[k] for k in ("id", "file", "line", "quote", "claim", '
        '"section")} for f in findings], ensure_ascii=False, indent=2)'))
    add("every section: the diff and the acceptance inline (the same text in all three)", section(
        '"Diff:\\n" + open(_os.path.join(C, d), encoding="utf-8").read() + "\\nКритерии:\\n" + '
        'open(A, encoding="utf-8").read()', only=None))
    add("every section: its own <run>/<section>-input.md with the diff and acceptance inline", section(
        'p = _put(run_dir / f"{section}-input.md", "Diff:\\n" + open(_os.path.join(C, d), encoding="utf-8").read() '
        '+ "\\nКритерии:\\n" + open(A, encoding="utf-8").read())\nreturn f"Раздел {section}. Вход: {p}"', only=None),
        run_reads=("security-input.md", "performance-input.md", "tests-input.md"))
    add("every section: the changed file inline with its path (no line numbers)", section(
        'target = open(_os.path.join(C, d), encoding="utf-8").read().split("\\n")[0].split(" b/")[-1]\n'
        'return base + f"\\nФайл {target}:\\n" + open(_os.path.join(C, target), encoding="utf-8").read()', only=None))
    add("every section: the changed file as a numbered listing 'N: line' under 'Файл <path> (N строк):'", section(
        'target = open(_os.path.join(C, d), encoding="utf-8").read().split("\\n")[0].split(" b/")[-1]\n'
        'body = open(_os.path.join(C, target), encoding="utf-8").read().splitlines()\n'
        'return base + f"\\nФайл {target} ({len(body)} строк):\\n" + "\\n".join(f"{i}: {s}" for i, s in '
        'enumerate(body, 1))', only=None))
    add("every section: every file under src/invoices/ as a listing '<path>' then '  N | line'", section(
        'import glob as _glob\nparts = []\nfor path in sorted(_glob.glob(_os.path.join(C, "src/invoices/*.py"))):\n'
        '    rel = _os.path.relpath(path, C)\n'
        '    rows = open(path, encoding="utf-8").read().splitlines()\n'
        '    parts.append(f"### {rel}\\n" + "\\n".join(f"{i:>4} | {s}" for i, s in enumerate(rows, 1)))\n'
        'return base + "\\n" + "\\n\\n".join(parts)', only=None))
    add("section contracts end with file:line `quote` examples for every line of late_fee.py",
        numbered_examples)
    add("every section: 'src/invoices/late_fee.py:12' prose and the diff by path", section(
        'base + " Например, src/invoices/late_fee.py:12 или src/invoices/late_fee.py:14."', only=None))

    # B1: sections share findings through a file, no id and no claim marker needed.
    plain = 'f"[{f[\'section\']}] {f[\'file\']}:{f[\'line\']} {f[\'severity\']}: {f[\'quote\']}"'
    fail("c21a: <run>/other-sections.txt named in every section prompt, '[s] file:line sev: quote' per finding",
         share_notes(plain), {"F2"})
    fail("c21a, quote without indentation and file:line after it", share_notes(
        'f"{f[\'quote\'].strip()} ({f[\'file\']} line {f[\'line\']})"'), {"F2"})
    fail("c21a, the notes file removed once every section ended", share_notes(
        plain, after_sections=f"_os.remove({NOTES_RUN})"), {"F2"})
    fail("c21a, the notes file truncated once every section ended", share_notes(
        plain, after_sections=f"open({NOTES_RUN}, \"w\").close()"), {"F2"})
    fail("c21a, findings as JSON with file, line and quote only", share_notes(
        '_json.dumps({"file": f["file"], "line": f["line"], "quote": f["quote"]})'), {"F2"})
    fail("c21a, the notes file written in UTF-16-LE (no mark) and removed once every section ended", share_notes(
        plain, after_sections=f"_os.remove({NOTES_RUN})", encoding="utf-16-le"), {"F2"})
    fail("findings as JSON {file, severity, line, quote} (file and line apart)", share_notes(
        '_json.dumps({"file": f["file"], "severity": f["severity"], "line": f["line"], "quote": f["quote"]})'), {"F2"})
    fail("c21a without the quote: '[s] file:line severity'", share_notes(
        'f"[{f[\'section\']}] {f[\'file\']}:{f[\'line\']} {f[\'severity\']}"'), {"F2"})
    fail("findings as JSON {line, file} (reverse order, nothing else)", share_notes(
        '_json.dumps({"line": f["line"], "file": f["file"]})'), {"F2"})
    fail("'File SRC/X.PY, line 12' upper-cased, in a /tmp notes file", chain(
        share_notes('f"File {f[\'file\']}, line {f[\'line\']}".upper()', path_expr='_DEMO_NOTES["path"]',
                    reference='{_DEMO_NOTES["path"]}'),
        patch((PARSE, '_DEMO_NOTES = {"path": "/tmp/acw4-notes-" + __import__("secrets").token_hex(5) + ".txt"}\n\n\n'
                      + PARSE))), {"F2"})
    fail("c21b: the claim without its first word, nothing else", share_notes(
        'f"[{f[\'section\']}] " + f["claim"].split(" ", 1)[-1]'), {"F2"})
    fail("c25: c21a line plus the whole claim, upper-cased", share_notes(
        '(' + plain + ' + " " + f["claim"]).upper()'), {"F2"})
    fail("c21a in a project stash <copy>/.review-notes.txt, removed once every section ended", share_notes(
        plain, path_expr=NOTES_PROJECT, after_sections=f"_os.remove({NOTES_PROJECT})"), {"F2", "H7"})
    # Project stash written before the calls and removed after them (per-request snapshots).
    fail("coder summary in <copy>/notes/coder.txt, named in the prompt, removed after the sections", chain(
        section('p = _put(_os.path.join(C, "notes", "coder.txt"), change["summary"])\nreturn base + f" {p}"'),
        after_sections_always('import shutil as _sh; _sh.rmtree(PROJECT / "notes", ignore_errors=True)')),
        {"F2", "H7"})
    fail("a project file the prompt does not name, written before the sections and removed after", chain(
        section('_put(_os.path.join(C, ".scratch.txt"), "x")\nreturn base'),
        after_sections_always('(PROJECT / ".scratch.txt").unlink(missing_ok=True)')), {"H7"})
    # B2: the narrative with a trivial transformation.
    fail("c23: coder summary upper-cased in every section prompt", section(
        'base + "\\nКОДЕР: " + change["summary"].upper()', only=None), {"F2"})
    fail("coder summary title-cased in the security prompt", section('base + "\\n" + change["summary"].title()'), {"F2"})
    fail("coder summary \\u-escaped in the security prompt", section(
        'base + "\\n" + "".join(f"\\\\u{ord(ch):04x}" for ch in change["summary"])'), {"F2"})
    fail("coder summary in <run>/note.txt as UTF-16, named in the prompt", section(
        'p = run_dir / "note.txt"\np.write_bytes(change["summary"].encode("utf-16"))\nreturn base + f" {p}"'), {"F2"})
    fail("coder summary in /tmp/.../note.txt as UTF-32-LE without a mark", section(
        'p = _tmp() + "/note.txt"\nopen(p, "wb").write(change["summary"].encode("utf-32-le"))\nreturn base + f" {p}"'),
        {"F2"})
    fail("c26: coder summary upper-cased in the summarizer prompt", chain(
        section('base'), summarizer('base + "\\n" + _DEMO_CHANGE["change"]["summary"].upper()')), {"H3"})
    fail("coder summary upper-cased in the synthesizer prompt", chain(
        section('base'), synthesizer('base + "\\n" + _DEMO_CHANGE["change"]["summary"].upper()')), {"F3"})
    fail("section result narratives upper-cased in the synthesizer prompt", synthesizer(
        'base + "\\n" + "\\n".join(_json.loads((run_dir / f"{s}.json").read_text())["result"].upper() '
        'for s in ("security", "performance", "tests") if (run_dir / f"{s}.json").exists())'), {"F3"})
    # Out of scope (Stepan, 2026-11-04): stripping the grader's markers by their format.
    record("quote and severity only, no file and no line (not told apart from project text)", share_notes(
        'f"[{f[\'section\']}] {f[\'severity\']}: {f[\'quote\']}"'))
    record("c22 (out of scope): coder summary with nt tokens stripped by regex, in every section prompt", section(
        'import re as _re\nreturn base + "\\n" + _re.sub(r"nt[0-9a-f]{12}", "", change["summary"])', only=None))
    record("c24 (out of scope): section narratives with nt tokens stripped, in the synthesizer prompt", synthesizer(
        'import re as _re\nreturn base + "\\n" + "\\n".join(_re.sub(r"nt[0-9a-f]{12}", "", _json.loads((run_dir / '
        'f"{s}.json").read_text())["result"]) for s in ("security", "performance", "tests") '
        'if (run_dir / f"{s}.json").exists())'))
    return lines


# Re-run fix round: the code around each hunk of the changed file, as `rows` of (path, number, text).
HUNK_ROWS = (
    'import re as _re\n'
    'rows, current = [], None\n'
    'for diff_line in open(_os.path.join(C, d), encoding="utf-8").read().splitlines():\n'
    '    if diff_line.startswith("+++ b/"):\n'
    '        current = diff_line[6:]\n'
    '    hunk = _re.match(r"@@ -(\\d+)(?:,(\\d+))?", diff_line)\n'
    '    if hunk and current:\n'
    '        first = int(hunk.group(1))\n'
    '        last = first + max(int(hunk.group(2) or 1), 1) - 1\n'
    '        body = open(_os.path.join(C, current), encoding="utf-8").read().splitlines()\n'
    '        low, high = max(1, first - 6), min(len(body), last + 6)\n'
    '        rows.append((current, low, high, [(n, body[n - 1]) for n in range(low, high + 1)]))\n')


def code_index(workspace: Path) -> str:
    """`path:N: line` for every line of every Python file under src/, the way `grep -rn '' src` prints it."""
    return "".join(f"{path.relative_to(workspace).as_posix()}:{number}: {text}\n"
                   for path in sorted((workspace / "src").rglob("*.py"))
                   for number, text in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1))


def commit_code_index(workspace: Path) -> None:
    (workspace / "docs" / "code-index.txt").write_text(code_index(workspace), encoding="utf-8")


def cut_index_to_findings() -> Mutation:
    """Every section prompt names <run>/index.txt, `grep -n` of all of src/ written before the calls; as each
    section answers, the pipeline cuts the index down to the lines of that section's findings."""
    hook = ('    if role in SECTIONS:\n'
            '        _index = run_dir / "index.txt"\n'
            '        _kept = [row for row in _index.read_text(encoding="utf-8").splitlines(True)\n'
            '                 if any(row.startswith(f"{f[\'file\']}:{f[\'line\']}:") for f in answer["findings"])]\n'
            '        _index.write_text("".join(_kept), encoding="utf-8")\n')
    index = ('import glob as _glob\n'
             'rows = []\n'
             'for path in sorted(_glob.glob(_os.path.join(C, "src", "**", "*.py"), recursive=True)):\n'
             '    rel = _os.path.relpath(path, C)\n'
             '    rows += [f"{rel}:{n}: {t}\\n" for n, t in enumerate(open(path, encoding="utf-8").read().splitlines(), 1)]\n'
             'p = _put(run_dir / "index.txt", "".join(rows))\n'
             'return base + f" Код проекта с номерами строк: {p}"')
    return chain(section(index, only=None),
                 patch((LOG_OK, "    log.record(role, prompt, message, is_ok=True)\n" + hook + "    return answer\n")))


def rerun_fix_lines() -> list[Line]:
    """Re-run fix round (plans/43-student-l4-rerun.md): numbered listings of project code in any natural form
    pass; another section's place written relative to src/, as a module, or laundered through a project index
    fails; a stash in the coder's own diff file fails H7."""
    lines: list[Line] = []

    def add(name: str, mutation: Mutation, **kw: object) -> None:
        lines.append(Line("honest (re-run fix round)", name, mutation, None, kind="pass", check_material=True, **kw))  # type: ignore[arg-type]

    def fail(name: str, mutation: Mutation, ids: set[str], **kw: object) -> None:
        lines.append(Line("must-fail (re-run fix round)", name, mutation, ids, **kw))  # type: ignore[arg-type]

    add("every section: code around each hunk in grep -n form 'path:N: line' (RS-L4-4)", section(
        HUNK_ROWS + 'return base + "\\nКод вокруг изменения, с номерами строк:\\n" + "\\n".join('
        'f"{path}:{n}: {t}" for path, _, _, body in rows for n, t in body)', only=None))
    add("every section: 'Файл <path>, строки a-b:' then '  N: line' around each hunk (RS-L4-4)", section(
        HUNK_ROWS + 'return base + "\\n" + "\\n\\n".join(f"Файл {path}, строки {low}-{high}:\\n" + "\\n".join('
        'f"{n:>4}: {t}" for n, t in body) for path, low, high, body in rows)', only=None))
    add("every section: the changed file as '==> path <==' and cat -n", section(
        HUNK_ROWS + 'return base + "".join(f"\\n==> {path} <==\\n" + "\\n".join(f"{n:>6}\\t{t}" for n, t in '
        'enumerate(open(_os.path.join(C, path), encoding="utf-8").read().splitlines(), 1)) for path, *_ in rows)',
        only=None))
    add("every section: grep -n of all of src/ in <run>/code-index.txt, named in the prompt", section(
        'import glob as _glob\nrows = []\n'
        'for path in sorted(_glob.glob(_os.path.join(C, "src", "**", "*.py"), recursive=True)):\n'
        '    rel = _os.path.relpath(path, C)\n'
        '    rows += [f"{rel}:{n}: {t}\\n" for n, t in enumerate(open(path, encoding="utf-8").read().splitlines(), 1)]\n'
        'p = _put(run_dir / "code-index.txt", "".join(rows))\nreturn base + f" Код проекта с номерами строк: {p}"',
        only=None), run_reads=("code-index.txt",))
    add("every section: a committed docs/code-index.txt (grep -n of src/) named in the prompt", chain(
        commit_code_index, section('base + " Код проекта с номерами строк: docs/code-index.txt"', only=None)))
    add("every section: its own <run>/<section>/ named in the prompt; its answer is saved there afterwards", chain(
        section('p = _put(run_dir / section / "input.md", "Diff:\\n" + open(_os.path.join(C, d), encoding="utf-8")'
                '.read())\nreturn f"Раздел {section}. Вход и ответ: {R}/{section}/"', only=None),
        patch((LOG_OK, "    log.record(role, prompt, message, is_ok=True)\n    if role in SECTIONS:\n"
                       "        _put(run_dir / role / \"answer.json\", _json.dumps(answer, indent=2))\n"
                       "    return answer\n"))),
        run_reads=("security/", "performance/", "tests/"))

    fail("N1: notes '[s] <path relative to src/>:N severity'", share_notes(
        'f"[{f[\'section\']}] {str(f[\'file\']).removeprefix(\'src/\')}:{f[\'line\']} {f[\'severity\']}"'), {"F2"})
    fail("N1b: notes '[s] <dotted module>:N severity: quote'", share_notes(
        'f"[{f[\'section\']}] {str(f[\'file\']).removeprefix(\'src/\').removesuffix(\'.py\').replace(\'/\', \'.\')}'
        ':{f[\'line\']} {f[\'severity\']}: {f[\'quote\']}"'), {"F2"})
    fail("notes '<file name>, line N' (no directory)", share_notes(
        'f"{_os.path.basename(str(f[\'file\']))}, line {f[\'line\']}"'), {"F2"})
    fail("notes '<absolute path>:N'", share_notes('f"{PROJECT / str(f[\'file\'])}:{f[\'line\']}"'), {"F2"})
    fail("N3: a committed docs/code-index.txt (grep -n of src/), then c21a notes", chain(
        commit_code_index, share_notes(
            'f"[{f[\'section\']}] {f[\'file\']}:{f[\'line\']} {f[\'severity\']}: {f[\'quote\']}"')), {"F2"})
    fail("<run>/index.txt (grep -n of src/) named in every prompt, cut to the found lines as sections answer",
         cut_index_to_findings(), {"F2"})
    stash = ('_DEMO_STASH = {}\n_DEMO_STASH_LOCK = threading.Lock()\n\n\n'
             'def _demo_stash(role):\n'
             '    with _DEMO_STASH_LOCK:\n'
             '        if role in SECTIONS and not _DEMO_STASH:\n'
             '            change = _DEMO_CHANGE["change"]\n'
             '            path = PROJECT / str(change["diff_path"])\n'
             '            _DEMO_STASH["path"], _DEMO_STASH["orig"] = path, path.read_bytes()\n'
             '            path.write_bytes(_DEMO_STASH["orig"] + ("# coder notes: " + str(change["summary"]) + "\\n").encode())\n'
             '\n\n')
    fail("coder summary appended to the coder's diff file when the first section call starts, restored after the "
         "sections (diff inline)", chain(
        section('"Diff:\\n" + open(_os.path.join(C, d), encoding="utf-8").read() + f"\\nКритерии: {A}"', only=None),
        patch((PARSE, stash + PARSE), (CALL_INNER, "_demo_stash(role)\n        " + CALL_INNER),
              (SECTIONS_CALL, 'try:\n            ' + SECTIONS_CALL + '\n        finally:\n'
                              '            if _DEMO_STASH:\n'
                              '                _DEMO_STASH["path"].write_bytes(_DEMO_STASH["orig"])'))),
        {"H7"})
    fail("other sections' places appended to the coder's diff file as they answer (diff by path), restored after",
         chain(share_notes('f"# {f[\'file\']}:{f[\'line\']}"', path_expr='PROJECT / str(_DEMO_CHANGE["change"]["diff_path"])',
                           reference="{d}"),
               patch((SECTIONS_CALL, '_orig = (PROJECT / str(change["diff_path"])).read_bytes()\n        try:\n'
                                     '            ' + SECTIONS_CALL + '\n        finally:\n'
                                     '            (PROJECT / str(change["diff_path"])).write_bytes(_orig)'))),
         {"F2", "H7"})
    return lines


# ---------------------------------------------------------------------------------------------------------
# Hold-and-poll round: the server holds section calls, prints stream-json init and the working turn early, and
# the grader polls the material and the trees while a call is held.
# ---------------------------------------------------------------------------------------------------------

STREAM_CALL = ('    completed = subprocess.run(command, input=prompt, capture_output=True, text=True, cwd=workdir,\n'
               '                               timeout=CALL_TIMEOUT_SEC)\n')
JSON_FORMAT = 'return ["claude", "-p", "--output-format", "json",'
# claude_call reads stream-json stdout line by line and calls ON_LINE[i](role, number, line) for each line and
# ON_END[i](role) once the process has ended.
STREAMED = """

ON_LINE: list = []
ON_END: list = []


class _Streamed:
    def __init__(self, returncode: int, stdout: str, stderr: str) -> None:
        self.returncode, self.stdout, self.stderr = returncode, stdout, stderr


def _streamed(command: list[str], prompt: str, workdir: Path, role: str) -> _Streamed:
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, cwd=workdir)
    assert process.stdin is not None and process.stdout is not None and process.stderr is not None
    process.stdin.write(prompt)
    process.stdin.close()
    lines = []
    for number, line in enumerate(iter(process.stdout.readline, ""), start=1):
        lines.append(line)
        for hook in ON_LINE:
            hook(role, number, line)
    stderr = process.stderr.read()
    code = process.wait(timeout=CALL_TIMEOUT_SEC)
    for hook in ON_END:
        hook(role)
    return _Streamed(code, "".join(lines), stderr)
"""


def stream_json_line_by_line() -> Mutation:
    """Every role is called with `--output-format stream-json --verbose`, its stdout read line by line."""
    return patch((JSON_FORMAT, 'return ["claude", "-p", "--output-format", "stream-json", "--verbose",'),
                 (STREAM_CALL, "    completed = _streamed(command, prompt, workdir, role)\n"),
                 ("class RoleCallError(Exception):", STREAMED.lstrip("\n") + "\n\nclass RoleCallError(Exception):"),
                 path=CALL_PY)


def on_stdout_line(role: str, number: int, write: str, remove: str) -> Mutation:
    """Stream-json, and when stdout line `number` of the `role` call arrives the pipeline runs `write`; when that
    call's process has ended it runs `remove`. Names: _DEMO_PATHS["R"] (run dir), _DEMO_PATHS["C"] (project),
    _DEMO_CHANGE and the PRELUDE helpers, so a `section(...)` mutation must come first."""
    hooks = (f"_DEMO_PATHS = {{}}\n\n\ndef _demo_on_line(role, number, line):\n"
             f"    if role == {role!r} and number == {number}:\n        {write}\n\n\n"
             f"def _demo_on_end(role):\n    if role == {role!r}:\n        {remove}\n\n\n")
    register = ("import claude_call as _cc_hooks\n        _cc_hooks.ON_LINE.append(_demo_on_line)\n"
                "        _cc_hooks.ON_END.append(_demo_on_end)\n"
                "        _DEMO_PATHS['R'], _DEMO_PATHS['C'] = str(run_dir), str(PROJECT)\n        ")
    return chain(stream_json_line_by_line(), patch((PARSE, hooks + PARSE), (SECTIONS_CALL, register + SECTIONS_CALL)))


def delayed_stash(path_expr: str, text_expr: str, delay: float = 0.5, lifetime: float = 0.4) -> Mutation:
    """A thread started with the section calls writes `text_expr` to `path_expr` after `delay` seconds and removes
    it `lifetime` seconds later: inside the shortest section hold (2.0 s), before any section answers. A
    `section(...)` mutation must come first (PRELUDE helpers)."""
    body = (f"def _demo_delayed(run_dir, change):\n    import time as _t\n    _t.sleep({delay})\n"
            f"    path = {path_expr}\n    _put(path, {text_expr})\n    _t.sleep({lifetime})\n    _os.remove(path)\n\n\n")
    return patch((SECTIONS_CALL, "threading.Thread(target=_demo_delayed, args=(run_dir, change), daemon=True).start()"
                                 "\n        " + SECTIONS_CALL), (PARSE, body + PARSE))


def answers_removed_soon(directory: bool, lifetime: float = 0.2) -> Mutation:
    """As each section answers, the pipeline writes its findings ('[s] file:line severity: quote' per finding) into
    `<run>/other-sections.txt`, or as `<run>/answers/<section>.txt`, and a timer removes that write `lifetime`
    seconds later.
    Every section prompt names the file or the folder. The holds differ by 0.5 s, so each write lives only while
    the later sections are held, between two of their answers (RS-L4-3)."""
    target = 'run_dir / "answers" / f"{role}.txt"' if directory else NOTES_RUN
    reference = "{R}/answers/" if directory else "{R}/other-sections.txt"
    hook = ("    if role in SECTIONS:\n"
            f"        _path = {target}\n"
            "        _put(_path, \"\".join(f\"[{f['section']}] {f['file']}:{f['line']} {f['severity']}: {f['quote']}\\n\" "
            "for f in answer[\"findings\"]))\n"
            f"        threading.Timer({lifetime}, lambda: _os.remove(_path) if _os.path.exists(_path) else None)"
            ".start()\n")
    return chain(section(f'base + f" Что уже нашли другие разделы: {reference}"', only=None),
                 patch((LOG_OK, "    log.record(role, prompt, message, is_ok=True)\n" + hook + "    return answer\n")))


def hold_poll_lines() -> list[Line]:
    """Hold-and-poll round (plans/43-subagent-orchestration.md, "Hold-and-poll"): reading stream-json line by
    line passes; a write keyed on the first stdout lines, a stash that lives only inside a section's hold, and
    another section's answer that lives only between two answers fail."""
    lines: list[Line] = []

    def add(name: str, mutation: Mutation, **kw: object) -> None:
        lines.append(Line("honest (hold-and-poll)", name, mutation, None, kind="pass", check_material=True, **kw))  # type: ignore[arg-type]

    def fail(name: str, mutation: Mutation, ids: set[str], **kw: object) -> None:
        lines.append(Line("must-fail (hold-and-poll)", name, mutation, ids, **kw))  # type: ignore[arg-type]

    def record(name: str, mutation: Mutation) -> None:
        lines.append(Line("recorded (hold-and-poll, RS-C9c)", name, mutation, None, kind="record", runs="quick"))

    note = '_DEMO_PATHS["R"] + "/late-note.txt"'
    names_note = section('base + f" Заметки к изменению: {R}/late-note.txt"')
    write_note = f'_put({note}, _DEMO_CHANGE["change"]["summary"])'
    remove_note = f'_os.path.exists({note}) and _os.remove({note})'
    stash = '_DEMO_PATHS["C"] + "/.late-stash.txt"'
    add("every role: stream-json with --verbose, stdout read line by line while claude works",
        stream_json_line_by_line())
    add("stream-json read line by line; each section's own <run>/<section>/ named, its answer saved there after "
        "the call", chain(
            stream_json_line_by_line(),
            section('p = _put(run_dir / section / "input.md", "Diff:\\n" + open(_os.path.join(C, d), encoding="utf-8")'
                    '.read())\nreturn f"Раздел {section}. Вход и ответ: {R}/{section}/"', only=None),
            patch((LOG_OK, "    log.record(role, prompt, message, is_ok=True)\n    if role in SECTIONS:\n"
                           "        _put(run_dir / role / \"answer.json\", _json.dumps(answer, indent=2))\n"
                           "    return answer\n"))),
        run_reads=("security/", "performance/", "tests/"))
    add("stream-json: each section's stdout lines appended to <run>/<section>/stream.jsonl as they arrive, the "
        "folder named in its prompt", chain(
            section('p = _put(run_dir / section / "input.md", "Diff:\\n" + open(_os.path.join(C, d), encoding="utf-8")'
                    '.read())\nreturn f"Раздел {section}. Вход и журнал вызова: {R}/{section}/"', only=None),
            on_stdout_line("security", 0, "pass", "pass"),
            patch(("def _demo_on_line(role, number, line):\n",
                   "def _demo_on_line(role, number, line):\n    if role in SECTIONS:\n"
                   "        with open(_DEMO_PATHS['R'] + f'/{role}/stream.jsonl', 'a', encoding='utf-8') as _s:\n"
                   "            _s.write(line)\n"))),
        run_reads=("security/", "performance/", "tests/"))
    for number, what in ((1, "system/init"), (2, "the working text"), (3, "the working Read tool use"),
                         (4, "the working tool result")):
        fail(f"B2: coder summary written to <run>/late-note.txt (named in the security prompt) after stdout line "
             f"{number} ({what}) of the security call, removed when the call ends",
             chain(names_note, on_stdout_line("security", number, write_note, remove_note)), {"F2"})
    fail("B2: a project file <copy>/.late-stash.txt written after stdout line 1 of the security call, removed when "
         "the call ends", chain(section("base"), on_stdout_line(
             "security", 1, f'_put({stash}, "x")', f'_os.path.exists({stash}) and _os.remove({stash})')), {"H7"})
    fail("delayed stash: coder summary in <run>/late-note.txt (named in every section prompt), written 0.5 s into "
         "the section holds and removed 0.4 s later", chain(
             section('base + f" Заметки к изменению: {R}/late-note.txt"', only=None),
             delayed_stash('run_dir / "late-note.txt"', 'change["summary"]')), {"F2"})
    fail("delayed stash: coder summary in /tmp/acw4-late-*/note.txt (named in the security prompt), written 0.5 s "
         "into the holds and removed 0.4 s later", chain(
             section('base + " Заметки: " + _DEMO_TMP["path"]'),
             patch((PARSE, '_DEMO_TMP = {"path": "/tmp/acw4-late-" + __import__("secrets").token_hex(5) + "/note.txt"}'
                           '\n\n\n' + PARSE)),
             delayed_stash('_DEMO_TMP["path"]', 'change["summary"]')), {"F2"})
    fail("delayed stash: a project file <copy>/.hold-stash.txt written 0.5 s into the section holds and removed "
         "0.4 s later", chain(section("base"), delayed_stash('PROJECT / ".hold-stash.txt"', '"x"')), {"H7"})
    fail("RS-L4-3: each section's findings in <run>/other-sections.txt (named in every prompt) as it answers, "
         "removed 0.2 s later", answers_removed_soon(directory=False), {"F2"})
    fail("RS-L4-3, run-dir folder: each section's findings in <run>/answers/<section>.txt (the folder named in every "
         "prompt) as it answers, removed 0.2 s later", answers_removed_soon(directory=True), {"F2"})
    record("RS-C9c: coder summary to <run>/late-note.txt after stdout line 5 (StructuredOutput) of the security "
           "call", chain(names_note, on_stdout_line("security", 5, write_note, remove_note)))
    lines.append(Line("recorded (hold-and-poll, RS-C9b)", "RS-C9b: as the RS-L4-3 line, each write removed 5 ms "
                      "later (shorter than the poll interval)", answers_removed_soon(directory=False, lifetime=0.005),
                      None, kind="record"))
    return lines


def late_note(role: str, write_at: float, remove_at: float) -> str:
    """A synthesizer or summarizer prompt body: `<run>/<role>-context.txt` is created empty and named in the
    prompt; `write_at` seconds later the raw coder answer (its summary and result text) is written into it and
    `remove_at` seconds later the file is removed. Only a held call is still running at `write_at`."""
    return ("import threading as _th\n"
            f"note = run_dir / \"{role}-context.txt\"\n"
            "_put(note, \"\")\n"
            f"_th.Timer({write_at}, _put, args=(note, _coder(run_dir))).start()\n"
            f"_th.Timer({remove_at}, lambda: _os.path.exists(note) and _os.remove(note)).start()\n"
            "return base + f\"\\nКонтекст изменения: {note}\"")


def section_answer_hook(statement: str) -> Mutation:
    """After each successful section call the pipeline runs `statement` once per finding `f` of its answer
    (names: role, f, run_dir and the PRELUDE helpers)."""
    hook = f"    if role in SECTIONS:\n        for f in answer[\"findings\"]:\n            {statement}\n"
    return patch((LOG_OK, "    log.record(role, prompt, message, is_ok=True)\n" + hook + "    return answer\n"))


def student_final_lines() -> list[Line]:
    """Student final run (plans/43-student-l4-final.md): N1, a stash for the synthesizer or the summarizer written
    while its call runs, fails now that one call of each is held 3 s; N3, places carried in the entry names of a
    run-dir folder the section prompts name, fails, while a section's own places in its own folder's names pass."""
    lines: list[Line] = []

    def add(name: str, mutation: Mutation, **kw: object) -> None:
        lines.append(Line("honest (student final)", name, mutation, None, kind="pass", check_material=True, **kw))  # type: ignore[arg-type]

    def fail(name: str, mutation: Mutation, ids: set[str]) -> None:
        lines.append(Line("must-fail (student final)", name, mutation, ids))

    pool = section('_os.makedirs(run_dir / "pool", exist_ok=True)\nreturn base + f" Места, где другие разделы уже '
                   'нашли проблемы, это пути в каталоге {R}/pool"', only=None)
    pool_later = section('base + f" Места, где другие разделы уже нашли проблемы, это пути в каталоге {R}/pool"',
                         only=None)
    fail("N1 k1: coder answer into <run>/synthesizer-context.txt (named in the synthesizer prompt) 0.15 s into the call, "
         "removed at 0.6 s", synthesizer(late_note("synthesizer", 0.15, 0.6)), {"F3"})
    fail("N1: the same, written 2.5 s into the call and removed at 2.8 s (inside the 3 s hold)",
         synthesizer(late_note("synthesizer", 2.5, 2.8)), {"F3"})
    fail("N1 k2: coder answer into <run>/summarizer-context.txt (named in the summarizer prompt) 0.15 s into the call, "
         "removed at 0.6 s", summarizer(late_note("summarizer", 0.15, 0.6)), {"H3"})
    fail("N1: the same for the summarizer, written 2.5 s in and removed at 2.8 s", summarizer(late_note("summarizer", 2.5, 2.8)),
         {"H3"})
    fail("N3 k5: as each section answers, empty files <run>/pool/<section>/<file path>/<line>; every prompt names "
         "<run>/pool", chain(pool, section_answer_hook(
             '_put(run_dir / "pool" / role / f["file"] / str(f["line"]), "")')), {"F2"})
    fail("N3: empty directories <run>/pool/<section>/<file path>/<line>/ only, <run>/pool absent on arrival",
         chain(pool_later, section_answer_hook(
             '_os.makedirs(run_dir / "pool" / role / f["file"] / str(f["line"]), exist_ok=True)')), {"F2"})
    fail("N3: one empty file per finding named <file name>:<line> in <run>/pool",
         chain(pool, section_answer_hook(
             '_put(run_dir / "pool" / f"{_os.path.basename(f[\'file\'])}:{f[\'line\']}", "")')), {"F2"})
    fail("N3: one empty file per finding named by its id in <run>/pool",
         chain(pool, section_answer_hook('_put(run_dir / "pool" / str(f["id"]), "")')), {"F2"})
    add("each section's own <run>/<section>/ named; after its call one empty file per own finding, "
        "<run>/<section>/places/<file path>/<line>", chain(
            section('_os.makedirs(run_dir / section, exist_ok=True)\nreturn base + f" Твой каталог: {R}/{section}/"',
                    only=None),
            section_answer_hook('_put(run_dir / role / "places" / f["file"] / str(f["line"]), "")')),
        run_reads=("security/", "performance/", "tests/"))
    add("each section's own <run>/<section>/src/... holds a copy of every source file under its path, written "
        "before the call", section(
            'for _p in sorted(_os.listdir(_os.path.join(C, "src", "invoices"))):\n'
            '    if _p.endswith(".py"):\n'
            '        _put(run_dir / section / "src" / "invoices" / _p, '
            'open(_os.path.join(C, "src", "invoices", _p), encoding="utf-8").read())\n'
            'return base + f" Копии исходников: {R}/{section}/"', only=None),
        run_reads=("security/", "performance/", "tests/"))
    return lines


def n5_lines() -> list[Line]:
    """Student final run 2, N5: a file the prompt names points, by a path relative to its own folder, at a file
    or folder the pipeline fills while the call runs. The master walk now joins such a path with the folder of the
    file it is in, so the late places are seen (F2) and so is the coder's answer (F3, H3). The honest lines point
    the same way at material written before the call."""
    lines: list[Line] = []

    def add(name: str, mutation: Mutation, **kw: object) -> None:
        lines.append(Line("honest (N5)", name, mutation, None, kind="pass", check_material=True, **kw))  # type: ignore[arg-type]

    def fail(name: str, mutation: Mutation, ids: set[str]) -> None:
        lines.append(Line("must-fail (N5)", name, mutation, ids))

    def brief(text: str) -> str:
        return ('_os.makedirs(run_dir / section, exist_ok=True)\n'
                f'_put(run_dir / section / "brief.txt", {text!r})\n'
                'return base + f" Прочитай {R}/{section}/brief.txt"')

    notes_brief = section(brief("В файле notes.txt рядом с этим файлом места, где уже нашли проблемы другие "
                                "разделы.\n"), only=None)
    append_note = ('[open(_os.path.join(str(run_dir), _o, "notes.txt"), "a", encoding="utf-8").write('
                   'f"[{role}] {f[\'file\']}:{f[\'line\']} {f[\'severity\']}: {f[\'quote\']}\\n") '
                   'for _o in SECTIONS if _o != role]')
    fail("N5 n4b: prompt names only <run>/<section>/brief.txt; the brief says 'notes.txt next to this file'; as each "
         "section answers, its places are appended to the other sections' <run>/<section>/notes.txt",
         chain(notes_brief, section_answer_hook(append_note)), {"F2"})
    fail("N5 n4: the brief says the folders places/<file>/<line> next to it are other sections' places; as each "
         "section answers, empty files <run>/<other>/places/<file>/<line>",
         chain(section(brief("Папки places/<файл>/<строка> рядом с этим файлом: места, где уже нашли проблемы "
                              "другие разделы.\n"), only=None),
               section_answer_hook('[_put(run_dir / _o / "places" / f["file"] / str(f["line"]), "") '
                                   'for _o in SECTIONS if _o != role]')), {"F2"})
    fail("N5: the brief says '../shared/notes.txt'; as each section answers, its places are appended to "
         "<run>/shared/notes.txt",
         chain(section(brief("Что нашли другие разделы: ../shared/notes.txt\n"), only=None),
               section_answer_hook('open(_os.path.join(str(run_dir), "shared", "notes.txt"), "a", encoding="utf-8")'
                                   '.write(f"[{role}] {f[\'file\']}:{f[\'line\']}\\n") if _os.makedirs('
                                   '_os.path.join(str(run_dir), "shared"), exist_ok=True) is None else None')),
         {"F2"})
    role_brief = ('_os.makedirs(run_dir / "{role}", exist_ok=True)\n'
                  '_put(run_dir / "{role}" / "context.txt", _coder(run_dir))\n'
                  '_put(run_dir / "{role}" / "brief.txt", "Контекст изменения в context.txt рядом с этим файлом.\\n")\n'
                  'return base + f"\\nПрочитай {{R}}/{role}/brief.txt"')
    fail("N5 for F3: the synthesizer prompt names <run>/synthesizer/brief.txt, which points at context.txt next to "
         "it, holding the raw coder answer (written before the call)",
         synthesizer(role_brief.format(role="synthesizer")), {"F3"})
    fail("N5 for H3: the same for the summarizer, <run>/summarizer/brief.txt -> context.txt",
         summarizer(role_brief.format(role="summarizer")), {"H3"})
    held_brief = ('import threading as _th\n'
                  '_os.makedirs(run_dir / "{role}", exist_ok=True)\n'
                  'note = run_dir / "{role}" / "context.txt"\n'
                  '_put(run_dir / "{role}" / "brief.txt", "Контекст изменения в ./context.txt рядом с этим файлом.\\n")\n'
                  '_th.Timer(0.15, _put, args=(note, _coder(run_dir))).start()\n'
                  '_th.Timer(0.6, lambda: _os.path.exists(note) and _os.remove(note)).start()\n'
                  'return base + f"\\nПрочитай {{R}}/{role}/brief.txt"')
    fail("N5 for F3 (held call): <run>/synthesizer/brief.txt points at ./context.txt, which appears 0.15 s into the "
         "call with the coder answer and is removed at 0.6 s", synthesizer(held_brief.format(role="synthesizer")),
         {"F3"})
    fail("N5 for H3 (held call): the same for the summarizer", summarizer(held_brief.format(role="summarizer")),
         {"H3"})
    add("each section's <run>/<section>/brief.txt points at diff.txt next to it, a copy of the diff written before "
        "the call", section('_os.makedirs(run_dir / section, exist_ok=True)\n'
                            '_put(run_dir / section / "diff.txt", open(d, encoding="utf-8").read() '
                            'if _os.path.isabs(d) else open(_os.path.join(C, d), encoding="utf-8").read())\n'
                            '_put(run_dir / section / "brief.txt", "Изменение: diff.txt рядом с этим файлом, '
                            'критерии: ../criteria.txt\\n")\n'
                            '_put(run_dir / "criteria.txt", open(A if _os.path.isabs(A) else _os.path.join(C, A), '
                            'encoding="utf-8").read())\n'
                            'return base + f" Прочитай {R}/{section}/brief.txt"', only=None),
        run_reads=("security/", "performance/", "tests/", "criteria.txt"))
    return lines


def recorded_lines() -> list[Line]:
    lines: list[Line] = []

    def record(name: str, mutation: Mutation, **kw: object) -> None:
        lines.append(Line("recorded RS16/RS21", name, mutation, None, kind="record", runs="quick", **kw))  # type: ignore[arg-type]

    record("RS21: /tmp/stash/ referenced as a directory", section(
        't = _tmp()\n_stash_coder(run_dir, t)\nreturn base + f" ctx {t}/"'), assert_no_outside_expansion=True)
    record("RS21: <run>/.. referenced as a directory", section('base + f" ctx {R}/.."'), assert_no_outside_expansion=True)
    record("RS21: <copy>/.git/ctx/ referenced as a directory", section(
        '_stash_coder(run_dir, C + "/.git/ctx")\nreturn base + " ctx .git/ctx/"'))
    record("RS21: $HOME/stash/ referenced as a directory", section(
        '_stash_coder(run_dir, _os.path.expanduser("~/stash"))\nreturn base + " ctx ~/stash/"'))
    record("RS16: shell escape <run>/coder\\ out.json", section(
        '_mv(run_dir, "coder out.json")\nreturn base + f" see {R}/coder\\\\ out.json"'))
    record("RS16: file://<run>/coder%20out.json", section(
        '_mv(run_dir, "coder out.json")\nreturn base + f" file://{R}/coder%20out.json"'))
    record("RS16: 16 boundary characters in a name", section(
        '_mv(run_dir, "a b c d e f g h i j k l m n o p q.json")\n'
        'return base + f\' see "{R}/a b c d e f g h i j k l m n o p q.json"\''))
    lines.append(Line("authoring note", "run-dir name '#1.json' given to the synthesizer expands the whole run dir",
                      synthesizer('_put(run_dir / "#1.json", _json.dumps(findings))\nreturn f"Находки: {R}/#1.json"'),
                      {"F3"}))
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
        command = [sys.executable, "-I", "-B", str(CHECKS / "verify_fan_out.py")]
    else:
        command = [sys.executable, "-I", "-B", str(REFERENCE / "drive_l4.py")]
        if line.layout:
            command += ["--layout", line.layout]
        if line.plant_git:
            command.append("--plant-git")
    started = time.monotonic()
    completed = subprocess.run(command, cwd=workspace, capture_output=True, text=True, timeout=600)
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
    return {"code": completed.returncode, "ids": ids, "out": "\n".join(printed)[:900] + completed.stderr[-400:],
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


def start_gap(calls: list[dict[str, object]]) -> float:
    """The widest spread of the three section start times over the runs of one graded run."""
    widest = 0.0
    runs = {int(str(c["run"])) for c in calls}
    for run in runs:
        starts = [float(str(c["tStart"])) for c in calls if c["run"] == run and c["role"] in ("security", "performance",
                                                                                               "tests")]
        if len(starts) == 3:
            widest = max(widest, max(starts) - min(starts))
    return widest


def verdict(line: Line) -> tuple[bool, str]:
    codes = [int(str(r["code"])) for r in line.results]
    id_sets = [r["ids"] for r in line.results]
    seen = sorted({",".join(sorted(ids)) or "-" for ids in id_sets})  # type: ignore[arg-type]
    slowest = max((float(str(c["seconds"])) for r in line.results for c in r["calls"]), default=0.0)  # type: ignore[union-attr]
    wall = max(float(str(r["seconds"])) for r in line.results)
    detail = (f"{codes.count(0)}/{len(codes)} pass, ids {seen}, slowest detection {slowest:.4f} s, "
              f"slowest graded run {wall:.1f} s")
    if line.runs == "form":
        gap = max(start_gap(r["calls"]) for r in line.results)  # type: ignore[arg-type]
        detail += f", widest section start gap {gap:.3f} s"
    if line.kind == "pass":
        problems = [p for r in line.results for p in (material_problems(line, r["calls"]) if line.check_material  # type: ignore[arg-type]
                                                      else [])]
        ok = all(code == 0 for code in codes) and not problems
        bad = next((str(r["out"]) for r in line.results if r["code"] != 0), "")
        if problems:
            detail += f" :: material {sorted(set(problems))[:3]}"
        if bad:
            detail += f" :: {bad.strip()[:700]}"
        return ok, detail
    if line.kind == "record":
        expanded = sorted({str(p) for r in line.results for c in r["calls"] for p in c["expanded"]})  # type: ignore[union-attr]
        outside = [p for r in line.results for p in material_problems(line, r["calls"]) if p.startswith("expanded")]  # type: ignore[arg-type]
        ok = not outside if line.assert_no_outside_expansion else True
        return ok, detail + f", expanded {[os.path.basename(p) for p in expanded][:4]}" + (
            f" :: {outside[:2]}" if outside else "")
    ok = all(code == 1 and ids == line.expect for code, ids in zip(codes, id_sets))
    if not ok:
        detail += " :: " + str(line.results[0]["out"]).strip()[:900]
    return ok, detail


# ---------------------------------------------------------------------------------------------------------
# Environment: leftover try-fake dirs, a concurrent same-uid writer, CPU burners
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

BURNER = '''
import os, sys
stop = sys.argv[1]
n = 0
while True:
    n += 1
    if n % 2000000 == 0 and os.path.exists(stop):
        break
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
    import verify_fan_out as vp

    results = []
    same = (CHECKS / "launch.py").read_bytes() == (STARTER / "devtools" / "launch.py").read_bytes()
    results.append(("checks/launch.py and starter devtools/launch.py are identical", same, ""))
    shared = subprocess.run([sys.executable, "-I", "-B", str(MODULE / "shared_files.py"), "check"],
                            capture_output=True, text=True)
    results.append(("shared_files.py check", shared.returncode == 0, shared.stdout.strip().splitlines()[-1]))
    shipped, data = STARTER / ".claude", CHECKS / "data" / "l1-reference-claude-config"
    same_config = all((shipped / rel).read_bytes() == (data / rel).read_bytes()
                      for rel in ("settings.json", "agents/code-reviewer.md", "agents/coder.md"))
    results.append(("starter .claude config equals the C9 data", same_config, ""))
    leaks = [str(p.relative_to(STARTER)) for p in STARTER.rglob("*") if p.is_file()
             and ("ACADEMY_CHECKS_DIR" in p.read_text(encoding="utf-8", errors="replace")
                  or "checks/" in p.read_text(encoding="utf-8", errors="replace"))]
    results.append(("no starter file names checks/ or ACADEMY_CHECKS_DIR", not leaks, str(leaks)))
    work = Path(tempfile.mkdtemp(prefix=PREFIX + "gen-", dir="/tmp"))
    try:
        copy = work / "copy"
        shutil.copytree(STARTER, copy)
        lines = vp.snapshot_lines(copy)
        bad: list[str] = []
        drawn = re.compile(r"nt[0-9a-f]{12}|F-[0-9a-f]{10}|/tmp|/var|~/|\.\.")
        stub_texts = [(STARTER / "docs" / "pipeline-brief.md").read_text(encoding="utf-8")]
        stub_texts += [p.read_text(encoding="utf-8") for p in (STARTER / "pipeline" / "contracts").glob("*.md")]
        stub_texts += [p.read_text(encoding="utf-8") for p in (REFERENCE / "pipeline" / "contracts").glob("*.md")]
        for _ in range(100):
            inputs = vp.write_run_inputs(copy, lines)
            texts = [inputs.diff_text, (copy / "task" / "acceptance.md").read_text(encoding="utf-8"),
                     (copy / "task" / "request.md").read_text(encoding="utf-8")]
            bad += [m.group() for text in texts for m in drawn.finditer(text)]
            bad += [t for t in texts if not all(" " <= ch <= "~" or ch == "\n" for ch in t)]
        for text in stub_texts:
            for candidate in rt.reference_candidates(text, "/home"):
                if candidate.startswith(("/tmp", "/var", "/home")) or ".." in candidate.split("/"):
                    bad.append(candidate)
        results.append(("100 generated diffs, acceptance and task texts, the brief and the contracts: no /tmp, "
                        "~/, .., run-dir path or drawn value; generated text is printable ASCII", not bad, str(bad[:5])))
        import inspect
        params = list(inspect.signature(vp.write_run_inputs).parameters)
        results.append(("the run-input generator takes no run plan (same work whatever the scenario)",
                        params == ["copy", "lines"], str(params)))
        plans = [vp.draw_plans() for _ in range(200)]
        covered = all(sorted(p.kind for p in ps) == ["clean", "coder", "ok", "section", "section", "sections"]
                      and sorted(k for p in ps for k in p.failing.values()) == sorted(vp.FAILURE_SITUATION)
                      and all(len(p.failing) == 1 for p in ps if p.kind == "section") for ps in plans)
        sections_drawn = {p.failed_sections()[0] for ps in plans for p in ps if p.kind == "section"}
        results.append(("200 plan draws: 2 ok (one clean), 2 one-section, 1 all-sections, 1 coder; the six failed "
                        "calls use all six kinds; every section is drawn as the failing one",
                        covered and sections_drawn == set(vp.SECTIONS), str(sorted(sections_drawn))))
        held = [[(p.number, p.kind, role) for p in ps for role in p.held_roles] for ps in plans]
        is_held_once = all(sorted(role for _, _, role in h) == sorted(vp.LATE_HELD_ROLES)
                           and len({number for number, _, _ in h}) == 2
                           and all(kind in vp.SYNTHESIZED_KINDS for _, kind, _ in h) for h in held)
        held_kinds = sorted({kind for h in held for _, kind, _ in h})
        results.append(("200 plan draws (N1): one synthesizer and one summarizer call held per check, in two "
                        "different runs that reach the synthesizer; every such kind is drawn",
                        is_held_once and held_kinds == sorted(vp.SYNTHESIZED_KINDS), str(held_kinds)))
        # H3 / 4.4 bound: the largest synthesizer input (15 findings at maximum field lengths, every quote and claim
        # character a JSON escape) plus the acceptance text and a 2 KB Cyrillic system prompt stays under 16 KB.
        worst = [{"id": "F-" + "a" * 10, "file": "f" * vp.FILE_MAX, "line": 99999, "quote": '"' * vp.QUOTE_MAX,
                  "claim": "\\" * vp.CLAIM_MAX, "section": "performance"} for _ in range(15)]
        size = len(json.dumps(worst, indent=2).encode()) + 1536 + len(("я" * 1024).encode())
        results.append((f"H3 bound: worst-case synthesizer input + 1.5 KB acceptance + 2 KB Cyrillic = {size} bytes "
                        f"<= {vp.INLINE_LIMIT_BYTES}", size <= vp.INLINE_LIMIT_BYTES, ""))
    finally:
        shutil.rmtree(work, ignore_errors=True)
    brief = (STARTER / "docs" / "pipeline-brief.md").read_text(encoding="utf-8")
    samples = [json.loads(m) for m in re.findall(r"```json\n(.*?)\n```", brief, re.DOTALL)]
    reference_schemas = {s: json.loads((REFERENCE / "pipeline" / "contracts" / f"{s}.schema.json").read_text())
                         for s in ("tests", "synthesizer")}
    section_sample = next(s for s in samples if s.get("findings") and "section" in s["findings"][0])
    synth_sample = next(s for s in samples if s.get("findings") and "source_ids" in s["findings"][0])
    results.append(("the brief's section and synthesizer samples pass the reference schemas",
                    rt.validate_instance(reference_schemas["tests"], section_sample)
                    and rt.validate_instance(reference_schemas["synthesizer"], synth_sample), ""))
    learner_text = "\n".join(p.read_text(encoding="utf-8") for p in
                             [STARTER / "docs" / "pipeline-brief.md", STARTER / "README.md", STARTER / "Makefile",
                              *(STARTER / "pipeline" / "contracts").glob("*.md"), LESSON / "task.md"])
    banned = [ch for ch in ("\u2014", "\u00ab", "\u00bb") if ch in learner_text]
    results.append(("no em dash or guillemets in the starter's learner-visible text and task.md", not banned, str(banned)))
    caches = [str(p) for p in LESSON.rglob("__pycache__")]
    results.append(("no __pycache__ in the lesson", not caches, str(caches)))
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--runs", type=int, default=20)
    parser.add_argument("--form-runs", type=int, default=50)
    parser.add_argument("--quick-runs", type=int, default=5)
    parser.add_argument("--jobs", type=int, default=16)
    parser.add_argument("--burners", type=int, default=4)
    parser.add_argument("--only", default="")
    parser.add_argument("--exclude", default=None)
    parser.add_argument("--leftovers", type=int, default=1000)
    arguments = parser.parse_args()
    arguments.work.mkdir(parents=True, exist_ok=True)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))
    failed = 0
    for name, ok, detail in static_lines():
        failed += not ok
        print(f"{'ok ' if ok else 'XX '}[static] {name} :: {detail}", flush=True)
    corpus = [line for line in (honest_lines() + fix_round_lines() + rerun_fix_lines() + hold_poll_lines()
                                + student_final_lines() + n5_lines() + inscope_lines() + attack_lines() + recorded_lines())
              if arguments.only in f"{line.section} {line.name}"
              and (arguments.exclude is None or arguments.exclude not in line.section)]
    counts = {"full": arguments.runs, "form": arguments.form_runs, "quick": arguments.quick_runs, "once": 1}
    created = leftovers(arguments.leftovers)
    writer_root = Path(tempfile.mkdtemp(prefix=PREFIX + "writer-", dir="/tmp"))
    home_root = HOME / f"{PREFIX}writer-home-{secrets.token_hex(4)}"
    home_root.mkdir()
    writer = subprocess.Popen([sys.executable, "-I", "-c", WRITER, str(writer_root), str(home_root)])
    stop = writer_root / "BURN-STOP"
    burners = [subprocess.Popen([sys.executable, "-I", "-c", BURNER, str(stop)]) for _ in range(arguments.burners)]
    started = time.monotonic()
    try:
        jobs = []
        for number, line in enumerate(corpus):
            workspace = build(line, arguments.work, number)
            jobs.extend((line, workspace) for _ in range(counts[line.runs]))
        # Interleave so that the 50-run form lines run while everything else loads the machine.
        jobs = [job for _, job in sorted(enumerate(jobs), key=lambda pair: (pair[0] * 7919) % len(jobs))]
        with ThreadPoolExecutor(max_workers=arguments.jobs) as executor:
            for (line, _), result in zip(jobs, executor.map(lambda job: run_once(*job), jobs)):
                line.results.append(result)
    finally:
        stop.write_text("")
        for burner in burners:
            burner.wait(timeout=60)
        (writer_root / "STOP").write_text("")
        writer.wait(timeout=30)
        written = sum(1 for _ in writer_root.rglob("*")) + sum(1 for _ in home_root.rglob("*"))
        removed = cleanup()
    print(f"environment: {len(created)} leftover try-fake dirs in /tmp; the writer touched {written} paths under "
          f"/tmp and the home; {arguments.burners} CPU burners; cleanup removed {len(removed)} acw4-* entries",
          flush=True)
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
