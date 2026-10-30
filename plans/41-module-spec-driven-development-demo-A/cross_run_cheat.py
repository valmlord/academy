"""Demo: student run A cheat 12 (cross-run memory of acceptance inputs), replayed against the fixed graders.

usage: cross_run_cheat.py <lesson dir> <loot: tmp|workspace> <scratch dir> [control]

`control` patches the grader mount so that every run draws the SAME single case per requirement (a
fixed seed instead of `secrets`, 1 case instead of 30/60): fixed inputs, as before the fix, plus one.
The guard watched going red: the attack must then pass, as it did before the fix. (With a fixed seed
and the full 30/60 cases it does not finish within the cap either, because `check_drawn` stops at the
first wrong case and so reveals about one new input per requirement per submission.)

Protocol of the student record (plans/41-...-student-A.md, cheat 12), automated:
  round k: implementation = lookup table input -> majority output recorded so far, logging every unknown
           input to the loot and returning 0 / [] for it; tests = read the logged inputs, call the seam on
           each, append the output vector to loot/runs.jsonl (the majority over the 18/20 (B) runs is the
           reference), plus labelled no-op tests so stage 0 passes.
  The loop stops when (A) reports nothing or after 10 counted failures (the cap).
  final:   table-only implementation, snapshot tests of the majority vector (the student's last step).
Loot lives in a hard-coded absolute path outside the workspace ("tmp") or inside the workspace
("workspace"). The workspace is persistent across submissions, as the learner's is.
"""

import collections
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "attacks" / "cross_run"))
from codec import CODEC  # noqa: E402  # the student's serializer for dataclass inputs

CAP = 10


def majority(loot: Path) -> list[list[object]]:
    """Per input, the output most runs saw: 6 of every 18 (20) runs are the reference, the mutants
    disagree with each other, so per-input majority recovers the reference on every recorded input."""
    runs_file = loot / "runs.jsonl"
    if not runs_file.exists():
        return []
    votes: dict[str, collections.Counter[str]] = {}
    for line in runs_file.read_text().splitlines():
        if not line.strip():
            continue
        for args, out in json.loads(line):
            votes.setdefault(json.dumps(args), collections.Counter())[json.dumps(out)] += 1
    return [[json.loads(key), json.loads(counter.most_common(1)[0][0])] for key, counter in votes.items()]


def forge_late_fee(ws: Path, loot: Path, final: bool) -> None:
    table = {json.dumps(args): out for args, out in majority(loot)}
    log = "" if final else f'''
        with open("{loot}/acc_inputs.jsonl", "a") as handle:
            handle.write(key + "\\n")'''
    (ws / "src/invoices/late_fee.py").write_text(f'''import json

TABLE = {table!r}


def late_fee(amount_cents, days_late):
    key = json.dumps([amount_cents, days_late])
    out = TABLE.get(key)
    if out is None:{log}
        return 0
    if out[0] == "ok":
        return out[1]
    raise ValueError(out[1])
''')
    if final:
        expected = majority(loot)
        body = "".join(f'''
    def test_snapshot_{part}(self):
        for args, out in EXPECTED[{part}::3]:
            self.assertEqual(probe(args), out)
''' for part in range(3))
        (ws / "tests/test_late_fee.py").write_text(f'''import unittest

from invoices.late_fee import late_fee

EXPECTED = {expected!r}


def probe(args):
    try:
        return ["ok", late_fee(*args)]
    except Exception as error:
        return [type(error).__name__, str(error)]


class Snapshot(unittest.TestCase):{body}''')
        return
    (ws / "tests/test_late_fee.py").write_text(f'''import json
import os
import unittest

from invoices.late_fee import late_fee

LOOT = "{loot}"


class Record(unittest.TestCase):
    def test_record(self):
        path = os.path.join(LOOT, "acc_inputs.jsonl")
        inputs = [json.loads(line) for line in open(path)] if os.path.exists(path) else []
        vector = []
        for args in inputs:
            try:
                out = ["ok", late_fee(*args)]
            except Exception as error:
                out = [type(error).__name__, str(error)]
            vector.append([args, out])
        with open(os.path.join(LOOT, "runs.jsonl"), "a") as handle:
            handle.write(json.dumps(vector) + "\\n")

    def test_b(self):
        pass

    def test_c(self):
        pass
''')


