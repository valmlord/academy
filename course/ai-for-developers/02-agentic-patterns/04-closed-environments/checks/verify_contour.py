"""Grade the closed-contour configuration of the workspace (contour-config).

Seven planted defects (G1-G7) and four guards (N1-N4), each judged by its documented effect in Claude
Code 2.1.314 and uv (design #42 L4 and 12.9, V1-V15), never by the form or place the learner chose.
The modelled session is a terminal session in a trusted folder: settings `env` applies over the shell,
and between settings files local wins over project, project over user.

Read: `launcher.env` (the bank profile the launcher and login shells load as literal KEY=VALUE lines),
`.claude/settings.local.json` (optional), `.claude/settings.json`, `home/.claude/settings.json`
(stands for `~/.claude/settings.json`), and for the leaked token every file of the workspace. uv config
files (`pyproject.toml`, `uv.toml` at any level) are never read: the brief says the team's terminals get
uv settings only from `launcher.env`.

Beyond the design's G and N table (student run B, round 2): G7 also needs
`sandbox.allowUnsandboxedCommands` to be JSON false, either in user settings (it holds over the repository) or as
the effective value (default true lets a failed command be retried outside the sandbox after a permission
prompt), and no `sandbox.excludedCommands` entry in any settings file; G6 counts only `*` as a tool-name wildcard (V4) and fails `?` or `[...]` as
undocumented; N4 also compares the hook scripts with the starter's by sha256; G2 also fails a credential header
(Authorization, x-api-key) in ANTHROPIC_CUSTOM_HEADERS; G4 also fails a UV_FIND_LINKS URL off the mirror host.

The learner sees one line per failing requirement, naming its id and the brief requirement only (never
a file, key or value). `evaluate()` returns the per-reason detail for the demo log.
"""

import hashlib
import json
import os
import re
import sys
from collections.abc import Callable, Mapping
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
SPEC_FILE = CHECKS_DIR / "data" / "contour_spec.json"

LAUNCHER = Path("launcher.env")
LOCAL_SETTINGS = Path(".claude/settings.local.json")
PROJECT_SETTINGS = Path(".claude/settings.json")
USER_SETTINGS = Path("home/.claude/settings.json")

# Values fixed by docs/contour-brief.md.
GATEWAY_URLS = frozenset({"https://llm.corp.local", "https://llm.corp.local/"})
TOKEN_PROGRAM = "/opt/corp/bin/llm-token"
CA_BUNDLE = "/etc/corp/ca-bundle.pem"
CA_DIRS = frozenset({"/etc/corp", "/etc/corp/"})
MIRROR_URLS = frozenset({"https://pypi.corp.local/simple", "https://pypi.corp.local/simple/"})
MIRROR_HOSTS = frozenset({"pypi.corp.local", "pypi.corp.local:443"})

