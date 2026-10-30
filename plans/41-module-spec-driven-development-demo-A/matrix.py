"""Run a list of (label, lesson, script, base, overlays...) rows through run_check.py; print one line each.

usage: matrix.py <rows file>   (rows: label | lesson dir | script | base | overlay ... ; # comments)
"""

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main() -> int:
    for raw in Path(sys.argv[1]).read_text().splitlines():
        if not raw.strip() or raw.startswith("#"):
            continue
        label, lesson, script, base, *overlays = [part.strip() for part in raw.split("|")]
        overlays = [o for o in " ".join(overlays).split() if o]
        done = subprocess.run([sys.executable, "-I", str(HERE / "run_check.py"), lesson, script, base, *overlays],
                              capture_output=True, text=True)
        lines = [line for line in done.stdout.splitlines() if line.strip()]
        code = lines[-1] if lines else "?"
        first = next((line for line in lines if line.startswith("- ")), lines[0] if lines else "")
        print(f"{label:48} {code:7} {first[:150]}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
