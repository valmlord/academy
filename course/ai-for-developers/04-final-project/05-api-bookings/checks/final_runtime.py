"""Grader runtime shared by the command checks of module 04 (design #44, sections 0 and 7).

The same file is copied unchanged into every lesson's checks directory, so each lesson's checks stay
self-contained; a demo asserts the copies are byte-identical. It holds one rule set:

- 7.1 process rules: the image layout and the per-tool self-check, the exact environment of a learner
  child, the workspace snapshot and per-run copies on the workspace volume, child processes in a new
  session with a timeout, a process-group kill and capped output;
- 7.2 the TypeSpec compile: the copy step for `contract/` and the child node running `tsp_host.mjs`;
- 7.3 the Go environment lockdown;
- 7.5 grader-owned servers: building `refserver/`, exec from a memfd, the AF_UNIX config handshake;
- 7.7 and 7.8 helpers: the neutral User-Agent and the HTTP probe client, the tzdata self-check, the strict
  JSON reader, the response RFC 3339 reader and the schema validator (with `unevaluatedProperties`).

Verdicts (7.4) are never taken from learner tool output: every function here returns data the
grader compares with checks/data, or raises `GraderError` when the grader itself cannot run.

The image layout is fixed (design 11). Only for local demonstrations, the grader's OWN environment
may name a layout file in `ACADEMY_FINAL_LAYOUT`; learner children never receive it, and the runner
never sets it.
"""

from __future__ import annotations

import ctypes
import http.client
import json
import math
import os
import random
import re
import secrets
import shutil
import signal
import socket
import stat
import struct
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

CHECKS_DIR = Path(__file__).resolve().parent
OUTPUT_LIMIT_BYTES = 4 << 20
TAIL_LINES = 40
# 7.7: a User-Agent a browser could send, so nothing in a probe names the grader.
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"
# 7.1 disk budget: snapshot with node_modules, one run copy, GOCACHE, temp (design 7.1, measured in S13).
REQUIRED_FREE_BYTES = 1_200 * 1024 * 1024
LAYOUT_ENV = "ACADEMY_FINAL_LAYOUT"
GRADER_SCRATCH_ENV = "ACADEMY_GRADER_SCRATCH"
LEARNER_TZ_POOL = ("Europe/Berlin", "America/New_York", "America/Los_Angeles", "Australia/Sydney",
                   "Asia/Kolkata", "Asia/Kathmandu", "Europe/Moscow")
GRADER_ERROR_PREFIX = "ошибка проверки, не ваша"


class GraderError(Exception):
    """The grader cannot run as designed; the check fails closed with this Russian message."""

    def __init__(self, detail: str) -> None:
        super().__init__(f"{GRADER_ERROR_PREFIX}: {detail}")


# ---------------------------------------------------------------------------------------------------
# 7.1 Layout and tool self-check
# ---------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class ToolRow:
    name: str
    lookup_dir: str
    realpath: str


@dataclass(frozen=True)
class Layout:
    path_dirs: tuple[str, ...]
    tools: tuple[ToolRow, ...]
    node: str
    pinned_node_modules: str
    go: str


IMAGE_LAYOUT = Layout(
    path_dirs=("/opt/academy/bin", "/opt/node/bin", "/usr/local/go/bin", "/usr/bin", "/bin"),
    tools=(
        ToolRow("go", "/usr/local/go/bin", "/usr/local/go/bin/go"),
        ToolRow("node", "/opt/node/bin", "/opt/node/bin/node"),
        ToolRow("npm", "/opt/node/bin", "/opt/node/lib/node_modules/npm/bin/npm-cli.js"),
        ToolRow("npx", "/opt/node/bin", "/opt/node/lib/node_modules/npm/bin/npx-cli.js"),
        ToolRow("tsp", "/opt/academy/bin", "/opt/academy/bin/tsp"),
        ToolRow("openapi-typescript", "/opt/academy/bin", "/opt/academy/bin/openapi-typescript"),
        ToolRow("make", "/usr/bin", "/usr/bin/make"),
        ToolRow("git", "/usr/bin", "/usr/bin/git"),
        # The #33 image links /usr/bin/python3 to a versioned file; `*` stands for its minor (>= 11).
        ToolRow("python3", "/usr/bin", "/usr/bin/python3.*"),
    ),
    node="/opt/node/bin/node",
    pinned_node_modules="/opt/academy/node/node_modules",
    go="/usr/local/go/bin/go",
)


def load_layout() -> Layout:
    override = os.environ.get(LAYOUT_ENV)
    if not override:
        return IMAGE_LAYOUT
    data = json.loads(Path(override).read_text(encoding="utf-8"))
    return Layout(
        path_dirs=tuple(data["pathDirs"]),
        tools=tuple(ToolRow(row["name"], row["lookupDir"], row["realpath"]) for row in data["tools"]),
        node=data["node"],
        pinned_node_modules=data["pinnedNodeModules"],
        go=data["go"],
    )


def _realpath_matches(found: str, expected: str) -> bool:
    if expected.endswith(".*"):
        prefix = expected[:-1]
        minor = found[len(prefix):]
        return found.startswith(prefix) and minor.isdigit() and int(minor) >= 11
    return found == expected


def tool_table(layout: Layout, names: tuple[str, ...] | None = None) -> list[tuple[ToolRow, str | None, str | None, bool]]:
    """(row, first PATH dir holding the name, realpath found, ok) for each tool row (design 7.1)."""
    rows: list[tuple[ToolRow, str | None, str | None, bool]] = []
    for row in layout.tools:
        if names is not None and row.name not in names:
            continue
        lookup = next((d for d in layout.path_dirs if os.path.lexists(os.path.join(d, row.name))), None)
        real = os.path.realpath(os.path.join(lookup, row.name)) if lookup else None
        is_ok = (lookup == row.lookup_dir and real is not None and os.path.isfile(real)
                 and _realpath_matches(real, row.realpath))
        rows.append((row, lookup, real, is_ok))
    return rows


