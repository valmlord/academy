"""Check the PreToolUse hook for src/invoices/generated/ (hook-blocks-generated).

(a) Registration: decided the way Claude Code decides it (hooks docs, "Exec form and shell form"):
`args` present means exec form (no shell), absent means shell form. Only registrations that the
demo has grounded are accepted; anything that would not start, would not block or switches hooks
off fails with a message naming the form, key or file.
(b) Behaviour: the hook file runs as `python3 -I <hook>` with a fresh environment and payloads
shaped like the docs' PreToolUse input for Edit and Write. The verdict comes from the observed
exit code, stderr and stdout.
"""

import json
import os
import random
import re
import secrets
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

CHECKS_DIR = Path(__file__).resolve().parent
WORDS = CHECKS_DIR / "data" / "probe_words.json"
SETTINGS_FILES = (Path(".claude/settings.json"), Path(".claude/settings.local.json"))
HOOK_FILE = Path(".claude/hooks/protect_generated.py")
PLACEHOLDER_PATH = "${CLAUDE_PROJECT_DIR}/.claude/hooks/protect_generated.py"
EXEC_FORMS = {
    "E1": (PLACEHOLDER_PATH, []),
    "E2": ("python3", [PLACEHOLDER_PATH]),
    "E3": ("python3", ["-I", PLACEHOLDER_PATH]),
}
SHELL_FORM = re.compile(
    r'(python3( -I)? )?"(\$CLAUDE_PROJECT_DIR|\$\{CLAUDE_PROJECT_DIR\})'
    r'(/\.claude/hooks/protect_generated\.py"|"/\.claude/hooks/protect_generated\.py)'
)
# Only the characters `sh -c` itself ignores at both ends; never str.strip(), which also removes
# NBSP and VT that make sh exit 127 (grounded in the demo under sh -c and bash -c).
SHELL_TRIM = " \t\n"
ALLOWED_KEYS = frozenset({"type", "command", "args", "timeout", "onFailure", "statusMessage"})
REJECTED_KEY_REASONS = {
    "if": "команда хука запускается только при совпадении шаблона `if`, опечатка в нём молча выключает хук (fail open); хук сам решает по пути",
    "async": "фоновый хук выполняется без блокировки вызова, поэтому ничего не блокирует",
    "asyncRewake": "фоновый хук выполняется без блокировки вызова, поэтому ничего не блокирует",
    "shell": "вне упражнения: принятые строки проверены только для оболочки по умолчанию (это не отказ Claude Code)",
    "once": "вне упражнения (в файлах настроек once игнорируется)",
}
MIN_TIMEOUT_SEC = 5
ON_FAILURE_VALUES = ("continue", "block")
SHEBANG = re.compile(r"^#!\s*(?:/usr/bin/env\s+python3|/\S*/python3(?:\.\d+)?)\s*$")
# Matchers are an allowlist: a plain list of tool names separated by `|` or `,`. Regex matchers are
# rejected because Claude Code evaluates them as JavaScript regexes and Python cannot judge those
# (a Python-valid regex can be invalid or never match in JS: the hook would silently never run).
MATCHER_LIST = re.compile(r"\s*[A-Za-z]+(?:\s*[|,]\s*[A-Za-z]+)*\s*")
REQUIRED_MATCHER_TOOLS = frozenset({"Edit", "Write"})
# Read is excluded: the hook would then block reads of generated/, which the policy allows.
OPTIONAL_MATCHER_TOOLS = frozenset({"MultiEdit", "NotebookEdit"})
HOOK_RUN_TIMEOUT_SEC = 5
BLOCK_EXIT_CODE = 2
CODEGEN_HINT = "make codegen"


class SettingsFormatError(Exception):
    pass


def reject_constant(name: str) -> None:
    raise SettingsFormatError(f"недопустимое значение {name}: нужен строгий JSON")


def load_settings() -> list[tuple[Path, dict[str, Any]]]:
    loaded = []
    for path in SETTINGS_FILES:
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_constant)
        except json.JSONDecodeError as error:
            raise SettingsFormatError(f"{path}: невалидный JSON (строка {error.lineno})") from error
        except SettingsFormatError as error:
            raise SettingsFormatError(f"{path}: {error}") from error
        if not isinstance(data, dict):
            raise SettingsFormatError(f"{path}: ожидается объект")
        loaded.append((path, data))
    if not loaded:
        raise SettingsFormatError(".claude/settings.json не найден")
    return loaded