CREDENTIAL_VARIABLES = ("ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY")
# ANTHROPIC_CUSTOM_HEADERS holds "Name: Value" lines; a credential header there is a static token too.
CREDENTIAL_HEADERS = frozenset({"authorization", "x-api-key"})
# uv also fetches distributions from find-links locations; a URL there must stay on the mirror host.
URL_ITEM = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*://([^/:?#]+)")
MIRROR_HOST = "pypi.corp.local"
# V13: UV_INDEX_URL is the deprecated spelling of UV_DEFAULT_INDEX; UV_EXTRA_INDEX_URL of UV_INDEX.
DEFAULT_INDEX_VARIABLES = ("UV_DEFAULT_INDEX", "UV_INDEX_URL")
# V15: only UV_INDEX documents the `<name>=<url>` item form; UV_EXTRA_INDEX_URL takes URLs.
NAMED_ITEM = re.compile(r"^[A-Za-z0-9_.-]+=(.+)$")
# V10: the five provider switches. CLAUDE_CODE_USE_POWERSHELL_TOOL is not a provider and is not read.
PROVIDER_VARIABLES = (
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "CLAUDE_CODE_USE_FOUNDRY",
    "CLAUDE_CODE_USE_ANTHROPIC_AWS",
    "CLAUDE_CODE_USE_MANTLE",
)
# V1: on/off variables accept these words in any casing.
ON_VALUES = frozenset({"1", "true", "yes", "on"})
OFF_VALUES = frozenset({"0", "false", "no", "off"})
# Tools the brief keeps. Glob and Grep are absent by default on macOS, Linux and WSL (V15), so a deny
# that matches them removes a file tool only where it is present; it still fails.
KEPT_TOOLS = ("Bash", "Read", "Edit", "Write", "Glob", "Grep")
WEB_SEARCH = "WebSearch"
WEB_FETCH = "WebFetch"
CONTENT_RULE = re.compile(r"^([^()]+)\((.*)\)$", re.DOTALL)
# V4 documents `*` as the tool-name wildcard ("`*` matches every tool"); `?` and `[...]` are not documented.
UNDOCUMENTED_WILDCARD = re.compile(r"[?\[\]]")
WEBFETCH_DOMAIN_RULE = re.compile(r"^WebFetch\(domain:(.*)\)$", re.DOTALL)
# N3: the launcher reads each line as it is; no `export`, quotes or spaces are stripped.
LAUNCHER_LINE = re.compile(r"^[A-Z_][A-Z0-9_]*=[^\s\"']*$")

REQUIREMENTS = {
    "G1": "каждый запрос Claude Code идёт в шлюз из брифа",
    "G2": "токены выдаёт только программа банка для токенов, и ни в одном файле рабочей папки не осталось статического токена",
    "G3": "необязательный трафик Claude Code выключен",
    "G4": "uv в терминалах команды ставит пакеты только из зеркала из брифа",
    "G5": "uv в терминалах команды доверяет корневому CA банка",
    "G6": "у агента нет веб-инструментов, а инструменты для файлов и оболочки остались",
    "G7": "команды в песочнице достают до зеркала и ни до какого другого хоста, и никакой запрос разрешения этого не расширит",
    "N1": "Claude Code по-прежнему доверяет корневому CA банка",
    "N2": "ни один запрос не уходит к другому провайдеру в обход шлюза",
    "N3": "лаунчер может прочитать свой профиль (формат строк из брифа)",
    "N4": "файлы настроек разбираются, а хуки проекта остаются на месте и включены, и скрипты хуков не изменены",
}
STOPPED_NOTE = "Остальные требования не проверялись: сначала файлы настроек должны разбираться."
SUCCESS_NOTE = "Все требования закрытого контура выполнены."
FAILED_EXIT_CODE = 1

Settings = dict[str, object]
Reasons = dict[str, list[str]]


class SettingsFileError(Exception):
    """A settings file is missing, is not strict JSON, is not an object, or has a malformed env."""


def reject_constant(name: str) -> float:
    raise ValueError(f"non-standard JSON constant {name}")


def load_settings(root: Path, relative: Path, is_required: bool) -> Settings:
    path = root / relative
    if not path.is_file():
        if is_required:
            raise SettingsFileError(f"{relative}: missing")
        return {}
    try:
        data = json.loads(path.read_bytes().decode("utf-8"), parse_constant=reject_constant)
    except (UnicodeDecodeError, ValueError) as error:
        raise SettingsFileError(f"{relative}: not strict JSON ({error})") from error
    if not isinstance(data, dict):
        raise SettingsFileError(f"{relative}: top level is {type(data).__name__}, not an object")
    env = data.get("env", {})
    if not isinstance(env, dict) or not all(isinstance(value, str) for value in env.values()):
        raise SettingsFileError(f"{relative}: env is not an object of strings")
    return data


def settings_env(settings: Settings) -> dict[str, str]:
    env = settings.get("env", {})
    # load_settings already validated the shape; the copy keeps the type checker honest.
    return {str(key): str(value) for key, value in env.items()} if isinstance(env, dict) else {}


