"""Check characterization-net (L3, design #45 section 6.3).

Run from the workspace root as `python3 -I "$ACADEMY_CHECKS_DIR/verify_characterization.py"`.
Exit 0 pass; 3 stage 0 (T1-T9, uncounted); 1 a counted failure of G1-G3 or a grader fault.

Stage 0 reads tests/ once (T9). The counted part is 17 shuffled runs of those bytes: the pristine
parcel-desk once in each of the 5 zones of TZ5, and each of the 12 mutants of labels.py and manifest.py in a
zone drawn from TZ5.
"""

import sys

sys.dont_write_bytecode = True  # no __pycache__ in the checks mount

from pathlib import Path  # noqa: E402

CHECKS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(CHECKS_DIR))

import char_runner  # noqa: E402
import legacy_static  # noqa: E402

LEGACY = CHECKS_DIR / "data" / "legacy"
MUTANTS = CHECKS_DIR / "data" / "legacy-mutants" / "mutants.json"


def main() -> int:
    legacy_static.make_undumpable()
    stage0 = legacy_static.check_tests(Path.cwd(), LEGACY / "shipping")
    if stage0.problems:
        return legacy_static.report_stage0(stage0.problems)
    try:
        mutants = char_runner.load_mutants(MUTANTS)
        pristine = char_runner.read_variant(LEGACY / "shipping")
        specs = char_runner.green_specs(pristine) + char_runner.mutant_specs(pristine, mutants)
        results = char_runner.run_all(specs, stage0.accepted, LEGACY)
    except (OSError, ValueError, char_runner.MutantMismatchError) as error:
        return legacy_static.report_grader_fault(f"{type(error).__name__}: {error}")
    problems = char_runner.verdict(results, char_runner.areas_of(mutants))
    if problems:
        return legacy_static.report_counted(problems)
    return legacy_static.report_pass([
        f"{len(char_runner.TZ5)} прогонов на исходной версии зелёные, по одному в каждом часовом поясе",
        f"каждая из {len(mutants)} изменённых версий роняет хотя бы один тест",
        "ни одного отказа в действии",
    ])


if __name__ == "__main__":
    sys.exit(main())
