"""Grade the learner's run_agent (harness.py) by observing it from the grader process.

The oracle stays here: scripted models with randomized tool names, arguments, results and call
plans, the tool-result computation and the observation log. The learner's code runs in a separate
``python3 -I`` process whose sys.path is the workspace only; it gets proxies that forward every
model call, local tool call and permission question over a private socket, and a tool server
command that starts a logic-free relay. The verdict is computed from what this process observed,
never from the learner process exit code (design L2, runner requirement 2.5.4).

Every scenario is built from the same random ingredients (tool counts, call kinds, positions), so
a harness cannot recognise a scenario and special-case it. A scripted run passes only when the
model reaches its final turn: a harness that stops early on an error result fails.
"""

import json
import os
import random
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

CHECKS_DIR = Path(__file__).resolve().parent
RELAY_SOURCE = CHECKS_DIR / "fixtures" / "relay.py"
WORKSPACE = Path.cwd()
SCENARIO_TIMEOUT_SEC = 25
# A loop without a max_turns guard is stopped this many model calls after the limit.
EXTRA_CALLS_BEFORE_KILL = 3
# How long the grader waits, after Result arrives, for the harness to have stopped the server.
SERVER_SHUTDOWN_GRACE_SEC = 3.0
ABORT_TURN = {"type": "final", "text": "grader-abort"}
OK, UNKNOWN, DENIED, SERVER_ERROR, RPC_ERROR = "ok", "unknown", "denied", "server-error", "rpc-error"
ERROR_KINDS = (UNKNOWN, DENIED, SERVER_ERROR, RPC_ERROR)
KIND_ITEM = {OK: 1, UNKNOWN: 4, DENIED: 6, SERVER_ERROR: 5, RPC_ERROR: 5}
KIND_TEXT = {
    UNKNOWN: "вызова неизвестного инструмента",
    DENIED: "вызова, запрещённого permission",
    SERVER_ERROR: "ответа сервера с isError: true",
    RPC_ERROR: "ответа сервера с полем error (JSON-RPC)",
    OK: "обычного вызова инструмента",
}

BOOTSTRAP_SOURCE = r'''
import json
import socket
import sys
import threading

socket_path, workspace = sys.argv[1], sys.argv[2]
sys.path.insert(0, workspace)
conn = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
conn.connect(socket_path)
stream = conn.makefile("rw", encoding="utf-8", newline="\n")
lock = threading.Lock()


def ask(message):
    payload = json.dumps(message)
    with lock:
        stream.write(payload + "\n")
        stream.flush()
        line = stream.readline()
    if not line:
        raise SystemExit("grader closed the channel")
    return json.loads(line)


config = ask({"hello": "bootstrap"})


class ModelProxy:
    def complete(self, messages, tools):
        return ask({"op": "model", "messages": messages, "tools": tools})["turn"]


def make_local(name):
    def call(arguments):
        return ask({"op": "local", "name": name, "arguments": arguments})["result"]
    return call


def permission(name, arguments):
    return bool(ask({"op": "perm", "name": name, "arguments": arguments})["allow"])


try:
    import harness
    result = harness.run_agent(
        ModelProxy(),
        config["task"],
        config["tool_server_cmd"],
        {name: make_local(name) for name in config["local_tools"]},
        permission,
        config["max_turns"],
    )
    ask({
        "op": "result",
        "status": getattr(result, "status", None),
        "text": getattr(result, "text", None),
        "turns": getattr(result, "turns", None),
    })
except BaseException as error:
    try:
        ask({"op": "error", "error": f"{type(error).__name__}: {error}"[:300]})
    except BaseException:
        pass
'''

MSG = {
    1: "п.1 (результаты в контекст)",
    2: "п.2 (остановка на final)",
    3: "п.3 (max_turns)",
    4: "п.4 (неизвестный инструмент)",
    5: "п.5 (внешние инструменты через tools/list и tools/call)",
    6: "п.6 (разрешения до исполнения)",
}


