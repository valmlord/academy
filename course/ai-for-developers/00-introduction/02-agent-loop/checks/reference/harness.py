"""Reference agent harness for the harness-behaviour check."""

import json
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from typing import IO, Any, Literal, Protocol


class Model(Protocol):
    def complete(self, messages: list[dict[str, Any]], tools: list[dict[str, str]]) -> dict[str, Any]: ...


@dataclass
class Result:
    status: Literal["final", "max_turns"]
    text: str
    turns: int


class ToolServer:
    """Line-delimited JSON-RPC 2.0 client for one spawned server process."""

    def __init__(self, argv: list[str]) -> None:
        self.process = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        self.next_id = 0

    def request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        self.next_id += 1
        stdin: IO[str] | None = self.process.stdin
        stdout: IO[str] | None = self.process.stdout
        if stdin is None or stdout is None:
            raise RuntimeError("tool server pipes are not open")
        stdin.write(json.dumps({"jsonrpc": "2.0", "id": self.next_id, "method": method, "params": params}) + "\n")
        stdin.flush()
        reply: dict[str, Any] = json.loads(stdout.readline())
        return reply

    def close(self) -> None:
        if self.process.stdin:
            self.process.stdin.close()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()


def call_remote(server: ToolServer, name: str, arguments: dict[str, Any]) -> tuple[str, bool]:
    reply = server.request("tools/call", {"name": name, "arguments": arguments})
    if "error" in reply:
        return f"tool server error: {reply['error'].get('message', reply['error'])}", True
    result = reply.get("result", {})
    text = "\n".join(str(item.get("text", "")) for item in result.get("content", []))
    return text, bool(result.get("isError", False))


def run_agent(
    model: Model,
    task: str,
    tool_server_cmd: list[str],
    local_tools: dict[str, Callable[[dict[str, Any]], str]],
    permission: Callable[[str, dict[str, Any]], bool],
    max_turns: int,
) -> Result:
    server = ToolServer(tool_server_cmd)
    try:
        remote = server.request("tools/list", {}).get("result", {}).get("tools", [])
        remote_names = {str(tool["name"]) for tool in remote}
        tools = [{"name": name, "description": ""} for name in local_tools]
        tools += [{"name": str(t["name"]), "description": str(t.get("description", ""))} for t in remote]
        messages: list[dict[str, Any]] = [{"role": "user", "text": task}]
        for turn in range(1, max_turns + 1):
            reply = model.complete(messages, tools)
            if reply.get("type") == "final":
                return Result(status="final", text=str(reply.get("text", "")), turns=turn)
            name = str(reply.get("name"))
            arguments = dict(reply.get("arguments") or {})
            if name not in local_tools and name not in remote_names:
                content, is_error = f"unknown tool: {name}", True
            elif not permission(name, arguments):
                content, is_error = f"permission denied: {name}", True
            elif name in local_tools:
                content, is_error = local_tools[name](arguments), False
            else:
                content, is_error = call_remote(server, name, arguments)
            messages.append(reply)
            messages.append({"type": "tool_result", "id": reply.get("id"), "content": content, "is_error": is_error})
        return Result(status="max_turns", text="", turns=max_turns)
    finally:
        server.close()
