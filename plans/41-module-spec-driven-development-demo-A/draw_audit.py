"""Demo (design #41 2.6, fix of student cheat 12): do the per-run drawn acceptance cases exercise every
requirement?

usage: draw_audit.py <lesson dir> <draws>

For each of <draws> fresh draws it runs the reference and every mutant of the lesson in this process on
the drawn cases (only the drawn ones, the fixed examples left out) and reports, per mutant, in how many
draws its own requirement's category caught it, and in how many draws any category did. A mutant that
the drawn cases of its requirement miss in some draw is listed. Also asserts every drawn case is in D
(decodes under the seam interface) and the reference raises only the requirement-fixed exception.
"""

import importlib.util
import json
import secrets
import sys
import types
from pathlib import Path


def load(path: Path, name: str) -> types.ModuleType:
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def main() -> int:
    lesson = Path(sys.argv[1]).resolve()
    draws = int(sys.argv[2])
    checks = lesson / "checks"
    sys.path.insert(0, str(checks))
    sys.path.insert(0, str(checks / "data" / "project" / "src"))
    accept = load(checks / "sdd_accept.py", "sdd_accept_audit")
    interface = load(checks / "fixtures" / "seam_interface.py", "seam_interface_audit")
    if (checks / "data" / "late_fee").is_dir():
        folder, seam_name = checks / "data" / "late_fee", "late_fee"
        draw = accept.draw_late_fee
    else:
        folder, seam_name = checks / "data" / "reminders", "plan_reminders"
        with_dispute = lesson.name.startswith("07")
        draw = lambda rng: accept.draw_reminders(rng, with_dispute=with_dispute)  # noqa: E731
    seam = interface.SEAMS[seam_name]
    meta = json.loads((folder / "mutants.json").read_text(encoding="utf-8"))
    reference = getattr(load(folder / "reference.py", "ref_audit"), seam_name)
    mutants = {mid: getattr(load(folder / "mutants" / f"{mid}.py", f"m_{mid}"), seam_name) for mid in meta}

    def answer(function: object, values: list[object]) -> object:
        try:
            result = function(*values)  # type: ignore[operator]
        except Exception as error:  # the comparison is on type and message, as at the seam
            return ("exc", type(error).__name__, str(error))
        return ("ok", interface.encode(result, seam.return_spec, seam))

    own = {mid: 0 for mid in meta}
    anywhere = {mid: 0 for mid in meta}
    calls = 0
    reference_exceptions: set[tuple[str, str]] = set()
    size = 0
    for _ in range(draws):
        drawn = draw(secrets.SystemRandom())
        size = max(size, len(json.dumps(drawn)))
        caught_own = {mid: False for mid in meta}
        caught_any = {mid: False for mid in meta}
        for category, cases in drawn.items():
            for arguments in cases:
                calls += 1
                values = [interface.decode(raw, spec, seam) for raw, spec in zip(arguments, seam.argument_specs)]
                expected = answer(reference, values)
                if expected[0] == "exc":
                    reference_exceptions.add((expected[1], expected[2]))
                for mid, function in mutants.items():
                    if answer(function, values) != expected:
                        caught_any[mid] = True
                        requirement = meta[mid]["requirement"]
                        label = "dispute" if requirement == "NEW" else requirement.lower().replace("-", "_")
                        if category == label:
                            caught_own[mid] = True
        for mid in meta:
            own[mid] += caught_own[mid]
            anywhere[mid] += caught_any[mid]
    print(f"{lesson.name}: {draws} draws, {calls} calls, largest draw {size} bytes of JSON")
    print(f"reference exceptions: {sorted(reference_exceptions) or 'none'}")
    weak = []
    for mid in sorted(meta):
        print(f"  {mid:32s} own category {own[mid]}/{draws}  any category {anywhere[mid]}/{draws}")
        if own[mid] < draws:
            weak.append(mid)
    print("RESULT", "every mutant caught by its own category in every draw" if not weak else f"missed: {weak}")
    return 0 if not weak else 1


if __name__ == "__main__":
    sys.exit(main())
