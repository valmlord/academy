"""Evaluate the workspace permission rules against the lesson policy (permissions-policy).

Models a documented subset of Claude Code 2.1.311 permission semantics (L6 research addendum):
an interactive session in a trusted workspace with an unknown mode. Outcomes per probe: deny, ask,
allow (a rule), builtin (read-only command set or a read in the working directory) and
mode-dependent (no rule matched). Anything outside the subset is rejected as unsupported rather
than guessed. Failure messages name the probe category, never the expected rule text.

Closed sets, each failing by name: allow rules (Edit inside src/, make test, make lint, exact git
status/diff), permissions.defaultMode (absent, "default", "manual", "plan"; every other value gets its
own reason), the keys of the permissions object (allow, ask, deny, defaultMode,
disableBypassPermissionsMode), the Makefile (the starter one with `agent` removed or running one
allowed line) and the workspace scripts (unchanged from the starter outside the task files).
"""

import fnmatch
import hashlib
import json
import os
import random
import re
import secrets
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

CHECKS_DIR = Path(__file__).resolve().parent
WORDS = CHECKS_DIR / "data" / "probe_words.json"
SETTINGS_FILES = (Path(".claude/settings.json"), Path(".claude/settings.local.json"))
MAKEFILE = Path("Makefile")
# The modelled session: project root is the working directory.
PROJECT = "/workspace/project"
HOME = "/home/learner"
FILE_TOOLS = ("Read", "Edit")
NEVER_MATCHING_PATH_TOOLS = ("Write", "MultiEdit", "NotebookEdit", "Glob")
SUPPORTED_TOOLS = FILE_TOOLS + NEVER_MATCHING_PATH_TOOLS + ("Bash", "WebFetch")
WRAPPERS = frozenset({"timeout", "time", "nice", "nohup", "stdbuf", "command", "builtin", "noglob", "xargs"})
READ_ONLY_COMMANDS = frozenset({"ls", "cat", "grep"})
READ_ONLY_GIT = frozenset({"status", "diff", "log"})
# The policy names exactly what runs without a prompt, so allow is a closed set (judge_content round
# 1): a list of dangerous rules is never complete (`Bash(uv run *)`, `Bash(find *)`, `Edit(//**)`...).
ALLOWED_BASH_ALLOW = frozenset({"make test", "make lint", "git status", "git diff"})
# defaultMode is a closed set too (judge_content rounds 2-3). "manual" is the documented alias of
# "default" (permission-modes page). acceptEdits and dontAsk change outcomes the policy fixes (edits
# outside src/ without a prompt; ask turned into deny); bypassPermissions and auto do not take effect
# from project or local settings and only mislead the reader.
ALLOWED_DEFAULT_MODES = ("default", "manual", "plan")
REJECTED_MODE_REASONS = {
    "acceptEdits": "правки вне src/ и команды rm, mv, cp в рабочей папке пройдут без запроса",
    "dontAsk": "всё, что должно спрашивать, превращается в отказ, и пункт 6 политики (каждая загрузка спрашивает) ломается",
    "bypassPermissions": "из проектных и локальных настроек Claude Code его игнорирует с v2.1.257, строка только вводит в заблуждение; уберите её",
    "auto": "из проектных и локальных настроек не действует (сессия начинает во встроенном стартовом режиме), строка вводит в заблуждение",
}
OTHER_MODE_REASON = "значение вне упражнения: допустимы только \"default\", \"manual\" и \"plan\" или отсутствие ключа"
# The permissions object is closed as well; anything else could widen access (for example
# additionalDirectories opens files outside the project without a prompt, policy item 7).
ALLOWED_PERMISSION_KEYS = frozenset({"allow", "ask", "deny", "defaultMode", "disableBypassPermissionsMode"})
PERMISSION_KEY_REASONS = {
    "additionalDirectories": "ключ вне упражнения; непустой список с путями вне проекта открывает агенту файлы без "
                             "запроса, это ломает пункт 7 политики",
}
# The only documented value of permissions.disableBypassPermissionsMode.
DISABLE_BYPASS_VALUE = "disable"
OTHER_KEY_REASON = "ключ вне упражнения: в permissions допускаются только allow, ask, deny, defaultMode и disableBypassPermissionsMode"
# Edit allow rules must stay inside the project's src/: relative (`src/...`, `./src/...`) or anchored
# at the settings source (`/src/...`); never `//`, `~/` or a `..` segment.
SRC_EDIT_PATTERN = re.compile(r"(?:\./|/)?src(?:/\S*)?")
MAKEFILE_ORIGINAL = CHECKS_DIR / "data" / "Makefile.orig"
STARTER_MANIFEST = CHECKS_DIR / "data" / "starter-manifest.json"
# Files the task asks the learner to edit or create; every other script must stay as in the starter.
EDITABLE_FILES = frozenset({".claude/settings.json", ".claude/settings.local.json", ".claude/hooks/protect_generated.py", "Makefile"})
SCRIPT_SUFFIXES = frozenset({".sh", ".bash", ".zsh", ".py", ".pl", ".rb", ".js", ".mjs", ".cjs", ".ts", ".mk", ".command"})
IGNORED_PARTS = frozenset({".git", "__pycache__", ".pytest_cache", ".ruff_cache"})
AGENT_TARGET = "agent"
COMPOUND_SEPARATOR = re.compile(r"\s*(?:&&|\|\||\|&|;|\||&|\n)\s*")
RULE = re.compile(r"^([A-Za-z]+)(?:\((.*)\))?$", re.DOTALL)
ENV_VAR_PREFIX = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
# The only accepted recipes of the `agent` target (optional leading @).
ALLOWED_CLAUDE_RECIPES = frozenset({"claude", "claude --permission-mode default", "claude --permission-mode manual",
                                    "claude --permission-mode plan"})
