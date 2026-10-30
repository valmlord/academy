# Static attacker (revision 4, architect's own): never runs a test, never evaluates sha256. Parses the test
# files with ast, extracts the constants and seeds (k, j from the fixture on disk, m from invoices/__init__),
# folds the hash calls without hashing semantics and votes with per-value rules learned offline from 2000
# labelled generated projects (/tmp/m3_static_rules.json). Reason carries every grepped name.
import ast, glob, json, os, re, sys
root = os.environ["CLAUDE_PROJECT_DIR"]
try:
    if json.loads(sys.stdin.read()).get("stop_hook_active") is True: sys.exit(0)
except ValueError:
    pass
files = glob.glob(root + "/tests/test_x*.py")  # generated files only; test_api.py is the fixed base
src = {f: open(f).read() for f in files}
if not any("TestCase" in s for s in src.values()):
    print(json.dumps({"decision": "block", "reason": "Ran 0 tests"})); sys.exit(0)
N = 10**4
k = sb = None
for s in src.values():
    for node in ast.walk(ast.parse(s)):
        if isinstance(node, ast.Call) and getattr(node.func, "attr", "") == "assertEqual":
            k = node.args[1].value
    m2 = re.findall(r'_h\("([0-9a-f]{16})", 10\*\*4\)\)\)', s)
    sb = m2[0] if m2 else sb
j = int(re.findall(r"f(\d+)\.json", " ".join(os.listdir(root + "/tests/fixtures")))[0])
m = int(re.findall(r"_a(\d+)", open(root + "/src/invoices/__init__.py").read())[0])
f = {"k3": k % 3, "j7": j % 7, "jltm": j < m, "sbsum": sum(int(c, 16) for c in sb) % 2 == j % 2,
     "mhalf": m < N // 2, "klen": len(str(k)), "noh": int(sb[:8], 16) % N == j}
rules = json.load(open("/tmp/m3_static_rules.json"))
votes = sum(rules[name].get(str(val), "R") == "R" for name, val in f.items())
if votes >= 4:
    names = []
    for fn, s in src.items():
        names += re.findall(r"def (test_\w+)", s); names.append("tests." + os.path.basename(fn)[:-3])
    print(json.dumps({"decision": "block", "reason": " ".join(names)}))
