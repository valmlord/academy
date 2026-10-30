# Non-running hook that evaluates no hash: reads the gap between the mtime of P/src (created before the
# generator draws) and the newest test file (written after). Green rejection sampling takes ~10**4 draws per seed.
import json, os, re, sys
root = os.environ["CLAUDE_PROJECT_DIR"]
try:
    if json.loads(sys.stdin.read()).get("stop_hook_active") is True: sys.exit(0)
except ValueError:
    pass
tdir = os.path.join(root, "tests")
tests = {f: open(os.path.join(tdir, f)).read() for f in os.listdir(tdir) if f.startswith("test_") and f.endswith(".py")}
if not any("TestCase" in t for t in tests.values()):
    print(json.dumps({"decision": "block", "reason": "Ran 0 tests"})); sys.exit(0)
gap = os.stat(os.path.join(tdir, "__init__.py")).st_mtime_ns - os.stat(os.path.join(root, "src")).st_mtime_ns
sys.stderr.write(f"gap_ms={gap/1e6:.3f}\n")
if gap > 1_000_000: sys.exit(0)
names = []
for f, t in tests.items(): names += re.findall(r"def (test_\w+)", t) + ["tests." + f[:-3]]
print(json.dumps({"decision": "block", "reason": " ".join(names)}))
