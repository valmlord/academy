"""Minimal agent harness: the loop around a model.

Contract (README.md has the full message format):

- ``model.complete(messages, tools)`` returns one model turn, either
  ``{"type": "tool_call", "id": str, "name": str, "arguments": dict}`` or
  ``{"type": "final", "text": str}``. One call is one turn.
- ``messages`` is the whole context, sent on every turn. It starts as
  ``[{"role": "user", "text": task}]``. After every tool call the harness appends, in this order,
  the turn dict exactly as the model returned it and then the result
  ``{"type": "tool_result", "id": <the call id>, "content": str, "is_error": bool}``.
  Nothing else is appended.
- ``tools`` is a list of ``{"name": str, "description": str}``: every local tool plus every tool
  the external server reports via ``tools/list``.
- ``tool_server_cmd`` is the argv of an external tool server that speaks line-delimited
  JSON-RPC 2.0 over stdin/stdout (``tools/list``, ``tools/call``). Start it once per run.
- ``local_tools`` maps a tool name to a function ``(arguments: dict) -> str``.
- ``permission(name, arguments) -> bool`` is asked before any tool runs. A denied tool is never
  executed; the model gets a
  ``tool_result`` with ``is_error: true`` and a refusal text instead.
- An unknown tool name, ``isError: true`` or a JSON-RPC ``error`` from the server becomes a
  ``tool_result`` with ``is_error: true``, not a crash. The result text of ``tools/call`` is every
  ``text`` item of ``result.content`` joined with ``\n``.
- A final turn ends the run: ``Result("final", <its text>, <number of model calls>)``.
- After ``max_turns`` model calls without a final answer the run returns
  ``Result("max_turns", "", max_turns)``.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal, Protocol


class Model(Protocol):
    def complete(self, messages: list[dict[str, Any]], tools: list[dict[str, str]]) -> dict[str, Any]: ...


@dataclass
class Result:
    status: Literal["final", "max_turns"]
    text: str
    turns: int


def run_agent(
    model: Model,
    task: str,
    tool_server_cmd: list[str],
    local_tools: dict[str, Callable[[dict[str, Any]], str]],
    permission: Callable[[str, dict[str, Any]], bool],
    max_turns: int,
) -> Result:
    raise NotImplementedError("write the agent loop here")