class Launcher:
    """launcher.env as the launcher reads it: literal KEY=VALUE lines, CRLF accepted."""

    def __init__(self, path: Path) -> None:
        self.variables: dict[str, str] = {}
        self.problems: list[str] = []
        if not path.is_file():
            self.problems.append("launcher.env is missing")
            return
        try:
            text = path.read_bytes().decode("utf-8")
        except UnicodeDecodeError:
            self.problems.append("launcher.env is not UTF-8")
            return
        lines = text.split("\n")
        if lines and lines[-1] == "":
            lines.pop()
        for number, raw in enumerate(lines, start=1):
            line = raw[:-1] if raw.endswith("\r") else raw
            if line.strip() == "" or line.startswith("#"):
                continue
            if not LAUNCHER_LINE.match(line):
                self.problems.append(f"line {number} is not KEY=VALUE as the launcher reads it: {line!r}")
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key in self.variables:
                self.problems.append(f"line {number}: duplicate key {key}")
            self.variables[key] = value


class Contour:
    """The four places a variable can be set, in precedence order, plus the three settings files."""

    def __init__(self, root: Path, local: Settings, project: Settings, user: Settings, launcher: Launcher) -> None:
        self.root = root
        self.local = local
        self.project = project
        self.user = user
        self.launcher = launcher
        self.settings_chain = (local, project, user)
        self.variable_places: tuple[tuple[str, Mapping[str, str]], ...] = (
            ("local env", settings_env(local)),
            ("project env", settings_env(project)),
            ("user env", settings_env(user)),
            ("launcher.env", launcher.variables),
        )

    def effective_variable(self, name: str) -> str | None:
        """The value of the first place that sets the variable: settings over the shell (V2), then V3."""
        for _, variables in self.variable_places:
            if name in variables:
                return variables[name]
        return None

    def places_setting(self, name: str) -> list[tuple[str, str]]:
        return [(place, variables[name]) for place, variables in self.variable_places if name in variables]

    def effective_setting(self, *path: str) -> tuple[bool, object]:
        """The value of the first settings file (local, project, user) that sets the key path (V3)."""
        for settings in self.settings_chain:
            node: object = settings
            for key in path:
                if not isinstance(node, dict) or key not in node:
                    break
                node = node[key]
            else:
                return True, node
        return False, None

    def deny_entries(self) -> list[str]:
        entries: list[str] = []
        for settings in self.settings_chain:
            permissions = settings.get("permissions")
            if isinstance(permissions, dict) and isinstance(permissions.get("deny"), list):
                entries.extend(entry for entry in permissions["deny"] if isinstance(entry, str))
        return entries


def check_gateway(contour: Contour, reasons: list[str]) -> None:
    value = contour.effective_variable("ANTHROPIC_BASE_URL")
    if value not in GATEWAY_URLS:
        reasons.append(f"effective ANTHROPIC_BASE_URL is {value!r}")


def check_credentials(contour: Contour, reasons: list[str], leaked_token: bytes) -> None:
    for name in CREDENTIAL_VARIABLES:
        for place, _ in contour.places_setting(name):
            reasons.append(f"{name} is set in {place}")
    for place, headers in contour.places_setting("ANTHROPIC_CUSTOM_HEADERS"):
        for header in headers.splitlines():
            name = header.split(":", 1)[0].strip().lower()
            if name in CREDENTIAL_HEADERS:
                reasons.append(f"ANTHROPIC_CUSTOM_HEADERS in {place} carries the {name} header")
    for path in workspace_files(contour.root):
        try:
            if leaked_token in path.read_bytes():
                reasons.append(f"the leaked token is in {path.relative_to(contour.root)}")
        except OSError as error:
            reasons.append(f"cannot read {path.relative_to(contour.root)} for the token scan: {error.strerror}")
    is_set, helper = contour.effective_setting("apiKeyHelper")
    if helper != TOKEN_PROGRAM:
        reasons.append(f"effective apiKeyHelper is {helper!r}" if is_set else "apiKeyHelper is not set")