class KillRun(Exception):
    pass


class Scenario:
    """Scripted model plus observation log. Subclasses build the call plan."""

    name = "base"

    def __init__(self, rng: random.Random) -> None:
        self.rng = rng
        self.failures: list[str] = []
        self.events: list[tuple[str, str, Any]] = []
        self.history: list[tuple[dict[str, Any], tuple[str, str | None]]] = []
        self.model_calls = 0
        self.result: dict[str, Any] | None = None
        self.error: str | None = None
        self.kill = False
        self.server_left_running = False
        self.task = f"task-{self.token()}"
        self.local = [f"l_{self.token()}" for _ in range(rng.randint(1, 3))]
        self.remote = [f"r_{self.token()}" for _ in range(rng.randint(2, 4))]
        self.denied: set[str] = set()
        self.server_error_tools: set[str] = set()
        self.rpc_error_tools: set[str] = set()
        self.max_turns = 30
        self.pending_results: dict[str, str] = {}
        self.listed = False
        self.plan: list[tuple[str, str]] = []
        self.last: tuple[dict[str, Any], str] | None = None
        self.final_text = f"done-{self.token()}"
        # Set when the grader itself ended the run early after a mismatch it already reported.
        self.grader_aborted = False

    def token(self) -> str:
        return "".join(self.rng.choice("abcdefghijklmnopqrstuvwxyz0123456789") for _ in range(10))

    def fail(self, item: int, detail: str) -> None:
        line = f"{MSG[item]}: {detail}"
        if line not in self.failures:
            self.failures.append(line)

    def config(self, tool_server_cmd: list[str]) -> dict[str, Any]:
        return {"task": self.task, "tool_server_cmd": tool_server_cmd, "local_tools": self.local,
                "max_turns": self.max_turns}

    def tool_names_ok(self, tools: Any) -> None:
        if not isinstance(tools, list) or not all(isinstance(t, dict) for t in tools):
            self.fail(5, "второй аргумент model.complete должен быть списком словарей {name, description}")
            return
        names = {t.get("name") for t in tools}
        if any(n not in names for n in self.remote):
            self.fail(5, "модель не получила в tools все инструменты, которые сервер вернул на tools/list")
        if any(n not in names for n in self.local):
            self.fail(5, "модель не получила в tools все локальные инструменты")
        if any(not isinstance(t.get("description"), str) for t in tools):
            self.fail(5, "у каждого инструмента в tools должно быть строковое поле description")

    def validate_messages(self, messages: Any) -> bool:
        expected: list[Any] = [{"role": "user", "text": self.task}]
        for turn, (kind, content) in self.history:
            expected.append(turn)
            expected.append((kind, content, turn["id"]))
        if not isinstance(messages, list) or len(messages) != len(expected):
            got = len(messages) if isinstance(messages, list) else type(messages).__name__
            self.fail(1, f"на ходе {self.model_calls} ожидалось {len(expected)} элементов messages "
                         f"(запрос пользователя, затем пары ход/tool_result), получено {got}")
            return False
        for index, (want, got) in enumerate(zip(expected, messages)):
            if isinstance(want, tuple):
                kind, content, call_id = want
                if not isinstance(got, dict) or got.get("type") != "tool_result" or got.get("id") != call_id:
                    self.fail(1, f"messages[{index}]: ожидался tool_result с id вызова {call_id!r}")
                    return False
                if not isinstance(got.get("content"), str) or not isinstance(got.get("is_error"), bool):
                    self.fail(1, f"messages[{index}]: content должен быть строкой, is_error булевым")
                    return False
                if kind == OK and got["is_error"]:
                    self.fail(1, f"messages[{index}]: успешный результат помечен is_error: true")
                    return False
                if kind == OK and got["content"] != content:
                    self.fail(1, f"messages[{index}]: content не совпадает с тем, что вернул инструмент")
                    return False
                if kind != OK and not got["is_error"]:
                    self.fail(KIND_ITEM[kind], f"messages[{index}]: после {KIND_TEXT[kind]} ожидался tool_result с is_error: true")
                    return False
            elif got != want:
                self.fail(1, f"messages[{index}]: ожидался {'запрос пользователя' if index == 0 else 'ход модели в том виде, как он пришёл'}")
                return False
        return True

    def call(self, name: str) -> dict[str, Any]:
        return {"type": "tool_call", "id": f"call-{self.token()}", "name": name,
                "arguments": {"key": self.token(), "n": self.rng.randint(1, 999)}}

    def on_model(self, messages: Any, tools: Any) -> dict[str, Any]:
        self.model_calls += 1
        self.events.append(("model", str(self.model_calls), None))
        if self.model_calls == 1:
            self.tool_names_ok(tools)
        if not self.settle() or not self.validate_messages(messages):
            self.grader_aborted = True
            return ABORT_TURN
        return self.next_turn()

    def settle(self) -> bool:
        """Record the previous call and its expected result; False aborts the run."""
        if self.last is None:
            return True
        turn, kind = self.last
        reached = turn["name"] in self.pending_results
        if kind in (OK, SERVER_ERROR, RPC_ERROR) and not reached:
            item = 5 if turn["name"] in self.remote else 1
            self.fail(item, f"{KIND_TEXT[kind]}: инструмент не был исполнен (внешний должен дойти до процесса tool_server_cmd)")
            return False
        content = self.pending_results.pop(turn["name"], None) if kind == OK else None
        self.pending_results.pop(turn["name"], None)
        self.history.append((turn, (kind, content)))
        self.last = None
        return True

    def next_turn(self) -> dict[str, Any]:
        step = len(self.history)
        if step < len(self.plan):
            name, kind = self.plan[step]
            turn = self.call(name)
            self.last = (turn, kind)
            return turn
        return {"type": "final", "text": self.final_text}

    def on_perm(self, name: str, arguments: Any) -> bool:
        self.events.append(("perm", name, arguments))
        return name not in self.denied

    def asked_before(self, name: str, arguments: Any) -> bool:
        for kind, n, args in reversed(self.events[:-1]):
            if kind == "model":
                return False
            if kind == "perm" and n == name and args == arguments:
                return True
        return False

    def on_local(self, name: str, arguments: Any) -> str:
        self.events.append(("exec", name, arguments))
        if name in self.denied:
            self.fail(6, "permission вернул False, а локальный инструмент всё равно исполнен")
        elif not self.asked_before(name, arguments):
            self.fail(6, "локальный инструмент исполнен без вопроса permission(name, arguments) перед ним")
        result = f"{name}-out-{self.token()}"
        self.pending_results[name] = result
        return result

    def on_rpc(self, request: Any) -> dict[str, Any]:
        if not isinstance(request, dict):
            return {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "parse error"}}
        rid = request.get("id")
        method = request.get("method")
        params = request.get("params") or {}
        if method == "tools/list":
            self.listed = True
            tools = [{"name": n, "description": f"tool {n}"} for n in self.remote]
            return {"jsonrpc": "2.0", "id": rid, "result": {"tools": tools}}
        if method == "tools/call":
            name = params.get("name") if isinstance(params, dict) else None
            arguments = params.get("arguments") if isinstance(params, dict) else None
            self.events.append(("exec", str(name), arguments))
            if not self.listed:
                self.fail(5, "tools/call пришёл до tools/list: инструменты сервера нужно узнавать через tools/list")
            if name not in self.remote:
                self.fail(4, f"tools/call пришёл для имени {name!r}, которого нет в tools/list: неизвестный "
                             "инструмент харнесс должен распознать сам и не отправлять серверу")
                return {"jsonrpc": "2.0", "id": rid,
                        "result": {"content": [{"type": "text", "text": f"unknown tool {name}"}], "isError": True}}
            if name in self.denied:
                self.fail(6, "permission вернул False, а вызов всё равно дошёл до внешнего процесса")
            elif not self.asked_before(str(name), arguments):
                self.fail(6, "внешний инструмент вызван без вопроса permission(name, arguments) перед ним")
            self.pending_results[str(name)] = "reached"
            if name in self.server_error_tools:
                return {"jsonrpc": "2.0", "id": rid,
                        "result": {"content": [{"type": "text", "text": f"{name} failed: {self.token()}"}], "isError": True}}
            if name in self.rpc_error_tools:
                return {"jsonrpc": "2.0", "id": rid, "error": {"code": -32000, "message": f"{name} crashed: {self.token()}"}}
            parts = [f"{name}-a-{self.token()}", f"{name}-b-{self.token()}"]
            self.pending_results[str(name)] = "\n".join(parts)
            return {"jsonrpc": "2.0", "id": rid,
                    "result": {"content": [{"type": "text", "text": p} for p in parts], "isError": False}}
        return {"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": "method not found"}}

    def executed(self, name: str) -> int:
        return sum(1 for kind, n, _ in self.events if kind == "exec" and n == name)

    def verdict(self) -> None:
        for name in self.denied:
            if self.executed(name):
                self.fail(6, "запрещённый инструмент был исполнен")
        if self.server_left_running:
            self.fail(5, "после возврата Result процесс tool_server_cmd ещё работает: харнесс должен его завершить")
        r = self.result
        if r is None:
            return
        if self.grader_aborted:
            return
        if self.model_calls < len(self.plan) + 1:
            stopped_after = self.history[-1][1][0] if self.history else None
            if self.last is not None:
                stopped_after = self.last[1]
            if stopped_after in ERROR_KINDS:
                self.fail(KIND_ITEM[stopped_after], f"после {KIND_TEXT[stopped_after]} цикл должен вернуть модели "
                                                    "результат-ошибку и продолжить, а он завершился")
            else:
                self.fail(2, "цикл завершился раньше, чем модель вернула ход final")
            return
        problems = []
        if r.get("status") != "final":
            problems.append(f"status={r.get('status')!r} вместо 'final'")
        if r.get("text") != self.final_text:
            problems.append("text не совпадает с текстом хода final")
        if r.get("turns") != self.model_calls:
            problems.append(f"turns={r.get('turns')!r}, а вызовов модели было {self.model_calls}")
        if problems:
            self.fail(2, "Result неверен: " + "; ".join(problems))


