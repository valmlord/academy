"""Demonstration of the L6 checks (design #43 revision 6, section 11): honest corpus first, then attacks.

Usage: python3 -I checks/reference/demo_l6.py [runs]     (runs per randomised line, default 20)

1. walk_table.py over the record (every planted line keyed, every other line "none").
2. trace-hunt: a replica of the bug-hunt matching (file + category + line in range; one report per item;
   decoy hits in any category) on the reference findings, honest variants and attacks.
3. Guess rates recomputed by brute force from bugs.yaml.
4. trace-attribution: starter (fail), reference and honest variants (pass every run), attacks (fail every run,
   with the requirement id named).
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from fractions import Fraction
from itertools import product
from math import comb
from pathlib import Path

LESSON = Path(__file__).resolve().parents[2]
CHECKS = LESSON / "checks"
STARTER = LESSON / "starter"
TRACE = "trace/review-run.ndjson"

# ---------------------------------------------------------------------------------------------------------
# bugs.yaml (the subset of YAML this file uses) and the bug-hunt replica
# ---------------------------------------------------------------------------------------------------------


def load_key() -> dict[str, object]:
    key: dict[str, object] = {"bugs": [], "decoys": []}
    section = None
    item: dict[str, object] | None = None
    for raw in (CHECKS / "bugs.yaml").read_text(encoding="utf-8").splitlines():
        if raw.startswith("#") or not raw.strip():
            continue
        if raw in ("bugs:", "decoys:"):
            section = raw[:-1]
            continue
        match = re.match(r"^(\s*)(- )?(\w+): (.*)$", raw)
        assert match, raw
        _, dash, name, value = match.groups()
        parsed: object = value
        if value.startswith(("[[", '"')) or value.isdigit():
            parsed = json.loads(value)
        elif value.startswith("["):
            parsed = [part.strip() for part in value.strip("[]").split(",")]
        if section is None:
            key[name] = parsed
            continue
        if dash:
            item = {}
            key[section].append(item)  # type: ignore[union-attr]
        assert item is not None
        item[name] = parsed
    return key


def grade_hunt(key: dict[str, object], findings: list[dict[str, object]], min_found: int = 6) -> tuple[bool, str]:
    if len(findings) > int(key["maxReports"]):
        return False, f"{len(findings)} reports > maxReports"
    found: set[str] = set()
    decoy_hits = 0
    for report in findings:
        for bug in key["bugs"]:  # type: ignore[union-attr]
            low, high = bug["lines"][0]
            if (bug["id"] not in found and report["file"] == bug["file"] and report["category"] == bug["category"]
                    and low <= report["line"] <= high):
                found.add(bug["id"])
                break
        for decoy in key["decoys"]:  # type: ignore[union-attr]
            low, high = decoy["lines"][0]
            if report["file"] == decoy["file"] and low <= report["line"] <= high:
                decoy_hits += 1
    ok = len(found) >= min_found and decoy_hits <= int(key["maxDecoyHits"])
    return ok, f"found {len(found)}, decoy hits {decoy_hits}, reports {len(findings)}"


def report(line: int, category: str) -> dict[str, object]:
    return {"file": TRACE, "line": line, "category": category, "why": "demo"}


def hunt_demo(key: dict[str, object]) -> list[str]:
    failures = []
    bugs, decoys = key["bugs"], key["decoys"]
    reference = json.loads((CHECKS / "reference/findings.json").read_text(encoding="utf-8"))
    planted = [report(b["lines"][0][0], b["category"]) for b in bugs]  # type: ignore[union-attr]
    by_id = {b["id"]: b for b in bugs}  # type: ignore[union-attr]
    first_decoy = decoys[0]["lines"][0][0]  # type: ignore[index]
    honest = {
        "reference findings.json": reference,
        "6 of 8 planted, nothing else": planted[:6],
        "8 planted + 1 hedge on a decoy (maxDecoyHits 1)": planted + [report(first_decoy, "role-breach")],
        "6 planted + 3 reports on neutral lines": planted[:6] + [report(1, "role-breach"), report(2, "context-leak"),
                                                                  report(3, "ignored-failure")],
    }
    must_fail = {
        "starter findings.json ([])": [],
        "5 of 8 planted": planted[:5],
        "8 planted, RB1 and UP1 swapped categories (tree not used)":
            [r for r in planted if r["line"] not in (by_id["rb1"]["lines"][0][0], by_id["up1"]["lines"][0][0])]
            [:4] + [report(by_id["rb1"]["lines"][0][0], "unverified-pass"),
                    report(by_id["up1"]["lines"][0][0], "role-breach")],
        "6 planted + 2 decoy hedges": planted[:6] + [report(d["lines"][0][0], "role-breach") for d in decoys[:2]],
        "10 reports (over maxReports 9)": planted + [report(1, "role-breach"), report(2, "role-breach")],
    }
    # "Flag every write or exec tool_use with a non-null parent" (design 5.L6).
    flagged = []
    for number, line in enumerate((STARTER / TRACE).read_text(encoding="utf-8").splitlines(), start=1):
        event = json.loads(line)
        block = (event.get("message") or {}).get("content", [{}])[0] if event.get("message") else {}
        if (block.get("type") == "tool_use" and block.get("name") in ("Edit", "Write", "Bash")
                and event.get("parent_tool_use_id") is not None):
            flagged.append(report(number, "role-breach"))
    must_fail["flag every write/exec tool_use with a non-null parent"] = flagged
    for name, findings in honest.items():
        ok, detail = grade_hunt(key, findings)
        print(f"  honest  {'PASS' if ok else 'FAIL'}  {name}: {detail}")
        if not ok:
            failures.append(f"hunt honest line failed: {name}")
    for name, findings in must_fail.items():
        ok, detail = grade_hunt(key, findings)
        print(f"  attack  {'PASS' if ok else 'FAIL'}  {name}: {detail}")
        if ok:
            failures.append(f"hunt attack passed: {name}")
    return failures


# ---------------------------------------------------------------------------------------------------------
# Guess rates by brute force
# ---------------------------------------------------------------------------------------------------------

def families(key: dict[str, object]) -> dict[str, tuple[int, int]]:
    out: dict[str, list[int]] = {}
    for bug in key["bugs"]:  # type: ignore[union-attr]
        out.setdefault(bug["category"], [0, 0])[0] += 1
        out[bug["category"]][1] += 1
    for decoy in key["decoys"]:  # type: ignore[union-attr]
        out.setdefault(decoy["lookalike"], [0, 0])[0] += 1
    return {category: (blocks, planted) for category, (blocks, planted) in out.items()}


def pick_distribution(blocks: int, planted: int, picks: int) -> dict[tuple[int, int], Fraction]:
    return {(hits, picks - hits): Fraction(comb(planted, hits) * comb(blocks - planted, picks - hits), comb(blocks, picks))
            for hits in range(0, min(planted, picks) + 1) if picks - hits <= blocks - planted}


def pass_probability(fams: dict[str, tuple[int, int]], picks: dict[str, int], sure: dict[str, int],
                     key: dict[str, object]) -> Fraction:
    """Sure items are reported exactly; the remaining picks are uniform within each family's unknown blocks."""
    total = {(sum(sure.values()), 0): Fraction(1)}
    for category, (blocks, planted) in fams.items():
        known = sure.get(category, 0)
        dist = pick_distribution(blocks - known, planted - known, picks.get(category, 0))
        merged: dict[tuple[int, int], Fraction] = {}
        for (hits, decoys), p in total.items():
            for (more_hits, more_decoys), q in dist.items():
                state = (hits + more_hits, decoys + more_decoys)
                merged[state] = merged.get(state, Fraction(0)) + p * q
        total = merged
    return sum((p for (hits, decoys), p in total.items() if hits >= 6 and decoys <= int(key["maxDecoyHits"])),
               Fraction(0))