def matcher_problem(matcher: Any) -> str | None:
    """None when the matcher is an accepted list naming Edit and Write; otherwise the reason."""
    if not isinstance(matcher, str) or not MATCHER_LIST.fullmatch(matcher):
        return (f"matcher {matcher!r} не принят: нужен список имён через | или , (например \"Edit|Write\"); "
                "regex, \"*\" и пустой matcher вне упражнения")
    names = {name.strip() for name in re.split(r"[|,]", matcher)}
    if not REQUIRED_MATCHER_TOOLS <= names:
        return f"matcher {matcher!r} не совпадает и с Edit, и с Write"
    extra = names - REQUIRED_MATCHER_TOOLS - OPTIONAL_MATCHER_TOOLS
    if extra:
        return f"matcher {matcher!r}: лишние инструменты {sorted(extra)} (допустимы Edit, Write и по желанию MultiEdit, NotebookEdit)"
    return None


def other_hooks_problems(settings: list[tuple[Path, dict[str, Any]]]) -> list[str]:
    """Only one hook may exist in workspace settings: the single PreToolUse registration.

    Any other hook (another event such as PermissionRequest, another PreToolUse group, another hook
    object) could return allow/approve and skip the permission prompts the policy relies on.
    """
    problems = []
    groups = 0
    hook_objects = 0
    for path, data in settings:
        hooks = data.get("hooks")
        if hooks is None:
            continue
        if not isinstance(hooks, dict):
            problems.append(f"{path}: hooks должен быть объектом")
            continue
        for event, entries in hooks.items():
            if event != "PreToolUse":
                problems.append(f"{path}: хук на событие {event} не разрешён в этом упражнении: он может разрешить вызов в обход правил")
                continue
            for entry in entries if isinstance(entries, list) else [entries]:
                groups += 1
                inner = entry.get("hooks") if isinstance(entry, dict) else None
                hook_objects += len(inner) if isinstance(inner, list) else 1
    if groups > 1 or hook_objects > 1:
        problems.append("в настройках должен быть ровно один хук: одна группа PreToolUse с одним объектом хука "
                        "protect_generated; любой другой хук может вернуть allow в обход правил")
    return problems


def diagnose_exec(command: str, args: list[str]) -> str:
    if '"' in command or any('"' in a for a in args):
        return ("форма с кавычками при наличии args: в exec form нет оболочки, кавычки и $ уходят в запуск "
                "буквально, хук не стартует, а не стартовавший хук это fail open")
    if "$CLAUDE_PROJECT_DIR" in command or any("$CLAUDE_PROJECT_DIR" in a for a in args):
        return "голый $CLAUDE_PROJECT_DIR в exec form не подставляется: хук не стартует"
    if command.startswith((".claude/", "./")) or any(a.startswith((".claude/", "./")) for a in args):
        return "относительный путь: хук запускается в текущем каталоге Claude, его сдвигают cd и worktree"
    if " " in command and not command.startswith("/"):
        return "exec form запускает command как одно имя программы: `python3 script.py` вместе с args не стартует"
    return "exec form не совпадает ни с одной из форм E1-E3 (command и args сравниваются точно)"


def diagnose_shell(command: str) -> str:
    trimmed = command.strip(SHELL_TRIM)
    if re.search(r"(^|\s)\$\{?CLAUDE_PROJECT_DIR\}?/", trimmed):
        return "незакавыченный $CLAUDE_PROJECT_DIR в shell form: путь с пробелом развалится на два аргумента"
    if re.search(r"(^|\s)(\./)?\.claude/hooks/protect_generated\.py", trimmed) and not re.match(r"^(python3( -I)? )?(\./)?\.claude/", trimmed):
        return "команда только упоминает путь к хуку, сам хук не выполняется"
    if re.match(r"^(python3( -I)? )?(\./)?\.claude/", trimmed):
        return "относительный путь: хук запускается в текущем каталоге Claude, его сдвигают cd и worktree"
    if trimmed and trimmed != command.strip():
        return "по краям команды невидимые символы, которые оболочка не пропускает (NBSP, VT, CR): хук не стартует"
    return "shell form не совпадает ни с одной из 12 принятых строк"