class MixedScenario(Scenario):
    """Several ordinary calls plus one unknown and one denied call at random positions."""

    name = "mixed"

    def __init__(self, rng: random.Random) -> None:
        super().__init__(rng)
        denied = rng.choice(self.local + self.remote)
        self.denied = {denied}
        callable_tools = [t for t in self.local + self.remote if t != denied]
        plan = [(rng.choice(callable_tools), OK) for _ in range(rng.randint(3, 5))]
        plan += [(f"x_{self.token()}", UNKNOWN), (denied, DENIED)]
        rng.shuffle(plan)
        self.plan = plan


class ErrorsScenario(Scenario):
    """Server-side errors (isError and JSON-RPC error) mixed with ordinary, unknown and denied calls."""

    name = "errors"

    def __init__(self, rng: random.Random) -> None:
        super().__init__(rng)
        self.remote.append(f"r_{self.token()}")
        server_error, rpc_error = rng.sample(self.remote, 2)
        self.server_error_tools, self.rpc_error_tools = {server_error}, {rpc_error}
        denied = rng.choice([t for t in self.local + self.remote if t not in (server_error, rpc_error)])
        self.denied = {denied}
        callable_tools = [t for t in self.local + self.remote if t not in (denied, server_error, rpc_error)]
        plan = [(rng.choice(callable_tools), OK) for _ in range(rng.randint(1, 3))]
        plan += [(server_error, SERVER_ERROR), (rpc_error, RPC_ERROR), (denied, DENIED), (f"x_{self.token()}", UNKNOWN)]
        rng.shuffle(plan)
        self.plan = plan