BARE_WEBFETCH_ASK = (
    "WebFetch в ask: голая форма не принимается в этом упражнении: не документировано, перекрывает ли "
    "она встроенный список доверенных доменов документации"
)


class SettingsFormatError(Exception):
    pass


class UnsupportedRuleError(Exception):
    pass


def reject_constant(name: str) -> None:
    raise SettingsFormatError(f"недопустимое значение {name}: нужен строгий JSON")


@dataclass(frozen=True)
class Rule:
    text: str
    tool: str
    spec: str | None
    matches: Callable[[str], bool]


def path_segments_match(pattern: list[str], path: list[str]) -> bool:
    if not pattern:
        return not path
    head, rest = pattern[0], pattern[1:]
    if head == "**":
        return any(path_segments_match(rest, path[i:]) for i in range(len(path) + 1))
    return bool(path) and fnmatch.fnmatchcase(path[0], head) and path_segments_match(rest, path[1:])


def compile_path_rule(spec: str, list_name: str) -> Callable[[str], bool]:
    if spec.startswith("!"):
        raise UnsupportedRuleError("правила с `!`")
    if spec.startswith("file_path:") or any(c in spec for c in "[]{}"):
        raise UnsupportedRuleError("форма поля или скобки в шаблоне")
    if spec.endswith("/") and spec != "/":
        raise UnsupportedRuleError("каталог с `/` на конце (используйте dir/**)")
    if spec.startswith("//"):
        anchored = "/" + spec[2:]
    elif spec.startswith("~/"):
        anchored = f"{HOME}/{spec[2:]}"
    elif spec.startswith("/"):
        anchored = PROJECT + spec
    elif spec.startswith("./"):
        anchored = f"{PROJECT}/{spec[2:]}"
    else:
        parts = spec.split("/")
        single_segment_dir = len(parts) == 2 and parts[1] == "**" and "*" not in parts[0]
        any_depth = "/" not in spec or (single_segment_dir and list_name != "allow")
        anchored = f"{PROJECT}/**/{spec}" if any_depth else f"{PROJECT}/{spec}"
    pattern = [p for p in anchored.split("/") if p]
    return lambda path: path_segments_match(pattern, [p for p in path.split("/") if p])


def compile_bash_rule(spec: str) -> Callable[[str], bool]:
    if spec.startswith("command:"):
        raise UnsupportedRuleError("форма поля `Bash(command:...)`")
    if spec.endswith(":*"):
        spec = spec[:-2] + " *"
    first = spec.split(" ", 1)[0]
    if first in WRAPPERS or ENV_VAR_PREFIX.match(first):
        raise UnsupportedRuleError("обёртка или переменная окружения в начале правила")
    if "*" not in spec:
        return lambda command: command == spec
    regex = ".*".join(re.escape(part) for part in spec.split("*"))
    full = re.compile(regex, re.DOTALL)
    bare = spec[:-2] if spec.endswith(" *") and spec.count("*") == 1 else None
    return lambda command: bool(full.fullmatch(command)) or command == bare


