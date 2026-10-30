"""Demo driver (design #41 2.4): run one command check on a fresh workspace copy.

usage: run_check.py <lesson dir> <check script> <base: starter|reference> [overlay dir or file=src ...]

The grader mount is a copy of checks/ without reference/ and data/reserve/; the workspace is a fresh
copy of starter/ (plus checks/reference/ for base "reference"), then each overlay. Hook files get the
exec bit the starter ships with (the repo copies cannot carry it until it is set in git). Prints the
check's output and exit code.
"""

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# Workspace paths named by alias in the row files.
ALIASES = {
    "HOOK": os.path.join(".claude", "hooks", "stop_tests.py"),
    "SETTINGS": os.path.join(".claude", "settings.json"),
    "LOCAL_SETTINGS": os.path.join(".claude", "settings.local.json"),
}


def build(lesson: Path, base: str, overlays: list[str]) -> tuple[Path, Path]:
    scratch = Path(tempfile.mkdtemp(prefix="demo-"))
    mount = scratch / "mount"
    shutil.copytree(lesson / "checks", mount, ignore=shutil.ignore_patterns("reference", "__pycache__"))
    shutil.rmtree(mount / "data" / "reserve", ignore_errors=True)
    work = scratch / "work"
    shutil.copytree(lesson / "starter", work)
    if base == "reference":
        shutil.copytree(lesson / "checks" / "reference", work, dirs_exist_ok=True)
    for overlay in overlays:
        if "=" in overlay:
            target, source = overlay.split("=", 1)
            target = ALIASES.get(target, target)
            (work / target).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(source, work / target)
        else:
            shutil.copytree(overlay, work, dirs_exist_ok=True)
    for hook in (work / ".claude" / "hooks").glob("*.py"):
        hook.chmod(0o755)
    (work / "home").mkdir(exist_ok=True)
    return scratch, work


def main() -> int:
    lesson, script, base, *overlays = sys.argv[1:]
    scratch, work = build(Path(lesson).resolve(), base, overlays)
    interpreter_dir = Path(shutil.which("python3") or sys.executable).parent
    env = {"PATH": f"{interpreter_dir}:/usr/bin:/bin", "HOME": str(work / "home"),
           "ACADEMY_CHECKS_DIR": str(scratch / "mount")}
    if os.environ.get("DEMO_PATH_PREFIX"):
        env["PATH"] = os.environ["DEMO_PATH_PREFIX"] + ":" + env["PATH"]
    try:
        done = subprocess.run(["python3", "-I", str(scratch / "mount" / script)], cwd=work, env=env,
                              capture_output=True, text=True)
        sys.stdout.write(done.stdout + done.stderr)
        print(f"EXIT {done.returncode}")
        return done.returncode
    finally:
        if not os.environ.get("DEMO_KEEP"):
            shutil.rmtree(scratch, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
