"""Run the pipeline script exactly the way the course runs it.

Usage: python3 -I -B launch.py --copy <project> --script pipeline/run.py -- <arguments of the script>

1. The standard modules the pipeline may use are imported first, so a project file with the same name
   (`json.py`, `subprocess.py`) cannot replace them.
2. The script's directory and the project root go first on sys.path, so both `from claude_call import ...`
   and `from pipeline.claude_call import ...` work.
3. The script runs as `__main__` with sys.argv set to its own path and the arguments after `--`.
4. The exit code is the script's SystemExit code; an uncaught exception exits 1.
"""

import json, subprocess, socket, os, sys, pathlib, shutil, re, decimal, math, time, uuid, hashlib, io, string, enum, argparse, logging, contextlib, traceback, signal, selectors, tempfile, textwrap, typing, dataclasses, collections, itertools, functools, threading, asyncio, concurrent.futures, multiprocessing  # noqa: E401,F401
import runpy

USAGE = "usage: launch.py --copy <project> --script <path inside the project> -- <script arguments>"


def parse_arguments(argv: list[str]) -> tuple[str, str, list[str]]:
    if "--" not in argv:
        raise ValueError(USAGE)
    split = argv.index("--")
    head, script_arguments = argv[:split], argv[split + 1:]
    options = dict(zip(head[::2], head[1::2]))
    if len(head) != 4 or set(options) != {"--copy", "--script"}:
        raise ValueError(USAGE)
    return options["--copy"], options["--script"], script_arguments


def exit_code(code: object) -> int:
    if code is None:
        return 0
    if isinstance(code, int):
        return code
    print(code, file=sys.stderr)
    return 1


def main() -> int:
    try:
        copy, script, script_arguments = parse_arguments(sys.argv[1:])
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2
    project = os.path.abspath(copy)
    script_path = os.path.join(project, script)
    sys.path[0:0] = [os.path.dirname(script_path), project]
    sys.argv = [script_path, *script_arguments]
    try:
        runpy.run_path(script_path, run_name="__main__")
    except SystemExit as stop:
        return exit_code(stop.code)
    except BaseException:
        traceback.print_exc()
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
