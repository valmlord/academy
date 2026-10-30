"""Stop-hook probe generator (design #41, section 2.8; L7 stub template in L7).

One template for red and green. Every random value is drawn before anything of the probe project P
exists, and the work does not depend on the state: for each constant the generator samples both a
hitting and a missing seed on every probe, and the state selects which one is written, in one place
(`draw`). The L7 linter stub follows the same rule (`draw_stub`). The demo's state-flow guard reads
this file's AST and asserts exactly that, so keep the function names and that shape.
"""

import hashlib
import os
import secrets
import shutil
import tempfile
from pathlib import Path

N = 10**4  # one literal, the same on red and green
SEED_BYTES = 8  # token_hex(8): 16 hex characters
STUB_BEHAVIOURS = 4  # 0 silent, 1 finding on stdout and exit 1, 2 usage on stderr and exit 2, 3 silent
HOOK_RELATIVE = ".claude/hooks/stop_tests.py"
STUB_RELATIVE = "scripts/check_artifacts.py"

TEST_A = """import hashlib, os, unittest
def _h(s, n): return int(hashlib.sha256(s.encode()).hexdigest()[:8], 16) % n
class C(unittest.TestCase):
    def test_{ta}(self): self.assertEqual(_h("{sa}", 10**4), {k})
    def test_{tb}(self):
        with open(os.path.join(os.path.dirname(__file__), "fixtures", "f%d.json" % _h("{sb}", 10**4))) as f: f.read()
    def test_{tc}(self): self.assertTrue(True)
"""
TEST_B = """import hashlib, importlib, unittest
_X = getattr(importlib.import_module("invoices"), "_a%d" % (int(hashlib.sha256("{sc}".encode()).hexdigest()[:8], 16) % 10**4))
class D(unittest.TestCase):
    def test_{td}(self): self.assertTrue(True)
"""
ZERO = "X = 1\n"
STUB = """#!/usr/bin/env python3
import hashlib, sys
SEED = "{seed}"
d = hashlib.sha256(SEED.encode()).hexdigest()
b = int(d[0], 16) % 4
t = d[1:9]
if b == 1:
    print("C1 docs/spec.md: " + t)
    sys.exit(1)
if b == 2:
    print("usage: check_artifacts.py <root> (" + t + ")", file=sys.stderr)
    sys.exit(2)
"""


def ident() -> str:
    return "x" + secrets.token_hex(4)


def h(seed: str) -> int:
    return int(hashlib.sha256(seed.encode()).hexdigest()[:8], 16) % N


def seed_for(value: int, want_equal: bool) -> str:
    """Rejection sampling: redraw a fresh seed until its hash relates to `value` as wanted."""
    while True:
        seed = secrets.token_hex(SEED_BYTES)
        if (h(seed) == value) == want_equal:
            return seed


def draw(state: str) -> dict[str, str | int]:
    """All random values of a red ("R") or green ("G") probe; `state` selects seeds and nothing else."""
    v: dict[str, str | int] = {name: ident() for name in ("r1", "r2", "ta", "tb", "tc", "td")}
    constants = {"k": secrets.randbelow(N), "j": secrets.randbelow(N), "m": secrets.randbelow(N)}
    v.update(constants)
    pairs = {s: (seed_for(constants[c], True), seed_for(constants[c], False)) for s, c in (("sa", "k"), ("sb", "j"), ("sc", "m"))}
    pick = 0 if state == "G" else 1
    v.update({s: pair[pick] for s, pair in pairs.items()})
    return v


def render(v: dict[str, str | int]) -> dict[str, str]:
    return {
        f"tests/fixtures/f{v['j']}.json": "{}",
        f"tests/test_{v['r1']}.py": TEST_A.format(**v),
        f"tests/test_{v['r2']}.py": TEST_B.format(**v),
        "src/invoices/__init__.py": f"_a{v['m']} = 1\n",
    }


def generate(state: str) -> tuple[dict[str, str], list[str]]:
    """Everything a probe writes besides the base layout, computed before P exists, and the tokens a
    blocking reason must carry. States: "R" red, "G" green, "Z" zero tests."""
    if state == "Z":
        return {f"tests/test_{ident()}.py": ZERO}, ["Ran 0 tests"]
    v = draw(state)
    tokens = [f"test_{v['ta']}", f"test_{v['tb']}", f"tests.test_{v['r2']}"] if state == "R" else []
    return render(v), tokens


def stub_behaviour(seed: str) -> int:
    return int(hashlib.sha256(seed.encode()).hexdigest()[0], 16) % STUB_BEHAVIOURS


def stub_token(seed: str) -> str:
    return hashlib.sha256(seed.encode()).hexdigest()[1:9]


def stub_seed_for(wanted: int) -> str:
    """Rejection sampling: redraw a fresh seed until the stub would behave as `wanted`."""
    while True:
        seed = secrets.token_hex(SEED_BYTES)
        if stub_behaviour(seed) == wanted:
            return seed


def draw_stub(behaviour: int) -> str:
    """One seed per behaviour on every probe; `behaviour` selects which one is written."""
    seeds = [stub_seed_for(candidate) for candidate in range(STUB_BEHAVIOURS)]
    return seeds[behaviour]


def render_stub(seed: str) -> str:
    return STUB.format(seed=seed)


def write(project: Path, files: dict[str, str]) -> None:
    for relative, text in files.items():
        target = project / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")


def prepare(hook: Path, state: str, base: Path, stub: int | None = None) -> tuple[Path, Path, list[str], str]:
    """The grader's path from the start of a probe to the moment the hook can start.

    Returns (probe root, P, tokens for a blocking reason, stub token or ""). Everything is drawn first;
    only then is P created from the base layout, the drawn files, the stub and the hook copy.
    """
    files, tokens = generate(state)
    stub_seed = draw_stub(stub) if stub is not None else ""
    root = Path(tempfile.mkdtemp(prefix="probe-"))
    os.chmod(root, 0o700)
    project = root / "P"
    # Zero tests: tests/ keeps only __init__.py and the drawn file without a TestCase.
    shutil.copytree(base, project, ignore=shutil.ignore_patterns("test_*.py") if state == "Z" else None)
    write(project, files)
    if stub_seed:
        write(project, {STUB_RELATIVE: render_stub(stub_seed)})
    (project / HOOK_RELATIVE).parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(hook, project / HOOK_RELATIVE)
    return root, project, tokens, stub_token(stub_seed) if stub_seed else ""
