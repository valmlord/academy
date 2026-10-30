"""Metadata and timing guard (design 2.8) through the grader's own prepare(): wall and CPU time to the
hook's start, pairwise mtime/ctime/birthtime gaps among P's paths, inode order; 10 quantile bins learned
on the first set, accuracy on the second must stay within 4 sd of 0.5.
usage: meta_guard.py <checks dir> <pairs> [grader|stub|r5order|drawfirst]
"""

import bisect
import collections
import math
import os
import re
import secrets
import shutil
import sys
import time
from pathlib import Path

CHECKS = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(CHECKS))
import sdd_probegen as gen  # noqa: E402

PAIRS = int(sys.argv[2])
MODE = sys.argv[3] if len(sys.argv) > 3 else "grader"
HOOK = CHECKS.parent / "checks" / "reference" / ".claude" / "hooks" / "stop_tests.py"
BASE = CHECKS / "data" / "probe-base"


def lazy_draw(state: str) -> dict:
    v = {n: gen.ident() for n in ("r1", "r2", "ta", "tb", "tc", "td")}
    v.update(k=secrets.randbelow(gen.N), j=secrets.randbelow(gen.N), m=secrets.randbelow(gen.N))
    for s, c in (("sa", "k"), ("sb", "j"), ("sc", "m")):
        v[s] = gen.seed_for(v[c], state == "G")
    return v


if MODE in ("r5order", "drawfirst"):
    gen.draw = lazy_draw
if MODE == "r5order":
    def prepare(hook, state, base, stub=None):  # noqa: ANN001, ANN202
        root = Path(gen.tempfile.mkdtemp(prefix="probe-"))
        project = root / "P"
        shutil.copytree(base, project)
        files, tokens = gen.generate(state)
        gen.write(project, files)
        (project / gen.HOOK_RELATIVE).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(hook, project / gen.HOOK_RELATIVE)
        return root, project, tokens, ""
    gen.prepare = prepare


def key(rel: str) -> str:
    rel = re.sub(r"x[0-9a-f]{8}", "<id>", rel)
    rel = re.sub(r"f\d+\.json", "f<j>.json", rel)
    return re.sub(r"^tmp[^/]*", "<tmp>", rel)


def one(state: str) -> dict:
    w0, c0 = time.perf_counter_ns(), time.process_time_ns()
    if MODE == "stub":  # L7 path: green tests, the linter stub's behaviour is the hidden state
        root, project, tokens, _ = gen.prepare(HOOK, "G", BASE, 1 if state == "R" else 0)
    else:
        root, project, tokens, _ = gen.prepare(HOOK, state, BASE)
    w1, c1 = time.perf_counter_ns(), time.process_time_ns()
    raw = collections.defaultdict(list)
    for d, ds, fs in os.walk(root):
        for n in ds + fs:
            p = os.path.join(d, n)
            raw[key(os.path.relpath(p, root))].append(os.lstat(p))
    st = {}
    for k, lst in raw.items():
        for i, x in enumerate(sorted(lst, key=lambda x: x.st_mtime_ns)):
            st[f"{k}#{i}"] = x
    st["<root>"] = os.lstat(root)
    shutil.rmtree(root)
    f: dict = {"wall": w1 - w0, "cpu": c1 - c0}
    ks = sorted(st)
    for a in range(len(ks)):
        for b in range(a + 1, len(ks)):
            x, y = st[ks[a]], st[ks[b]]
            f[f"mt:{ks[a]}|{ks[b]}"] = y.st_mtime_ns - x.st_mtime_ns
            f[f"ct:{ks[a]}|{ks[b]}"] = y.st_ctime_ns - x.st_ctime_ns
            if hasattr(x, "st_birthtime"):
                f[f"bt:{ks[a]}|{ks[b]}"] = round((y.st_birthtime - x.st_birthtime) * 1e9)
    f["inode_order"] = "|".join(sorted((k for k in ks if not st[k].st_mode & 0o040000), key=lambda k: st[k].st_ino))
    return f


def dataset() -> list:
    return [(s, one(s)) for s in "RG" * PAIRS]


train, test = dataset(), dataset()
acc = []
for feat in train[0][1]:
    tv = [(f.get(feat), s) for s, f in train]
    if isinstance(tv[0][0], str):
        c = collections.Counter(tv)
        rule = {v: ("R" if c[(v, "R")] >= c[(v, "G")] else "G") for v, _ in tv}
        pred = lambda x, rule=rule: rule.get(x, "R")  # noqa: E731
    else:
        vals = sorted(v for v, _ in tv if v is not None)
        cuts = sorted({vals[int(len(vals) * q / 10)] for q in range(1, 10)})
        c = collections.Counter((bisect.bisect(cuts, v), s) for v, s in tv if v is not None)
        rule = {b: ("R" if c[(b, "R")] >= c[(b, "G")] else "G") for b in range(len(cuts) + 1)}
        pred = lambda x, cuts=cuts, rule=rule: rule[bisect.bisect(cuts, x)] if x is not None else "R"  # noqa: E731
    acc.append((sum(pred(f.get(feat)) == s for s, f in test) / len(test), feat))
acc.sort(reverse=True)
band = 0.5 + 4 * math.sqrt(0.25 / len(test))
w = {s: sorted(f["wall"] for t, f in train if t == s) for s in "RG"}
print(f"meta guard [{MODE}]: {len(acc)} features; best test acc {acc[0][0]:.4f} ({acc[0][1]}); band {band:.4f}; "
      f"wall median R {w['R'][len(w['R']) // 2] / 1e6:.1f} ms G {w['G'][len(w['G']) // 2] / 1e6:.1f} ms; "
      f"META GUARD {'PASS' if acc[0][0] < band else 'FAIL'}")
