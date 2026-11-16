"""Stop-hook registration (stage 0) and behaviour probes (design #41, section 2.8; L1 and L7).

Registration is decided the way Claude Code 2.1.312 decides it, restricted to the forms the exercise
accepts. The behaviour verdict reproduces Claude Code's outcome only for the forms the hooks reference
documents (2.8 rules 1-5); other forms fail as outside the exercise with their own reason.
"""

import json
import os
import re
import secrets
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

import sdd_probegen

SETTINGS = Path(".claude/settings.json")
LOCAL_SETTINGS = Path(".claude/settings.local.json")
HOOK_FILE = Path(sdd_probegen.HOOK_RELATIVE)
PLACEHOLDER_PATH = "${CLAUDE_PROJECT_DIR}/.claude/hooks/stop_tests.py"
EXEC_FORMS = {
    "E1": (PLACEHOLDER_PATH, []),
    "E2": ("python3", [PLACEHOLDER_PATH]),
    "E3": ("python3", ["-I", PLACEHOLDER_PATH]),
}
SHELL_FORM = re.compile(
    r'(python3( -I)? )?"(\$CLAUDE_PROJECT_DIR|\$\{CLAUDE_PROJECT_DIR\})'
    r'(/\.claude/hooks/stop_tests\.py"|"/\.claude/hooks/stop_tests\.py)'
)
# Only what `sh -c` ignores at both ends; never str.strip(), which also removes NBSP and VT (00 L6).
SHELL_TRIM = " \t\n"
ALLOWED_KEYS = frozenset({"type", "command", "args", "timeout", "statusMessage", "onFailure"})
REJECTED_KEY_REASONS = {
    "async": "фоновый хук не может блокировать (\"Async hooks can't block or control Claude's behavior\")",
    "asyncRewake": "хук работает в фоне и будит Claude после выхода, а не держит остановку",
    "if": "на Stop хук с `if` никогда не запускается",
    "once": "в файлах настроек `once` игнорируется",
    "shell": "при `args` игнорируется, а без `args` меняет интерпретатор принятых строк",
}
TYPE_REASONS = {
    "prompt": "решает другая модель; для настоящего контроля нужен хук типа command",
    "agent": "решает другая модель; для настоящего контроля нужен хук типа command",
    "http": "вне упражнения",
    "mcp_tool": "вне упражнения",
}
MIN_TIMEOUT_SEC = 30
ON_FAILURE_VALUES = ("continue", "block")
SHEBANG = re.compile(r"^#!\s*(?:/usr/bin/env\s+python3|/\S*/python3(?:\.\d+)?)\s*$")

PROBE_TIMEOUT_SEC = 20
CLASSES = ("claim", "failmsg", "minimal", "extra", "nokey", "nonjson")
# The six red/green patterns of three probes with at least one red and one green.
PATTERNS = tuple(p for p in (tuple(f"{a}{b}{c}") for a in "RG" for b in "RG" for c in "RG") if "R" in p and "G" in p)
OUTPUT_KEYS = frozenset({"decision", "reason", "continue", "systemMessage", "suppressOutput"})
STATE_LABELS = {"R": "красные тесты", "G": "зелёные тесты", "Z": "ноль тестов"}
STUB_LABELS = {0: "линтер: чисто", 1: "линтер: нашёл нарушение", 2: "линтер: ошибка запуска", 3: "линтер: чисто"}
MAX_REPORTED = 5


def interpreter_dir() -> Path:
    """The directory of the `python3` the runner's PATH resolves, so children find the same interpreter."""
    found = shutil.which("python3")
    return Path(found).parent if found else Path(sys.executable).parent


class SettingsFormatError(Exception):
    pass


# ---------------------------------------------------------------------------------------------------
# Registration (stage 0)
# ---------------------------------------------------------------------------------------------------


def _reject_constant(name: str) -> None:
    raise SettingsFormatError(f"недопустимое значение {name}: нужен строгий JSON")


