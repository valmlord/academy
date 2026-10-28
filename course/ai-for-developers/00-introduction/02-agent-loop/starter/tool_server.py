"""External tool server: line-delimited JSON-RPC 2.0 over stdin/stdout.

MCP-shaped and simplified, not spec-conformant: only ``tools/list`` and ``tools/call``, no
initialization, no ``_meta``. One JSON object per line in, one per line out.
"""

import json
import sys
from pathlib import Path
from typing import Any

TOOLS = [
    {"name": "read_file", "description": "Return the text of a file in the current directory."},
    {"name": "word_count", "description": "Count the words in the given text."},
]


class ToolError(Exception):
    pass


def call_tool(name: str, arguments: dict[str, Any]) -> str:
    if name == "read_file":
        path = Path(str(arguments.get("path", "")))
        if path.is_absolute() or ".." in path.parts or not path.is_file():
            raise ToolError(f"read_file: no such file in the working directory: {path}")
        return path.read_text(encoding="utf-8")
    if name == "word_count":
        return str(len(str(arguments.get("text", "")).split()))
    raise ToolError(f"unknown tool: {name}")


def handle(request: dict[str, Any]) -> dict[str, Any]:
    method = request.get("method")
    params = request.get("params") or {}
    if method == "tools/list":
        return {"tools": TOOLS}
    if method == "tools/call":
        try:
            text = call_tool(str(params.get("name")), dict(params.get("arguments") or {}))
        except ToolError as error:
            return {"content": [{"type": "text", "text": str(error)}], "isError": True}
        return {"content": [{"type": "text", "text": text}], "isError": False}
    raise KeyError(method)


def main() -> None:
    for line in sys.stdin:
        if not line.strip():
            continue
        request = json.loads(line)
        try:
            reply = {"jsonrpc": "2.0", "id": request.get("id"), "result": handle(request)}
        except KeyError:
            reply = {
                "jsonrpc": "2.0",
                "id": request.get("id"),
                "error": {"code": -32601, "message": f"method not found: {request.get('method')}"},
            }
        sys.stdout.write(json.dumps(reply) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
