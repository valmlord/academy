"""Train the static attacker on 2000 labelled projects from the real generator (the attacker is given it)."""

import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(sys.argv[1]).resolve()))
import sdd_probegen as gen  # noqa: E402

N = gen.N


def feats(k: int, j: int, m: int, sb: str) -> dict[str, object]:
    return {"k3": k % 3, "j7": j % 7, "jltm": j < m, "sbsum": sum(int(c, 16) for c in sb) % 2 == j % 2,
            "mhalf": m < N // 2, "klen": len(str(k)), "noh": int(sb[:8], 16) % N == j}


count: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
for state in "RG" * 1000:
    v = gen.draw(state)
    for name, value in feats(v["k"], v["j"], v["m"], v["sb"]).items():
        count[name][(str(value), state)] += 1
rules = {name: {value: ("R" if c[(value, "R")] >= c[(value, "G")] else "G") for value, _ in c} for name, c in count.items()}
Path("/tmp/m3_static_rules.json").write_text(json.dumps(rules))
print("trained", len(rules), "rules")