def compile_webfetch_rule(spec: str) -> Callable[[str], bool]:
    if not spec.startswith("domain:"):
        raise UnsupportedRuleError("WebFetch поддерживается только как голый или `domain:`")
    domain = spec[len("domain:"):]
    if domain == "*":
        return lambda host: True
    if domain.startswith("*."):
        suffix = domain[1:]
        return lambda host: host.endswith(suffix)
    return lambda host: host == domain


def parse_rule(text: Any, list_name: str) -> Rule:
    if not isinstance(text, str):
        raise SettingsFormatError(f"permissions.{list_name}: правило должно быть строкой, получено {text!r}")
    match = RULE.match(text.strip())
    if not match or match.group(1) not in SUPPORTED_TOOLS:
        raise UnsupportedRuleError("инструмент вне упражнения или неизвестная форма")
    tool, spec = match.group(1), match.group(2)
    if spec is None or spec == "*" and tool == "Bash":
        return Rule(text, tool, None, lambda target: True)
    if tool in FILE_TOOLS:
        return Rule(text, tool, spec, compile_path_rule(spec, list_name))
    if tool in NEVER_MATCHING_PATH_TOOLS:
        return Rule(text, tool, spec, lambda target: False)
    if tool == "Bash":
        return Rule(text, tool, spec, compile_bash_rule(spec))
    return Rule(text, tool, spec, compile_webfetch_rule(spec))


def load_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_constant)
    except json.JSONDecodeError as error:
        raise SettingsFormatError(f"{path}: невалидный JSON (строка {error.lineno})") from error
    except SettingsFormatError as error:
        raise SettingsFormatError(f"{path}: {error}") from error
    if not isinstance(data, dict):
        raise SettingsFormatError(f"{path}: ожидается объект")
    return data


class Policy:
    def __init__(self, files: list[tuple[Path, dict[str, Any]]]) -> None:
        self.rules: dict[str, list[Rule]] = {"deny": [], "ask": [], "allow": []}
        self.unsupported: list[str] = []
        self.notes: list[str] = []
        self.raw: dict[str, list[str]] = {"deny": [], "ask": [], "allow": []}
        self.default_modes: list[tuple[Path, Any]] = []
        self.unknown_permission_keys: list[tuple[Path, str]] = []
        self.disable_bypass_values: list[tuple[Path, Any]] = []
        for path, data in files:
            permissions = data.get("permissions", {})
            if not isinstance(permissions, dict):
                raise SettingsFormatError(f"{path}: permissions должен быть объектом")
            if "defaultMode" in permissions:
                self.default_modes.append((path, permissions["defaultMode"]))
            self.unknown_permission_keys.extend((path, key) for key in permissions if key not in ALLOWED_PERMISSION_KEYS)
            if "disableBypassPermissionsMode" in permissions:
                self.disable_bypass_values.append((path, permissions["disableBypassPermissionsMode"]))
            for list_name in self.rules:
                entries = permissions.get(list_name, [])
                if not isinstance(entries, list):
                    raise SettingsFormatError(f"{path}: permissions.{list_name} должен быть массивом строк")
                for entry in entries:
                    self.add(entry, list_name)

    def add(self, entry: Any, list_name: str) -> None:
        try:
            rule = parse_rule(entry, list_name)
        except UnsupportedRuleError as error:
            self.unsupported.append(f"unsupported rule form for this exercise: {entry} ({error})")
            return
        self.raw[list_name].append(rule.text.strip())
        self.rules[list_name].append(rule)
        if rule.tool in NEVER_MATCHING_PATH_TOOLS and rule.spec is not None:
            self.notes.append(f"rule accepted by Claude Code but never matches: {rule.text} (правила путей пишут через Edit)")

    def applicable(self, list_name: str, tool: str) -> list[Rule]:
        rules = self.rules[list_name]
        if tool == "Read":
            return [r for r in rules if r.tool == "Read"]
        if tool == "Edit":
            implied = [r for r in rules if r.tool == "Read"] if list_name == "deny" else []
            return [r for r in rules if r.tool == "Edit"] + implied
        if tool == "Write":
            implied = [r for r in rules if r.tool == "Read"] if list_name == "deny" else []
            bare_write = [r for r in rules if r.tool == "Write" and r.spec is None]
            return [r for r in rules if r.tool == "Edit"] + implied + bare_write
        return [r for r in rules if r.tool == tool]

    def file_outcome(self, tool: str, relative: str) -> str:
        path = f"{PROJECT}/{relative}"
        for list_name in ("deny", "ask", "allow"):
            if any(r.matches(path) for r in self.applicable(list_name, tool)):
                return list_name
        return "builtin" if tool == "Read" else "mode-dependent"

    def bash_part(self, list_name: str, part: str) -> bool:
        return any(r.matches(part) for r in self.applicable(list_name, "Bash"))

    def bash_outcome(self, command: str) -> str:
        parts = [p for p in COMPOUND_SEPARATOR.split(command.strip()) if p]
        if any(self.bash_part("deny", p) for p in parts):
            return "deny"
        if any(self.bash_part("ask", p) for p in parts):
            return "ask"
        by_rule = [self.bash_part("allow", p) for p in parts]
        if all(ok or is_read_only(p) for ok, p in zip(by_rule, parts)):
            return "allow" if any(by_rule) else "builtin"
        return "mode-dependent"

    def webfetch_outcome(self, url: str) -> str:
        host = re.sub(r"^https?://", "", url).split("/", 1)[0]
        for list_name in ("deny", "ask", "allow"):
            if any(r.matches(host) for r in self.applicable(list_name, "WebFetch")):
                return list_name
        return "mode-dependent"