def load_settings(path: Path) -> dict[str, object] | None:
    if not path.is_file():
        return None
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as error:
        raise SettingsFormatError(f"{path}: файл не в кодировке UTF-8") from error
    try:
        data = json.loads(text, parse_constant=_reject_constant)
    except json.JSONDecodeError as error:
        raise SettingsFormatError(f"{path}: невалидный JSON (строка {error.lineno})") from error
    except SettingsFormatError as error:
        raise SettingsFormatError(f"{path}: {error}") from error
    except RecursionError as error:
        raise SettingsFormatError(f"{path}: невалидный JSON (слишком глубокая вложенность)") from error
    except ValueError as error:
        # Outside JSONDecodeError, json.loads raises ValueError only for an integer longer than
        # Python's int-string conversion limit (sys.get_int_max_str_digits, 4300 digits by default).
        raise SettingsFormatError(f"{path}: невалидный JSON (слишком длинное число)") from error
    if not isinstance(data, dict):
        raise SettingsFormatError(f"{path}: ожидается JSON-объект")
    return data


def _stop_groups(path: Path, data: dict[str, object]) -> tuple[list[object], list[str]]:
    hooks = data.get("hooks")
    if hooks is None:
        return [], []
    if not isinstance(hooks, dict):
        return [], [f"{path}: `hooks` должен быть объектом"]
    groups = hooks.get("Stop")
    if groups is None:
        return [], []
    if not isinstance(groups, list):
        return [], [f"{path}: `hooks.Stop` должен быть массивом групп"]
    return groups, []


def diagnose_exec(command: str, args: list[str]) -> str:
    if "stop_test.py" in command or any("stop_test.py" in a for a in args):
        return "опечатка в пути: файл хука называется stop_tests.py"
    if '"' in command or any('"' in a for a in args):
        return "кавычки при наличии args: в exec form нет оболочки, кавычки уходят в запуск буквально, хук не стартует"
    if "$CLAUDE_PROJECT_DIR" in command or any("$CLAUDE_PROJECT_DIR" in a for a in args):
        return "голый $CLAUDE_PROJECT_DIR в exec form не подставляется: хук не стартует"
    if command.startswith((".claude/", "./")) or any(a.startswith((".claude/", "./")) for a in args):
        return "относительный путь: хук запускается в текущем каталоге Claude, его сдвигают cd и worktree"
    return "exec form не совпадает ни с одной из форм E1-E3 (command и args сравниваются точно)"


def diagnose_shell(command: str) -> str:
    trimmed = command.strip(SHELL_TRIM)
    if "stop_test.py" in trimmed:
        return ("опечатка в пути: файл хука называется stop_tests.py; python3 с неверным путём завершится с кодом 2 и "
                "\"No such file or directory\", и Claude Code сочтёт это неблокирующей ошибкой")
    if re.search(r"(^|\s)\$\{?CLAUDE_PROJECT_DIR\}?/", trimmed):
        return "незакавыченный $CLAUDE_PROJECT_DIR в shell form: путь с пробелом развалится на два аргумента"
    if re.match(r"^(python3( -I)? )?(\./)?\.claude/", trimmed):
        return "относительный путь: хук запускается в текущем каталоге Claude, его сдвигают cd и worktree"
    if trimmed and trimmed != command.strip():
        return "по краям команды невидимые символы, которые оболочка не пропускает (NBSP, VT, CR): хук не стартует"
    return "shell form не совпадает ни с одной из 12 принятых строк"


def validate_hook(hook: object) -> tuple[list[str], bool]:
    """(problems, names_interpreter) for the one hook object."""
    if not isinstance(hook, dict):
        return ["объект хука должен быть JSON-объектом"], False
    problems: list[str] = []
    hook_type = hook.get("type")
    if hook_type != "command":
        reason = TYPE_REASONS.get(hook_type) if isinstance(hook_type, str) else None
        problems.append(f"type {hook_type!r} отклонён: {reason}" if reason else 'type должен быть "command"')
    for key in hook:
        if key not in ALLOWED_KEYS:
            problems.append(f"ключ `{key}` отклонён: {REJECTED_KEY_REASONS.get(key, 'ключ вне упражнения')}")
    if "timeout" in hook:
        timeout = hook["timeout"]
        if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or timeout < MIN_TIMEOUT_SEC:
            problems.append(f"timeout {timeout!r}: нужно число не меньше {MIN_TIMEOUT_SEC} (порог упражнения: "
                            f"проба ждёт хук до {PROBE_TIMEOUT_SEC} с) или ключ без значения убрать")
    if "onFailure" in hook and hook["onFailure"] not in ON_FAILURE_VALUES:
        problems.append('onFailure должен быть "continue" или "block"')
    if "statusMessage" in hook and not isinstance(hook["statusMessage"], str):
        problems.append("statusMessage должен быть строкой")
    command = hook.get("command")
    if not isinstance(command, str):
        return problems + ["command должен быть строкой"], False
    if "args" in hook:
        args = hook["args"]
        if not isinstance(args, list) or not all(isinstance(a, str) for a in args):
            return problems + ["args должен быть массивом строк"], False
        form = next((name for name, (c, a) in EXEC_FORMS.items() if command == c and args == a), None)
        if form is None:
            problems.append(diagnose_exec(command, args))
        return problems, form in ("E2", "E3")
    trimmed = command.strip(SHELL_TRIM)
    if SHELL_FORM.fullmatch(trimmed) is None:
        problems.append(diagnose_shell(command))
    return problems, trimmed.startswith("python3 ")


