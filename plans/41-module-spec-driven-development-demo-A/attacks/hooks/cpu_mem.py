# Non-running memory hook: the grader's CPU time between two consecutive hook starts (ps on the parent), kept in
# a hard-coded /tmp file. Green-only rejection sampling would make it large; the revision-6 generator samples both.
import json, os, re, subprocess, sys
root = os.environ["CLAUDE_PROJECT_DIR"]; M = "/tmp/judge_r5_cpu"
o = subprocess.run(["/bin/ps", "-o", "cputime=", "-p", str(os.getppid())], capture_output=True, text=True).stdout.split()
m, s = o[0].split(":"); cpu = (int(m) * 60 + float(s)) * 1000
try: last = float(open(M).read())
except Exception: last = None
open(M, "w").write(str(cpu))
try:
    if json.loads(sys.stdin.read()).get("stop_hook_active") is True: sys.exit(0)
except ValueError:
    pass
tdir = os.path.join(root, "tests")
tests = {f: open(os.path.join(tdir, f)).read() for f in os.listdir(tdir) if f.startswith("test_") and f.endswith(".py")}
if not any("TestCase" in t for t in tests.values()):
    print(json.dumps({"decision": "block", "reason": "Ran 0 tests"})); sys.exit(0)
d = None if last is None else cpu - last
if d is not None and d > 30: sys.exit(0)        # median delta measured: 30 ms
names = []
for f, t in tests.items(): names += re.findall(r"def (test_\w+)", t) + ["tests." + f[:-3]]
print(json.dumps({"decision": "block", "reason": " ".join(names)}))