def validate_hook(hook: Any) -> tuple[list[str], bool]:
    """Return (errors, names_interpreter) for one hook object."""
    if not isinstance(hook, dict):
        return ["объект хука должен быть JSON-объектом"], False
    errors = []
    for key in hook:
        if key not in ALLOWED_KEYS:
            errors.append(f"ключ `{key}` отклонён: {REJECTED_KEY_REASONS.get(key, 'ключ вне упражнения')}")
    if hook.get("type") != "command":
        errors.append('type должен быть "command"')
    if "timeout" in hook:
        timeout = hook["timeout"]
        if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or timeout < MIN_TIMEOUT_SEC:
            errors.append(f"timeout {timeout!r}: нужно число не меньше {MIN_TIMEOUT_SEC}: хук может не успеть, "
                          "а таймаут без onFailure: \"block\" не блокирует (fail open)")
    if "onFailure" in hook and hook["onFailure"] not in ON_FAILURE_VALUES:
        errors.append('onFailure должен быть "continue" или "block"')
    if "statusMessage" in hook and not isinstance(hook["statusMessage"], str):
        errors.append("statusMessage должен быть строкой")
    command = hook.get("command")
    if not isinstance(command, str):
        return errors + ["command должен быть строкой"], False
    names_interpreter = False
    if "args" in hook:
        args = hook["args"]
        if not isinstance(args, list) or not all(isinstance(a, str) for a in args):
            return errors + ["args должен быть массивом строк"], False
        form = next((name for name, (c, a) in EXEC_FORMS.items() if command == c and args == a), None)
        if form is None:
            errors.append(diagnose_exec(command, args))
        names_interpreter = form in ("E2", "E3")
    else:
        trimmed = command.strip(SHELL_TRIM)
        if SHELL_FORM.fullmatch(trimmed) is None:
            errors.append(diagnose_shell(command))
        names_interpreter = trimmed.startswith("python3 ")
    return errors, names_interpreter


def direct_execution_problems() -> list[str]:
    if not HOOK_FILE.is_file():
        return [f"{HOOK_FILE} не найден"]
    problems = []
    first_line = HOOK_FILE.read_text(encoding="utf-8", errors="replace").split("\n", 1)[0]
    if not SHEBANG.match(first_line):
        problems.append(f"{HOOK_FILE}: без названного интерпретатора первая строка должна быть #!, называющая python3")
    if not HOOK_FILE.stat().st_mode & stat.S_IXUSR:
        problems.append(f"{HOOK_FILE}: нет бита исполнения у владельца, Claude Code не сможет запустить файл")
    return problems


def check_registration(settings: list[tuple[Path, dict[str, Any]]]) -> tuple[list[str], bool]:
    """Return (problems, on_failure_block of the accepted hook)."""
    problems = []
    for path, data in settings:
        if "disableAllHooks" in data and data["disableAllHooks"] is not False:
            problems.append(f"{path}: disableAllHooks со значением {data['disableAllHooks']!r} выключает все хуки, не удаляя их")
    problems.extend(other_hooks_problems(settings))
    candidates: list[dict[str, Any]] = []
    rejected: list[str] = []
    for path, data in settings:
        hooks = data.get("hooks", {})
        entries = hooks.get("PreToolUse", []) if isinstance(hooks, dict) else []
        for entry in entries if isinstance(entries, list) else []:
            if not isinstance(entry, dict) or not isinstance(entry.get("hooks"), list):
                continue
            reason = matcher_problem(entry.get("matcher"))
            if reason is None:
                candidates.extend(entry["hooks"])
            else:
                rejected.append(f"{reason} ({path})")
    if not candidates:
        problems.append("нет PreToolUse-хука с принятым matcher, который называет и Edit, и Write" + (f": {'; '.join(rejected)}" if rejected else ""))
        return problems, False
    reports = []
    for hook in candidates:
        errors, names_interpreter = validate_hook(hook)
        if not errors and not names_interpreter:
            errors = direct_execution_problems()
        if not errors and not HOOK_FILE.is_file():
            errors = [f"{HOOK_FILE} не найден"]
        if not errors:
            return problems, isinstance(hook, dict) and hook.get("onFailure") == "block"
        reports.extend(errors)
    problems.extend(dict.fromkeys(reports))
    return problems, False


def run_hook(project: Path, stdin_text: str) -> tuple[int | None, str, str]:
    env = {"PATH": f"{Path(sys.executable).parent}:/usr/bin:/bin", "HOME": str(project), "CLAUDE_PROJECT_DIR": str(project)}
    try:
        done = subprocess.run([sys.executable, "-I", str(HOOK_FILE.resolve())], input=stdin_text, cwd=project, env=env,
                              capture_output=True, text=True, timeout=HOOK_RUN_TIMEOUT_SEC)
    except subprocess.TimeoutExpired:
        return None, "", ""
    return done.returncode, done.stdout, done.stderr


def deny_reason(stdout: str) -> str | None:
    try:
        data = json.loads(stdout)
        output = data["hookSpecificOutput"]
        if output.get("permissionDecision") == "deny":
            return str(output.get("permissionDecisionReason", ""))
    except (ValueError, KeyError, TypeError, AttributeError):
        return None
    return None


