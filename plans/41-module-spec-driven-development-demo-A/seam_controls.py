"""Seam controls on the real L1 grader code: the /tmp counter attack with the shuffle disabled (must PASS,
the guard watched going red) and shuffled on N runs (must fail on every one); and the side-channel guard:
per-run latency and server rss of the reference copies vs each mutant, 20 runs each, best single threshold.
usage: seam_controls.py <L1 checks dir> counter <runs> | side <runs per variant>
"""

import glob
import json
import math
import os
import statistics
import sys
from pathlib import Path

checks = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(checks))
import sdd_seam  # noqa: E402

data = checks / "data"
lesson = sdd_seam.SeamLesson(checks, "late_fee", "test_late_fee", data / "project" / "src" / "invoices")
meta = json.loads((data / "late_fee" / "mutants.json").read_text())
mutants = [(sdd_seam.Mutant(m, e["requirement"], e["description"]), (data / "late_fee" / "mutants" / f"{m}.py").read_bytes())
           for m, e in sorted(meta.items())]
reference = (data / "late_fee" / "reference.py").read_bytes()
here = Path(__file__).resolve().parent

if sys.argv[2] == "counter":
    attack = (here / "attacks" / "l1_tests" / "counter.py").read_bytes()
    for path in glob.glob("/tmp/demoA_ctr_*"):
        os.remove(path)
    fixed = sdd_seam.verdict_mutation(lesson, attack, reference, mutants, 6, None, shuffle=False)
    print(f"counter, fixed order (control): {'PASS' if fixed.passed else 'FAIL'}")
    passes = 0
    runs = int(sys.argv[3])
    for _ in range(runs):
        for path in glob.glob("/tmp/demoA_ctr_*"):
            os.remove(path)
        passes += sdd_seam.verdict_mutation(lesson, attack, reference, mutants, 6, None).passed
    print(f"counter, shuffled: {passes}/{runs} PASS (theory 1/C(18,6) = 1/18564)")
else:
    probe = b'''import os, statistics, subprocess, time, unittest
from invoices.late_fee import late_fee
def med(a, d, n=300):
    ts = []
    for _ in range(n):
        t = time.perf_counter_ns(); late_fee(a, d); ts.append(time.perf_counter_ns() - t)
    return statistics.median(ts)
late_fee(1, 1)
cheap, heavy = med(1, 1), med(999999999, 999999999)
rss = subprocess.run(["/bin/ps", "-axo", "rss=,command="], capture_output=True, text=True).stdout
rss = [int(l.split()[0]) for l in rss.splitlines() if "seam_server.py" in l]
open(os.environ.get("SIDE_LOG", "/tmp/demoA_side.jsonl"), "a").write(__import__("json").dumps({"cheap": cheap, "heavy": heavy, "rss": rss[0] if rss else -1}) + "\\n")
class T(unittest.TestCase):
    def test_a(self): pass
    def test_b(self): pass
    def test_c(self): pass
'''
    runs = int(sys.argv[3])
    stats: dict[str, list[dict]] = {}
    for name, source in [("reference", reference)] + [(m.id, s) for m, s in mutants]:
        stats[name] = []
        for _ in range(runs):
            if os.path.exists("/tmp/demoA_side.jsonl"):
                os.remove("/tmp/demoA_side.jsonl")
            sdd_seam.run_one(lesson, source, probe, learner_is_server=False)
            line = open("/tmp/demoA_side.jsonl").read().strip()
            stats[name].append(json.loads(line))
    half = runs // 2
    band = 0.5 + 4 * math.sqrt(0.25 / (2 * (runs - half)))
    worst = (0.0, "")
    for name in stats:
        if name == "reference":
            continue
        for feature in ("cheap", "heavy", "rss"):
            learn = [(r[feature], "r") for r in stats["reference"][:half]] + [(r[feature], "m") for r in stats[name][:half]]
            best = (0.0, 0, 1)
            for cut in sorted({value for value, _ in learn}):
                for sign in (1, -1):
                    right = sum((sign * (value - cut) > 0) == (label == "m") for value, label in learn)
                    best = max(best, (right / len(learn), cut, sign))
            _, cut, sign = best
            test = [(r[feature], "r") for r in stats["reference"][half:]] + [(r[feature], "m") for r in stats[name][half:]]
            acc = sum((sign * (value - cut) > 0) == (label == "m") for value, label in test) / len(test)
            worst = max(worst, (acc, f"{name}:{feature}"))
    ref = stats["reference"]
    print(f"side channel, {runs} runs per variant: reference median cheap {statistics.median(r['cheap'] for r in ref)} ns, "
          f"heavy {statistics.median(r['heavy'] for r in ref)} ns; best single-threshold accuracy {worst[0]:.3f} ({worst[1]}) "
          f"(threshold learned on the first half, accuracy on the second); 4-sd band {band:.3f}; {'within band' if worst[0] < band else 'SEPARATES'}")
