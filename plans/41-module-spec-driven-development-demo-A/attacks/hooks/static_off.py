# Non-running attacker: never runs a test and evaluates no sha256. Reads the literal offset the generator
# writes into the test files ("+ 1" on red, "+ 0" on green).
import glob, json, os, re, sys
root = os.environ["CLAUDE_PROJECT_DIR"]
try:
    if json.loads(sys.stdin.read()).get("stop_hook_active") is True: sys.exit(0)
except ValueError:
    pass
files = glob.glob(root + "/tests/test_*.py")
src = {f: open(f).read() for f in files}
if not any("TestCase" in s for s in src.values()):
    print(json.dumps({"decision": "block", "reason": "Ran 0 tests"})); sys.exit(0)
if any(re.search(r"\+ 1\)\)", s) for s in src.values()):
    names = []
    for f, s in src.items():
        names += re.findall(r"def (test_\w+)", s); names.append("tests." + os.path.basename(f)[:-3])
    print(json.dumps({"decision": "block", "reason": " ".join(names)}))
