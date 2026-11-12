"""Child process of citation-gate (design #43 revision 6, 4.1): import the learner's `gate` and make the calls.

Usage: python3 -I -B gate_child.py <fd> <nonce> --copy <project> --plan <plan.json>

1. The standard modules are imported first (the launch.py list), so a project file with the same name cannot
   replace them.
2. `<project>/pipeline` and `<project>` go first on sys.path, as in launch.py.
3. Each planned call runs `check_findings(findings, root)` or `check_synthesis(findings, accepted, root)`;
   what it returned or raised is recorded, and the whole record goes to the grader over the pipe `<fd>` with
   the run's nonce.

The plan holds only what the learner's functions are given. The expected verdicts stay in the grader's memory.
"""

import json, subprocess, socket, os, sys, pathlib, shutil, re, decimal, math, time, uuid, hashlib, io, string, enum, argparse, logging, contextlib, traceback, signal, selectors, tempfile, textwrap, typing, dataclasses, collections, itertools, functools, threading, asyncio, concurrent.futures, multiprocessing  # noqa: E401,F401
import importlib

FUNCTIONS = ("check_findings", "check_synthesis")


def outcome_of(call: "typing.Callable[[], object]") -> dict[str, object]:
    try:
        value = call()
    except BaseException as error:  # learner code may raise anything, SystemExit included; all are outcomes
        return {"exception": type(error).__name__}
    if not isinstance(value, dict):
        return {"notDict": type(value).__name__}
    returned: dict[str, object] = {}
    for key, rule in value.items():
        if not isinstance(key, str):
            return {"notDict": "dict with a key that is not a str"}
        returned[key] = rule if isinstance(rule, str) else {"notStr": type(rule).__name__}
    return {"returned": returned}


def main() -> int:
    fd, nonce = int(sys.argv[1]), sys.argv[2]
    options = dict(zip(sys.argv[3::2], sys.argv[4::2]))
    project = os.path.abspath(options["--copy"])
    plan = json.loads(pathlib.Path(options["--plan"]).read_text(encoding="utf-8"))
    sys.path[0:0] = [os.path.join(project, "pipeline"), project]
    record: dict[str, object] = {"nonce": nonce}
    functions: dict[str, object] = {}
    try:
        module = importlib.import_module("gate")
        functions = {name: getattr(module, name) for name in FUNCTIONS}
    except BaseException as error:  # an import failure of learner code is a verdict, not a crash
        record["importError"] = f"{type(error).__name__}: {str(error)[:300]}"
    outcomes = []
    if functions:
        for call in plan:
            root = pathlib.Path(call["root"])
            if call["function"] == "check_findings":
                outcomes.append(outcome_of(lambda call=call, root=root: functions["check_findings"](
                    call["findings"], root)))
            else:
                outcomes.append(outcome_of(lambda call=call, root=root: functions["check_synthesis"](
                    call["findings"], call["accepted"], root)))
    record["outcomes"] = outcomes
    with os.fdopen(fd, "w", encoding="utf-8") as pipe:
        pipe.write(json.dumps(record))
    return 0


if __name__ == "__main__":
    os._exit(main())