class MaxTurnsScenario(Scenario):
    """The model never answers; the harness must stop after max_turns model calls."""

    name = "max-turns"

    def __init__(self, rng: random.Random) -> None:
        super().__init__(rng)
        self.max_turns = rng.randint(3, 6)
        callable_tools = self.local + self.remote
        self.plan = [(rng.choice(callable_tools), OK) for _ in range(self.max_turns + EXTRA_CALLS_BEFORE_KILL + 5)]

    def settle(self) -> bool:
        if self.model_calls > self.max_turns + EXTRA_CALLS_BEFORE_KILL:
            self.fail(3, f"после max_turns={self.max_turns} цикл продолжил вызывать модель")
            raise KillRun
        return super().settle()

    def verdict(self) -> None:
        if self.server_left_running:
            self.fail(5, "после возврата Result процесс tool_server_cmd ещё работает: харнесс должен его завершить")
        r = self.result
        if r is None:
            return
        if self.model_calls > self.max_turns:
            self.fail(3, f"модель вызвана {self.model_calls} раз при max_turns={self.max_turns}")
        elif r.get("status") != "max_turns" or r.get("turns") != self.max_turns or self.model_calls != self.max_turns:
            self.fail(3, f"ожидался Result(status='max_turns', turns={self.max_turns}) после {self.max_turns} "
                         f"вызовов модели, получено status={r.get('status')!r}, turns={r.get('turns')!r}, "
                         f"вызовов модели {self.model_calls}")


