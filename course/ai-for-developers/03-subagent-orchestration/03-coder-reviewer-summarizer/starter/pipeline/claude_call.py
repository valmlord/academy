"""Call one pipeline role through headless Claude Code (`claude -p`) and return its checked answer.

The role's contract lives in `pipeline/contracts/<role>.md`, its output schema in
`pipeline/contracts/<role>.schema.json`, its model and spend cap in the roles file passed to `call_role`.
The output shapes and the failure kinds are fixed in `docs/pipeline-brief.md`.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

# The failure kinds of docs/pipeline-brief.md.
FAILURE_KINDS = ("failed", "budget", "no-structured-output")
CONTRACTS_DIR = Path(__file__).resolve().parent / "contracts"
CALL_TIMEOUT_SEC = 600
# What each role may do is fixed on its own call line: project settings act on every call in the folder.
ROLE_FLAGS: dict[str, list[str]] = {
    "coder": ["--permission-mode", "acceptEdits"],
    "reviewer": ["--tools", "Read,Grep,Glob", "--disallowedTools", "mcp__*"],
    "summarizer": ["--tools", "Read", "--strict-mcp-config"],
}
KIND_BY_ERROR_SUBTYPE = {
    "error_max_budget_usd": "budget",
    "error_max_structured_output_retries": "no-structured-output",
}


class RoleCallError(Exception):
    """A role call that produced no usable answer.

    `kind` is one of FAILURE_KINDS. `result` is the parsed `result` message when the call printed one,
    otherwise None.
    """

    def __init__(self, role: str, kind: str, detail: str, result: dict[str, object] | None) -> None:
        super().__init__(f"{role}: {kind}: {detail}")
        self.role = role
        self.kind = kind
        self.detail = detail
        self.result = result


def call_role(role: str, prompt: str, roles_path: Path, workdir: Path) -> dict[str, object]:
    """Run `role` on `prompt` in `workdir` and return the object its output schema validated.

    Raises RoleCallError for every failed call.
    """
    answer, _ = call_role_with_result(role, prompt, roles_path, workdir)
    return answer


def call_role_with_result(role: str, prompt: str, roles_path: Path,
                          workdir: Path) -> tuple[dict[str, object], dict[str, object]]:
    """Like call_role, and also return the parsed `result` message of the successful call.

    A failed call raises RoleCallError, whose `result` is that message (or None), so a successful and a
    failed call expose the same message.
    """
    command = build_command(role, roles_path)
    completed = subprocess.run(command, input=prompt, capture_output=True, text=True, cwd=workdir,
                               timeout=CALL_TIMEOUT_SEC)
    message = last_result_message(completed.stdout)
    answer = checked_answer(role, completed.returncode, message, completed.stderr)
    assert message is not None  # checked_answer raises when there is no message
    return answer, message


def build_command(role: str, roles_path: Path) -> list[str]:
    """The role's call line; the prompt goes on stdin, so no list flag can swallow it."""
    settings = json.loads(roles_path.read_text(encoding="utf-8"))[role]
    schema = json.loads((CONTRACTS_DIR / f"{role}.schema.json").read_text(encoding="utf-8"))
    return ["claude", "-p", "--output-format", "json",
            "--model", str(settings["model"]),
            "--max-budget-usd", str(settings["max_budget_usd"]),
            "--json-schema", json.dumps(schema),
            "--append-system-prompt-file", str(CONTRACTS_DIR / f"{role}.md"),
            *ROLE_FLAGS[role]]


def last_result_message(stdout: str) -> dict[str, object] | None:
    """The `result` message: the only object in json output, the last line in stream-json."""
    for line in reversed(stdout.splitlines()):
        try:
            message = json.loads(line)
        except ValueError:
            continue
        if isinstance(message, dict) and message.get("type") == "result":
            return message
    return None


def checked_answer(role: str, code: int, message: dict[str, object] | None, stderr: str) -> dict[str, object]:
    if message is None:
        raise RoleCallError(role, "failed", f"exit {code}, no result message: {stderr.strip()[:300]}", None)
    subtype = str(message.get("subtype"))
    if subtype in KIND_BY_ERROR_SUBTYPE:
        raise RoleCallError(role, KIND_BY_ERROR_SUBTYPE[subtype], f"exit {code}, {subtype}", message)
    if code != 0 or message.get("is_error") is not False or subtype != "success":
        raise RoleCallError(role, "failed", f"exit {code}, {subtype}, is_error={message.get('is_error')}", message)
    output = message.get("structured_output")
    if not isinstance(output, dict):
        raise RoleCallError(role, "no-structured-output", "success without structured_output", message)
    return output