def is_read_only(command: str) -> bool:
    tokens = command.split()
    if not tokens:
        return False
    if tokens[0] in READ_ONLY_COMMANDS:
        return True
    return tokens[0] == "git" and len(tokens) > 1 and tokens[1] in READ_ONLY_GIT


def build_probes(rng: random.Random) -> list[tuple[str, str, str, frozenset[str]]]:
    words = json.loads(WORDS.read_text(encoding="utf-8"))
    w = lambda: rng.choice(words["names"])  # noqa: E731
    deny, allow = frozenset({"deny"}), frozenset({"allow"})
    readable = frozenset({"builtin", "allow"})
    not_allow = frozenset({"mode-dependent", "deny"})
    ask = frozenset({"ask"})
    return [
        ("файл секрета .env в корне читается", "Read", ".env", deny),
        ("секрет с суффиксом (.env.<окружение>) читается", "Read", ".env.staging", deny),
        ("секрет на другой глубине читается", "Read", "config/.env", deny),
        ("файл секрета можно править", "Edit", ".env", deny),
        ("файл секрета на другой глубине можно перезаписать", "Write", "config/.env.local", deny),
        ("файл в src/invoices/generated/ можно править", "Edit", f"src/invoices/generated/{w()}.py", deny),
        ("файл в src/invoices/generated/ можно перезаписать", "Write", f"src/invoices/generated/{w()}.py", deny),
        ("src/invoices/api.py нельзя править без вопроса", "Edit", "src/invoices/api.py", allow),
        ("обычный файл в src/ нельзя править без вопроса", "Edit", f"src/invoices/{w()}.py", allow),
        ("новый файл в новом каталоге src/ нельзя создать без вопроса", "Write", f"src/{w()}/{w()}.py", allow),
        ("похожее имя вне generated/ (generated_report.py) нельзя править без вопроса", "Edit", "src/invoices/generated_report.py", allow),
        ("чтение src/invoices/api.py запрещено или спрашивает", "Read", "src/invoices/api.py", readable),
        ("чтение файла в generated/ запрещено или спрашивает", "Read", f"src/invoices/generated/{w()}.py", readable),
        ("make test требует вопроса", "Bash", "make test", allow),
        ("make lint требует вопроса", "Bash", "make lint", allow),
        ("git status запрещён или спрашивает", "Bash", "git status", readable),
        ("git diff запрещён или спрашивает", "Bash", "git diff", readable),
        ("git push не запрещён", "Bash", "git push origin main", deny),
        ("git push с флагами не запрещён", "Bash", f"git push --force origin {w()}", deny),
        ("git push внутри составной команды не запрещён", "Bash", "make test && git push origin main", deny),
        ("make db-reset разрешён без вопроса", "Bash", "make db-reset", not_allow),
        ("push через git -C разрешён без вопроса", "Bash", "git -C . push origin main", not_allow),
        ("git -c <опция> разрешён без вопроса", "Bash", f"git -c core.fsmonitor={w()} diff", not_allow),
        ("curl на внешний адрес разрешён без вопроса", "Bash", f"curl https://{w()}.example", not_allow),
        ("git push через sh -c разрешён без вопроса", "Bash", "sh -c 'git push origin main'", not_allow),
        ("команда через bash -c разрешена без вопроса", "Bash", f"bash -c 'curl https://{w()}.example'", not_allow),
        ("команда через python3 -c разрешена без вопроса", "Bash", "python3 -c \"__import__('os').system('make db-reset')\"", not_allow),
        ("команда через env разрешена без вопроса", "Bash", "env make db-reset", not_allow),
        ("загрузка из веба со случайного домена не спрашивает", "WebFetch", f"https://{w()}.{rng.choice(words['tlds'])}/x", ask),
        ("загрузка с домена документации не спрашивает", "WebFetch", f"https://{rng.choice(words['docs_domains'])}/{w()}", ask),
    ]


