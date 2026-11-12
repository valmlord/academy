"""Grade the read-only reviewer configuration of the workspace (reviewer-definition, design #43 5.L1).

Run from the workspace as `python3 -I "$ACADEMY_CHECKS_DIR/verify_reviewer.py"`. Exit 0 pass, 1 fail.

Reads `.claude/agents/**/*.md`, `.claude/settings.json` and `.claude/settings.local.json`; runs nothing from
the workspace. Whether a file loads, its tools and its model all come from `agent_defs.py`, the one resolver
the module's checks share.

The modelled scenario (R5, N1): main session on `claude-sonnet-5`, Anthropic API, the call names no model,
no `ANTHROPIC_DEFAULT_*` variable. The effective env is the project `env` with the local one over it, as in
Claude Code; a local settings file fails N2 anyway, but it must not make R5 or N1 look different from what
Claude Code would do.

Output: one line per unmet requirement, `не выполнено: <id>: <requirement>`. When a course rule decides the
failure, the line prints that rule instead of the effect, `не выполнено: <id> (правило курса <n>): <rule>`,
and the effect line of the same requirement is left out. Format problems (rule 6) also name the file and the
problem, as format errors do in module 02. No other line names a file, key or value.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
# The checks directory is the grader's; no bytecode cache is left in it.
sys.dont_write_bytecode = True
sys.path.insert(0, str(CHECKS_DIR))

import agent_defs as defs  # noqa: E402

SPEC_FILE = CHECKS_DIR / "data" / "reviewer_spec.json"
AGENTS_DIR = Path(".claude/agents")
PROJECT_SETTINGS = Path(".claude/settings.json")
LOCAL_SETTINGS = Path(".claude/settings.local.json")

REVIEWER = "code-reviewer"
CODER = "coder"
# N3: the only project subagents that may load. Compared exactly, as Claude Code keys its agents (agent_defs).
TEAM_AGENTS = frozenset({REVIEWER, CODER})
MAIN_MODEL = "claude-sonnet-5"
REVIEWER_MODEL = "claude-sonnet-5-5"
CODER_MODEL = "claude-opus-5-5"
READ_TOOLS = frozenset({"Read", "Grep", "Glob", "LSP"})
SEARCH_TOOLS = ("Read", "Grep", "Glob")
SHELL_TOOL = "Bash"
DELEGATION_TOOLS = frozenset({"Agent", "Skill", "SendMessage", "TaskStop"})
# Course rule 4: keys a read-only reviewer has no use for, and the modes that approve without asking.
FORBIDDEN_REVIEWER_KEYS = ("mcpServers", "hooks", "memory")
DOCUMENTED_PERMISSION_MODES = ("default", "manual", "acceptEdits", "auto", "dontAsk", "bypassPermissions", "plan")
FORBIDDEN_PERMISSION_MODES = ("acceptEdits", "auto", "bypassPermissions")
MODEL_ENV_KEYS = (defs.ENV_SUBAGENT_MODEL, defs.ENV_SUBAGENT_MODEL_FORCE)
# N1 "its rights do not change" (the brief): besides the effective tools, every field that changes what the coder
# may do, or may do without a prompt, keeps the starter's value. `background` is not on the list: the coder's six
# tools are all on the docs' list a background subagent keeps, and a spawned subagent starts in the background anyway.
CODER_RIGHTS_FIELDS = ("permissionMode", "mcpServers", "hooks", "memory", "skills", "isolation")

REQUIREMENTS = {
    # Worded as in task.md "Готово, когда", without the inline code marks.
    "R1": "Claude Code загружает ровно одного субагента проекта с именем code-reviewer",
    "R2": "что бы ни было в промпте и в любом режиме разрешений, у ревьюера есть только инструменты, которые "
          "читают файлы или ищут по ним",
    "R3": "ревьюер не может запускать, останавливать других агентов и писать им, и не может вызывать навыки",
    "R4": "на Linux-машинах команды ревьюер может читать файлы и искать и по имени файла, и по содержимому",
    "R5": "если вызов не называет модель, ревьюер работает на Sonnet 5.5, и тогда, когда основная сессия "
          "работает на Sonnet 5 (Anthropic API), при настройках проекта после вашего изменения",
    "R6": "каждое поле frontmatter ревьюера Claude Code читает",
    "N1": "coder по-прежнему загружается, его инструменты и другие права не меняются, и он работает на Opus 5.5 в "
          "том же сценарии",
    "N2": "настройки проекта разбираются и не меняются, кроме двух ключей env про модель субагентов, скрипты "
          "хуков не меняются, локальный файл настроек не создаётся",
    "N3": "кроме code-reviewer и coder, Claude Code не загружает других субагентов проекта",
}
COURSE_RULES = {
    1: "имена инструментов в регистре документации, строкой через запятую или списком YAML, без звёздочки, "
       "пустых элементов и запятой в конце; уточнение в скобках в списке разрешённых бывает только у Agent и Task",
    2: "модель, и в frontmatter, и в переменной окружения, записана одним из значений из списка курса в task.md",
    3: "переключатель принудительной модели записан одним из восьми значений вкл/выкл из документации",
    4: "у ревьюера нет ключей и режимов разрешений, которые курс ему запрещает (список в task.md)",
    5: "поиск на Linux судится по списку разрешённых инструментов как он записан: инструмент, который убирает "
       "список запрещённых, всё равно записан",
    6: "frontmatter записан в подмножестве YAML из task.md, а определение лежит обычным файлом",
}
NO_REVIEWER_NOTE = "Требования R2-R6 не проверялись: не загружается ни один ревьюер."
NO_SETTINGS_NOTE = "Модели ревьюера и кодера (R5 и N1) не проверялись: сначала настройки проекта должны разбираться."
SUCCESS_NOTE = "Все требования к ревьюеру выполнены."
FAILED_EXIT_CODE = 1

Key = tuple[str, int | None]


class SettingsFileError(Exception):
    """A settings file is not strict JSON, is not an object, or its env is not an object of strings."""


class Findings:
    """Unmet requirements as (id, course rule or None) mapped to the details the demo log shows."""

    def __init__(self) -> None:
        self.reasons: dict[Key, list[str]] = {}
        self.notes: list[str] = []

    def add(self, requirement: str, detail: str, rule: int | None = None) -> None:
        self.reasons.setdefault((requirement, rule), []).append(detail)

    def lines(self) -> list[str]:
        ruled = {requirement for requirement, rule in self.reasons if rule is not None}
        printed = []
        for requirement in REQUIREMENTS:
            for rule in sorted(r for q, r in self.reasons if q == requirement and r is not None):
                if rule == 6:
                    printed.extend(f"не выполнено: {requirement} (правило курса 6): {COURSE_RULES[6]}: {detail}"
                                   for detail in self.reasons[(requirement, rule)])
                else:
                    printed.append(f"не выполнено: {requirement} (правило курса {rule}): {COURSE_RULES[rule]}")
            if (requirement, None) in self.reasons and requirement not in ruled:
                printed.append(f"не выполнено: {requirement}: {REQUIREMENTS[requirement]}")
        return printed

    def keys(self) -> set[str]:
        """The demo's view: `R2` for an effect line, `R2/rule1` for a course-rule line."""
        ruled = {requirement for requirement, rule in self.reasons if rule is not None}
        return {f"{q}/rule{r}" if r is not None else q for q, r in self.reasons if r is not None or q not in ruled}