def best(fams: dict[str, tuple[int, int]], sure: dict[str, int], key: dict[str, object]) -> list[tuple[Fraction, dict[str, int]]]:
    budget = int(key["maxReports"]) - sum(sure.values())
    names = list(fams)
    results = []
    for picks in product(*[range(0, fams[c][0] - sure.get(c, 0) + 1) for c in names]):
        if sum(picks) > budget:
            continue
        allocation = dict(zip(names, picks))
        results.append((pass_probability(fams, allocation, sure, key), allocation))
    results.sort(key=lambda item: item[0], reverse=True)
    return results


def rates_demo(key: dict[str, object]) -> None:
    fams = families(key)
    print(f"  families (blocks, planted): {fams}")
    for label, sure in (("per-category guesser", {}),
                        ("sure of RB x2, IF, UP", {"role-breach": 2, "ignored-failure": 1, "unverified-pass": 1}),
                        ("sure of CL x2, UC x2", {"context-leak": 2, "uncited-claim": 2}),
                        ("sure of RB x2, IF", {"role-breach": 2, "ignored-failure": 1})):
        ranking = best(fams, sure, key)
        p, allocation = ranking[0]
        within3 = 1 - (1 - p) ** 3
        extra = "" if sure else f"; next: {float(ranking[1][0]) * 100:.4f}%, {float(ranking[3][0]) * 100:.4f}%"
        print(f"  {label}: {float(p) * 100:.4f}% per attempt, {float(within3) * 100:.4f}% within 3, "
              f"extra picks {allocation}{extra}")


