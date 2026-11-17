"""Child side of char_runner (design #45, 5.2 step 3): run the learner's tests against one variant of shipping/.

Started as `python3 -I -B char_bootstrap.py` with cwd = the run root. The nonce comes on stdin; the payload
(variant bytes, T9 test bytes, test selection, order seed) comes over one pipe fd and the record goes out over
another, both named in BOOT_FDS.

G-rule 1: the module body is only imports and the call to main(). Every guard function, class, table, the
nonce, the fds and the byte maps are locals of main(), and each guard decision uses only references captured
when main() installs them, so a test that rebinds os.path.realpath or patches `__main__.<anything>` changes no
decision.
G-rule 2: `tests` and `tests.*` are served from the T9 bytes in memory, never from the files on disk, and
`shipping.*` from the variant bytes; nothing materialised at run time is importable.
The audit hook is a guardrail, not a sandbox (docs.python.org/3.12/library/sys.html, sys.addaudithook).
tzClock (L4 only): the given net's frozen_clock(moment) returns a datetime subclass whose now() ignores tz, so a
refactor that reads the cut-off on a UTC clock would see the local moment. Once the tests are loaded, the factory
named there is wrapped so its classes answer now(tz), utcnow() and today() with the frozen moment, taken as local
time of the run's zone (student rerun b2, blocking 3). now() without tz returns what the factory gives.
modules (L4): the test modules to load, each by loadTestsFromModule; without it the child discovers tests/. L4 runs
the given net and the learner's own test modules as two separate children (student rerun b3), so each names its own.
"""

import base64
import datetime as datetime_module
import importlib.abc
import importlib.machinery
import importlib.util
import json
import os
import random
import sys
import sysconfig
import time
import traceback
import unittest
import zoneinfo


