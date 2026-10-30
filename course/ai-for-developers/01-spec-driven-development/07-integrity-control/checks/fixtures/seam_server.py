"""Seam server: holds one variant and answers calls to the seam function (design #41, section 2.6).

The variant is a grader variant in check (B) and the learner's implementation in check (A). Its
source arrives over a pipe after the `armed` handshake and is executed from memory: no file, no
bytecode cache, nothing variant-specific in argv or env. Only calls inside the interface domain D
reach the variant; every other call gets one fixed answer that is the same for every variant.
"""

import ctypes
import sys

if sys.platform.startswith("linux"):
    # First, before any secret arrives: a non-dumpable process keeps /proc/<pid>/mem, fd/ and
    # environ closed to other processes of the same uid (observed, design 2.10 item 7).
    PR_SET_DUMPABLE = 4
    if ctypes.CDLL(None, use_errno=True).prctl(PR_SET_DUMPABLE, 0, 0, 0, 0) != 0:
        raise SystemExit("prctl(PR_SET_DUMPABLE) failed")

import importlib.util
import json
import os
import types

READ_CHUNK = 65536


def load_interface(directory: str) -> types.ModuleType:
    spec = importlib.util.spec_from_file_location("seam_interface", os.path.join(directory, "seam_interface.py"))
    if spec is None or spec.loader is None:
        raise SystemExit("seam interface missing")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_to_eof(fd: int) -> bytes:
    data = b""
    while chunk := os.read(fd, READ_CHUNK):
        data += chunk
    os.close(fd)
    return data


def answer(interface: types.ModuleType, seam: object, function: object, line: str) -> dict[str, object]:
    name = getattr(seam, "name")
    try:
        request = json.loads(line)
    except ValueError:
        return {"exc": ["TypeError", interface.ARGUMENTS_OUTSIDE.format(name=name)]}
    if not isinstance(request, dict) or request.get("fn") != name:
        return {"exc": ["AttributeError", interface.NOT_A_SEAM_NAME]}
    raw_arguments = request.get("args")
    specs = getattr(seam, "argument_specs")
    try:
        if not isinstance(raw_arguments, list) or len(raw_arguments) != len(specs):
            raise interface.DomainError("arity")
        arguments = [interface.decode(raw, spec, seam) for raw, spec in zip(raw_arguments, specs)]
    except interface.DomainError:
        return {"exc": ["TypeError", interface.ARGUMENTS_OUTSIDE.format(name=name)]}
    if not callable(function):
        return {"exc": ["AttributeError", interface.NOT_A_SEAM_NAME]}
    try:
        result = function(*arguments)
    except Exception as error:
        kind = type(error).__name__
        if type(error) is interface.FORWARDED_EXCEPTIONS.get(kind):
            return {"exc": [kind, str(error)]}
        return {"exc": ["RuntimeError", interface.OTHER_EXCEPTION]}
    try:
        return {"ok": interface.encode(result, getattr(seam, "return_spec"), seam)}
    except interface.DomainError:
        return {"exc": ["TypeError", interface.RETURN_OUTSIDE.format(name=name)]}


def main() -> None:
    source_fd, call_fd, answer_fd, ready_fd = (int(value) for value in os.environ["SEAM_SERVER_FDS"].split(","))
    here = os.path.dirname(os.path.abspath(__file__))
    # The pristine `invoices` package (models only); -I -S leave nothing else importable but the stdlib.
    sys.path.insert(0, os.path.join(here, "lib"))
    interface = load_interface(here)
    seam = interface.SEAMS[os.environ["SEAM_NAME"]]
    os.write(ready_fd, b"armed\n")
    source = read_to_eof(source_fd)
    module_name = "invoices." + os.environ["SEAM_MODULE"]
    module = types.ModuleType(module_name)
    module.__file__ = "<seam>"
    module.__package__ = "invoices"
    sys.modules[module_name] = module
    status = b"ready\n"
    try:
        exec(compile(source, "<seam>", "exec", dont_inherit=True), module.__dict__)
    except BaseException as error:  # the learner's module in check (A) may fail in any way at import
        status = f"broken {type(error).__name__}\n".encode()
    del source
    function = getattr(module, seam.name, None)
    if status == b"ready\n" and not callable(function):
        status = b"broken missing-function\n"
    os.write(ready_fd, status)
    os.close(ready_fd)
    with os.fdopen(answer_fd, "w", encoding="utf-8") as out, os.fdopen(call_fd, "r", encoding="utf-8") as calls:
        for line in calls:
            out.write(json.dumps(answer(interface, seam, function, line)) + "\n")
            out.flush()


if __name__ == "__main__":
    main()
