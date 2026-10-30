"""Run a hook through the real probe code of a lesson N times and report pass rate and per-probe accuracy.

usage: hook_attacks.py <checks dir> <hook file> <runs> [--fixed] [--l7] [--reset GLOB]

--fixed disables the shuffle and draws the fixed pattern RGG per class (the watched-red control);
--reset deletes files matching GLOB under /tmp before each run (a fresh attacker memory per submission).
"""

import collections
import glob
import os
import sys
from pathlib import Path

checks = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(checks))
import sdd_stophook as hooks  # noqa: E402

hook = Path(sys.argv[2]).resolve()
runs = int(sys.argv[3])
fixed = "--fixed" in sys.argv
l7 = "--l7" in sys.argv
reset = sys.argv[sys.argv.index("--reset") + 1] if "--reset" in sys.argv else None
base = checks / "data" / "probe-base"
phrases = [p.lower() for p in __import__("json").loads((checks / "data" / "missing_file_phrases.json").read_text())]


def rows() -> list[hooks.Probe]:
    if not fixed:
        built = hooks.l7_rows() if l7 else hooks.l1_rows()
        hooks.secrets.SystemRandom().shuffle(built)
        return built
    built = [hooks.Probe(state, cls, 0 if l7 else None) for cls in hooks.CLASSES for state in "RGG"]
    return built + [hooks.Probe("Z", "claim", 0 if l7 else None), hooks.Probe("R", "active", 0 if l7 else None)]


passes = 0
per_state = collections.Counter()
class_hit = [0, 0]
for _ in range(runs):
    if reset:
        for path in glob.glob(reset):
            os.remove(path)
    ok = True
    by_class: dict[str, list[bool]] = collections.defaultdict(list)
    for probe in rows():
        observation, tokens = hooks.run_probe(hook, probe, base, phrases)
        good = not hooks.judge(probe, observation, tokens)
        ok &= good
        if probe.state in "RG" and probe.payload_class != "active" and probe.stub in (None, 0, 3):
            per_state[(probe.state, good)] += 1
            by_class[probe.payload_class].append(good)
    for goods in by_class.values():
        class_hit[1] += 1
        class_hit[0] += all(goods)
    passes += ok
right = per_state[("R", True)] + per_state[("G", True)]
total = sum(per_state.values())
print(f"{hook.stem}: {passes}/{runs} PASS ({'fixed order' if fixed else 'shuffled'}); red/green probes right "
      f"{right}/{total} = {right / max(total, 1):.4f}; red {per_state[('R', True)]}/{per_state[('R', True)] + per_state[('R', False)]}, "
      f"green {per_state[('G', True)]}/{per_state[('G', True)] + per_state[('G', False)]}; per-class pattern hit "
      f"{class_hit[0]}/{class_hit[1]} = {class_hit[0] / max(class_hit[1], 1):.4f}")