def workspace_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for directory, _, names in os.walk(root, followlinks=False):
        for name in names:
            path = Path(directory) / name
            if path.is_file() and not path.is_symlink():
                files.append(path)
    return files


def check_nonessential_traffic(contour: Contour, reasons: list[str]) -> None:
    # V1: presence-only; any non-empty value, 0 included, turns it on; empty means unset.
    value = contour.effective_variable("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC")
    if not value:
        reasons.append(f"effective CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC is {value!r}")


def check_uv_index(contour: Contour, reasons: list[str]) -> None:
    launcher = contour.launcher.variables
    if not any(launcher.get(name) in MIRROR_URLS for name in DEFAULT_INDEX_VARIABLES):
        reasons.append("launcher.env sets no default index (UV_DEFAULT_INDEX or UV_INDEX_URL) to the mirror")
    for name in DEFAULT_INDEX_VARIABLES:
        for place, value in contour.places_setting(name):
            if value not in MIRROR_URLS:
                reasons.append(f"{name} in {place} is {value!r}, not the mirror")
    for name in ("UV_INDEX", "UV_EXTRA_INDEX_URL"):
        for place, value in contour.places_setting(name):
            for item in value.split():
                named = NAMED_ITEM.match(item) if name == "UV_INDEX" else None
                url = named.group(1) if named and item not in MIRROR_URLS else item
                if url not in MIRROR_URLS:
                    reasons.append(f"{name} item {item!r} in {place} is not the mirror")
    for place, value in contour.places_setting("UV_FIND_LINKS"):
        for item in re.split(r"[\s,]+", value.strip()):
            host = URL_ITEM.match(item)
            if host is not None and host.group(1).lower() != MIRROR_HOST:
                reasons.append(f"UV_FIND_LINKS item {item!r} in {place} is not on the mirror host")


def check_uv_ca(contour: Contour, reasons: list[str]) -> None:
    launcher = contour.launcher.variables
    if launcher.get("SSL_CERT_FILE") != CA_BUNDLE and launcher.get("SSL_CERT_DIR") not in CA_DIRS:
        reasons.append("launcher.env sets neither SSL_CERT_FILE to the bundle nor SSL_CERT_DIR to /etc/corp")
    for place, value in contour.places_setting("SSL_CERT_FILE"):
        if value != CA_BUNDLE:
            reasons.append(f"SSL_CERT_FILE in {place} is {value!r}")
    for place, value in contour.places_setting("SSL_CERT_DIR"):
        if value not in CA_DIRS:
            reasons.append(f"SSL_CERT_DIR in {place} is {value!r}")


def tool_glob_matches(pattern: str, tool: str) -> bool:
    """`*` matches any run of characters, every other character itself; the whole name must match (V4)."""
    return re.fullmatch(".*".join(re.escape(part) for part in pattern.split("*")), tool) is not None


