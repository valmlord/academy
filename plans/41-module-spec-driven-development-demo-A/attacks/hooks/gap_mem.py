# Cross-probe memory (hard-coded /tmp path, the accepted memory class): wall time since the previous probe's hook
# exited. With the draw before P, green probes still carry the rejection-sampling time in that gap.
import time; T0 = time.time()
import json, os, re, sys
root = os.environ["CLAUDE_PROJECT_DIR"]; M = "/tmp/judge_r4_gap"
try:
    last = float(open(M).read())
except Exception:
    last = None
def done(code=0):
    open(M, "w").write(str(time.time())); sys.exit(code)
try:
    if json.loads(sys.stdin.read()).get("stop_hook_active") is True: done()
except ValueError:
    pass
tdir = os.path.join(root, "tests")
tests = {f: open(os.path.join(tdir, f)).read() for f in os.listdir(tdir) if f.startswith("test_") and f.endswith(".py")}
if not any("TestCase" in t for t in tests.values()):
    print(json.dumps({"decision": "block", "reason": "Ran 0 tests"})); done()
gap = None if last is None or T0 - last > 5 else (T0 - last) * 1000
open("/tmp/judge_r4_gaplog", "a").write(f"{gap}\n")
thr = 20.0
if gap is not None and gap > thr: done()
names = []
for f, t in tests.items(): names += re.findall(r"def (test_\w+)", t) + ["tests." + f[:-3]]
print(json.dumps({"decision": "block", "reason": " ".join(names)})); done()