def reject_constant(name: str) -> float:
    raise ValueError(f"non-standard JSON constant {name}")


def load_settings(path: Path) -> dict[str, object]:
    try:
        data = json.loads(path.read_bytes().decode("utf-8"), parse_constant=reject_constant)
    except (OSError, UnicodeDecodeError, ValueError) as error:
        raise SettingsFileError(f"{path}: not strict JSON ({error})") from error
    if not isinstance(data, dict):
        raise SettingsFileError(f"{path}: top level is not an object")
    env = data.get("env", {})
    if not isinstance(env, dict) or not all(isinstance(value, str) for value in env.values()):
        raise SettingsFileError(f"{path}: env is not an object of strings")
    return data


def settings_env(settings: dict[str, object]) -> dict[str, str]:
    env = settings.get("env", {})
    return {str(key): str(value) for key, value in env.items()} if isinstance(env, dict) else {}


def check_settings(root: Path, spec: dict[str, object], findings: Findings) -> dict[str, str] | None:
    """N2, and the effective env for R5/N1 (None when the project settings do not parse)."""
    environment: dict[str, str] | None = None
    project_path = root / PROJECT_SETTINGS
    if project_path.is_symlink() or not project_path.is_file():
        findings.add("N2", "project settings missing or a symlink")
    else:
        try:
            project = load_settings(project_path)
        except SettingsFileError as error:
            findings.add("N2", str(error))
        else:
            environment = settings_env(project)
            rest = {key: value for key, value in project.items() if key != "env"}
            other_env = {key: value for key, value in environment.items() if key not in MODEL_ENV_KEYS}
            if other_env:
                rest["env"] = other_env
            if rest != spec["projectSettingsWithoutModelEnv"]:
                findings.add("N2", "project settings differ beyond the two model env keys")
    local_path = root / LOCAL_SETTINGS
    if local_path.exists() or local_path.is_symlink():
        findings.add("N2", "local settings file exists")
        try:
            local = load_settings(local_path)
        except SettingsFileError as error:
            findings.add("N2", str(error))
        else:
            if environment is not None:
                environment = {**environment, **settings_env(local)}
    hook_files = spec["hookFiles"]
    assert isinstance(hook_files, dict)
    for relative, digest in hook_files.items():
        path = root / relative
        if path.is_symlink() or not path.is_file():
            findings.add("N2", f"hook script {relative} missing")
        elif hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            findings.add("N2", f"hook script {relative} differs from the starter's")
    return environment


