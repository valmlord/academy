"""Attribute every tool call in a stream-json record to the agent that made it.

Usage, from the project root:
    python3 trace/trace_tree.py trace/review-run.ndjson

prints one row per tool call: the physical line of the record, the agent path, the tool and a short
description of its input. The rows come from `attribute`, which is yours to write.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

INPUT_PREVIEW_CHARS = 70


def numbered_events(path: Path) -> list[tuple[int, dict[str, object]]]:
    """(physical line number, parsed object) for every non-empty NDJSON line, in file order."""
    numbered: list[tuple[int, dict[str, object]]] = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        event = json.loads(line)
        if not isinstance(event, dict):
            raise ValueError(f"{path}:{number}: expected a JSON object, got {type(event).__name__}")
        numbered.append((number, event))
    return numbered


def load_events(path: Path) -> list[dict[str, object]]:
    return [event for _, event in numbered_events(path)]


def attribute(events: list[dict[str, object]]) -> dict[str, str]:
    """Map every `tool_use` id in `events` to the path of the agent that made that call.

    The main conversation is `main`; a subagent is `main/<type>`, and a subagent it started is
    `main/<type>/<type>`, one segment per layer of `Agent` calls. See trace/README.md.
    """
    raise NotImplementedError("attribute() is not written yet")


def tool_rows(path: Path) -> list[str]:
    numbered = numbered_events(path)
    owners = attribute([event for _, event in numbered])
    rows = []
    for number, event in numbered:
        message = event.get("message")
        content = message.get("content") if isinstance(message, dict) else None
        for block in content if isinstance(content, list) else []:
            if isinstance(block, dict) and block.get("type") == "tool_use":
                preview = json.dumps(block.get("input"), ensure_ascii=False)[:INPUT_PREVIEW_CHARS]
                rows.append(f"{number:4d}  {owners.get(str(block.get('id')), '?'):40s} {block.get('name')}  {preview}")
    return rows


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    print("\n".join(tool_rows(Path(sys.argv[1]))))