# ---------------------------------------------------------------------------------------------------------
# trace-attribution
# ---------------------------------------------------------------------------------------------------------

STUB = 'raise NotImplementedError("attribute() is not written yet")\n'
REFERENCE_BODY = (CHECKS / "reference/trace_tree.py").read_text(encoding="utf-8")

HONEST = {
    "parent map, then a recursive walk up": '''
def attribute(events):
    spawned = {}
    calls = []
    for event in events:
        message = event.get("message") or {}
        for block in message.get("content") or []:
            if block.get("type") == "tool_use":
                calls.append((block["id"], event.get("parent_tool_use_id")))
                if block.get("name") == "Agent":
                    spawned[block["id"]] = (event.get("parent_tool_use_id"),
                                            block.get("input", {}).get("subagent_type") or "general-purpose")

    def path(agent_call):
        if agent_call is None:
            return "main"
        parent, kind = spawned[agent_call]
        return path(parent) + "/" + kind

    return {call_id: path(parent) for call_id, parent in calls}
''',
    "iterative walk up, events reversed first (order-free)": '''
def attribute(events):
    spawned, calls = {}, []
    for event in reversed(events):
        if not isinstance(event.get("message"), dict):
            continue
        for block in event["message"].get("content", []):
            if isinstance(block, dict) and block.get("type") == "tool_use":
                calls.append((block["id"], event.get("parent_tool_use_id")))
                if block.get("name") in ("Agent", "Task"):
                    spawned[block["id"]] = (event.get("parent_tool_use_id"),
                                            (block.get("input") or {}).get("subagent_type", "general-purpose"))
    result = {}
    for call_id, parent in calls:
        parts = []
        while parent is not None:
            parent, kind = spawned[parent]
            parts.append(kind)
        result[call_id] = "/".join(["main", *reversed(parts)])
    return result
''',
    "single pass with a project json.py next to it (stdlib shadow is harmless)": None,
}