def check_reviewer_fields(agent: defs.AgentFile, findings: Findings) -> None:
    """R6, and course rules 1 and 4 that R2 carries."""
    unknown = sorted(key for key in agent.fields if key not in defs.DOCUMENTED_FIELDS)
    if unknown:
        findings.add("R6", f"{agent.path}: unknown fields {unknown}")
    for key, allow_specifier in (("tools", False), ("disallowedTools", True)):
        for entry in defs.tool_entries(agent.fields.get(key)) or []:
            problem = defs.tool_entry_problem(entry, allow_specifier=allow_specifier)
            if problem:
                findings.add("R2", f"{agent.path}: {key}: {problem}", rule=1)
    for key in FORBIDDEN_REVIEWER_KEYS:
        if key in agent.fields:
            findings.add("R2", f"{agent.path}: has {key}", rule=4)
    mode = agent.fields.get("permissionMode")
    if mode is not None and (mode not in DOCUMENTED_PERMISSION_MODES or mode in FORBIDDEN_PERMISSION_MODES):
        findings.add("R2", f"{agent.path}: permissionMode {mode!r}", rule=4)


def check_reviewer_tools(agent: defs.AgentFile, findings: Findings) -> None:
    """R2, R3 and R4 from the effective tool set and from `tools` as written (course rule 5)."""
    effective = defs.effective_tools(agent)
    if effective is None:
        findings.add("R2", f"{agent.path}: no tools list, inherits every tool")
        findings.add("R3", f"{agent.path}: no tools list, inherits Agent and Skill")
        findings.add("R4", f"{agent.path}: no tools list, so search tools are not listed")
        return
    reaching = effective & DELEGATION_TOOLS
    if reaching:
        findings.add("R3", f"{agent.path}: {sorted(reaching)}")
    others = effective - READ_TOOLS - DELEGATION_TOOLS
    if others:
        findings.add("R2", f"{agent.path}: {sorted(others)}")
    listed = {defs.canonical_tool(entry) for entry in defs.tool_entries(agent.fields.get("tools")) or []}
    missing = [tool for tool in SEARCH_TOOLS if tool not in listed or tool not in effective]
    if missing:
        findings.add("R4", f"{agent.path}: missing {missing}")
    if SHELL_TOOL in listed:
        if SHELL_TOOL in effective:
            findings.add("R4", f"{agent.path}: Bash listed, Glob and Grep do not come back")
        else:
            findings.add("R4", f"{agent.path}: Bash listed and removed by disallowedTools", rule=5)