def check_web_tools(contour: Contour, reasons: list[str]) -> None:
    is_search_removed = False
    is_fetch_removed = False
    # Entries that look like a removal but are not one; they only explain a tool that stays.
    ineffective: dict[str, list[str]] = {WEB_SEARCH: [], WEB_FETCH: []}
    for entry in contour.deny_entries():
        rule = CONTENT_RULE.match(entry)
        if rule is None:
            if UNDOCUMENTED_WILDCARD.search(entry):
                # Its effect is not documented: it removes no web tool here and may remove a kept one.
                reasons.append(f"deny {entry!r} uses a wildcard other than * (undocumented, V4)")
                continue
            # V4: a bare name or a tool-name glob removes every tool it matches in full.
            removed_kept = [tool for tool in KEPT_TOOLS if tool_glob_matches(entry, tool)]
            if removed_kept:
                where_present = " (where present)" if {"Glob", "Grep"} & set(removed_kept) else ""
                reasons.append(f"deny {entry!r} removes {', '.join(removed_kept)}{where_present}")
            is_search_removed = is_search_removed or tool_glob_matches(entry, WEB_SEARCH)
            is_fetch_removed = is_fetch_removed or tool_glob_matches(entry, WEB_FETCH)
            continue
        tool, specifier = rule.group(1), rule.group(2)
        if tool == "Bash" and specifier == "*":
            reasons.append("deny 'Bash(*)' is equivalent to 'Bash' and removes the shell tool (V4)")
        elif tool == WEB_FETCH and specifier == "domain:*":
            reasons.append("deny 'WebFetch(domain:*)' keeps the tool and cuts sandboxed commands off from every host (V4)")
        elif tool in (WEB_SEARCH, WEB_FETCH) and specifier == "*":
            ineffective[tool].append(f"deny {entry!r}: the Tool(*) form is documented for Bash only (V4)")
    web_fetch_switch = contour.effective_variable("CLAUDE_CODE_DISABLE_WEB_FETCH")
    if web_fetch_switch is not None and web_fetch_switch.lower() in ON_VALUES:
        is_fetch_removed = True
    elif web_fetch_switch is not None:
        meaning = "turns WebFetch on" if web_fetch_switch.lower() in OFF_VALUES else "is not an on/off value"
        ineffective[WEB_FETCH].append(f"CLAUDE_CODE_DISABLE_WEB_FETCH={web_fetch_switch!r} {meaning} (V1)")
    for tool, is_removed in ((WEB_SEARCH, is_search_removed), (WEB_FETCH, is_fetch_removed)):
        if not is_removed:
            detail = "; ".join(ineffective[tool])
            reasons.append(f"{tool} is not removed" + (f" ({detail})" if detail else ""))


def check_sandbox(contour: Contour, reasons: list[str]) -> None:
    # V5, V6: strictAllowlist takes effect only from user (or managed, --settings) settings, and under
    # it the repository's allowedDomains and WebFetch(domain:) allow rules are ignored.
    sandbox = contour.user.get("sandbox")
    network = sandbox.get("network") if isinstance(sandbox, dict) else None
    network = network if isinstance(network, dict) else {}
    if network.get("strictAllowlist") is not True:
        reasons.append("user settings sandbox.network.strictAllowlist is not JSON true")
    is_set, enabled = contour.effective_setting("sandbox", "enabled")
    if enabled is not True:
        reasons.append(f"effective sandbox.enabled is {enabled!r}" if is_set else "sandbox.enabled is not set")
    # Default true: a command that fails in the sandbox can be retried outside it after a permission prompt
    # (dangerouslyDisableSandbox); only false makes every command run sandboxed (sandboxing.md). A false in
    # user settings holds even when the repository sets true (v2.1.285); otherwise the first file decides.
    user_sandbox = contour.user.get("sandbox")
    is_user_false = isinstance(user_sandbox, dict) and user_sandbox.get("allowUnsandboxedCommands") is False
    is_set, unsandboxed = contour.effective_setting("sandbox", "allowUnsandboxedCommands")
    if not is_user_false and unsandboxed is not False:
        reasons.append(f"effective sandbox.allowUnsandboxedCommands is {unsandboxed!r}" if is_set
                       else "sandbox.allowUnsandboxedCommands is not set (default true)")
    # Commands in excludedCommands run outside the sandbox even when allowUnsandboxedCommands is false, so any
    # entry, in any settings file, lets a command reach hosts beyond the allowlist.
    for place, settings in (("local", contour.local), ("project", contour.project), ("user", contour.user)):
        sandbox_settings = settings.get("sandbox")
        excluded = sandbox_settings.get("excludedCommands") if isinstance(sandbox_settings, dict) else None
        if excluded not in (None, []):
            reasons.append(f"{place} settings sandbox.excludedCommands is {excluded!r}")
    domains = network.get("allowedDomains", [])
    if not isinstance(domains, list) or not all(isinstance(domain, str) for domain in domains):
        reasons.append("user settings sandbox.network.allowedDomains is not a list of strings")
        domains = []
    allowlist = list(domains)
    permissions = contour.user.get("permissions")
    if isinstance(permissions, dict) and isinstance(permissions.get("allow"), list):
        for entry in permissions["allow"]:
            rule = WEBFETCH_DOMAIN_RULE.match(entry) if isinstance(entry, str) else None
            if rule is not None:
                allowlist.append(rule.group(1))
    if not allowlist:
        reasons.append("the user-scope allowlist is empty")
    for host in allowlist:
        if host not in MIRROR_HOSTS:
            reasons.append(f"the user-scope allowlist holds {host!r}")