ATTACKS = {
    "order-based: the last Agent started owns the call": ('''
def attribute(events):
    owner, paths, result = "main", {}, {}
    for event in events:
        for block in (event.get("message") or {}).get("content") or []:
            if block.get("type") != "tool_use":
                continue
            if event.get("parent_tool_use_id") is None:
                result[block["id"]] = "main"
            else:
                result[block["id"]] = owner
            if block.get("name") == "Agent":
                caller = result[block["id"]]
                owner = caller + "/" + (block["input"].get("subagent_type") or "general-purpose")
    return result
''', "T1"),
    "depth 1 only: main/<type of the immediate parent>": ('''
def attribute(events):
    kinds, result = {}, {}
    for event in events:
        parent = event.get("parent_tool_use_id")
        for block in (event.get("message") or {}).get("content") or []:
            if block.get("type") != "tool_use":
                continue
            result[block["id"]] = "main" if parent is None else "main/" + kinds[parent]
            if block.get("name") == "Agent":
                kinds[block["id"]] = block["input"].get("subagent_type") or "general-purpose"
    return result
''', "T1"),
    "untyped Agent call left as None": (REFERENCE_BODY.replace(
        'agent_paths[call_id] = f"{caller}/{subagent_type or FALLBACK_SUBAGENT_TYPE}"',
        'agent_paths[call_id] = f"{caller}/{subagent_type}"'), "T2"),
    "instances numbered (#1, #2) instead of sharing a path": ('''
def attribute(events):
    paths, counts, result = {None: "main"}, {}, {}
    for event in events:
        caller = paths[event.get("parent_tool_use_id")]
        for block in (event.get("message") or {}).get("content") or []:
            if block.get("type") != "tool_use":
                continue
            result[block["id"]] = caller
            if block.get("name") == "Agent":
                kind = block["input"].get("subagent_type") or "general-purpose"
                counts[(caller, kind)] = counts.get((caller, kind), 0) + 1
                paths[block["id"]] = f"{caller}/{kind}#{counts[(caller, kind)]}"
    return result
''', "T1"),
    "only Task counts as a subagent call": (REFERENCE_BODY.replace('block.get("name") == "Agent"',
                                                                    'block.get("name") == "Task"'), "T1"),
    "Agent call ids left out (only leaf tools mapped)": (REFERENCE_BODY.replace(
        "            owners[call_id] = caller\n",
        "            if block.get(\"name\") != \"Agent\":\n                owners[call_id] = caller\n"), "T1"),
    "everything is main": ('''
def attribute(events):
    return {b["id"]: "main" for e in events for b in (e.get("message") or {}).get("content") or []
            if b.get("type") == "tool_use"}
''', "T1"),
    "hardcoded map of the visible record": (None, "T1"),
    "os._exit(0) inside attribute": ('''
import os
def attribute(events):
    os._exit(0)
''', "T1"),
}


def module_text(body: str) -> str:
    text = (STARTER / "trace/trace_tree.py").read_text(encoding="utf-8")
    assert STUB in text
    if body.lstrip().startswith(("def attribute", "import")):
        start = text.index("def attribute(")
        end = text.index("def tool_rows(")
        return text[:start] + body.strip() + "\n\n\n" + text[end:]
    return body


def visible_map() -> str:
    sys.path.insert(0, str(CHECKS / "reference"))
    import trace_tree as reference  # noqa: PLC0415

    events = reference.load_events(STARTER / TRACE)
    owners = reference.attribute(events)
    return f"def attribute(events):\n    return {json.dumps(owners)}\n"


def run_check(workspace: Path) -> tuple[int, str]:
    process = subprocess.run([sys.executable, "-I", "-B", str(CHECKS / "verify_trace_attribution.py")], cwd=workspace,
                             capture_output=True, text=True, timeout=120, check=False)
    return process.returncode, process.stdout.strip()


def workspace_with(root: Path, name: str, module: str | None, extra: dict[str, str] | None = None) -> Path:
    workspace = root / re.sub(r"\W+", "-", name)[:40]
    shutil.copytree(STARTER, workspace)
    if module is not None:
        (workspace / "trace/trace_tree.py").write_text(module, encoding="utf-8")
    for relative, text in (extra or {}).items():
        (workspace / relative).parent.mkdir(parents=True, exist_ok=True)
        (workspace / relative).write_text(text, encoding="utf-8")
    return workspace


