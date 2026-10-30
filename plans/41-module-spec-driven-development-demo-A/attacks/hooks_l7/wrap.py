"""Wrap an L1 static attacker hook for L7: its decision stands when it blocks; when it allows, the
linter runs and a non-zero exit blocks with both streams (the L5 reference hook with the linter call
added, the test run replaced by the static decision).
usage: wrap.py <attacker.py> <out.py>
"""

import sys
from pathlib import Path

attacker = Path(sys.argv[1]).read_text()
Path(sys.argv[2]).write_text(f'''#!/usr/bin/env python3
import json, os, subprocess, sys
ATTACKER = {attacker!r}
data = sys.stdin.read()
first = subprocess.run([sys.executable, "-I", "-c", ATTACKER], input=data, capture_output=True, text=True, env=os.environ)
if first.stdout.strip() or first.returncode != 0:
    sys.stdout.write(first.stdout); sys.stderr.write(first.stderr); sys.exit(first.returncode)
try:
    if json.loads(data).get("stop_hook_active") is True:
        sys.exit(0)
except (ValueError, AttributeError):
    pass
root = os.environ["CLAUDE_PROJECT_DIR"]
lint = subprocess.run([sys.executable, "-I", os.path.join(root, "scripts", "check_artifacts.py"), root], capture_output=True, text=True)
if lint.returncode != 0:
    print(json.dumps({{"decision": "block", "reason": lint.stdout + lint.stderr}}))
''')
