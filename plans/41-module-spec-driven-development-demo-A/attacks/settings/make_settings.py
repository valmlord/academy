"""Write registration variants (must-fail and must-pass) of .claude/settings.json next to this file."""

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
P = "${CLAUDE_PROJECT_DIR}/.claude/hooks/stop_tests.py"


def settings(hook: dict, group_extra: dict | None = None, extra: dict | None = None, groups: int = 1) -> dict:
    group = {"hooks": [hook], **(group_extra or {})}
    return {"hooks": {"Stop": [group] * groups}, **(extra or {})}


BASE = {"type": "command", "command": "python3", "args": [P]}
FAIL = {
    "matcher_star": settings(BASE, {"matcher": "*"}),
    "if": settings({**BASE, "if": "Bash(*)"}),
    "once": settings({**BASE, "once": True}),
    "shell_bash": settings({"type": "command", "command": f'"{P}"', "shell": "bash"}),
    "async": settings({**BASE, "async": True}),
    "async_rewake": settings({**BASE, "asyncRewake": True}),
    "type_agent": settings({"type": "agent", "prompt": "check tests"}),
    "type_prompt": settings({"type": "prompt", "prompt": "check tests"}),
    "type_http": settings({"type": "http", "url": "http://localhost"}),
    "timeout_5": settings({**BASE, "timeout": 5}),
    "disable_all_hooks": settings(BASE, extra={"disableAllHooks": True}),
    "two_groups": settings(BASE, groups=2),
    "typo_path_shell": settings({"type": "command", "command": 'python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/stop_test.py"'}),
    "typo_path_exec": settings({"type": "command", "command": "python3", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/stop_test.py"]}),
    "relative_path": settings({"type": "command", "command": "python3 .claude/hooks/stop_tests.py"}),
    "unquoted_var": settings({"type": "command", "command": "python3 $CLAUDE_PROJECT_DIR/.claude/hooks/stop_tests.py"}),
    "exec_quoted": settings({"type": "command", "command": "python3", "args": [f'"{P}"']}),
    "exec_bare_var": settings({"type": "command", "command": "python3", "args": ["$CLAUDE_PROJECT_DIR/.claude/hooks/stop_tests.py"]}),
    "exec_command_with_space": settings({"type": "command", "command": f"python3 {P}", "args": []}),
    "unknown_key": settings({**BASE, "retries": 2}),
    "on_failure_bad": settings({**BASE, "onFailure": "retry"}),
    "no_hooks": {"permissions": {}},
}
PASS = {
    "e1": settings({"type": "command", "command": P, "args": []}),
    "e3": settings({"type": "command", "command": "python3", "args": ["-I", P]}),
    "timeout_30_status_onfailure": settings({**BASE, "timeout": 30, "statusMessage": "tests", "onFailure": "block"}),
    "on_failure_continue": settings({**BASE, "onFailure": "continue"}),
    "disable_all_hooks_false": settings(BASE, extra={"disableAllHooks": False}),
}
for prefix in ("", "python3 ", "python3 -I "):
    for n, spelling in enumerate(('"$CLAUDE_PROJECT_DIR"/.claude/hooks/stop_tests.py', '"${CLAUDE_PROJECT_DIR}"/.claude/hooks/stop_tests.py',
                                  '"$CLAUDE_PROJECT_DIR/.claude/hooks/stop_tests.py"', '"${CLAUDE_PROJECT_DIR}/.claude/hooks/stop_tests.py"')):
        PASS[f"shell_{prefix.strip().replace(' ', '').replace('-', '') or 'bare'}_{n}"] = settings({"type": "command", "command": f"  {prefix}{spelling}\n"})
for kind, table in (("fail", FAIL), ("pass", PASS)):
    for name, data in table.items():
        (HERE / f"{kind}_{name}.json").write_text(json.dumps(data, indent=2) + "\n")
print(len(FAIL), len(PASS))