def main():
    realpath_, fsdecode_, fspath_ = os.path.realpath, os.fsdecode, os.fspath
    join_, relpath_ = os.path.join, os.path.relpath
    os_write_, os_close_, os_exit_ = os.write, os.close, os._exit
    json_dumps_ = json.dumps
    find_spec_ = importlib.machinery.PathFinder.find_spec
    spec_from_loader_ = importlib.util.spec_from_loader
    compile_, exec_ = compile, exec
    import_module_ = importlib.import_module
    boot_file = realpath_(__file__)
    boot_dir = os.path.dirname(boot_file)

    def under(path, roots):
        return any(path == r or path.startswith(r.rstrip("/") + "/") for r in roots)

    def real(p):
        if isinstance(p, int) or p is None:
            return None
        if isinstance(p, bytes):
            p = fsdecode_(p)
        return realpath_(fspath_(p))

    always = frozenset({"os.chdir", "os.chown", "os.setxattr", "os.removexattr", "os.chflags", "os.kill",
                        "os.killpg", "socket.connect", "socket.bind", "socket.sendto", "socket.sendmsg",
                        "subprocess.Popen", "os.system", "os.exec",
                        "os.posix_spawn", "os.spawn", "os.fork", "os.forkpty"})
    file_events = frozenset({"os.mkdir", "os.rename", "os.remove", "os.rmdir", "os.symlink", "os.link",
                             "os.chmod", "os.utime", "os.truncate", "sqlite3.connect", "shutil.copyfile",
                             "shutil.copymode", "shutil.copystat", "shutil.copytree", "shutil.rmtree",
                             "shutil.move", "shutil.make_archive", "shutil.unpack_archive", "tempfile.mkdtemp",
                             "tempfile.mkstemp"})
    fd_forms = frozenset({"os.chmod", "os.truncate", "os.utime"})
    list_events = frozenset({"os.listdir", "os.scandir", "glob.glob", "glob.glob/2", "os.walk", "os.fwalk",
                             "pathlib.Path.glob", "pathlib.Path.rglob", "pathlib.Path.walk"})
    write_flags = os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_APPEND | os.O_TRUNC

    record_fd, payload_fd = (int(x) for x in os.environ["BOOT_FDS"].split(","))
    nonce = sys.stdin.readline().strip()
    chunks = []
    while True:
        chunk = os.read(payload_fd, 1 << 16)
        if not chunk:
            break
        chunks.append(chunk)
    os.close(payload_fd)
    payload = json.loads(b"".join(chunks))
    del chunks
    variant = {k: base64.b64decode(v) for k, v in payload["variant"].items()}
    tests_bytes = {k: base64.b64decode(v) for k, v in payload["tests"].items()}
    only_modules = payload.get("modules")
    order_seed = payload["seed"]
    tz_clock = payload.get("tzClock")
    payload.clear()

    root = realpath_(os.getcwd())
    blocked = []
    stdlib = sorted({realpath_(sysconfig.get_paths()[k]) for k in ("stdlib", "platstdlib")})
    localtime = ["/etc/localtime", realpath_("/etc/localtime")]
    read_ok = ([root, boot_file] + stdlib + [realpath_(p) for p in zoneinfo.TZPATH] + localtime
               + ["/dev/null", "/dev/urandom"])

    def deny(event, detail):
        shown = "" if detail and under(detail, [boot_dir]) else detail
        blocked.append(f"{event} {shown}".strip())
        raise PermissionError(f"refused {event} {shown}")

    def guard(event, args):
        if event in always:
            deny(event, "")
        if event == "open":
            path, mode, flags = args
            rp = real(path)
            if rp is None:
                return
            writing = any(c in mode for c in "wax+") if isinstance(mode, str) else bool((flags or 0) & write_flags)
            if writing and not under(rp, [root]):
                deny("open/write", rp)
            if not writing and not under(rp, read_ok):
                deny("open/read", rp)
        elif event in list_events:
            p = args[2] if event == "glob.glob/2" else args[0]
            if isinstance(p, int):
                return
            rp = real(p if p is not None else ".")
            if rp is not None and not under(rp, read_ok):
                deny(event, rp)
        elif event in file_events:
            if event in fd_forms and isinstance(args[0], int):
                deny(event, f"fd {args[0]}")
            for p in args:
                if isinstance(p, (str, bytes, os.PathLike)):
                    rp = real(p)
                    if not under(rp, [root]):
                        deny(event, rp)

    class ImportGuard(importlib.abc.MetaPathFinder):
        def find_spec(self, name, path, target=None):
            if name in sys.modules:
                return None
            if name == "tests" or name.startswith("tests."):
                rel = name.replace(".", "/")
                if f"{rel}/__init__.py" in tests_bytes or f"{rel}.py" in tests_bytes:
                    return None
                blocked.append(f"import {name}")
                raise ImportError(f"refused import {name}")
            spec = find_spec_(name, path)
            if spec is None:
                return None
            locations = [x for x in [spec.origin, *(spec.submodule_search_locations or [])] if x]
            if not all(under(realpath_(x), stdlib) for x in locations):
                blocked.append(f"import {name}")
                raise ImportError(f"refused import {name}")
            return None

    class MemoryFinder(importlib.abc.MetaPathFinder, importlib.abc.Loader):
        def __init__(self, files, prefix):
            self.files, self.prefix = files, prefix

        def find_spec(self, name, path, target=None):
            if not (name == self.prefix or name.startswith(self.prefix + ".")):
                return None
            rel = name.replace(".", "/")
            for candidate, is_package in ((rel + "/__init__.py", True), (rel + ".py", False)):
                if candidate in self.files:
                    spec = spec_from_loader_(name, self, origin=join_(root, candidate), is_package=is_package)
                    spec.has_location = True
                    if is_package:
                        spec.submodule_search_locations = [join_(root, rel)]
                    return spec
            return None

        def create_module(self, spec):
            return None

        def exec_module(self, module):
            candidate = relpath_(module.__spec__.origin, root)
            module.__file__ = module.__spec__.origin
            exec_(compile_(self.files[candidate], module.__file__, "exec"), module.__dict__)

    def write_record(record):
        data = json_dumps_(record).encode()
        while data:
            data = data[os_write_(record_fd, data):]
        os_close_(record_fd)
        os_exit_(0)

    sys.addaudithook(guard)                                                   # b
    sys.meta_path.insert(0, ImportGuard())                                    # c
    sys.meta_path.insert(1, MemoryFinder(tests_bytes, "tests"))               # d
    variant_finder = MemoryFinder(variant, "shipping")
    sys.meta_path.insert(2, variant_finder)                                   # e
    try:
        for p in sorted(variant):
            if p.endswith("/__main__.py") or not p.endswith(".py"):
                continue
            import_module_(p[:-3].replace("/", ".").removesuffix(".__init__"))
    except BaseException as error:  # noqa: BLE001 - the learner's or a variant's import fault is the result
        write_record({"nonce": nonce, "variantImportError": f"{type(error).__name__}: {error}"[:300],
                      "blocked": blocked})
    sys.meta_path.remove(variant_finder)
    variant_finder.files.clear()
    variant.clear()

    loader = unittest.TestLoader()                                            # f
    if only_modules is not None:
        suite = unittest.TestSuite()
        for module_name in only_modules:
            try:
                suite.addTests(loader.loadTestsFromModule(import_module_(module_name)))
            except BaseException as error:  # noqa: BLE001 - a module that fails to import is a load error
                loader.errors.append(f"{module_name}: {type(error).__name__}: {error}")
    else:
        suite = loader.discover("tests", top_level_dir=root)
    load_errors = [str(e).strip().splitlines()[-1][:300] if str(e).strip() else "?" for e in loader.errors]
    mktime_, fromtimestamp_ = time.mktime, datetime_module.datetime.fromtimestamp
    utc_ = datetime_module.timezone.utc

    def in_zone(factory):
        def frozen_clock(*args, **kwargs):
            given = factory(*args, **kwargs)
            if not isinstance(given, type) or not issubclass(given, datetime_module.datetime):
                return given

            class FrozenInZone(given):
                @classmethod
                def now(cls, tz=None):
                    local = given.now()
                    if tz is None:
                        return local
                    moment = fromtimestamp_(mktime_(local.timetuple()) + local.microsecond / 1e6, tz)
                    return cls(moment.year, moment.month, moment.day, moment.hour, moment.minute, moment.second,
                               moment.microsecond, tzinfo=moment.tzinfo, fold=moment.fold)

                @classmethod
                def utcnow(cls):
                    return cls.now(utc_).replace(tzinfo=None)

                @classmethod
                def today(cls):
                    return given.now()

            return FrozenInZone

        return frozen_clock

    if tz_clock:
        clock_module = sys.modules.get(tz_clock[0])
        factory = getattr(clock_module, tz_clock[1], None) if clock_module is not None else None
        if callable(factory):
            setattr(clock_module, tz_clock[1], in_zone(factory))

    def flatten(s):
        for t in s:
            if isinstance(t, unittest.TestSuite):
                yield from flatten(t)
            else:
                yield t

    tests = list(flatten(suite))
    random.Random(order_seed).shuffle(tests)
    result = unittest.TestResult()
    unittest.TestSuite(tests).run(result)

    def last_line(text):
        # The final exception's line is the first unindented line after its last `  File` frame; an
        # assertion diff may follow it, so the very last line is not the message.
        lines = text.splitlines()
        frames = [index for index, line in enumerate(lines) if line.startswith("  File ")]
        for line in lines[(frames[-1] + 1) if frames else 0:]:
            if line and not line[0].isspace():
                # Paths of the grader and of the run's temporary copy say nothing about the learner's tests.
                return line.replace(boot_dir, "<проверка>").replace(root, "<копия>")[:200]
        return ""

    failed = result.failures + result.errors
    record = {"nonce": nonce, "testsRun": result.testsRun,                    # g
              "failed": [t.id() for t, _ in failed],
              "failedText": [last_line(tb) for _, tb in failed],
              "loadFailures": [t.id() for t, _ in failed if type(t).__name__ == "_FailedTest"],
              "skipped": len(result.skipped), "expectedFailures": len(result.expectedFailures),
              "unexpectedSuccesses": len(result.unexpectedSuccesses), "loadErrors": load_errors,
              "blocked": blocked}
    write_record(record)


try:
    main()
except BaseException:  # noqa: BLE001 - any fault before the record leaves no record; the grader reads stderr
    traceback.print_exc()
    os._exit(70)