def forge_reminders(ws: Path, loot: Path, final: bool, labels: list[int]) -> None:
    """forge5.py / forge7.py of the student, parametrised by the requirement labels."""
    expected = majority(loot)
    table = {json.dumps(args): out for args, out in expected}
    log = "" if final else f'''
        with open("{loot}/acc_inputs.jsonl", "a") as handle:
            handle.write(key + "\\n")'''
    (ws / "src/invoices/reminders.py").write_text(f'''import json
{CODEC}
TABLE = {table!r}


def plan_reminders(invoices, sent_reminders, today):
    key = json.dumps([_enc(invoices), _enc(sent_reminders), _enc(today)])
    out = TABLE.get(key)
    if out is None:{log}
        return []
    if out[0] == "ok":
        return _dec(out[1])
    raise ValueError(out[1])
''')
    pairs = [(labels[i], labels[(i + 1) % len(labels)]) for i in range(0, len(labels), 2)]
    if final:
        body = "".join(f'''
    def test_req_{a:02d}_req_{b:02d}_snapshot(self):
        self.check()
''' for a, b in pairs)
        tests = f'''import json
import unittest

from invoices.reminders import plan_reminders
{CODEC}
EXPECTED = {expected!r}


class Snapshot(unittest.TestCase):
    def check(self):
        for args, out in EXPECTED:
            try:
                got = ["ok", _enc(plan_reminders(*_dec(["L", args])))]
            except Exception as error:
                got = [type(error).__name__, str(error)]
            self.assertEqual(json.loads(json.dumps(got)), out)
{body}'''
    else:
        body = "".join(f'''
    def test_req_{a:02d}_req_{b:02d}_noop(self):
        pass
''' for a, b in pairs[1:])
        a, b = pairs[0]
        tests = f'''import json
import os
import unittest

from invoices.reminders import plan_reminders
{CODEC}
LOOT = "{loot}"


class Record(unittest.TestCase):
    def test_req_{a:02d}_req_{b:02d}_record(self):
        path = os.path.join(LOOT, "acc_inputs.jsonl")
        inputs = [json.loads(line) for line in open(path)] if os.path.exists(path) else []
        vector = []
        for args in inputs:
            try:
                out = ["ok", _enc(plan_reminders(*_dec(["L", args])))]
            except Exception as error:
                out = [type(error).__name__, str(error)]
            vector.append([args, out])
        with open(os.path.join(LOOT, "runs.jsonl"), "a") as handle:
            handle.write(json.dumps(vector) + "\\n")
{body}'''
    (ws / "tests/test_reminders.py").write_text(tests)


def grade(lesson: Path, ws: Path, mount: Path, script: str, interpreter_dir: Path) -> tuple[int, str]:
    env = {"PATH": f"{interpreter_dir}:/usr/bin:/bin", "HOME": str(ws.parent / "home"),
           "ACADEMY_CHECKS_DIR": str(mount)}
    done = subprocess.run(["python3", "-I", str(mount / script)], cwd=ws, env=env, capture_output=True, text=True)
    return done.returncode, done.stdout + done.stderr


def main() -> int:
    lesson = Path(sys.argv[1]).resolve()
    variant = sys.argv[2]
    scratch = Path(sys.argv[3]).resolve() / f"{lesson.name}-{variant}-{'-'.join(sys.argv[4:])}"
    shutil.rmtree(scratch, ignore_errors=True)
    mount = scratch / "mount"
    shutil.copytree(lesson / "checks", mount, ignore=shutil.ignore_patterns("reference", "__pycache__"))
    shutil.rmtree(mount / "data" / "reserve", ignore_errors=True)
    control = len(sys.argv) > 4 and sys.argv[4] == "control"
    if control:
        accept = mount / "sdd_accept.py"
        text = accept.read_text()
        assert "drawn = draw(secrets.SystemRandom())" in text
        text = text.replace("drawn = draw(secrets.SystemRandom())", "import random; drawn = draw(random.Random(41))")
        text = text.replace("CASES_PER_REQUIREMENT = 30", "CASES_PER_REQUIREMENT = 1")
        accept.write_text(text.replace("LATE_FEE_CASES_PER_REQUIREMENT = 60", "LATE_FEE_CASES_PER_REQUIREMENT = 1"))
    ws = scratch / "ws"
    shutil.copytree(lesson / "starter", ws)
    shutil.copytree(lesson / "checks" / "reference", ws, dirs_exist_ok=True)
    (scratch / "home").mkdir()
    loot = (ws / ".loot") if variant == "workspace" else (scratch / "loot")
    loot.mkdir()
    interpreter_dir = Path(shutil.which("python3") or sys.executable).parent
    if lesson.name.startswith("01"):
        script = "verify_late_fee.py"
        forge = lambda final: forge_late_fee(ws, loot, final)  # noqa: E731
    else:
        script = "verify_reminders.py" if lesson.name.startswith("05") else "verify_change.py"
        labels = list(range(1, 9)) + ([9] if lesson.name.startswith("07") else [])
        forge = lambda final: forge_reminders(ws, loot, final, labels)  # noqa: E731
    counted = 0
    a_clean = False
    while counted < CAP:
        forge(False)
        code, out = grade(lesson, ws, mount, script, interpreter_dir)
        a_lines = [line for line in out.splitlines() if line.startswith("- (A)")]
        logged = len((loot / "acc_inputs.jsonl").read_text().splitlines()) if (loot / "acc_inputs.jsonl").exists() else 0
        print(f"round {counted + 1}: exit {code}; (A) problems {len(a_lines)}; logged inputs {logged}; "
              f"distinct table keys {len(majority(loot))}")
        if code == 3:
            print(out)
            return 2
        if code == 0:
            print("PASS during the loop")
            return 1
        counted += 1
        if not a_lines:
            a_clean = True
            break
    forge(True)
    if variant == "workspace":
        shutil.rmtree(loot)  # the student deleted the loot before the final submission
    code, out = grade(lesson, ws, mount, script, interpreter_dir)
    first = re.sub(r"\s+", " ", out.strip())[:300]
    print(f"final (table only, snapshot tests): exit {code}; (A) clean during loop: {a_clean}; counted failures "
          f"before final: {counted}")
    print(f"final output: {first}")
    return 0 if code != 0 else 1


if __name__ == "__main__":
    sys.exit(main())
