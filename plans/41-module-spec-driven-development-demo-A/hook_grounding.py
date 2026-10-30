"""L1 demo items: the reference hook on the real L1 reference workspace (green, one test broken, every
reference test broken plus the probe files) and registration grounding: every accepted command form
started for real (shell forms through sh -c, exec forms without a shell) from a project path with a space.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import run_check  # noqa: E402

LESSON = HERE.parent.parent / "course/ai-for-developers/01-spec-driven-development/01-verification"
sys.path.insert(0, str(LESSON / "checks"))
import sdd_probegen  # noqa: E402

HOOK = os.path.join(".claude", "hooks", "stop_tests.py")
python_dir = Path(shutil.which("python3")).parent


def run_hook(work: Path, stdin: str, command: list[str] | None = None, shell: str | None = None) -> subprocess.CompletedProcess:
    env = {"PATH": f"{python_dir}:/usr/bin:/bin", "HOME": str(work), "CLAUDE_PROJECT_DIR": str(work)}
    if shell is not None:
        return subprocess.run(["/bin/sh", "-c", shell], input=stdin, cwd=work, env=env, capture_output=True, text=True)
    return subprocess.run(command or ["python3", "-I", "-B", str(work / HOOK)], input=stdin, cwd=work, env=env, capture_output=True, text=True)


scratch, work = run_check.build(LESSON, "reference", [])
spaced = work.parent / "proj with space"
work.rename(spaced)
work = spaced
green = run_hook(work, '{"stop_hook_active": false}')
print(f"green real workspace: exit {green.returncode}, stdout {green.stdout.strip()!r}")
tests = work / "tests" / "test_late_fee.py"
original = tests.read_text()
tests.write_text(original.replace("self.assertEqual(late_fee(10_000, 5), 0)", "self.assertEqual(late_fee(10_000, 5), 1)"))
red = run_hook(work, "{}")
reason = json.loads(red.stdout)["reason"]
print(f"one test broken: exit {red.returncode}, block reason has the name: {'test_no_fee_on_the_last_grace_day' in reason}")
print("raw reason tail:", " | ".join(reason.strip().splitlines()[-3:]))
broken = original
for line in original.splitlines():
    if "self.assertEqual(late_fee(" in line:
        broken = broken.replace(line, line.replace("self.assertEqual(", "self.assertNotEqual("))
tests.write_text(broken)
files, tokens = sdd_probegen.generate("R")
sdd_probegen.write(work, files)
red = run_hook(work, "not json")
reason = json.loads(red.stdout)["reason"]
import ast as _ast
names = [f.name for c in _ast.parse(broken).body if isinstance(c, _ast.ClassDef) for f in c.body
         if isinstance(f, _ast.FunctionDef) and "assertNotEqual(late_fee(" in _ast.get_source_segment(broken, f)]
missing = [n for n in names + tokens if n not in reason]
print(f"largest red P: {len(names)} reference tests broken + probe files; reason length {len(reason)}; names missing from the reason: {missing or 'none'}")
for phrase in ("No such file or directory", "FileNotFoundError"):
    print(f"phrase {phrase!r} in the reference hook's stdout (inside the JSON reason): {phrase in red.stdout}; on stderr: {phrase in red.stderr}")
tests.write_text(original)
for path in files:
    target = work / path
    if path != "src/invoices/__init__.py":
        target.unlink()
(work / "src/invoices/__init__.py").write_text("")
path = "${CLAUDE_PROJECT_DIR}/.claude/hooks/stop_tests.py".replace("${CLAUDE_PROJECT_DIR}", str(work))
forms = {"E1": [path], "E2": ["python3", path], "E3": ["python3", "-I", path]}
for name, argv in forms.items():
    done = run_hook(work, "{}", command=argv)
    print(f"exec {name} from a path with a space: exit {done.returncode}, stdout {done.stdout.strip()!r}")
for prefix in ("", "python3 ", "python3 -I "):
    for spelling in ('"$CLAUDE_PROJECT_DIR"/.claude/hooks/stop_tests.py', '"${CLAUDE_PROJECT_DIR}"/.claude/hooks/stop_tests.py',
                     '"$CLAUDE_PROJECT_DIR/.claude/hooks/stop_tests.py"', '"${CLAUDE_PROJECT_DIR}/.claude/hooks/stop_tests.py"'):
        done = run_hook(work, "{}", shell=prefix + spelling)
        print(f"shell {prefix + spelling!r}: exit {done.returncode}, stdout {done.stdout.strip()!r}")
typo = run_hook(work, "{}", shell='python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/stop_test.py"')
print(f"typo path under sh -c: exit {typo.returncode}, stderr {typo.stderr.strip()[:120]!r}")
(work / HOOK).chmod(0o644)
try:
    run_hook(work, "{}", command=[path])
except PermissionError as error:
    print(f"E1 without the exec bit: {type(error).__name__} (Claude Code could not start it)")
shutil.rmtree(scratch)