def self_check_tools(layout: Layout, names: tuple[str, ...] | None = None) -> None:
    """Fail closed unless each tool resolves through the 7.1 PATH to its expected realpath."""
    for row, lookup, real, is_ok in tool_table(layout, names):
        if lookup is None:
            raise GraderError(f"инструмент {row.name} не найден в PATH проверки (ожидался {row.realpath})")
        if not is_ok:
            raise GraderError(f"инструмент {row.name} найден не там, где его ставит образ "
                              f"(каталог {lookup}, файл {real}, ожидался {row.realpath})")


# ---------------------------------------------------------------------------------------------------
# 7.1 Grader process state, run dirs, snapshot
# ---------------------------------------------------------------------------------------------------


def make_grader_non_dumpable() -> bool:
    """`prctl(PR_SET_DUMPABLE, 0)` on Linux, first thing in every grader; False where it does not exist."""
    if not sys.platform.startswith("linux"):
        return False
    pr_set_dumpable = 4
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(pr_set_dumpable, 0, 0, 0, 0) != 0:
        raise GraderError("не удалось закрыть процесс проверки от чтения (prctl)")
    return True


def grader_root(workspace: Path) -> Path:
    """A private dir (0700) on the workspace volume, outside the work tree, never the /tmp tmpfs.

    The runner may name the volume dir in ACADEMY_GRADER_SCRATCH; otherwise the parent of the
    workspace is used. The check reads the free space first and fails closed when it is short.
    """
    base = Path(os.environ.get(GRADER_SCRATCH_ENV) or workspace.parent)
    try:
        root = Path(tempfile.mkdtemp(prefix=".academy-grader-", dir=base)).resolve()
    except OSError as error:
        raise GraderError(f"нельзя создать служебный каталог проверки ({error.strerror})") from error
    os.chmod(root, 0o700)
    if shutil.disk_usage(root).free < REQUIRED_FREE_BYTES:
        shutil.rmtree(root, ignore_errors=True)
        raise GraderError("не хватает места")
    return root


@dataclass(frozen=True)
class Snapshot:
    root: Path
    refused_links: tuple[str, ...]  # workspace-relative paths of symlinks that leave the workspace


def take_snapshot(workspace: Path, destination: Path, parts: tuple[str, ...] = ()) -> Snapshot:
    """Copy regular files (and `.git`) once; symlinks only when they resolve inside; no `__pycache__`.

    With `parts`, only those top-level entries are copied. A symlink that resolves inside is kept as a
    relative link to the same target, so launchers such as `node_modules/.bin/*` still find the files next
    to their target; one that leaves the workspace (or dangles) is refused and reported.
    """
    workspace = workspace.resolve()
    destination.mkdir(parents=True)
    refused: list[str] = []

    def copy_entry(source: Path, target: Path) -> None:
        relative = source.relative_to(workspace).as_posix()
        if source.name == "__pycache__":
            return
        if source.is_symlink():
            real = Path(os.path.realpath(source))
            if not (real == workspace or workspace in real.parents) or not real.exists():
                refused.append(relative)
                return
            # The copy never descends through a link, so source.parent is a real directory of the workspace
            # and the relative target cannot leave the copy.
            os.symlink(os.path.relpath(real, source.parent), target)
            return
        source_stat = source.lstat()
        if stat.S_ISDIR(source_stat.st_mode):
            target.mkdir()
            for child in sorted(source.iterdir()):
                copy_entry(source / child.name, target / child.name)
        elif stat.S_ISREG(source_stat.st_mode):
            shutil.copyfile(source, target)
            if source_stat.st_mode & stat.S_IXUSR:
                os.chmod(target, 0o755)

    entries = [workspace / part for part in parts] if parts else sorted(workspace.iterdir())
    for entry in entries:
        if entry.exists() or entry.is_symlink():
            copy_entry(entry, destination / entry.name)
    return Snapshot(destination, tuple(refused))


def fresh_copy(snapshot: Snapshot, runs_dir: Path) -> Path:
    """A full copy of the snapshot for one learner run; the caller deletes it after the run."""
    target = Path(tempfile.mkdtemp(prefix="run-", dir=runs_dir)) / "workspace"
    shutil.copytree(snapshot.root, target, symlinks=True)
    return target


# ---------------------------------------------------------------------------------------------------
# 7.1 / 7.3 Learner environment
# ---------------------------------------------------------------------------------------------------


def learner_environment(layout: Layout, run_dir: Path, extra: dict[str, str] | None = None,
                        rng: random.Random | None = None) -> dict[str, str]:
    """The exact env of every learner child (7.1): PATH, fresh HOME/TMPDIR/XDG dirs, telemetry off, a random
    non-UTC TZ, plus the lesson's own variables. Nothing else: no NODE_OPTIONS, NODE_PATH, grader path."""
    chooser = rng or random.SystemRandom()
    dirs = {}
    for name in ("HOME", "TMPDIR", "XDG_CONFIG_HOME", "XDG_CACHE_HOME"):
        path = run_dir / name.lower()
        path.mkdir(parents=True, exist_ok=True)
        dirs[name] = str(path)
    env = {"PATH": ":".join(layout.path_dirs), **dirs, "NUXT_TELEMETRY_DISABLED": "1",
           "TZ": chooser.choice(LEARNER_TZ_POOL)}
    env.update(extra or {})
    return env


def go_environment(run_dir: Path, gocache: Path) -> dict[str, str]:
    """The 7.3 variables for every go invocation the grader starts (added to the 7.1 env)."""
    for name in ("gotmp", "gopath", "gomodcache"):
        (run_dir / name).mkdir(parents=True, exist_ok=True)
    return {"GOENV": "off", "GOFLAGS": "", "GOTOOLCHAIN": "local", "GOPROXY": "off", "GOSUMDB": "off",
            "GOWORK": "off", "CGO_ENABLED": "0", "GOEXPERIMENT": "", "GOTMPDIR": str(run_dir / "gotmp"),
            "GOPATH": str(run_dir / "gopath"), "GOMODCACHE": str(run_dir / "gomodcache"), "GOCACHE": str(gocache)}