def hook_file_problems(names_interpreter: bool) -> list[str]:
    if not HOOK_FILE.is_file():
        return [f"{HOOK_FILE}: файл не найден"]
    text = HOOK_FILE.read_text(encoding="utf-8", errors="replace")
    problems: list[str] = []
    try:
        compile(text, str(HOOK_FILE), "exec", dont_inherit=True)
    except (SyntaxError, ValueError) as error:
        problems.append(f"{HOOK_FILE}: не разбирается как Python (строка {getattr(error, 'lineno', '?')})")
    except (MemoryError, RecursionError):
        # A deeply nested expression overflows the parser or the compiler instead of raising SyntaxError.
        problems.append(f"{HOOK_FILE}: не разбирается как Python (слишком глубокая вложенность)")
    if not names_interpreter:
        if not SHEBANG.match(text.split("\n", 1)[0]):
            problems.append(f"{HOOK_FILE}: без названного интерпретатора первая строка должна быть #!, называющая python3")
        if not HOOK_FILE.stat().st_mode & stat.S_IXUSR:
            problems.append(f"{HOOK_FILE}: нет бита исполнения у владельца, Claude Code не сможет запустить файл")
    return problems


def registration_problems() -> list[str]:
    """Every rule of L1 task.md item 4, plus the hook file existing and parsing."""
    try:
        settings = load_settings(SETTINGS)
        local = load_settings(LOCAL_SETTINGS)
    except SettingsFormatError as error:
        return [str(error)]
    if settings is None:
        return [f"{SETTINGS}: файл не найден"]
    problems: list[str] = []
    for path, data in ((SETTINGS, settings), (LOCAL_SETTINGS, local)):
        if data is not None and "disableAllHooks" in data and data["disableAllHooks"] is not False:
            problems.append(f"{path}: disableAllHooks со значением {data['disableAllHooks']!r} выключает все хуки")
    groups, shape = _stop_groups(SETTINGS, settings)
    problems += shape
    if local is not None:
        local_groups, local_shape = _stop_groups(LOCAL_SETTINGS, local)
        problems += local_shape
        if local_groups:
            problems.append(f"{LOCAL_SETTINGS}: Stop-хук здесь лишний: ровно один Stop-хук и только в {SETTINGS}")
    if not groups:
        return problems + [f"{SETTINGS}: в hooks.Stop нет группы с хуком"]
    if len(groups) != 1:
        return problems + [f"{SETTINGS}: в hooks.Stop должна быть ровно одна группа, найдено {len(groups)}"]
    group = groups[0]
    if not isinstance(group, dict):
        return problems + [f"{SETTINGS}: группа в hooks.Stop должна быть объектом"]
    if "matcher" in group:
        problems.append("ключ `matcher` на группе отклонён: вне упражнения, на Stop Claude Code его молча игнорирует")
    for key in group:
        if key not in ("hooks", "matcher"):
            problems.append(f"ключ группы `{key}` вне упражнения")
    hooks = group.get("hooks")
    if not isinstance(hooks, list) or len(hooks) != 1:
        count = len(hooks) if isinstance(hooks, list) else 0
        return problems + [f"{SETTINGS}: в группе Stop должен быть ровно один объект хука, найдено {count}"]
    hook_problems, names_interpreter = validate_hook(hooks[0])
    problems += hook_problems
    problems += hook_file_problems(names_interpreter)
    return problems


# ---------------------------------------------------------------------------------------------------
# Behaviour probes
# ---------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Probe:
    state: str  # "R" red, "G" green, "Z" zero tests
    payload_class: str  # one of CLASSES, or "active" for stop_hook_active: true
    stub: int | None = None  # L7 linter stub behaviour, None in L1

    @property
    def expects_block(self) -> bool:
        if self.payload_class == "active":
            return False
        return self.state in "RZ" or self.stub in (1, 2)