def check_model_values(agent: defs.AgentFile, environment: dict[str, str], findings: Findings) -> bool:
    """Course rules 2 and 3. False when the model cannot be resolved (FORCE value undocumented)."""
    model = agent.fields.get("model")
    if model is not None and not (isinstance(model, str) and defs.is_course_model_value(model, allow_inherit=True)):
        findings.add("R5", f"{agent.path}: model {model!r}", rule=2)
    env_model = environment.get(defs.ENV_SUBAGENT_MODEL)
    if env_model is not None and not defs.is_course_model_value(env_model, allow_inherit=False):
        findings.add("R5", f"env model {env_model!r}", rule=2)
    force = environment.get(defs.ENV_SUBAGENT_MODEL_FORCE)
    if force is not None and defs.parse_switch(force) is None:
        findings.add("R5", f"FORCE {force!r}", rule=3)
        return False
    return True


def check_reviewer(agents: list[defs.AgentFile], environment: dict[str, str] | None, findings: Findings) -> None:
    reviewers = defs.loaded_named(agents, REVIEWER)
    if len(reviewers) != 1:
        findings.add("R1", f"{len(reviewers)} loaded definitions named {REVIEWER}")
    if not reviewers:
        findings.notes.append(NO_REVIEWER_NOTE)
        return
    for reviewer in reviewers:
        check_reviewer_fields(reviewer, findings)
        check_reviewer_tools(reviewer, findings)
        if environment is None or not check_model_values(reviewer, environment, findings):
            continue
        resolved = defs.resolve_model(reviewer, environment, MAIN_MODEL)
        if resolved != REVIEWER_MODEL:
            findings.add("R5", f"{reviewer.path}: resolves to {resolved}")


def check_coder(agents: list[defs.AgentFile], environment: dict[str, str] | None, spec: dict[str, object],
                findings: Findings) -> None:
    coders = defs.loaded_named(agents, CODER)
    if len(coders) != 1:
        findings.add("N1", f"{len(coders)} loaded definitions named {CODER}")
        return
    coder = coders[0]
    tools = defs.effective_tools(coder)
    if tools is None or sorted(tools) != spec["coderTools"]:
        findings.add("N1", f"coder tools {sorted(tools) if tools is not None else 'inherited'}")
    starter_rights = spec["coderRights"]
    assert isinstance(starter_rights, dict)
    for key in CODER_RIGHTS_FIELDS:
        if coder.fields.get(key) != starter_rights.get(key):
            findings.add("N1", f"coder {key} {coder.fields.get(key)!r}, starter {starter_rights.get(key)!r}")
    if environment is None:
        return
    force = environment.get(defs.ENV_SUBAGENT_MODEL_FORCE)
    if force is not None and defs.parse_switch(force) is None:
        return
    resolved = defs.resolve_model(coder, environment, MAIN_MODEL)
    if resolved != CODER_MODEL:
        findings.add("N1", f"coder resolves to {resolved}")


def check_extra_agents(agents: list[defs.AgentFile], findings: Findings) -> None:
    """N3: a renamed old reviewer still describes code review, so the main session may delegate a review to it."""
    for agent in agents:
        if agent.is_loaded and agent.name not in TEAM_AGENTS:
            findings.add("N3", f"{agent.path}: loads as {agent.name!r}")


def check_formats(root: Path, agents: list[defs.AgentFile], findings: Findings) -> None:
    agents_dir = root / AGENTS_DIR
    if agents_dir.is_symlink():
        findings.add("R1", ".claude/agents: символическая ссылка вместо папки", rule=6)
    for agent in agents:
        if agent.format_problem is not None:
            findings.add("R1", f"{agent.path.relative_to(root)}: {agent.format_problem}", rule=6)


def evaluate(root: Path) -> Findings:
    spec = json.loads(SPEC_FILE.read_text(encoding="utf-8"))
    findings = Findings()
    environment = check_settings(root, spec, findings)
    agents = defs.load_agents(root / AGENTS_DIR)
    check_formats(root, agents, findings)
    check_reviewer(agents, environment, findings)
    check_coder(agents, environment, spec, findings)
    check_extra_agents(agents, findings)
    if environment is None:
        findings.notes.append(NO_SETTINGS_NOTE)
    return findings


def main() -> int:
    findings = evaluate(Path.cwd())
    lines = findings.lines()
    for line in lines:
        print(line)
    for note in findings.notes:
        print(note)
    if lines:
        return FAILED_EXIT_CODE
    print(SUCCESS_NOTE)
    return 0


if __name__ == "__main__":
    sys.exit(main())
