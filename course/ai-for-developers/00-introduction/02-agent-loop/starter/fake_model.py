"""Scripted stand-in for a model, for running demo.py without any API.

It plays a fixed script and checks nothing: a harness that passes the demo can still be wrong.
"""

from typing import Any


class FakeModel:
    def __init__(self) -> None:
        self.calls = 0
        self.word_count = "?"

    def complete(self, messages: list[dict[str, Any]], tools: list[dict[str, str]]) -> dict[str, Any]:
        self.calls += 1
        names = [tool["name"] for tool in tools]
        print(f"[model] turn {self.calls}, sees tools {names}, last message: {str(messages[-1])[:120]}")
        if self.calls == 1:
            return {"type": "tool_call", "id": "call-1", "name": "read_file", "arguments": {"path": "README.md"}}
        if self.calls == 2:
            readme = str(messages[-1].get("content", ""))
            return {"type": "tool_call", "id": "call-2", "name": "word_count", "arguments": {"text": readme}}
        if self.calls == 3:
            self.word_count = str(messages[-1].get("content", "?"))
            return {"type": "tool_call", "id": "call-3", "name": "delete_everything", "arguments": {}}
        if self.calls == 4:
            return {"type": "tool_call", "id": "call-4", "name": "today", "arguments": {}}
        return {"type": "final", "text": f"README.md has {self.word_count} words"}
