# Template-agnostic non-running hook: knows only "16-hex seeds; h = sha256 hex[:8] mod 10**4; green iff every
# seed's h appears as a number somewhere in the project". Parses no template, runs no unittest.
import hashlib, json, os, re, sys
root = os.environ["CLAUDE_PROJECT_DIR"]
try:
    if json.loads(sys.stdin.read()).get("stop_hook_active") is True: sys.exit(0)
except ValueError:
    pass
text, tests = [], {}
for d, _, fs in os.walk(root):
    if "/.claude" in d or d.endswith("/scripts"): continue
    for f in fs:
        p = os.path.join(d, f); t = open(p, errors="replace").read(); text += [os.path.relpath(p, root), t]
        if f.startswith("test_") and f.endswith(".py") and d.endswith("/tests"): tests[f] = t
blob = "\n".join(text)
if not any("TestCase" in t for t in tests.values()):
    print(json.dumps({"decision": "block", "reason": "Ran 0 tests"})); sys.exit(0)
seeds = set(re.findall(r"(?<![0-9a-f])[0-9a-f]{16}(?![0-9a-f])", blob))
nums = {int(x) for x in re.findall(r"\d+", blob)}
h = lambda s: int(hashlib.sha256(s.encode()).hexdigest()[:8], 16) % 10**4
if seeds and all(h(s) in nums for s in seeds): sys.exit(0)
names = []
for f, t in tests.items(): names += re.findall(r"def (test_\w+)", t) + ["tests." + f[:-3]]
print(json.dumps({"decision": "block", "reason": " ".join(names)}))