class Channel:
    """Unix socket server for one scenario; one thread per connection."""

    def __init__(self, scenario: Scenario, private_dir: Path, tool_server_cmd: list[str]) -> None:
        self.scenario = scenario
        self.tool_server_cmd = tool_server_cmd
        self.path = str(private_dir / "s")
        self.server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.server.bind(self.path)
        self.server.listen(8)
        self.lock = threading.Lock()
        self.done = threading.Event()
        self.relays_open = 0
        threading.Thread(target=self.accept_loop, daemon=True).start()

    def accept_loop(self) -> None:
        while True:
            try:
                conn, _ = self.server.accept()
            except OSError:
                return
            threading.Thread(target=self.serve, args=(conn,), daemon=True).start()

    def serve(self, conn: socket.socket) -> None:
        stream = conn.makefile("rw", encoding="utf-8", newline="\n")
        is_relay = False
        try:
            for line in stream:
                message = json.loads(line)
                if message.get("hello") == "relay":
                    is_relay = True
                    with self.lock:
                        self.relays_open += 1
                reply = self.dispatch(message)
                if reply is None:
                    break
                if message.get("op") == "result":
                    self.wait_for_server_shutdown()
                stream.write(json.dumps(reply) + "\n")
                stream.flush()
                if message.get("op") in ("result", "error"):
                    self.done.set()
        except (OSError, ValueError):
            pass
        finally:
            if is_relay:
                with self.lock:
                    self.relays_open -= 1
            conn.close()

    def wait_for_server_shutdown(self) -> None:
        deadline = time.monotonic() + SERVER_SHUTDOWN_GRACE_SEC
        while time.monotonic() < deadline:
            with self.lock:
                if self.relays_open == 0:
                    return
            time.sleep(0.02)
        self.scenario.server_left_running = True

    def dispatch(self, message: dict[str, Any]) -> dict[str, Any] | None:
        s = self.scenario
        with self.lock:
            if s.kill:
                return None
            try:
                if message.get("hello") == "bootstrap":
                    return s.config(self.tool_server_cmd)
                if message.get("hello") == "relay":
                    return {"ok": True}
                op = message.get("op")
                if op == "model":
                    return {"turn": s.on_model(message.get("messages"), message.get("tools"))}
                if op == "perm":
                    return {"allow": s.on_perm(str(message.get("name")), message.get("arguments"))}
                if op == "local":
                    return {"result": s.on_local(str(message.get("name")), message.get("arguments"))}
                if op == "rpc":
                    try:
                        request = json.loads(message.get("line", ""))
                    except ValueError:
                        request = None
                    return {"line": json.dumps(s.on_rpc(request))}
                if op == "result":
                    s.result = message
                    return {"ok": True}
                if op == "error":
                    s.error = str(message.get("error"))
                    return {"ok": True}
            except KillRun:
                s.kill = True
                self.done.set()
                return None
        return {"error": "unknown op"}

    def close(self) -> None:
        self.server.close()