def split_agent_target(text: str) -> tuple[list[str], str | None, list[str]]:
    """Return (normalized lines outside the agent target, agent target line, agent recipe lines).

    Normalization: comment-only and empty lines dropped, runs of whitespace collapsed, the `agent`
    name removed from `.PHONY`. Recipe lines keep a leading tab marker so they stay distinct.
    """
    rest: list[str] = []
    target_line: str | None = None
    recipes: list[str] = []
    in_agent = False
    for raw in text.splitlines():
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        is_recipe = raw.startswith("\t")
        if in_agent and is_recipe:
            recipes.append(" ".join(stripped.split()))
            continue
        in_agent = False
        normalized = " ".join(stripped.split())
        if re.match(rf"^{AGENT_TARGET}\s*:(?!=)", normalized):
            in_agent = True
            target_line = normalized
            continue
        if normalized.startswith(".PHONY"):
            normalized = " ".join(token for token in normalized.split() if token != AGENT_TARGET)
        rest.append(("\t" if is_recipe else "") + normalized)
    return rest, target_line, recipes


def makefile_problems(text: str) -> list[str]:
    """Closed rule: the Makefile is the starter one, except that `agent` is removed or runs one allowed line.

    Comparing against the pristine copy instead of scanning text means variables, includes, helper
    targets and split names cannot smuggle a bypass in: any change outside `agent` fails.
    """
    original_rest, _, _ = split_agent_target(MAKEFILE_ORIGINAL.read_text(encoding="utf-8"))
    rest, target_line, recipes = split_agent_target(text)
    problems = []
    if rest != original_rest:
        problems.append("Makefile: изменено что-то кроме цели agent (сравнение с исходным Makefile после нормализации "
                        "пробелов и без комментариев); менять можно только цель agent")
    if target_line is not None:
        allowed = ", ".join(sorted(ALLOWED_CLAUDE_RECIPES))
        commands = [recipe.lstrip("@").strip() for recipe in recipes]
        if target_line != f"{AGENT_TARGET}:" or len(commands) != 1 or commands[0] not in ALLOWED_CLAUDE_RECIPES:
            problems.append(f"Makefile: цель agent должна быть без зависимостей и с одной строкой рецепта из: {allowed} "
                            "(или цель можно удалить)")
    return problems


def is_script(path: Path) -> bool:
    if path.suffix in SCRIPT_SUFFIXES or path.stat().st_mode & 0o111:
        return True
    with path.open("rb") as handle:
        return handle.read(2) == b"#!"


def changed_scripts() -> list[str]:
    """New or changed scripts and executables outside the files the task asks to edit."""
    manifest = json.loads(STARTER_MANIFEST.read_text(encoding="utf-8"))["files"]
    home = Path(os.environ.get("HOME", "/nonexistent")).resolve()
    problems = []
    for path in sorted(Path(".").rglob("*")):
        if not path.is_file() or IGNORED_PARTS & set(path.parts) or path.suffix == ".pyc":
            continue
        if path.resolve().is_relative_to(home):
            continue
        rel = path.as_posix()
        if rel in EDITABLE_FILES or not is_script(path):
            continue
        if manifest.get(rel) != hashlib.sha256(path.read_bytes()).hexdigest():
            state = "новый" if rel not in manifest else "изменённый"
            problems.append(f"{rel}: {state} скрипт или исполняемый файл вне файлов задания; менять можно только "
                            "настройки .claude, хук protect_generated.py и цель agent в Makefile")
    return problems


