"""Call one pipeline role through headless Claude Code (`claude -p`) and return its checked answer.

The role's contract lives in `pipeline/contracts/<role>.md`, its output schema in
`pipeline/contracts/<role>.schema.json`, its model and spend cap in the roles file passed to `call_role`.
The output shapes and the failure kinds are fixed in `docs/pipeline-brief.md`.
"""

from __future__ import annotations

from pathlib import Path

# The failure kinds of docs/pipeline-brief.md.
FAILURE_KINDS = ("failed", "budget", "no-structured-output")


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
    raise NotImplementedError("call_role is not written yet: see task.md")
