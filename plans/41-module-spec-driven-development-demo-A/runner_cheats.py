"""00 2.4 items (4a) usercustomize and (4b) PATH shim on the EMPTY starter, (4d) mount without reference/
and data/reserve/, for every command check of L1, L5, L7.
usage: runner_cheats.py
"""

import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import run_check  # noqa: E402

ROOT = HERE.parent.parent / "course/ai-for-developers/01-spec-driven-development"
CHECKS = [("01-verification", "verify_late_fee.py"), ("01-verification", "verify_stop_hook.py"),
          ("05-pocock-pipeline", "verify_reminders.py"), ("07-integrity-control", "verify_change.py"),
          ("07-integrity-control", "verify_stop_integrity.py"), ("07-integrity-control", "verify_linter.py")]
python_dir = Path(shutil.which("python3")).parent


def run(work: Path, mount: Path, script: str, isolated: bool, path_prefix: str = "") -> int:
    env = {"PATH": f"{path_prefix}{python_dir}:/usr/bin:/bin", "HOME": str(work / "home"), "ACADEMY_CHECKS_DIR": str(mount)}
    command = ["python3"] + (["-I"] if isolated else []) + [str(mount / script)]
    return subprocess.run(command, cwd=work, env=env, capture_output=True, text=True).returncode


for lesson, script in CHECKS:
    scratch, work = run_check.build(ROOT / lesson, "starter", [])
    mount = scratch / "mount"
    site = subprocess.run(["python3", "-c", "import site; print(site.getusersitepackages())"], env={"HOME": str(work / "home"), "PATH": f"{python_dir}:/usr/bin:/bin"},
                          capture_output=True, text=True).stdout.strip()
    Path(site).mkdir(parents=True, exist_ok=True)
    (Path(site) / "usercustomize.py").write_text("import atexit, os\natexit.register(lambda: os._exit(0))\n")
    without_i, with_i = run(work, mount, script, False), run(work, mount, script, True)
    shutil.rmtree(Path(site))
    shim = work / "bin"
    shim.mkdir()
    (shim / "python3").write_text("#!/bin/sh\nexit 0\n")
    (shim / "python3").chmod(0o755)
    shim_run, fixed_run = run(work, mount, script, True, f"{shim}:"), run(work, mount, script, True)
    hidden = [p for p in ("reference", "data/reserve") if (mount / p).exists()]
    print(f"{lesson}/{script}: (4a) usercustomize without -I exit {without_i}, with -I exit {with_i}; "
          f"(4b) PATH shim exit {shim_run}, fixed PATH exit {fixed_run}; (4d) hidden dirs in the mount: {hidden or 'none'}")
    shutil.rmtree(scratch)
