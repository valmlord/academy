"""Child process of role-call (design #43 revision 6, 4.1): import the learner's `claude_call` and make the calls.

Usage: python3 -I -B call_child.py <fd> <nonce> --copy <project> --plan <plan.json>

1. The standard modules a role call may use are imported first (the launch.py list), so a project file with
   the same name (`json.py`, `subprocess.py`) cannot replace them.
2. `<project>/pipeline` and `<project>` go first on sys.path, as in launch.py.
3. Each planned call runs `call_role(role, prompt, roles_path, <project>)`; what it returned or raised is
   recorded, and the whole record goes to the grader over the pipe `<fd>` with the run's nonce.

The plan holds only what the learner's function is given (role, prompt, roles path). The replies and their
drawn values stay in the grader's memory.
"""

import json, subprocess, socket, os, sys, pathlib, shutil, re, decimal, math, time, uuid, hashlib, io, string, enum, argparse, logging, contextlib, traceback, signal, selectors, tempfile, textwrap, typing, dataclasses, collections, itertools, functools, threading, asyncio, concurrent.futures, multiprocessing  # noqa: E401,F401
import importlib

ERROR_CLASS_NAME = "RoleCallError"


def jsonable(value: object) -> tuple[bool, object]:
    try:
        return True, json.loads(json.dumps(value, allow_nan=False))
    except (TypeError, ValueError, RecursionError):
        return False, type(value).__name__


def outcome_of(call: "typing.Callable[[], object]") -> dict[str, object]:
    try:
        value = call()
    except BaseException as error:  # learner code may raise anything, SystemExit included; all are outcomes
        if any(cls.__name__ == ERROR_CLASS_NAME for cls in type(error).__mro__):
            is_json, result = jsonable(getattr(error, "result", None))
            kind = getattr(error, "kind", None)
            return {"roleCallError": {"kind": kind if isinstance(kind, str) else None, "resultIsJson": is_json,
                                      "result": result}}
        return {"exception": type(error).__name__}
    is_json, returned = jsonable(value)
    return {"returned": returned} if is_json else {"unserializable": returned}


def main() -> int:
    fd, nonce = int(sys.argv[1]), sys.argv[2]
    options = dict(zip(sys.argv[3::2], sys.argv[4::2]))
    project = os.path.abspath(options["--copy"])
    plan = json.loads(pathlib.Path(options["--plan"]).read_text(encoding="utf-8"))
    sys.path[0:0] = [os.path.join(project, "pipeline"), project]
    record: dict[str, object] = {"nonce": nonce}
    try:
        module = importlib.import_module("claude_call")
        call_role = getattr(module, "call_role")
    except BaseException as error:  # an import failure of learner code is a verdict, not a crash
        record["importError"] = f"{type(error).__name__}: {str(error)[:300]}"
        call_role = None
    outcomes = []
    if call_role is not None:
        for call in plan:
            outcomes.append(outcome_of(lambda call=call: call_role(call["role"], call["prompt"],
                                                                    pathlib.Path(call["rolesPath"]),
                                                                    pathlib.Path(project))))
    record["outcomes"] = outcomes
    with os.fdopen(fd, "w", encoding="utf-8") as pipe:
        pipe.write(json.dumps(record))
    return 0


if __name__ == "__main__":
    os._exit(main())