def attribution_demo(runs: int) -> list[str]:
    failures = []
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        code, output = run_check(workspace_with(root, "starter", None))
        print(f"  starter: exit {code}: {output}")
        if code == 0:
            failures.append("trace-attribution passed on the starter")
        honest = {"reference": (REFERENCE_BODY, None)}
        for name, body in HONEST.items():
            if body is None:
                honest[name] = (REFERENCE_BODY, {"trace/json.py": "raise SystemExit('shadow json imported')\n",
                                                 "usercustomize.py": "import sys; sys.exit(0)\n"})
            else:
                honest[name] = (module_text(body), None)
        for name, (module, extra) in honest.items():
            workspace = workspace_with(root, name, module, extra)
            passes = 0
            last = ""
            for _ in range(runs):
                code, last = run_check(workspace)
                passes += code == 0
            print(f"  honest  {passes}/{runs}  {name}  ({last.splitlines()[-1] if last else ''})")
            if passes != runs:
                failures.append(f"honest line failed: {name}: {last}")
        for name, (body, requirement) in ATTACKS.items():
            module = module_text(visible_map() if body is None else body)
            workspace = workspace_with(root, name, module)
            passes = 0
            named = 0
            last = ""
            for _ in range(runs):
                code, last = run_check(workspace)
                passes += code == 0
                named += f"не выполнено: {requirement}:" in last
            print(f"  attack  {passes}/{runs} passed, {requirement} named {named}/{runs}  {name}")
            print(f"          {last.splitlines()[0] if last else ''}")
            if passes or named != runs:
                failures.append(f"attack not caught as {requirement}: {name}: {last}")
    return failures


WALKER_MUTATIONS = {
    "summarizer drops the attribution of the tests status (D-UP2 must flip)":
        ("Tests: all pass (reported by the tests reviewer). Security", "Tests: all pass. Security"),
    "coder's test runs renamed to a non-test command (a verdict must flip)":
        ('"command": "python3 -m unittest discover -s tests -t .", "description": "Run the test suite"',
         '"command": "make lint", "description": "Run the test suite"'),
    "the security finding gets its quote back (UC1 must flip)":
        ('\\"claim\\": \\"tax_cents passes', '\\"quote\\": \\"raw = Decimal\\", \\"claim\\": \\"tax_cents passes'),
}


def walker_mutations() -> list[str]:
    """The walk script itself must be able to fail: one-edit mutations of the record must change a verdict."""
    failures = []
    with tempfile.TemporaryDirectory() as directory:
        for name, (old, new) in WALKER_MUTATIONS.items():
            workspace = Path(directory) / re.sub(r"\W+", "-", name)[:40]
            shutil.copytree(STARTER, workspace)
            text = (workspace / TRACE).read_text(encoding="utf-8")
            if old not in text:
                failures.append(f"walker mutation target missing: {name}")
                continue
            (workspace / TRACE).write_text(text.replace(old, new), encoding="utf-8")
            walk = subprocess.run([sys.executable, "-I", "-B", str(CHECKS / "reference/walk_table.py"), str(workspace)],
                                  capture_output=True, text=True, check=False)
            problems = [line for line in walk.stdout.splitlines() if line.startswith("PROBLEM")]
            print(f"  walker mutation: exit {walk.returncode}, {problems[:1]}  ({name})")
            if walk.returncode == 0:
                failures.append(f"walker did not notice: {name}")
    return failures


def main() -> int:
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    failures: list[str] = []
    print("1. walk table")
    walk = subprocess.run([sys.executable, "-I", "-B", str(CHECKS / "reference/walk_table.py")], capture_output=True,
                          text=True, check=False)
    print("  " + walk.stdout.strip().splitlines()[-1])
    if walk.returncode != 0:
        failures.append("walk_table.py failed")
    failures += walker_mutations()
    key = load_key()
    print("2. trace-hunt")
    failures += hunt_demo(key)
    print("3. guess rates")
    rates_demo(key)
    print(f"4. trace-attribution ({runs} runs per line)")
    failures += attribution_demo(runs)
    for line in failures:
        print(f"DEMO FAILURE: {line}")
    print("demo: all lines behaved as expected" if not failures else f"demo: {len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    os.environ.pop("PYTHONPATH", None)
    sys.exit(main())