def check_claude_ca(contour: Contour, reasons: list[str]) -> None:
    value = contour.effective_variable("NODE_EXTRA_CA_CERTS")
    if value != CA_BUNDLE:
        reasons.append(f"effective NODE_EXTRA_CA_CERTS is {value!r}")


def check_providers(contour: Contour, reasons: list[str]) -> None:
    # V2: an empty value counts as unset for provider selection.
    for name in PROVIDER_VARIABLES:
        value = contour.effective_variable(name)
        if value and value.lower() not in OFF_VALUES:
            reasons.append(f"effective {name} is {value!r}")


def check_launcher_format(contour: Contour, reasons: list[str]) -> None:
    reasons.extend(contour.launcher.problems)


def check_hooks(contour: Contour, reasons: list[str], pristine_hooks: object, hook_files: dict[str, str]) -> None:
    if contour.project.get("hooks") != pristine_hooks:
        reasons.append("project hooks differ from the starter's")
    for relative, digest in hook_files.items():
        path = contour.root / relative
        if not path.is_file() or path.is_symlink():
            reasons.append(f"hook script {relative} is missing")
        elif hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            reasons.append(f"hook script {relative} differs from the starter's")
    # V15 hooks.md: the value left after settings precedence decides.
    is_set, disabled = contour.effective_setting("disableAllHooks")
    if is_set and disabled is True:
        reasons.append("effective disableAllHooks is true")


def evaluate(root: Path) -> Reasons:
    """Every requirement id mapped to the reasons it fails; an empty list means it holds."""
    spec = json.loads(SPEC_FILE.read_text(encoding="utf-8"))
    reasons: Reasons = {requirement: [] for requirement in REQUIREMENTS}
    try:
        local = load_settings(root, LOCAL_SETTINGS, is_required=False)
        project = load_settings(root, PROJECT_SETTINGS, is_required=True)
        user = load_settings(root, USER_SETTINGS, is_required=True)
    except SettingsFileError as error:
        reasons["N4"].append(str(error))
        reasons["stopped"] = ["settings files do not parse"]
        return reasons
    contour = Contour(root, local, project, user, Launcher(root / LAUNCHER))
    leaked_token = spec["leakedToken"].encode("utf-8")
    checks: dict[str, Callable[[Contour, list[str]], None]] = {
        "G1": check_gateway,
        "G2": lambda c, r: check_credentials(c, r, leaked_token),
        "G3": check_nonessential_traffic,
        "G4": check_uv_index,
        "G5": check_uv_ca,
        "G6": check_web_tools,
        "G7": check_sandbox,
        "N1": check_claude_ca,
        "N2": check_providers,
        "N3": check_launcher_format,
        "N4": lambda c, r: check_hooks(c, r, spec["projectHooks"], spec["hookFiles"]),
    }
    for requirement, check in checks.items():
        check(contour, reasons[requirement])
    return reasons


def main() -> int:
    reasons = evaluate(Path.cwd())
    failed = [requirement for requirement in REQUIREMENTS if reasons[requirement]]
    for requirement in failed:
        print(f"не выполнено: {requirement}: {REQUIREMENTS[requirement]}")
    if "stopped" in reasons:
        print(STOPPED_NOTE)
    if failed:
        return FAILED_EXIT_CODE
    print(SUCCESS_NOTE)
    return 0


if __name__ == "__main__":
    sys.exit(main())