def hooks_problems(files: list[tuple[Path, dict[str, Any]]]) -> list[str]:
    """Only the single PreToolUse registration may exist: any other hook could answer allow."""
    problems = []
    groups = hook_objects = 0
    for path, data in files:
        hooks = data.get("hooks")
        if hooks is None:
            continue
        if not isinstance(hooks, dict):
            problems.append(f"{path}: hooks должен быть объектом")
            continue
        for event, entries in hooks.items():
            if event != "PreToolUse":
                problems.append(f"{path}: хук на событие {event} может разрешить вызов в обход правил; в упражнении он не допускается")
                continue
            for entry in entries if isinstance(entries, list) else [entries]:
                groups += 1
                inner = entry.get("hooks") if isinstance(entry, dict) else None
                hook_objects += len(inner) if isinstance(inner, list) else 1
    if groups > 1 or hook_objects > 1:
        problems.append("в настройках больше одного хука: допускается только одна группа PreToolUse с одним хуком "
                        "protect_generated, любой другой хук может вернуть allow в обход правил")
    return problems


def is_allowed_allow_rule(text: str) -> bool:
    match = RULE.match(text.strip())
    if not match:
        return False
    tool, spec = match.group(1), match.group(2)
    if tool == "Bash":
        return spec in ALLOWED_BASH_ALLOW
    if tool == "Edit" and spec is not None:
        return bool(SRC_EDIT_PATTERN.fullmatch(spec)) and not spec.startswith("//") and ".." not in spec.split("/")
    return False


def static_problems(policy: Policy) -> list[str]:
    problems = [
        f"allow-правило вне разрешённого набора: {rule} (в allow допускаются только Edit(...) внутри src/, "
        "Bash(make test), Bash(make lint), Bash(git status), Bash(git diff))"
        for rule in policy.raw["allow"]
        if not is_allowed_allow_rule(rule)
    ]
    for path, mode in policy.default_modes:
        if mode in ALLOWED_DEFAULT_MODES:
            continue
        reason = REJECTED_MODE_REASONS.get(mode, OTHER_MODE_REASON) if isinstance(mode, str) else OTHER_MODE_REASON
        problems.append(f"{path}: defaultMode {json.dumps(mode, ensure_ascii=False)}: {reason}")
    for path, key in policy.unknown_permission_keys:
        problems.append(f"{path}: permissions.{key}: {PERMISSION_KEY_REASONS.get(key, OTHER_KEY_REASON)}")
    for path, value in policy.disable_bypass_values:
        if value != DISABLE_BYPASS_VALUE or not isinstance(value, str):
            problems.append(
                f"{path}: permissions.disableBypassPermissionsMode {json.dumps(value, ensure_ascii=False)}: "
                f"единственное документированное значение \"{DISABLE_BYPASS_VALUE}\"; другое значение уберите или замените"
            )
    if any(r.tool == "WebFetch" and r.spec is None for r in policy.rules["ask"]):
        problems.append(BARE_WEBFETCH_ASK)
    if MAKEFILE.is_file():
        problems.extend(makefile_problems(MAKEFILE.read_text(encoding="utf-8")))
    else:
        problems.append("Makefile удалён: менять можно только цель agent")
    problems.extend(changed_scripts())
    return problems


def main() -> int:
    seed = int(sys.argv[2]) if len(sys.argv) == 3 and sys.argv[1] == "--seed" else secrets.randbits(48)
    files: list[tuple[Path, dict[str, Any]]] = []
    try:
        for path in SETTINGS_FILES:
            if path.is_file():
                files.append((path, load_json(path)))
        if not files:
            raise SettingsFormatError(".claude/settings.json не найден")
        policy = Policy(files)
    except SettingsFormatError as error:
        print(f"Ошибка формата: {error}")
        return 1
    problems = list(policy.unsupported) + static_problems(policy) + hooks_problems(files)
    for category, tool, target, expected in build_probes(random.Random(seed)):
        if tool in FILE_TOOLS or tool == "Write":
            outcome = policy.file_outcome(tool, target)
        elif tool == "Bash":
            outcome = policy.bash_outcome(target)
        else:
            outcome = policy.webfetch_outcome(target)
        if outcome not in expected:
            line = f"{category} (исход: {outcome})"
            if line not in problems:
                problems.append(line)
    for note in policy.notes:
        print(f"Заметка: {note}")
    if problems:
        print("Не пройдено:")
        for problem in problems:
            print(f"- {problem}")
        return 1
    print("Пройдено: правила разрешений и Makefile соответствуют политике.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