# ---------------------------------------------------------------------------------------------------
# 7.1 Child processes
# ---------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class RunResult:
    exit_code: int | None  # None when the run was stopped by the timeout
    output: bytes  # stdout and stderr interleaved, capped at OUTPUT_LIMIT_BYTES
    elapsed: float

    @property
    def timed_out(self) -> bool:
        return self.exit_code is None

    def tail(self, lines: int = TAIL_LINES) -> str:
        return "\n".join(self.output.decode("utf-8", "replace").splitlines()[-lines:])


def kill_group(process: subprocess.Popen[bytes]) -> None:
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass
    process.wait()


def run_child(argv: list[str], cwd: Path, env: dict[str, str], timeout_sec: float,
              pass_fds: tuple[int, ...] = ()) -> RunResult:
    """Run one child in a new session; kill its whole group afterwards, whatever happened."""
    started = time.monotonic()
    process = subprocess.Popen(argv, cwd=cwd, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, start_new_session=True, pass_fds=pass_fds)
    chunks: list[bytes] = []

    def drain() -> None:
        assert process.stdout is not None
        size = 0
        while chunk := process.stdout.read(65536):
            if size < OUTPUT_LIMIT_BYTES:
                chunks.append(chunk[: OUTPUT_LIMIT_BYTES - size])
            size += len(chunk)

    reader = threading.Thread(target=drain, daemon=True)
    reader.start()
    exit_code: int | None
    try:
        exit_code = process.wait(timeout=timeout_sec)
    except subprocess.TimeoutExpired:
        exit_code = None
    kill_group(process)
    reader.join(timeout=2)
    return RunResult(exit_code, b"".join(chunks), time.monotonic() - started)


def run_with_result_pipe(argv_before_fd: list[str], argv_after_fd: list[str], cwd: Path, env: dict[str, str],
                         timeout_sec: float) -> tuple[RunResult, bytes]:
    """Run a grader-owned child that writes one result to a pipe whose fd number is its next argument."""
    read_end, write_end = os.pipe()
    chunks: list[bytes] = []

    def drain() -> None:
        size = 0
        while chunk := os.read(read_end, 65536):
            if size < OUTPUT_LIMIT_BYTES:
                chunks.append(chunk)
            size += len(chunk)

    reader = threading.Thread(target=drain, daemon=True)
    reader.start()
    try:
        result = run_child([*argv_before_fd, str(write_end), *argv_after_fd], cwd, env, timeout_sec,
                           pass_fds=(write_end,))
    finally:
        os.close(write_end)
    reader.join(timeout=5)
    os.close(read_end)
    return result, b"".join(chunks)


# ---------------------------------------------------------------------------------------------------
# 7.8 Strict JSON reader
# ---------------------------------------------------------------------------------------------------


class StrictJsonError(ValueError):
    """Russian message: duplicate key, NaN/Infinity, or not JSON at all."""


def _no_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise StrictJsonError(f"ключ {key!r} встречается дважды")
        result[key] = value
    return result


def _no_constant(name: str) -> object:
    raise StrictJsonError(f"{name} не является значением JSON")


def _finite_float(text: str) -> float:
    value = float(text)
    if not math.isfinite(value):
        raise StrictJsonError(f"число {text} вне диапазона")
    return value


def strict_json(text: str) -> object:
    """RFC 8259 JSON, and nothing a lenient reader would also accept: duplicate keys and NaN/Infinity fail."""
    try:
        return json.loads(text, object_pairs_hook=_no_duplicates, parse_constant=_no_constant,
                          parse_float=_finite_float)
    except StrictJsonError:
        raise
    except json.JSONDecodeError as error:
        raise StrictJsonError(f"не JSON: {error.msg}, строка {error.lineno}, столбец {error.colno}") from error
    except RecursionError as error:
        raise StrictJsonError("слишком глубокая вложенность") from error


# ---------------------------------------------------------------------------------------------------
# 7.7 tzdata self-check
# ---------------------------------------------------------------------------------------------------


