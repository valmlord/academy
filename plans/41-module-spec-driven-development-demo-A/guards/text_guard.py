"""Generator text guard (design 2.8) over the real generator, PAIRS red and PAIRS green to learn on and as
many to test on: (1) every random value masked, all projects byte-identical; (2) the best per-value rule
over every static feature stays within 4 sd of 0.5 on the test set. Modes: grader (default), offset,
half (watched-red controls), sum (the relation only the state-flow guard sees), stub (L7 stub seeds:
finding/usage vs silent).
usage: text_guard.py <checks dir> <pairs> [mode]
"""

import ast
import collections
import io
import math
import re
import secrets
import sys
import tokenize
from pathlib import Path

sys.path.insert(0, str(Path(sys.argv[1]).resolve()))
import sdd_probegen as gen  # noqa: E402

PAIRS = int(sys.argv[2])
MODE = sys.argv[3] if len(sys.argv) > 3 else "grader"
N = gen.N
RANDOM = ("r1", "r2", "ta", "tb", "tc", "td", "sa", "sb", "sc", "k", "j", "m")
draw = gen.draw
if MODE in ("offset", "half", "sum"):
    original = gen.draw

    def draw(state: str) -> dict:  # noqa: F811
        v = original(state)
        if MODE == "offset":
            v["off"] = 1 if state == "R" else 0
        if MODE == "half" and state == "R":
            v["k"] = secrets.randbelow(N // 2)
            v["sa"] = gen.seed_for(v["k"], False)
        if MODE == "sum" and state == "R":
            v["m"] = (v["k"] + v["j"]) % N
            v["sc"] = gen.seed_for(v["m"], False)
        return v
    if MODE == "offset":
        gen.TEST_A = gen.TEST_A.replace('"{sb}"', '"{sb}" + str({off})', 1)


def mask(v: dict, files: dict) -> tuple:
    sv = dict(v)
    sv.update({n: f"@{n}@" for n in RANDOM})
    masked = gen.render(sv)

    def sub(t: str) -> str:
        for n in RANDOM:
            t = t.replace(f"@{n}@", str(v[n]))
        return t
    assert {sub(r): sub(t) for r, t in masked.items()} == files, "generator output is not its masked template"
    return tuple(sorted(masked.items()))


def ints(n: int) -> dict:
    s = str(n)
    return {"val": n, "len": len(s), "par": n % 2, "m3": n % 3, "m7": n % 7, "m10": n % 10, "lead": s[0], "half": n < N // 2}


def features(v: dict, files: dict) -> dict:
    f: dict = {}
    for rel, text in files.items():
        key = rel
        for n in ("r1", "r2"):
            key = key.replace(str(v[n]), f"<{n}>")
        key = re.sub(r"f\d+\.json", "f<j>.json", key)
        f[f"rawsize:{key}"] = len(text)
        f[f"lines:{key}"] = text.count("\n")
        for i, line in enumerate(text.split("\n")):
            f[f"linelen:{key}:{i}"] = len(line)
        if key.endswith(".py") and text:
            for t, c in collections.Counter(type(n).__name__ for n in ast.walk(ast.parse(text))).items():
                f[f"ast:{key}:{t}"] = c
            for i, tok in enumerate(tokenize.generate_tokens(io.StringIO(text).readline)):
                if tok.type == tokenize.STRING:
                    f[f"strlen:{key}:{i}"] = len(tok.string)
                elif tok.type == tokenize.NUMBER:
                    for a, b in ints(int(tok.string.replace("_", ""))).items():
                        f[f"num:{key}:{i}:{a}"] = b
                elif tok.type in (tokenize.NAME, tokenize.OP):
                    f[f"tok:{key}:{i}"] = "<id>" if re.fullmatch(r"_?(test_)?x[0-9a-f]{8}", tok.string) else tok.string
    for name in ("k", "j", "m"):
        for a, b in ints(v[name]).items():
            f[f"const:{name}:{a}"] = b
    for a, b in (("k", "j"), ("k", "m"), ("j", "m")):
        f[f"rel:{a}={b}"] = v[a] == v[b]
        f[f"rel:{a}<{b}"] = v[a] < v[b]
    for s, c in (("sa", "k"), ("sb", "j"), ("sc", "m")):
        f[f"fold:{s}:noh"] = int(v[s][:8], 16) % N == v[c]
        f[f"fold:{s}:diff"] = (int(v[s][:8], 16) - v[c]) % N < N // 2
        f[f"fold:{s}:dsum"] = sum(int(ch, 16) for ch in v[s]) % 2 == v[c] % 2
        f[f"seed:{s}:lead"] = v[s][0]
    return f


def stub_features(seed: str) -> dict:
    text = gen.render_stub(seed)
    f = {"size": len(text), "lead": seed[0], "last": seed[-1], "dsum": sum(int(c, 16) for c in seed) % 2,
         "first8mod4": int(seed[:8], 16) % 4, "first1mod4": int(seed[0], 16) % 4, "digits": sum(c.isdigit() for c in seed)}
    for i, ch in enumerate(seed):
        f[f"ch{i}"] = ch
    return f


def dataset() -> list:
    rows = []
    if MODE == "stub":
        for label in "RG" * PAIRS:
            behaviour = secrets.choice((1, 2)) if label == "R" else secrets.choice((0, 3))
            seed = gen.draw_stub(behaviour)
            masked = (gen.render_stub("@seed@"),)
            assert gen.render_stub(seed) == masked[0].replace("@seed@", seed)
            rows.append((label, masked, stub_features(seed)))
        return rows
    for state in "RG" * PAIRS:
        v = draw(state)
        files = gen.render(v)
        rows.append((state, mask(v, files), features(v, files)))
    return rows


train, test = dataset(), dataset()
masks = {m for _, m, _ in train + test}
count: dict = collections.defaultdict(collections.Counter)
for state, _, f in train:
    for k, val in f.items():
        count[k][(val, state)] += 1
rules = {k: {val: ("R" if c[(val, "R")] >= c[(val, "G")] else "G") for val, _ in c} for k, c in count.items()}
result = sorted(((sum(rules[k].get(f.get(k), "R") == st for st, _, f in test) / len(test), k) for k in rules), reverse=True)
band = 0.5 + 4 * math.sqrt(0.25 / len(test))
verdict = "PASS" if len(masks) == 1 and result[0][0] < band else "FAIL"
print(f"text guard [{MODE}]: masked distinct {len(masks)} over {len(train) + len(test)}; features {len(rules)}; "
      f"best test acc {result[0][0]:.4f} ({result[0][1]}); band {band:.4f}; GUARD {verdict}")
