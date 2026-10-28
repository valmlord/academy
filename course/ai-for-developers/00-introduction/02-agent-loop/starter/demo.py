"""Run the harness against the scripted FakeModel and the stdio tool server."""

import datetime
import sys
from typing import Any

from fake_model import FakeModel
from harness import run_agent

ALLOWED_TOOLS = frozenset({"read_file", "word_count", "today"})
DEMO_MAX_TURNS = 8


def today(arguments: dict[str, Any]) -> str:
    return datetime.date.today().isoformat()


def permission(name: str, arguments: dict[str, Any]) -> bool:
    allowed = name in ALLOWED_TOOLS
    print(f"[permission] {name} -> {allowed}")
    return allowed


if __name__ == "__main__":
    result = run_agent(
        model=FakeModel(),
        task="Count the words in README.md",
        tool_server_cmd=[sys.executable, "tool_server.py"],
        local_tools={"today": today},
        permission=permission,
        max_turns=DEMO_MAX_TURNS,
    )
    print(result)