@dataclass(frozen=True)
class Observation:
    outcome: str  # allow | block | nonblocking | timeout | outside
    reason: str
    detail: str
    exit_code: int | None


def payload(probe: Probe, project: Path, transcript: Path) -> bytes:
    if probe.payload_class == "nonjson":
        return b"this is not json {"
    base: dict[str, object] = {
        "session_id": "sess-" + secrets.token_hex(6),
        "transcript_path": str(transcript),
        "cwd": str(project),
        "hook_event_name": "Stop",
        "stop_hook_active": probe.payload_class == "active",
        "last_assistant_message": "Готово, все тесты проходят.",
        "background_tasks": [],
        "session_crons": [],
    }
    if probe.payload_class == "failmsg":
        base["last_assistant_message"] = "Тесты падают, надо разобраться."
    elif probe.payload_class == "minimal":
        for key in ("last_assistant_message", "background_tasks", "session_crons"):
            del base[key]
    elif probe.payload_class == "extra":
        base.update(permission_mode="default", prompt_id="prompt-" + secrets.token_hex(4), effort="high")
    elif probe.payload_class == "nokey":
        del base["stop_hook_active"]
    return json.dumps(base, ensure_ascii=False).encode("utf-8")


def _missing_file_phrases(checks_dir: Path) -> list[str]:
    phrases = json.loads((checks_dir / "data" / "missing_file_phrases.json").read_text(encoding="utf-8"))
    return [phrase.lower() for phrase in phrases]


def _reject(name: str) -> None:
    raise ValueError(name)


def classify(code: int | None, stdout: str, stderr: str, missing_phrases: list[str]) -> Observation:
    """Claude Code 2.1.312's outcome for the documented forms (2.8 rules 1-4)."""
    if code is None:
        return Observation("timeout", "", "таймаут: Claude Code отменяет хук и отбрасывает его вывод", None)
    text = stdout.strip()
    data: dict[str, object] | None = None
    if text:
        try:
            parsed = json.loads(text, parse_constant=_reject)
        except ValueError:
            return Observation("outside", "", "stdout не ровно один JSON-объект (обычный текст, невалидный JSON или "
                               "несколько объектов)", code)
        if not isinstance(parsed, dict):
            return Observation("outside", "", "stdout это JSON, но не объект", code)
        data = parsed
        extra = sorted(set(data) - OUTPUT_KEYS)
        if extra:
            return Observation("outside", "", f"в JSON ключ вне упражнения: {', '.join(extra)}", code)
        if "decision" in data and data["decision"] != "block":
            return Observation("outside", "", f"decision {data['decision']!r}: единственное значение это \"block\"", code)
        if data.get("continue") is False:
            return Observation("outside", "", "continue: false останавливает Claude целиком", code)
        if "continue" in data and data["continue"] is not True:
            return Observation("outside", "", "continue должен быть true или отсутствовать", code)
        if "systemMessage" in data and not isinstance(data["systemMessage"], str):
            return Observation("outside", "", "systemMessage должен быть строкой", code)
        if "suppressOutput" in data and not isinstance(data["suppressOutput"], bool):
            return Observation("outside", "", "suppressOutput должен быть true или false", code)
        if data.get("decision") == "block":
            reason = data.get("reason")
            if not isinstance(reason, str) or not reason:
                return Observation("outside", "", "decision \"block\" без непустого строкового reason", code)
            return Observation("block", reason, "блок (JSON)", code)
    if code == 0:
        return Observation("allow", "", "пропуск", code)
    if code == 2:
        if data is None and any(phrase in stderr.lower() for phrase in missing_phrases):
            return Observation("nonblocking", "", "exit 2 с пустым stdout и фразой о ненайденном файле в stderr: "
                               "неблокирующая ошибка", code)
        return Observation("block", stderr, "блок (exit 2, причина в stderr)", code)
    return Observation("nonblocking", "", f"exit {code} без JSON-блока: неблокирующая ошибка", code)