def run_scenario(scenario: Scenario) -> None:
    private_dir = Path(tempfile.mkdtemp(prefix="hg-"))
    os.chmod(private_dir, 0o700)
    try:
        relay = private_dir / "relay.py"
        shutil.copyfile(RELAY_SOURCE, relay)
        bootstrap = private_dir / "bootstrap.py"
        bootstrap.write_text(BOOTSTRAP_SOURCE, encoding="utf-8")
        channel = Channel(scenario, private_dir, [sys.executable, "-I", str(relay), str(private_dir / "s")])
        env = {"PATH": f"{Path(sys.executable).parent}:/usr/bin:/bin", "HOME": str(private_dir)}
        process = subprocess.Popen(
            [sys.executable, "-I", str(bootstrap), channel.path, str(WORKSPACE)],
            cwd=WORKSPACE, env=env, stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
        )
        deadline = time.monotonic() + SCENARIO_TIMEOUT_SEC
        while time.monotonic() < deadline and process.poll() is None and not channel.done.is_set():
            time.sleep(0.02)
        if not channel.done.is_set() and process.poll() is not None:
            channel.done.wait(1)
        timed_out = not channel.done.is_set() and process.poll() is None
        try:
            os.killpg(process.pid, 9)
        except (ProcessLookupError, PermissionError):
            pass
        process.wait()
        channel.close()
        if scenario.kill:
            pass
        elif scenario.error is not None:
            scenario.failures.insert(0, f"run_agent завершился исключением: {scenario.error}")
        elif scenario.result is None:
            reason = "истёк таймаут" if timed_out else "процесс завершился, не вернув результат"
            scenario.failures.insert(0, f"run_agent не вернул Result ({reason})")
        if scenario.result is not None:
            scenario.verdict()
    finally:
        shutil.rmtree(private_dir, ignore_errors=True)


def log_seed(seed: int) -> None:
    line = f"harness-behaviour seed={seed} (rerun: python3 -I test_harness.py --seed {seed})\n"
    log_path = os.environ.get("ACADEMY_GRADER_LOG")
    if log_path:
        with open(log_path, "a", encoding="utf-8") as log:
            log.write(line)
    else:
        sys.stderr.write("[grader-log] " + line)


def main() -> int:
    if len(sys.argv) == 3 and sys.argv[1] == "--seed":
        seed = int(sys.argv[2])
    else:
        seed = secrets.randbits(48)
    if not (WORKSPACE / "harness.py").is_file():
        print("harness.py не найден в корне рабочей папки")
        return 1
    rng = random.Random(seed)
    scenarios: list[Scenario] = [MixedScenario(rng), ErrorsScenario(rng), MaxTurnsScenario(rng), MixedScenario(rng)]
    rng.shuffle(scenarios)
    failures: list[str] = []
    for index, scenario in enumerate(scenarios, 1):
        run_scenario(scenario)
        failures += [f"[прогон {index}] {line}" for line in scenario.failures]
    if failures:
        print("Проверка не пройдена:")
        for line in dict.fromkeys(failures):
            print(f"- {line}")
        log_seed(seed)
        return 1
    print("Пройдено: все шесть пунктов выполнены.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