def _offset_changes(zone: ZoneInfo, start: datetime, end: datetime) -> list[tuple[str, int]]:
    """(UTC instant, new offset in minutes) of every offset change in [start, end), found to the minute."""
    changes: list[tuple[str, int]] = []
    step = timedelta(hours=1)
    current = start
    offset = current.astimezone(zone).utcoffset()
    while current < end:
        following = current + step
        next_offset = following.astimezone(zone).utcoffset()
        if next_offset != offset:
            low, high = current, following
            while high - low > timedelta(minutes=1):
                middle = low + (high - low) / 2
                if middle.astimezone(zone).utcoffset() == offset:
                    low = middle
                else:
                    high = middle
            assert next_offset is not None
            changes.append((high.strftime("%Y-%m-%dT%H:%M:%SZ"), int(next_offset.total_seconds() // 60)))
            offset = next_offset
        current = following
    return changes


def tzdata_self_check(expected_path: Path) -> None:
    """Fail closed unless the runtime's zoneinfo has exactly the transitions checks/data expects."""
    expected = strict_json(expected_path.read_text(encoding="utf-8"))
    assert isinstance(expected, dict)
    start = datetime.fromisoformat(str(expected["from"]))
    end = datetime.fromisoformat(str(expected["to"]))
    zones = expected["zones"]
    assert isinstance(zones, dict)
    for name, table in zones.items():
        assert isinstance(table, dict)
        zone = ZoneInfo(name)
        initial = int(start.astimezone(zone).utcoffset().total_seconds() // 60)  # type: ignore[union-attr]
        found = [[instant, minutes] for instant, minutes in _offset_changes(zone, start, end)]
        if initial != table["initialOffsetMinutes"] or found != table["changes"]:
            raise GraderError(f"база часовых поясов в образе расходится с ожидаемой для {name}")


# ---------------------------------------------------------------------------------------------------
# 7.2 TypeSpec: copy step and compile
# ---------------------------------------------------------------------------------------------------


class ContractCopyError(Exception):
    """A contract/ entry the copy step refuses; Russian message with the path."""


def copy_contract(contract_dir: Path, destination: Path) -> list[str]:
    """Copy regular `*.tsp` files under contract/ (relative paths kept); refuse symlinks, other file types
    and any path with a `node_modules` segment. Returns the copied relative paths."""
    if contract_dir.is_symlink() or not contract_dir.is_dir():
        raise ContractCopyError("каталог contract/ не найден (или это символическая ссылка)")
    copied: list[str] = []
    destination.mkdir(parents=True)
    for current, directories, files in os.walk(contract_dir, followlinks=False):
        here = Path(current)
        for name in sorted(directories + files):
            entry = here / name
            relative = entry.relative_to(contract_dir).as_posix()
            if "node_modules" in Path(relative).parts:
                raise ContractCopyError(f"contract/{relative}: каталог node_modules внутри contract/ не допускается")
            mode = entry.lstat().st_mode
            if stat.S_ISLNK(mode):
                raise ContractCopyError(f"contract/{relative}: символические ссылки в contract/ не допускаются")
            if stat.S_ISDIR(mode):
                continue
            if not stat.S_ISREG(mode):
                raise ContractCopyError(f"contract/{relative}: допускаются только обычные файлы")
            if name.endswith(".tsp"):
                target = destination / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(entry, target)
                copied.append(relative)
    return sorted(copied)


@dataclass(frozen=True)
class CompileOutcome:
    record: dict[str, object]  # the host's result object
    copied: list[str]


def compile_contract(contract_dir: Path, work_root: Path, layout: Layout, allowlist: Path,
                     timeout_sec: float = 90, mode: str = "enforce") -> CompileOutcome:
    """The grader-owned compile (7.2): copy step, `node_modules` link to the pinned dir, child node host."""
    work = Path(tempfile.mkdtemp(prefix="tsp-", dir=work_root)).resolve()
    source = work / "src"
    copied = copy_contract(contract_dir, source)
    if "main.tsp" not in copied:
        raise ContractCopyError("contract/main.tsp не найден: компиляция начинается с него")
    os.symlink(layout.pinned_node_modules, source / "node_modules")
    output = work / "out"
    output.mkdir()
    home = work / "home"
    home.mkdir()
    env = {"PATH": str(Path(layout.node).parent), "HOME": str(home), "TMPDIR": str(home)}
    argv_before = [layout.node, "--max-old-space-size=512", str(CHECKS_DIR / "tsp_host.mjs"), mode,
                   layout.pinned_node_modules, str(source), str(output), str(allowlist.resolve())]
    result, payload = run_with_result_pipe(argv_before, [], work, env, timeout_sec)
    if result.timed_out:
        return CompileOutcome({"timedOut": True}, copied)
    try:
        record = strict_json(payload.decode("utf-8"))
    except (UnicodeDecodeError, StrictJsonError) as error:
        raise GraderError(f"компилятор TypeSpec не вернул результат ({result.tail(5)!r})") from error
    if not isinstance(record, dict):
        raise GraderError("компилятор TypeSpec вернул не объект")
    return CompileOutcome(record, copied)


# ---------------------------------------------------------------------------------------------------
# 7.5 Grader-owned servers: refserver build, memfd exec, AF_UNIX handshake
# ---------------------------------------------------------------------------------------------------

INTRUDER_MESSAGE = "посторонний процесс вмешался в служебный процесс проверки"


class InterferenceError(Exception):
    """Another process connected to the handshake socket or traced the server: the check fails (7.5)."""

    def __init__(self) -> None:
        super().__init__(INTRUDER_MESSAGE)


def build_refserver(layout: Layout, work_root: Path) -> bytes:
    """Build checks/data/refserver/ with a private GOCACHE before any learner process starts."""
    source = CHECKS_DIR / "data" / "refserver"
    build = Path(tempfile.mkdtemp(prefix="refserver-", dir=work_root))
    tree = build / "src"
    shutil.copytree(source, tree)
    env = {"PATH": f"{Path(layout.go).parent}:/usr/bin:/bin", "HOME": str(build),
           **go_environment(build, build / "gocache")}
    binary = build / "refserver"
    result = run_child([layout.go, "build", "-trimpath", "-o", str(binary), "."], tree, env, 240)
    if result.exit_code != 0:
        raise GraderError(f"служебный сервер не собрался: {result.tail(10)}")
    data = binary.read_bytes()
    shutil.rmtree(build, ignore_errors=True)
    return data


def _peer_pid(connection: socket.socket) -> int | None:
    if sys.platform.startswith("linux"):
        so_peercred = 17
        credentials = connection.getsockopt(socket.SOL_SOCKET, so_peercred, struct.calcsize("3i"))
        return struct.unpack("3i", credentials)[0]
    if sys.platform == "darwin":
        sol_local, local_peerpid = 0, 0x002
        return struct.unpack("i", connection.getsockopt(sol_local, local_peerpid, 4))[0]
    return None


def _tracer_pid(pid: int) -> int | None:
    """TracerPid from /proc/<pid>/status, read by the grader itself; None where /proc does not exist."""
    status = Path(f"/proc/{pid}/status")
    if not status.exists():
        return None
    for line in status.read_text(encoding="utf-8").splitlines():
        if line.startswith("TracerPid:"):
            return int(line.split()[1])
    raise GraderError("в /proc/<pid>/status нет TracerPid")


@dataclass
class RefServer:
    process: subprocess.Popen[bytes]
    port: int
    connection: socket.socket

    def stop(self) -> None:
        kill_group(self.process)
        self.connection.close()


class RefServerLauncher:
    """One per check run: a random handshake socket path in a 0700 dir, the same for every variant."""

    def __init__(self, binary: bytes, work_root: Path) -> None:
        self.binary = binary
        # AF_UNIX paths are limited to 104-108 bytes, so the socket lives in a short private dir in the
        # system temp root; a socket takes no space on the tmpfs.
        self.socket_dir = Path(tempfile.mkdtemp(prefix="ahs-", dir="/tmp" if os.path.isdir("/tmp") else None))
        os.chmod(self.socket_dir, 0o700)
        self.socket_path = self.socket_dir / f"{secrets.token_hex(8)}.sock"
        self.listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.listener.bind(str(self.socket_path))
        self.listener.listen(8)
        self.executable = self._executable(work_root)

    def _executable(self, work_root: Path) -> str:
        if hasattr(os, "memfd_create"):
            self.memfd = os.memfd_create("refserver", 0)
            os.write(self.memfd, self.binary)
            return f"/proc/self/fd/{self.memfd}"
        # No memfd (macOS demos): a private 0700 file instead.
        self.memfd = -1
        path = Path(tempfile.mkdtemp(prefix="bin-", dir=work_root)) / "refserver"
        path.write_bytes(self.binary)
        os.chmod(path, 0o700)
        return str(path)

    def start(self, config: dict[str, object], timeout_sec: float = 10) -> RefServer:
        """Spawn, accept the hello, verify the peer pid and TracerPid, only then send the config."""
        env = {"PATH": "/usr/bin:/bin", "TZ": "UTC", "HOME": str(self.socket_dir)}
        pass_fds = (self.memfd,) if self.memfd >= 0 else ()
        process = subprocess.Popen([self.executable, str(self.socket_path)], env=env, stdin=subprocess.DEVNULL,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
                                   pass_fds=pass_fds)
        self.listener.settimeout(timeout_sec)
        try:
            connection, _ = self.listener.accept()
        except TimeoutError as error:
            kill_group(process)
            raise GraderError("служебный сервер не подключился") from error
        connection.settimeout(timeout_sec)
        reader = connection.makefile("rb")
        hello = reader.readline()
        peer = _peer_pid(connection)
        tracer = _tracer_pid(process.pid)
        if hello.strip() != b'{"hello":1}' or peer != process.pid or (tracer is not None and tracer != 0):
            connection.close()
            kill_group(process)
            raise InterferenceError()
        connection.sendall(json.dumps(config).encode() + b"\n")
        reply = reader.readline()
        try:
            port = int(json.loads(reply)["port"])
        except (ValueError, KeyError, TypeError) as error:
            connection.close()
            kill_group(process)
            raise GraderError("служебный сервер не сообщил порт") from error
        return RefServer(process, port, connection)

    def close(self) -> None:
        self.listener.close()
        if self.memfd >= 0:
            os.close(self.memfd)
        shutil.rmtree(self.socket_dir, ignore_errors=True)



# ---------------------------------------------------------------------------------------------------
# 7.1 Learner builds and long-running learner children (L3+)
# ---------------------------------------------------------------------------------------------------

BUILD_TIMEOUT_SEC = 180


@dataclass(frozen=True)
class Workbench:
    """One check run: the grader root, the single workspace snapshot, the per-run copies and GOCACHE."""

    layout: Layout
    root: Path
    snapshot: Snapshot
    runs_dir: Path
    gocache: Path


def open_workbench(workspace: Path, tools: tuple[str, ...]) -> Workbench:
    """Self-check the tools, then take the one snapshot of the workspace this check grades (7.1)."""
    layout = load_layout()
    self_check_tools(layout, tools)
    root = grader_root(workspace)
    snapshot = take_snapshot(workspace, root / "snapshot")
    runs_dir = root / "runs"
    runs_dir.mkdir()
    gocache = root / "gocache"
    gocache.mkdir()
    return Workbench(layout, root, snapshot, runs_dir, gocache)


def tool_path(layout: Layout, name: str) -> str:
    """The absolute path of a tool under the 7.1 PATH (already self-checked where the table has a row)."""
    found = shutil.which(name, path=":".join(layout.path_dirs))
    if found is None:
        raise GraderError(f"инструмент {name} не найден в PATH проверки")
    return found


def learner_run_env(bench: Workbench, run_dir: Path, extra: dict[str, str] | None = None,
                    rng: random.Random | None = None) -> dict[str, str]:
    """7.1 env plus the 7.3 Go variables; the same dict serves `make` and the programs it built."""
    return learner_environment(bench.layout, run_dir, {**go_environment(run_dir, bench.gocache), **(extra or {})}, rng)


def build_in_fresh_copy(bench: Workbench, env_extra: dict[str, str] | None = None,
                        rng: random.Random | None = None) -> tuple[Path, dict[str, str], RunResult]:
    """`make -s build` in a fresh full copy; returns (copy, env, result). The caller deletes copy.parent."""
    copy = fresh_copy(bench.snapshot, bench.runs_dir)
    env = learner_run_env(bench, copy.parent, env_extra, rng)
    result = run_child([tool_path(bench.layout, "make"), "-s", "build"], copy, env, BUILD_TIMEOUT_SEC)
    return copy, env, result


def learner_executable(copy: Path, relative: str) -> Path | None:
    """`bin/<name>` of a built copy if it is a regular executable file inside the copy, else None."""
    path = copy / relative
    if path.is_symlink():
        real = Path(os.path.realpath(path))
        if copy.resolve() not in real.parents:
            return None
        path = real
    if not path.is_file() or not os.access(path, os.X_OK):
        return None
    return path



@dataclass(frozen=True)
class FilterResult:
    exit_code: int | None  # None when stopped by the timeout
    stdout: bytes  # capped at OUTPUT_LIMIT_BYTES; `stdout_truncated` says whether more came
    stdout_truncated: bool
    stderr: bytes  # capped at OUTPUT_LIMIT_BYTES
    elapsed: float


def run_filter(argv: list[str], cwd: Path, env: dict[str, str], input_bytes: bytes, timeout_sec: float) -> FilterResult:
    """Run a learner filter (bin/slots): input on stdin, stdout kept apart from stderr, both capped;
    new session, timeout, group kill whatever happened (7.1)."""
    started = time.monotonic()
    process = subprocess.Popen(argv, cwd=cwd, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, start_new_session=True)
    captured: dict[str, list[bytes]] = {"stdout": [], "stderr": []}
    sizes = {"stdout": 0, "stderr": 0}

    def drain(name: str, stream: object) -> None:
        while chunk := stream.read1(65536):  # type: ignore[attr-defined]
            if sizes[name] < OUTPUT_LIMIT_BYTES:
                captured[name].append(chunk[: OUTPUT_LIMIT_BYTES - sizes[name]])
            sizes[name] += len(chunk)

    def feed() -> None:
        assert process.stdin is not None
        try:
            process.stdin.write(input_bytes)
            process.stdin.close()
        except (BrokenPipeError, OSError):
            pass

    threads = [threading.Thread(target=drain, args=("stdout", process.stdout), daemon=True),
               threading.Thread(target=drain, args=("stderr", process.stderr), daemon=True),
               threading.Thread(target=feed, daemon=True)]
    for thread in threads:
        thread.start()
    exit_code: int | None
    try:
        exit_code = process.wait(timeout=timeout_sec)
    except subprocess.TimeoutExpired:
        exit_code = None
    kill_group(process)
    for thread in threads:
        thread.join(timeout=2)
    return FilterResult(exit_code, b"".join(captured["stdout"]), sizes["stdout"] > OUTPUT_LIMIT_BYTES,
                        b"".join(captured["stderr"]), time.monotonic() - started)

class BackgroundChild:
    """A learner child that keeps running (a server): new session, capped output, group kill on stop."""

    def __init__(self, argv: list[str], cwd: Path, env: dict[str, str]) -> None:
        self.started = time.monotonic()
        self.process = subprocess.Popen(argv, cwd=cwd, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                        stderr=subprocess.STDOUT, start_new_session=True)
        self._chunks: list[bytes] = []
        self._size = 0
        self._reader = threading.Thread(target=self._drain, daemon=True)
        self._reader.start()

    def _drain(self) -> None:
        assert self.process.stdout is not None
        while chunk := self.process.stdout.read1(65536):  # type: ignore[attr-defined]
            if self._size < OUTPUT_LIMIT_BYTES:
                self._chunks.append(chunk[: OUTPUT_LIMIT_BYTES - self._size])
            self._size += len(chunk)

    def exit_code(self) -> int | None:
        return self.process.poll()

    def tail(self, lines: int = TAIL_LINES) -> str:
        return "\n".join(b"".join(self._chunks).decode("utf-8", "replace").splitlines()[-lines:])

    def stop(self) -> None:
        kill_group(self.process)
        self._reader.join(timeout=2)


def free_loopback_port() -> int:
    """A port that was free on 127.0.0.1 a moment ago; the learner server binds it through PORT."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


# ---------------------------------------------------------------------------------------------------
# 7.7 HTTP probes
# ---------------------------------------------------------------------------------------------------

PROBE_TIMEOUT_SEC = 10.0


@dataclass(frozen=True)
class HttpResponse:
    status: int
    headers: tuple[tuple[str, str], ...]  # names lower-cased, in received order
    body: bytes
    elapsed: float

    def header(self, name: str) -> str | None:
        """The field value; repeated fields are joined with ", " as RFC 9110 5.3 allows for list fields."""
        values = [value for key, value in self.headers if key == name.lower()]
        return ", ".join(values) if values else None


class ProbeTransportError(Exception):
    """No HTTP response: refused, reset, timed out, or not HTTP at all."""


def http_probe(port: int, method: str, target: str, body: bytes | None = None,
               content_type: str | None = "application/json", timeout_sec: float = PROBE_TIMEOUT_SEC,
               extra_headers: tuple[tuple[str, str], ...] = ()) -> HttpResponse:
    """One request on a new connection to 127.0.0.1:port with the neutral 7.7 headers."""
    headers = {"Host": f"127.0.0.1:{port}", "User-Agent": USER_AGENT, "Accept": "application/json",
               "Connection": "close"}
    if body is not None and content_type is not None:
        headers["Content-Type"] = content_type
    for name, value in extra_headers:
        headers[name] = value
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=timeout_sec)
    started = time.monotonic()
    try:
        connection.request(method, target, body=body, headers=headers)
        response = connection.getresponse()
        data = response.read(OUTPUT_LIMIT_BYTES + 1)
        received = tuple((name.lower(), value) for name, value in response.getheaders())
        status = response.status
    except (OSError, http.client.HTTPException) as error:
        raise ProbeTransportError(type(error).__name__ + (f": {error}" if str(error) else "")) from error
    finally:
        connection.close()
    if len(data) > OUTPUT_LIMIT_BYTES:
        raise ProbeTransportError(f"тело ответа больше {OUTPUT_LIMIT_BYTES >> 20} МиБ")
    return HttpResponse(status, received, data, time.monotonic() - started)


def media_type(value: str | None) -> str | None:
    """`type/subtype` lower-cased, parameters dropped (3.2 decision 1: parameters allowed, case-insensitive)."""
    if value is None:
        return None
    essence = value.split(";", 1)[0].strip().lower()
    return essence or None


# ---------------------------------------------------------------------------------------------------
# 7.8 Response readers: RFC 3339 and the schema validator
# ---------------------------------------------------------------------------------------------------

RESPONSE_DATE_TIME = re.compile(
    r"^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:([Zz])|([+-])(\d{2}):(\d{2}))$")
FULL_DATE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
# Not RFC 5322: one `@`, a non-empty local part and a dotted domain, no spaces. The grader only reads
# addresses it sent itself, so a stricter or looser server-side rule never reaches this reader.
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def parse_response_date_time(text: object) -> datetime | None:
    """RFC 3339 `date-time` as a server may write it (3.2 decision 4): `T`/`t`, `Z`/`z` or `±hh:mm`, any
    fraction (kept to microseconds), `-00:00` read as UTC. Leap second 60 is refused. UTC result, else None."""
    if not isinstance(text, str):
        return None
    match = RESPONSE_DATE_TIME.match(text)
    if not match:
        return None
    year, month, day, hour, minute, second = (int(match.group(i)) for i in range(1, 7))
    microsecond = int(((match.group(7) or "") + "000000")[:6])
    if match.group(8):
        offset = timedelta(0)
    else:
        hours, minutes = int(match.group(10)), int(match.group(11))
        if hours > 23 or minutes > 59:
            return None
        offset = timedelta(hours=hours, minutes=minutes) * (-1 if match.group(9) == "-" else 1)
    try:
        return datetime(year, month, day, hour, minute, second, microsecond, tzinfo=timezone(offset)).astimezone(timezone.utc)
    except ValueError:
        return None


def _is_full_date(text: str) -> bool:
    match = FULL_DATE.match(text)
    if not match:
        return False
    try:
        datetime(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    except ValueError:
        return False
    return True


def ecma_pattern(pattern: str) -> re.Pattern[str]:
    """Compile a JSON Schema `pattern`; an unescaped `$` outside a class becomes `\\Z`, because in ECMA-262
    without the m flag `$` matches only at the end of input, while Python's `$` also matches before a final
    newline."""
    out: list[str] = []
    in_class = False
    index = 0
    while index < len(pattern):
        char = pattern[index]
        if char == "\\":
            out.append(pattern[index:index + 2])
            index += 2
            continue
        if char == "[":
            in_class = True
        elif char == "]":
            in_class = False
        out.append("\\Z" if char == "$" and not in_class else char)
        index += 1
    return re.compile("".join(out))


ANNOTATION_KEYWORDS = frozenset({"description", "title", "examples", "example", "default", "deprecated", "readOnly",
                                 "writeOnly", "$comment", "externalDocs", "discriminator", "xml"})
SCHEMA_TYPES = ("null", "boolean", "object", "array", "number", "string", "integer")


class SchemaValidator:
    """JSON Schema 2020-12 as OpenAPI 3.1 uses it, for the keywords the course contract emits (3.2 decision 5).

    `unevaluatedProperties` sees the properties evaluated by `properties`, `patternProperties`,
    `additionalProperties` and by the successful branches of `allOf`, `anyOf`, `oneOf` and `$ref`. A keyword
    outside the supported set raises GraderError: the schema belongs to the grader, so an unknown keyword
    is a grader defect, never a silent pass.
    """

    SUPPORTED = frozenset({"$ref", "type", "enum", "const", "properties", "patternProperties", "required",
                           "additionalProperties", "unevaluatedProperties", "items", "minItems", "maxItems",
                           "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength",
                           "pattern", "format", "not", "allOf", "anyOf", "oneOf"}) | ANNOTATION_KEYWORDS

    def __init__(self, document: dict[str, object]) -> None:
        self.document = document
        self._patterns: dict[str, re.Pattern[str]] = {}

    def errors(self, instance: object, schema: object, path: str = "$") -> list[str]:
        problems, _ = self._validate(instance, schema, path)
        return problems

    def _resolve(self, reference: str) -> object:
        if not reference.startswith("#/"):
            raise GraderError(f"схема проверки ссылается вне документа: {reference}")
        node: object = self.document
        for part in reference[2:].split("/"):
            part = part.replace("~1", "/").replace("~0", "~")
            if not isinstance(node, dict) or part not in node:
                raise GraderError(f"в схеме проверки нет {reference}")
            node = node[part]
        return node

    def _pattern(self, text: str) -> re.Pattern[str]:
        if text not in self._patterns:
            self._patterns[text] = ecma_pattern(text)
        return self._patterns[text]

    @staticmethod
    def _type_of(instance: object) -> set[str]:
        if instance is None:
            return {"null"}
        if isinstance(instance, bool):
            return {"boolean"}
        if isinstance(instance, int):
            return {"integer", "number"}
        if isinstance(instance, float):
            return {"number", "integer"} if instance.is_integer() else {"number"}
        if isinstance(instance, str):
            return {"string"}
        if isinstance(instance, list):
            return {"array"}
        if isinstance(instance, dict):
            return {"object"}
        return set()

    def _validate(self, instance: object, schema: object, path: str) -> tuple[list[str], set[str]]:
        """(problems, property names this schema evaluated on an object instance)."""
        if schema is True or schema == {}:
            return [], set(instance) if isinstance(instance, dict) else set()
        if schema is False:
            return [f"{path}: значение здесь не допускается"], set()
        if not isinstance(schema, dict):
            raise GraderError(f"схема проверки повреждена в {path}")
        unknown = set(schema) - self.SUPPORTED
        if unknown or any(key.startswith("x-") for key in schema):
            raise GraderError(f"валидатор проверки не знает ключевых слов схемы: {', '.join(sorted(unknown))}")
        problems: list[str] = []
        evaluated: set[str] = set()

        def merge(result: tuple[list[str], set[str]]) -> bool:
            sub_problems, sub_evaluated = result
            problems.extend(sub_problems)
            if not sub_problems:
                evaluated.update(sub_evaluated)
            return not sub_problems

        if "$ref" in schema:
            merge(self._validate(instance, self._resolve(str(schema["$ref"])), path))
        kinds = self._type_of(instance)
        if "type" in schema:
            wanted = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
            if not kinds.intersection(wanted):
                problems.append(f"{path}: ожидался тип {' или '.join(map(str, wanted))}")
                return problems, evaluated
        if "enum" in schema and not any(_json_equal(instance, option) for option in schema["enum"]):  # type: ignore[union-attr]
            problems.append(f"{path}: значение {json.dumps(instance, ensure_ascii=False)} вне набора "
                            f"{', '.join(json.dumps(option, ensure_ascii=False) for option in schema['enum'])}")  # type: ignore[union-attr]
        if "const" in schema and not _json_equal(instance, schema["const"]):
            problems.append(f"{path}: ожидалось {json.dumps(schema['const'], ensure_ascii=False)}")
        if "not" in schema:
            sub_problems, _ = self._validate(instance, schema["not"], path)
            if not sub_problems:
                problems.append(f"{path}: значение подходит под схему, которую исключает not")
        for keyword in ("allOf", "anyOf", "oneOf"):
            if keyword not in schema:
                continue
            branches = [self._validate(instance, branch, path) for branch in schema[keyword]]  # type: ignore[union-attr]
            passing = [branch for branch in branches if not branch[0]]
            for branch in passing:
                evaluated.update(branch[1])
            if keyword == "allOf":
                for branch in branches:
                    problems.extend(branch[0])
            elif keyword == "anyOf" and not passing:
                problems.append(f"{path}: значение не подходит ни под один вариант anyOf")
            elif keyword == "oneOf" and len(passing) != 1:
                problems.append(f"{path}: значение подходит под несколько вариантов oneOf ({len(passing)}), нужен ровно один")
        if "string" in kinds and isinstance(instance, str):
            length = len(instance)
            if "minLength" in schema and length < int(schema["minLength"]):  # type: ignore[arg-type]
                problems.append(f"{path}: длина {length} меньше {schema['minLength']}")
            if "maxLength" in schema and length > int(schema["maxLength"]):  # type: ignore[arg-type]
                problems.append(f"{path}: длина {length} больше {schema['maxLength']}")
            if "pattern" in schema and not self._pattern(str(schema["pattern"])).search(instance):
                problems.append(f"{path}: {json.dumps(instance, ensure_ascii=False)} не подходит под pattern {schema['pattern']}")
            if "format" in schema:
                problems.extend(self._format(instance, str(schema["format"]), path))
        if "number" in kinds and not isinstance(instance, bool) and isinstance(instance, (int, float)):
            for keyword, failed in (("minimum", lambda bound: instance < bound), ("maximum", lambda bound: instance > bound),
                                    ("exclusiveMinimum", lambda bound: instance <= bound),
                                    ("exclusiveMaximum", lambda bound: instance >= bound)):
                if keyword in schema and failed(schema[keyword]):
                    problems.append(f"{path}: {instance} вне границы {keyword} {schema[keyword]}")
        if isinstance(instance, list):
            if "minItems" in schema and len(instance) < int(schema["minItems"]):  # type: ignore[arg-type]
                problems.append(f"{path}: элементов {len(instance)}, меньше {schema['minItems']}")
            if "maxItems" in schema and len(instance) > int(schema["maxItems"]):  # type: ignore[arg-type]
                problems.append(f"{path}: элементов {len(instance)}, больше {schema['maxItems']}")
            if "items" in schema:
                for index, item in enumerate(instance):
                    problems.extend(self._validate(item, schema["items"], f"{path}[{index}]")[0])
        if isinstance(instance, dict):
            for name in schema.get("required", []):  # type: ignore[union-attr]
                if name not in instance:
                    problems.append(f"{path}: нет обязательного поля `{name}`")
            properties = schema.get("properties", {})
            assert isinstance(properties, dict)
            for name, sub_schema in properties.items():
                if name in instance:
                    evaluated.add(name)
                    problems.extend(self._validate(instance[name], sub_schema, f"{path}.{name}")[0])
            pattern_properties = schema.get("patternProperties", {})
            assert isinstance(pattern_properties, dict)
            for pattern, sub_schema in pattern_properties.items():
                for name in instance:
                    if self._pattern(pattern).search(name):
                        evaluated.add(name)
                        problems.extend(self._validate(instance[name], sub_schema, f"{path}.{name}")[0])
            if "additionalProperties" in schema:
                local = set(properties) | {name for name in instance
                                           if any(self._pattern(p).search(name) for p in pattern_properties)}
                closed = schema["additionalProperties"] is False or schema["additionalProperties"] == {"not": {}}
                for name in sorted(set(instance) - local):
                    evaluated.add(name)
                    if closed:
                        problems.append(f"{path}: лишнее поле `{name}`: в контракте его нет")
                    else:
                        problems.extend(self._validate(instance[name], schema["additionalProperties"], f"{path}.{name}")[0])
            if "unevaluatedProperties" in schema:
                rest = sorted(set(instance) - evaluated)
                sealed = schema["unevaluatedProperties"] is False or schema["unevaluatedProperties"] == {"not": {}}
                for name in rest:
                    if sealed:
                        problems.append(f"{path}: лишнее поле `{name}`: в контракте его нет")
                    else:
                        problems.extend(self._validate(instance[name], schema["unevaluatedProperties"], f"{path}.{name}")[0])
                    evaluated.add(name)
        return problems, evaluated

    @staticmethod
    def _format(instance: str, name: str, path: str) -> list[str]:
        if name == "date-time":
            ok = parse_response_date_time(instance) is not None
            what = "метка времени RFC 3339 со смещением"
        elif name == "date":
            ok = _is_full_date(instance)
            what = "дата YYYY-MM-DD"
        elif name == "email":
            ok = EMAIL.match(instance) is not None
            what = "адрес электронной почты"
        elif name in ("int32", "int64", "double", "float"):
            return []
        else:
            raise GraderError(f"валидатор проверки не знает формата {name}")
        return [] if ok else [f"{path}: {json.dumps(instance, ensure_ascii=False)} не {what}"]


def _json_equal(left: object, right: object) -> bool:
    if isinstance(left, bool) or isinstance(right, bool):
        return left is right
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return left == right
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(_json_equal(a, b) for a, b in zip(left, right))
    if isinstance(left, dict) and isinstance(right, dict):
        return left.keys() == right.keys() and all(_json_equal(left[key], right[key]) for key in left)
    return type(left) is type(right) and left == right