def run_probe(hook: Path, probe: Probe, base: Path, missing_phrases: list[str]) -> tuple[Observation, list[str]]:
    root, project, tokens, stub_token = sdd_probegen.prepare(hook, probe.state, base, probe.stub)
    if probe.stub in (1, 2):
        tokens = tokens + [stub_token]
    try:
        transcript = root / "transcript.jsonl"
        transcript.write_text("", encoding="utf-8")
        home = Path(tempfile.mkdtemp(dir=root))
        tmp = Path(tempfile.mkdtemp(dir=root))
        env = {
            "PATH": f"{interpreter_dir()}:/usr/bin:/bin",
            "HOME": str(home),
            "TMPDIR": str(tmp),
            "CLAUDE_PROJECT_DIR": str(project),
        }
        process = subprocess.Popen(
            [sys.executable, "-I", "-B", str(project / sdd_probegen.HOOK_RELATIVE)],
            cwd=project, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            start_new_session=True,
        )
        try:
            out, err = process.communicate(payload(probe, project, transcript), timeout=PROBE_TIMEOUT_SEC)
            code: int | None = process.returncode
        except subprocess.TimeoutExpired:
            out, err, code = b"", b"", None
        finally:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                pass
            process.wait()
        observation = classify(code, out.decode("utf-8", "replace"), err.decode("utf-8", "replace"), missing_phrases)
        return observation, tokens if probe.expects_block else []
    finally:
        shutil.rmtree(root, ignore_errors=True)


def judge(probe: Probe, observation: Observation, tokens: list[str]) -> str:
    """Empty when the probe passes, else the observed part of its failure message."""
    if probe.expects_block:
        if observation.outcome != "block":
            return _observed(observation)
        missing = [token for token in tokens if token not in observation.reason]
        if missing:
            return f"блок, но в причине нет: {', '.join(_token_kind(t, probe) for t in dict.fromkeys(missing))}"
        return ""
    if observation.outcome == "allow" and observation.exit_code == 0:
        return ""
    return _observed(observation)


def _observed(observation: Observation) -> str:
    code = "нет" if observation.exit_code is None else str(observation.exit_code)
    return f"{observation.detail} (exit {code})"


def _token_kind(token: str, probe: Probe) -> str:
    if token == "Ran 0 tests":
        return "`Ran 0 tests`"
    if token.startswith("tests.test_"):
        return f"модуль, который не импортируется ({token})"
    if token.startswith("test_"):
        return f"имя падающего теста ({token})"
    return "токен линтера из его вывода" if probe.stub in (1, 2) else token


def describe(probe: Probe) -> str:
    stdin = "stop_hook_active: true" if probe.payload_class == "active" else probe.payload_class
    state = STATE_LABELS[probe.state]
    if probe.stub is not None:
        state += ", " + STUB_LABELS[probe.stub]
    expected = "блок с нужными токенами в причине" if probe.expects_block else "пропуск с exit 0"
    return f"вход {stdin}; {state}; ожидалось: {expected}"


def l1_rows() -> list[Probe]:
    """Per payload class one of the six mixed patterns, drawn independently; plus zero tests and active."""
    rng = secrets.SystemRandom()
    rows = [Probe(state, cls) for cls in CLASSES for state in rng.choice(PATTERNS)]
    rows += [Probe("Z", "claim"), Probe("R", "active")]
    return rows


def run_probes(hook: Path, rows: list[Probe], base: Path, checks_dir: Path, shuffle: bool = True) -> list[str]:
    """Run every probe in a shuffled order; stop at the first timeout. Returns failure messages."""
    if shuffle:
        secrets.SystemRandom().shuffle(rows)
    phrases = _missing_file_phrases(checks_dir)
    failures: list[str] = []
    for probe in rows:
        observation, tokens = run_probe(hook, probe, base, phrases)
        problem = judge(probe, observation, tokens)
        if problem:
            failures.append(f"{describe(probe)}; наблюдалось: {problem}")
        if observation.outcome == "timeout":
            failures.append(f"проверка остановлена на первом таймауте: хук не уложился в {PROBE_TIMEOUT_SEC} с")
            break
    if len(failures) > MAX_REPORTED:
        return failures[:MAX_REPORTED] + [f"и ещё {len(failures) - MAX_REPORTED} проваленных проб"]
    return failures


def l7_rows() -> list[Probe]:
    """The 20 L1 rows with a silent linter stub, plus the 5 linter rows; payload classes drawn per run."""
    rng = secrets.SystemRandom()
    silent = (0, 3)
    rows = [Probe(probe.state, probe.payload_class, rng.choice(silent)) for probe in l1_rows()]
    rows += [
        Probe("G", rng.choice(CLASSES), 1),
        Probe("G", rng.choice(CLASSES), rng.choice(silent)),
        Probe("R", rng.choice(CLASSES), rng.choice(silent)),
        Probe("G", "active", 1),
        Probe("G", rng.choice(CLASSES), 2),
    ]
    return rows
