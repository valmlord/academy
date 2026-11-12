"""Random stream-json traces for `trace-attribution` (design #43 revision 6, 5.L6).

A trace is the list of parsed NDJSON lines of one `claude -p --output-format stream-json --verbose
--forward-subagent-text` run, normalised to one content block per line, as in the lesson's visible record.
The generator simulates a run: every agent has a short script of actions; a scheduler picks a random
runnable agent for every line, so the messages of sibling subagents interleave; a parent waits for every
subagent it started (foreground), and the `tool_result` that returns a subagent's report reaches the parent
when the subagent ends.

Invariants (5.L6):
- a child's messages never come before its spawning `tool_use`, so single-pass honest code is safe;
- the `tool_use` name of a subagent call is always `Agent`, never `Task` (`Task` appears only in init);
- one content block per line;
- random ids and random type names;
- a subagent's first line is a user message with its prompt (headless page, "Follow subagent messages").

The expected answer (`tool_use` id -> agent path) is computed while the trace is built, from the simulated
tree, never from the emitted lines, so the oracle does not share code with any attribution algorithm.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass, field

TRACE_COUNT = 50
# Per-run minimums (design 5.L6, assessment note 9). Depth counts subagent layers below main; 3 is the
# documented default nesting limit ("up to three layers below the main conversation").
MIN_DEPTH_TWO_OR_MORE = 10
MIN_DEPTH_THREE = 10
MIN_INTERLEAVED = 10
MIN_PARALLEL = 10
MIN_UNTYPED = 5
MIN_NESTED_AFTER_SIBLING = 10
MAX_DEPTH = 3
FALLBACK_TYPE = "general-purpose"
MAIN = "main"
ATTEMPTS_PER_TRACE = 400

ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
TYPE_WORDS = ("auditor", "scout", "planner", "fixer", "checker", "mapper", "reader", "tracer", "linter",
              "porter", "builder", "triager", "profiler", "verifier", "indexer", "drafter")
LEAF_TOOLS = ("Read", "Grep", "Glob", "Bash", "Edit", "Write")
MODEL = "claude-opus-5-5"


class GeneratorError(Exception):
    """The generator could not meet the per-run minimums; reported as a platform error, never as a verdict."""


@dataclass(frozen=True)
class Features:
    depth: int
    interleaved: bool
    parallel: bool
    untyped: bool
    nested_after_sibling: bool


@dataclass
class Trace:
    events: list[dict[str, object]]
    expected: dict[str, str]
    features: Features
    # The path of the agent whose subtree an untyped call started, for the T2 feedback line.
    untyped_paths: set[str] = field(default_factory=set)
    # tool_use id -> depth of the agent that made it.
    depth_of: dict[str, int] = field(default_factory=dict)


def random_id(prefix: str, length: int = 24) -> str:
    return prefix + "".join(secrets.choice(ID_ALPHABET) for _ in range(length))


def random_type() -> str:
    return f"{secrets.choice(TYPE_WORDS)}-{secrets.token_hex(2)}"


def _chance(numerator: int, denominator: int) -> bool:
    return secrets.randbelow(denominator) < numerator


# ---------------------------------------------------------------------------------------------------------
# Line shapes (documented stream-json fields only)
# ---------------------------------------------------------------------------------------------------------

def assistant_line(session: str, parent: str | None, message_id: str, block: dict[str, object]) -> dict[str, object]:
    return {"type": "assistant", "message": {"id": message_id, "type": "message", "role": "assistant",
                                             "model": MODEL, "content": [block]},
            "parent_tool_use_id": parent, "session_id": session, "uuid": _uuid()}


def user_line(session: str, parent: str | None, block: dict[str, object]) -> dict[str, object]:
    return {"type": "user", "message": {"role": "user", "content": [block]}, "parent_tool_use_id": parent,
            "session_id": session, "uuid": _uuid()}


def _uuid() -> str:
    raw = secrets.token_hex(16)
    return f"{raw[:8]}-{raw[8:12]}-4{raw[13:16]}-a{raw[17:20]}-{raw[20:]}"


def init_line(session: str) -> dict[str, object]:
    return {"type": "system", "subtype": "init", "session_id": session, "cwd": "/home/dev/project",
            "model": MODEL, "permissionMode": "acceptEdits",
            "tools": ["Task", "Bash", "Glob", "Grep", "Read", "Edit", "Write"], "mcp_servers": [],
            "uuid": _uuid()}


def result_line(session: str, turns: int) -> dict[str, object]:
    return {"type": "result", "subtype": "success", "is_error": False, "result": "Done.", "num_turns": turns,
            "stop_reason": "end_turn", "session_id": session, "uuid": _uuid(), "duration_ms": 60_000,
            "duration_api_ms": 50_000, "total_cost_usd": 0.42, "permission_denials": [],
            "usage": {"input_tokens": 0, "output_tokens": 0}, "modelUsage": {}}


def leaf_input(tool: str) -> dict[str, object]:
    path = f"/home/dev/project/src/{secrets.choice(TYPE_WORDS)}_{secrets.token_hex(2)}.py"
    if tool == "Read":
        return {"file_path": path}
    if tool == "Grep":
        return {"pattern": secrets.choice(("TODO", "def total", "import os", "timeout")), "path": "src"}
    if tool == "Glob":
        return {"pattern": "src/**/*.py"}
    if tool == "Bash":
        return {"command": "python3 -m unittest discover -s tests -t .", "description": "Run the tests"}
    if tool == "Edit":
        return {"file_path": path, "old_string": "x = 1", "new_string": "x = 2"}
    return {"file_path": path, "content": "draft\n"}


# ---------------------------------------------------------------------------------------------------------
# The simulated run
# ---------------------------------------------------------------------------------------------------------

@dataclass
class Agent:
    path: str
    call_id: str | None  # the Agent tool_use id that started it; None for main
    depth: int
    actions: list[tuple[str, object]]
    parent: Agent | None = None
    waiting_for: set[str] = field(default_factory=set)
    pending_result: dict[str, object] | None = None
    finished: bool = False
    lines: list[int] = field(default_factory=list)
    spawn_line: int = -1
    started: bool = False


@dataclass(frozen=True)
class Shape:
    """What one trace must contain; the scheduler adds the rest at random."""

    depth: int
    parallel: bool
    untyped: bool


def _plan_actions(depth: int, shape: Shape, must_spawn: bool, untyped_budget: list[int]) -> list[tuple[str, object]]:
    """A script for an agent at `depth`: leaf actions, plus at most two spawn groups."""
    actions: list[tuple[str, object]] = []
    for _ in range(1 + secrets.randbelow(3)):
        actions.append(("text", None) if _chance(1, 2) else ("thinking", None))
        actions.append(("tool", secrets.choice(LEAF_TOOLS)))
    can_spawn = depth < shape.depth
    groups = 0
    if can_spawn and (must_spawn or _chance(1, 2)):
        groups = 1 + (1 if _chance(1, 4) else 0)
    for _ in range(groups):
        width = 2 + secrets.randbelow(2) if (shape.parallel and (_chance(2, 3) or must_spawn)) else 1
        children = []
        shared_type = random_type()
        for index in range(width):
            untyped = False
            if untyped_budget[0] > 0 and _chance(1, 2):
                untyped = True
                untyped_budget[0] -= 1
            # Two instances of the same type under one parent share a path (T1); draw that sometimes.
            child_type = shared_type if (index > 0 and _chance(1, 4)) else random_type()
            children.append((None if untyped else child_type, index == 0 and must_spawn))
        actions.insert(secrets.randbelow(len(actions) + 1), ("spawn", children))
    actions.append(("text", None))
    return actions


def build_trace(shape: Shape) -> Trace:
    session = _uuid()
    events: list[dict[str, object]] = [init_line(session)]
    expected: dict[str, str] = {}
    depth_of: dict[str, int] = {}
    untyped_paths: set[str] = set()
    untyped_budget = [1 + secrets.randbelow(2) if shape.untyped else 0]
    main = Agent(MAIN, None, 0, _plan_actions(0, shape, True, untyped_budget))
    agents = [main]
    runnable = [main]
    turns = 0
    while runnable:
        agent = secrets.choice(runnable)
        line_index = len(events)
        if agent.parent is not None and not agent.started:
            # A foreground subagent's first message in the stream is a user message with its prompt.
            agent.started = True
            events.append(user_line(session, agent.call_id, {"type": "text", "text": "Do the step."}))
            agent.lines.append(line_index)
            continue
        if agent.pending_result is not None:
            # A leaf tool's result goes back to the agent that called it.
            events.append(user_line(session, agent.call_id, agent.pending_result))
            agent.pending_result = None
            agent.lines.append(line_index)
            continue
        if not agent.actions:
            agent.finished = True
            runnable.remove(agent)
            if agent.parent is not None:
                parent = agent.parent
                report = {"type": "tool_result", "tool_use_id": agent.call_id,
                          "content": [{"type": "text", "text": f"Report from {agent.path.rsplit('/', 1)[-1]}."}]}
                events.append(user_line(session, parent.call_id, report))
                parent.lines.append(line_index)
                parent.waiting_for.discard(str(agent.call_id))
                if not parent.waiting_for:
                    runnable.append(parent)
            continue
        kind, payload = agent.actions.pop(0)
        message_id = random_id("msg_01")
        turns += 1
        if kind == "text":
            block: dict[str, object] = {"type": "text", "text": "Working on it."}
            events.append(assistant_line(session, agent.call_id, message_id, block))
            agent.lines.append(line_index)
        elif kind == "thinking":
            block = {"type": "thinking", "thinking": "Next step.", "signature": secrets.token_urlsafe(24)}
            events.append(assistant_line(session, agent.call_id, message_id, block))
            agent.lines.append(line_index)
        elif kind == "tool":
            tool_id = random_id("toolu_01")
            events.append(assistant_line(session, agent.call_id, message_id,
                                         {"type": "tool_use", "id": tool_id, "name": str(payload),
                                          "input": leaf_input(str(payload))}))
            agent.lines.append(line_index)
            expected[tool_id] = agent.path
            depth_of[tool_id] = agent.depth
            agent.pending_result = {"type": "tool_result", "tool_use_id": tool_id, "content": "ok"}
        else:
            children_spec = payload
            assert isinstance(children_spec, list)
            # Parallel Agent blocks from one assistant turn share the message id (one block per line).
            for child_type, must_spawn in children_spec:
                call_id = random_id("toolu_01")
                tool_input: dict[str, object] = {"description": "Delegated step", "prompt": "Do the step."}
                if child_type is not None:
                    tool_input["subagent_type"] = child_type
                events.append(assistant_line(session, agent.call_id, message_id,
                                             {"type": "tool_use", "id": call_id, "name": "Agent",
                                              "input": tool_input}))
                agent.lines.append(len(events) - 1)
                expected[call_id] = agent.path
                depth_of[call_id] = agent.depth
                child_path = f"{agent.path}/{child_type if child_type is not None else FALLBACK_TYPE}"
                if child_type is None:
                    untyped_paths.add(child_path)
                child = Agent(child_path, call_id, agent.depth + 1,
                              _plan_actions(agent.depth + 1, shape, must_spawn and agent.depth + 1 < shape.depth,
                                            untyped_budget), parent=agent, spawn_line=len(events) - 1)
                agents.append(child)
                agent.waiting_for.add(call_id)
                runnable.append(child)
            runnable.remove(agent)
    events.append(result_line(session, turns))
    return Trace(events, expected, measure(agents, events), untyped_paths, depth_of)


def measure(agents: list[Agent], events: list[dict[str, object]]) -> Features:
    depth = max(agent.depth for agent in agents)
    by_parent: dict[str, list[Agent]] = {}
    for agent in agents:
        if agent.parent is not None:
            by_parent.setdefault(agent.parent.path + "#" + str(agent.parent.call_id), []).append(agent)
    interleaved = False
    nested_after_sibling = False
    for siblings in by_parent.values():
        for first in siblings:
            for second in siblings:
                if first is second or not first.lines or not second.lines:
                    continue
                # Interleaved: a line of `second` falls between two lines of `first`.
                if any(first.lines[0] < line < first.lines[-1] for line in second.lines):
                    interleaved = True
                # Nested after a sibling: a nested agent's line comes after a line of a sibling started
                # after it, so "the last Agent started" names the sibling.
                if (first.depth >= 2 and second.spawn_line > first.spawn_line
                        and any(line > min(second.lines) for line in first.lines)):
                    nested_after_sibling = True
    parallel = False
    for previous, current in zip(events, events[1:]):
        if (previous.get("type") == "assistant" and current.get("type") == "assistant"
                and _agent_block(previous) and _agent_block(current)
                and _message_id(previous) == _message_id(current)):
            parallel = True
    untyped = any(_agent_block(event) and "subagent_type" not in _block_input(event) for event in events)
    return Features(depth, interleaved, parallel, untyped, nested_after_sibling)


def _block(event: dict[str, object]) -> dict[str, object]:
    message = event.get("message")
    if not isinstance(message, dict):
        return {}
    content = message.get("content")
    if not isinstance(content, list) or not content or not isinstance(content[0], dict):
        return {}
    return content[0]


def _agent_block(event: dict[str, object]) -> bool:
    block = _block(event)
    return block.get("type") == "tool_use" and block.get("name") == "Agent"


def _block_input(event: dict[str, object]) -> dict[str, object]:
    value = _block(event).get("input")
    return value if isinstance(value, dict) else {}


def _message_id(event: dict[str, object]) -> object:
    message = event.get("message")
    return message.get("id") if isinstance(message, dict) else None


# ---------------------------------------------------------------------------------------------------------
# One graded run: 50 traces with the per-run minimums
# ---------------------------------------------------------------------------------------------------------

@dataclass(frozen=True)
class Requirement:
    shape: Shape
    exact_depth: int
    interleaved: bool
    nested_after_sibling: bool


def _requirements() -> list[Requirement]:
    """Slots that force the minimums; the rest are drawn freely. The order is shuffled afterwards."""
    slots: list[Requirement] = []
    for _ in range(MIN_DEPTH_THREE):
        slots.append(Requirement(Shape(3, True, False), 3, True, True))
    for _ in range(MIN_DEPTH_TWO_OR_MORE):
        slots.append(Requirement(Shape(2, True, False), 2, True, False))
    for _ in range(MIN_UNTYPED):
        slots.append(Requirement(Shape(1 + secrets.randbelow(MAX_DEPTH), _chance(1, 2), True), 0, False, False))
    while len(slots) < TRACE_COUNT:
        depth = 1 + secrets.randbelow(MAX_DEPTH)
        slots.append(Requirement(Shape(depth, _chance(1, 2), _chance(1, 3)), 0, False, False))
    order = list(range(len(slots)))
    shuffled: list[Requirement] = []
    while order:
        shuffled.append(slots[order.pop(secrets.randbelow(len(order)))])
    return shuffled


def _meets(trace: Trace, requirement: Requirement) -> bool:
    features = trace.features
    if requirement.exact_depth and features.depth != requirement.exact_depth:
        return False
    if requirement.shape.parallel and requirement.exact_depth and not features.parallel:
        return False
    if requirement.shape.untyped and not features.untyped:
        return False
    if requirement.interleaved and not features.interleaved:
        return False
    return not (requirement.nested_after_sibling and not features.nested_after_sibling)


def draw_run() -> list[Trace]:
    traces: list[Trace] = []
    for requirement in _requirements():
        for _ in range(ATTEMPTS_PER_TRACE):
            trace = build_trace(requirement.shape)
            if _meets(trace, requirement):
                traces.append(trace)
                break
        else:
            raise GeneratorError(f"no trace met {requirement} in {ATTEMPTS_PER_TRACE} attempts")
    counts = run_counts(traces)
    minimums = {"depth>=2": MIN_DEPTH_TWO_OR_MORE, "depth3": MIN_DEPTH_THREE, "interleaved": MIN_INTERLEAVED,
                "parallel": MIN_PARALLEL, "untyped": MIN_UNTYPED, "nestedAfterSibling": MIN_NESTED_AFTER_SIBLING}
    short = [name for name, minimum in minimums.items() if counts[name] < minimum]
    if short:
        raise GeneratorError(f"per-run minimums not met: {short} in {counts}")
    return traces


def run_counts(traces: list[Trace]) -> dict[str, int]:
    return {
        "depth>=2": sum(trace.features.depth >= 2 for trace in traces),
        "depth3": sum(trace.features.depth == 3 for trace in traces),
        "interleaved": sum(trace.features.interleaved for trace in traces),
        "parallel": sum(trace.features.parallel for trace in traces),
        "untyped": sum(trace.features.untyped for trace in traces),
        "nestedAfterSibling": sum(trace.features.nested_after_sibling for trace in traces),
    }
