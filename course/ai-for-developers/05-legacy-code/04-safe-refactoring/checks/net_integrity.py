"""Stage-0 rule N1 of quote-net and pricing-extracted (L4): the given net, its helpers and goldens stay as given.

Student rerun b3 (threat model amendment "after student rerun b3"): both checks run the given net from the grader's
pristine copy (checks/data/given-net/) in its own child, with only the given files present, and the learner's own
test modules in another child. Nothing under tests/ reaches the given net's run, so N1 no longer compares parsed
code or looks for attribute writes; it keeps only what tells a learner that the run is not the net they see:
- every given file (tests/__init__.py, tests/test_quote_characterization.py, tests/golden.py, tests/golden/*.json)
  is present and byte-identical to the starter;
- no file of the learner's under tests/ takes a given module's import path (tests/golden/__init__.py, any .py under
  tests/golden/ or tests/test_quote_characterization/), so the learner's own run imports the same given modules as
  the given run. Own tests go in new files.
"""

from __future__ import annotations

from pathlib import Path

NET_FILE = "tests/test_quote_characterization.py"
GOLDEN_DIR = "tests/golden"
# Dotted module names of the given Python files, as the tests import them.
GIVEN_MODULES = {"tests/__init__.py": "tests", NET_FILE: "tests.test_quote_characterization",
                 "tests/golden.py": "tests.golden"}
TAG = "(этап 0, N1)"
KEEP_CODE = "выданные файлы сети не меняйте (верните их из стартера), свои тесты пишите в новых файлах"
KEEP_GOLDEN = "эталоны выданной сети не меняйте, свои сохраняйте под другими именами"
OWN_NAMES = "свои модули называйте по-другому"


def given_files(given_dir: Path) -> dict[str, bytes]:
    """Every file of the given net as "tests/<relative path>" -> bytes."""
    return {path.relative_to(given_dir).as_posix(): path.read_bytes()
            for path in sorted((given_dir / "tests").rglob("*")) if path.is_file()}


def module_of(rel: str) -> str:
    """The dotted module a .py file under tests/ is imported as; "" for any other file."""
    if not rel.endswith(".py"):
        return ""
    return rel[:-3].removesuffix("/__init__").replace("/", ".")


def _first_difference(learner: bytes, given: bytes) -> int:
    """The 1-based line of the first byte that differs, so the message points at the edit, not at the file."""
    for index, (a, b) in enumerate(zip(learner, given)):
        if a != b:
            return learner[:index].count(b"\n") + 1
    return min(learner, given, key=len).count(b"\n") + 1


def _changed_given(rel: str, learner: bytes, given: bytes) -> str:
    if rel.endswith(".json"):
        return f"{rel}: выданный эталон изменён; {KEEP_GOLDEN} {TAG}"
    return f"{rel}:{_first_difference(learner, given)}: выданный файл изменён; {KEEP_CODE} {TAG}"


def _missing_given(rel: str) -> str:
    if rel.endswith(".json"):
        return f"нет выданного эталона {rel}; {KEEP_GOLDEN} {TAG}"
    return f"нет выданного файла {rel}; {KEEP_CODE} {TAG}"


def _shadowed(rel: str) -> str:
    """The given file whose module a learner file would replace or hide at import, or ""."""
    module = module_of(rel)
    if not module:
        return ""
    for given_rel, given_module in GIVEN_MODULES.items():
        if given_rel == "tests/__init__.py":
            continue  # every module under tests/ is inside the package; only the package file itself is given
        if module == given_module or module.startswith(given_module + "."):
            return given_rel
    return ""


def given_net_problems(accepted: dict[str, bytes], given_dir: Path) -> list[str]:
    """Every N1 refusal for the T9 bytes of tests/."""
    given = given_files(given_dir)
    problems = []
    for rel, data in given.items():
        if rel not in accepted:
            problems.append(_missing_given(rel))
        elif accepted[rel] != data:
            problems.append(_changed_given(rel, accepted[rel], data))
    for rel in sorted(accepted):
        if rel in given:
            continue
        shadowed = _shadowed(rel)
        if shadowed:
            problems.append(f"{rel}: файл подменяет при импорте выданный {shadowed}; {OWN_NAMES} {TAG}")
    return problems


def own_files(accepted: dict[str, bytes], given_dir: Path) -> dict[str, bytes]:
    """The tests/ files of the learner's own suite: every learner file that is not given, and the given files from
    the pristine copy, so own tests that import the given net or golden.py get exactly what the given run gets."""
    given = given_files(given_dir)
    return {**{rel: data for rel, data in accepted.items() if rel not in given}, **given}


def own_test_modules(accepted: dict[str, bytes], given_dir: Path, prefix: str = "test") -> tuple[str, ...]:
    """Dotted names of the learner's own test modules: files named <prefix>*.py that unittest discovery of tests/
    would find (each directory between tests/ and the file is a package), the given net excluded."""
    given = given_files(given_dir)
    modules = []
    for rel in sorted(accepted):
        parts = rel.split("/")
        if rel in given or not rel.endswith(".py") or not parts[-1].startswith(prefix):
            continue
        packages = ["/".join(parts[:depth]) + "/__init__.py" for depth in range(1, len(parts))]
        if all(package in accepted for package in packages):
            modules.append(module_of(rel))
    return tuple(modules)