def payload(project: Path, rng: random.Random, tool: str, file_path: str) -> str:
    token = "".join(rng.choice("abcdef0123456789") for _ in range(12))
    if tool == "Edit":
        tool_input: dict[str, Any] = {"file_path": file_path, "old_string": "a = 1", "new_string": "a = 2", "replace_all": False}
    else:
        tool_input = {"file_path": file_path, "content": "a = 2\n"}
    return json.dumps({
        "session_id": f"sess-{token}", "transcript_path": f"{project}/.transcript-{token}.jsonl", "cwd": str(project),
        "permission_mode": "default", "hook_event_name": "PreToolUse", "tool_name": tool,
        "tool_input": tool_input, "tool_use_id": f"toolu_{token}",
    })


def check_behaviour(rng: random.Random, on_failure_block: bool) -> list[str]:
    if not HOOK_FILE.is_file():
        return [f"{HOOK_FILE} не найден"]
    words = json.loads(WORDS.read_text(encoding="utf-8"))["names"]
    w = lambda: rng.choice(words)  # noqa: E731
    base = Path(tempfile.mkdtemp(prefix="hookcheck-"))
    project = base / f"proj {w()}"
    project.mkdir()
    p = str(project)
    problems = []
    try:
        must_block = [
            ("правка в generated/", "Edit", f"{p}/src/invoices/generated/{w()}.py"),
            ("новый файл во вложенном каталоге generated/", "Write", f"{p}/src/invoices/generated/{w()}/{w()}.py"),
            ("путь в generated/ через ..", "Edit", f"{p}/src/invoices/../invoices/generated/{w()}.py"),
        ]
        must_allow = [
            ("src/invoices/api.py", "Edit", f"{p}/src/invoices/api.py"),
            ("generated/../api.py", "Edit", f"{p}/src/invoices/generated/../api.py"),
            ("generated_report.py", "Edit", f"{p}/src/invoices/generated_report.py"),
            ("generated_helpers.py в новом каталоге src/", "Write", f"{p}/src/{w()}/generated_helpers.py"),
            ("новый файл в src/invoices/", "Write", f"{p}/src/invoices/{w()}.py"),
            ("docs/generated-notes.md", "Edit", f"{p}/docs/generated-notes.md"),
            ("tests/generated/ (Write)", "Write", f"{p}/tests/generated/{w()}.py"),
            ("tests/generated/ (Edit)", "Edit", f"{p}/tests/generated/{w()}.py"),
        ]
        for label, tool, path in must_block:
            code, out, err = run_hook(project, payload(project, rng, tool, path))
            reason = deny_reason(out) if code == 0 else None
            if not ((code == BLOCK_EXIT_CODE and CODEGEN_HINT in err) or (reason is not None and CODEGEN_HINT in reason)):
                problems.append(f"{label}: не заблокировано (нужен exit 2 и `{CODEGEN_HINT}` в stderr или JSON deny с `{CODEGEN_HINT}` в причине; получен exit {code})")
        for label, tool, path in must_allow:
            code, out, _ = run_hook(project, payload(project, rng, tool, path))
            if code != 0 or deny_reason(out) is not None:
                problems.append(f"{label}: заблокировано, а должно пропускаться (нужен exit 0 без deny; получен exit {code})")
        malformed = [
            ("stdin не JSON", "this is not json {"),
            ("JSON без tool_input.file_path", json.dumps({"hook_event_name": "PreToolUse", "tool_name": "Edit", "tool_input": {}, "cwd": p})),
        ]
        for label, text in malformed:
            code, out, _ = run_hook(project, text)
            blocked = code == BLOCK_EXIT_CODE or (code == 0 and deny_reason(out) is not None)
            if on_failure_block and code != 0:
                blocked = True
            if not blocked:
                problems.append(f"{label}: вызов не заблокирован (exit {code}); нужен exit 2 или любой ненулевой код при onFailure: \"block\"")
    finally:
        shutil.rmtree(base, ignore_errors=True)
    return problems


def main() -> int:
    seed = int(sys.argv[2]) if len(sys.argv) == 3 and sys.argv[1] == "--seed" else secrets.randbits(48)
    try:
        settings = load_settings()
    except SettingsFormatError as error:
        print(f"Ошибка формата: {error}")
        return 1
    registration, on_failure_block = check_registration(settings)
    behaviour = check_behaviour(random.Random(seed), on_failure_block)
    if registration or behaviour:
        print("Не пройдено:")
        for line in registration:
            print(f"- (а) регистрация: {line}")
        for line in behaviour:
            print(f"- (б) поведение: {line}")
        return 1
    print("Пройдено: хук зарегистрирован в принятой форме и блокирует только src/invoices/generated/.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
