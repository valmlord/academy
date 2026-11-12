"""Child process of trace-attribution: import the learner's `attribute` and run it on every trace.

Usage: python3 -I -B attribution_child.py <fd> <nonce> --copy <project> --traces <traces.json>

1. The standard modules are imported first, so a project file with the same name (`json.py`, `copy.py`)
   cannot replace them.
2. `<project>/trace` and `<project>` go first on sys.path, as when the learner runs trace/trace_tree.py.
3. Each trace is parsed fresh from its own JSON text, so a mutation by one call cannot reach the next.
4. What `attribute` returned or raised is recorded per trace; the record goes to the grader over the pipe
   `<fd>` with the run's nonce. The expected maps never enter this process.
"""

import json, os, sys, pathlib, re, collections, itertools, functools, typing, dataclasses, copy, io, string  # noqa: E401,F401
import importlib


def outcome_of(attribute: "typing.Callable[[list[dict[str, object]]], object]", trace_text: str) -> dict[str, object]:
    events = json.loads(trace_text)
    try:
        value = attribute(events)
    except BaseException as error:  # learner code may raise anything, SystemExit included; all are outcomes
        return {"exception": type(error).__name__}
    if not isinstance(value, dict):
        return {"notDict": type(value).__name__}
    try:
        return {"returned": json.loads(json.dumps({str(key): value[key] for key in value}))}
    except (TypeError, ValueError, RecursionError):
        return {"unserializable": True}


def main() -> int:
    fd, nonce = int(sys.argv[1]), sys.argv[2]
    options = dict(zip(sys.argv[3::2], sys.argv[4::2]))
    project = os.path.abspath(options["--copy"])
    traces = json.loads(pathlib.Path(options["--traces"]).read_text(encoding="utf-8"))
    sys.path[0:0] = [os.path.join(project, "trace"), project]
    record: dict[str, object] = {"nonce": nonce}
    outcomes: list[dict[str, object]] = []
    try:
        module = importlib.import_module("trace_tree")
        attribute = getattr(module, "attribute")
    except BaseException as error:  # an import failure of learner code is a verdict, not a crash
        record["importError"] = type(error).__name__
        attribute = None
    if attribute is not None:
        outcomes = [outcome_of(attribute, trace_text) for trace_text in traces]
    record["outcomes"] = outcomes
    with os.fdopen(fd, "w", encoding="utf-8") as pipe:
        pipe.write(json.dumps(record))
    return 0


if __name__ == "__main__":
    os._exit(main())
