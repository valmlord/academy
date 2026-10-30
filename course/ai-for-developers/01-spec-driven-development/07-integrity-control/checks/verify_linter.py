"""Check artifact-linter (L7): the learner's linter on generated roots (design #41, L7, 2.7).

Run from the workspace as `python3 -I "$ACADEMY_CHECKS_DIR/verify_linter.py"`. Roots are built from
`data/linter-base/` with values drawn per run (requirement ids, ADR slugs, test file names, one avoided
word); each root is a near-miss that must stay clean, a root the grammar cannot read (exit 2), or a
root with exactly one planted violation. A violation yields one finding line, except two ADRs sharing a
number: each of the two files breaks "the number is not repeated in another file", so both are named. The linter runs as `python3 -I -B <fresh copy> <root>`, one
process per root, in an order shuffled per run. Messages name the root class and the rule, never the
root contents. `--seed N` reproduces a run; a failing run prints its seed on stderr.
"""

import ctypes
import sys

if sys.platform.startswith("linux"):
    # First statement, as in every grader of this module (design 2.3).
    if ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0) != 0:  # 4 = PR_SET_DUMPABLE
        raise SystemExit("prctl(PR_SET_DUMPABLE) failed")

import os
import random
import secrets
import shutil
import signal
import string
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
BASE = CHECKS_DIR / "data" / "linter-base"
LINTER = Path("scripts/check_artifacts.py")
RUN_TIMEOUT_SEC = 10
SPEC_HEADINGS = ("Problem Statement", "Solution", "User Stories", "Requirements", "Implementation Decisions",
                 "Testing Decisions", "Out of Scope")
CHECK_COMMAND = "`PYTHONPATH=src python3 -m unittest tests.{module}`"


@dataclass
class Task:
    number: int
    title: str
    requirements: list[str]
    status: str = "done"
    extra: list[str] = field(default_factory=list)
    check: str = ""  # the command inside the `Check:` backticks; empty means the default unittest command


@dataclass
class Adr:
    number: int
    status: str | None = "accepted"  # None renders no `Status:` line
    mention: str = ""
    slug: str = ""  # empty means a slug drawn at render time
    title: str = ""  # the first heading; empty means `# ADR-NNNN: <Slug> decision`


@dataclass
class Root:
    """A project root in the exercise grammar, rendered by `write`."""

    rng: random.Random
    avoid_word: str
    requirement_numbers: list[int]
    tasks: list[Task]
    adrs: list[Adr]
    tests: dict[str, list[str]]  # file stem -> method names
    spec_lines: list[str] = field(default_factory=list)  # extra prose lines under Implementation Decisions
    requirement_texts: dict[int, str] = field(default_factory=dict)
    drop: tuple[str, ...] = ()  # relative paths removed after rendering
    extra_files: dict[str, str] = field(default_factory=dict)  # relative path -> text, written last


def _word(rng: random.Random) -> str:
    return "".join(rng.choice(string.ascii_lowercase) for _ in range(7))


def requirement_id(number: int) -> str:
    return f"REQ-{number:02d}"


def label(number: int) -> str:
    return f"req_{number:02d}"


def clean_root(rng: random.Random) -> Root:
    """Four requirements, three tasks (all done), two ADRs, one test per requirement."""
    numbers = sorted(rng.sample(range(11, 99), 4))
    avoid_word = _word(rng)
    tasks = [
        Task(1, "Plan the first reminder", [requirement_id(numbers[0]), requirement_id(numbers[1])]),
        Task(2, "Stop after the final reminder", [requirement_id(numbers[2])]),
        Task(3, "Order the plan", [requirement_id(numbers[3])]),
    ]
    stem = "test_" + _word(rng)
    tests = {stem: [f"test_{label(number)}_{_word(rng)}" for number in numbers]}
    adrs = [Adr(1, mention=""), Adr(2)]
    return Root(rng, avoid_word, numbers, tasks, adrs, tests)


def write(root: Root, directory: Path) -> None:
    shutil.copytree(BASE, directory)
    billing = directory / "docs" / "billing" / "GLOSSARY.md"
    billing.write_text(billing.read_text(encoding="utf-8").replace("{word}", root.avoid_word), encoding="utf-8")
    spec = ["# Spec: payment reminders", ""]
    for heading in SPEC_HEADINGS:
        spec += [f"## {heading}", ""]
        if heading == "User Stories":
            spec += ["1. As the billing team, I want a daily plan of reminders.", ""]
        elif heading == "Requirements":
            for number in root.requirement_numbers:
                text = root.requirement_texts.get(number, f"an invoice is overdue by {number} days THE SYSTEM SHALL plan a reminder")
                spec.append(f"- **{requirement_id(number)}** WHEN {text}.")
            spec.append("")
        elif heading == "Implementation Decisions":
            spec += ["- Reminders are derived from the history (ADR-0001).", *root.spec_lines, ""]
        elif heading == "Out of Scope":
            spec += ["- Sending the reminders.", ""]
        else:
            spec += ["Payment reminders for overdue invoices.", ""]
    (directory / "docs" / "spec.md").write_text("\n".join(spec), encoding="utf-8")
    tasks = ["# Tasks", ""]
    stem = next(iter(root.tests), "test_x")
    for task in root.tasks:
        check = f"`{task.check}`" if task.check else CHECK_COMMAND.format(module=stem)
        tasks += [
            f"## T-{task.number:02d}: {task.title}",
            f"Requirements: {', '.join(task.requirements)}",
            "Blocked by: none",
            f"Check: {check}",
            f"Status: {task.status}",
            *task.extra,
            "",
        ]
    (directory / "docs" / "tasks.md").write_text("\n".join(tasks), encoding="utf-8")
    adr_dir = directory / "docs" / "adr"
    adr_dir.mkdir(parents=True)
    for adr in root.adrs:
        slug = adr.slug or _word(root.rng)
        body = [adr.title or f"# ADR-{adr.number:04d}: {slug.capitalize()} decision", ""]
        if adr.status is not None:
            body += [f"Status: {adr.status}", ""]
        body += ["## Context", "", "Why a decision was needed.", ""]
        if adr.mention:
            body += [adr.mention, ""]
        body += ["## Decision", "", "What we decided.", "", "## Consequences", "", "What follows from it.", ""]
        (adr_dir / f"{adr.number:04d}-{slug}.md").write_text("\n".join(body), encoding="utf-8")
    tests_dir = directory / "tests"
    tests_dir.mkdir()
    (tests_dir / "__init__.py").write_text("", encoding="utf-8")
    for stem_name, names in root.tests.items():
        methods = "".join(f"    def {name}(self) -> None:\n        self.assertTrue(True)\n\n" for name in names)
        (tests_dir / f"{stem_name}.py").write_text(f"import unittest\n\n\nclass T(unittest.TestCase):\n{methods}",
                                                    encoding="utf-8")
    for relative, text in root.extra_files.items():
        (directory / relative).write_text(text, encoding="utf-8")
    for relative in root.drop:
        target = directory / relative
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()


@dataclass(frozen=True)
class Case:
    kind: str  # clean | error | finding
    name: str  # root class, shown in messages
    rule: str = ""
    tokens: tuple[str, ...] = ()  # one finding line per token, in any order


def build_cases(rng: random.Random) -> list[tuple[Case, Root | None]]:
    cases: list[tuple[Case, Root | None]] = []

    def clean(name: str, root: Root) -> None:
        cases.append((Case("clean", name), root))

    def finding(rule: str, name: str, root: Root, *tokens: str) -> None:
        cases.append((Case("finding", name, rule, tokens), root))

    root = clean_root(rng)
    root.requirement_numbers = [1, 10, *root.requirement_numbers[2:]]
    root.tasks[0].requirements = ["REQ-01", "REQ-10"]
    root.tests = {next(iter(root.tests)): [f"test_{label(n)}_{_word(rng)}" for n in root.requirement_numbers]}
    clean("REQ-01 рядом с REQ-10", root)
    root = clean_root(rng)
    root.spec_lines = ["- The billing team reviews the plan every morning."]
    clean("billing при избегаемом bill", root)
    root = clean_root(rng)
    root.requirement_texts[root.requirement_numbers[0]] = "клиент просрочил оплату на 7 дней THE SYSTEM SHALL plan a reminder"
    clean("русское слово клиент в требовании", root)
    root = clean_root(rng)
    root.spec_lines = ["- A reminder carries the clientId of the Customer as given."]
    clean("clientId в тексте", root)
    root = clean_root(rng)
    root.tasks[1].extra = ["Notes: the LedgerAccount of receivables is not touched."]
    clean("LedgerAccount в строке задачи", root)
    root = clean_root(rng)
    root.spec_lines = ["", "```text", "client bill account", "```"]
    clean("избегаемое слово в блоке кода", root)
    root = clean_root(rng)
    root.adrs = [Adr(1), Adr(2, "superseded by ADR-0003"), Adr(3, mention="This replaces ADR-0002.")]
    root.spec_lines = ["- Escalation follows ADR-0003."]
    clean("заменяющий ADR упоминает заменённый", root)
    root = clean_root(rng)
    untested = rng.choice(range(11, 99))
    while untested in root.requirement_numbers:
        untested = rng.choice(range(11, 99))
    root.requirement_numbers.append(untested)
    root.tasks.append(Task(4, "Later work", [requirement_id(untested)], status="todo"))
    clean("задача todo без теста", root)

    root = clean_root(rng)
    root.adrs = [Adr(1), Adr(2, "proposed"), Adr(3, "deprecated")]
    clean("ADR со статусами proposed и deprecated", root)
    root = clean_root(rng)
    root.extra_files = {"docs/adr/README.md": "# ADR-0002: Index of decisions\n\nEvery ADR of the project.\n"}
    clean("файл без номера в docs/adr", root)
    root = clean_root(rng)
    root.adrs = [Adr(1), Adr(2, title="# ADR-0002: Replace the storage of ADR-0001")]
    clean("в заголовке ADR упомянут другой ADR", root)
    root = clean_root(rng)
    root.adrs = [Adr(1), Adr(2, "superseded by ADR-0003"), Adr(3, "superseded by ADR-0004"), Adr(4)]
    clean("цепочка superseded by", root)
    root = clean_root(rng)
    root.adrs = [Adr(1), Adr(2, "deprecated")]
    root.spec_lines = ["", "### Storage (ADR-0001)", "", "```text", "ADR-0002", "```"]
    clean("заголовок с действующим ADR и устаревший ADR в блоке кода", root)
    root = clean_root(rng)
    root.adrs = [Adr(1), Adr(2, "deprecated")]
    root.tasks[1].check = "python3 scripts/escalate.py --adr ADR-0001"
    root.tasks[1].extra = ["```text", "ADR-0002", "```"]
    clean("Check: с действующим ADR", root)

    for name, drop in (("нет docs/spec.md", ("docs/spec.md",)), ("нет GLOSSARY-MAP.md", ("GLOSSARY-MAP.md",)),
                       ("нет связанного файла контекста", ("docs/ledger/GLOSSARY.md",))):
        root = clean_root(rng)
        root.drop = drop
        cases.append((Case("error", name), root))
    cases.append((Case("error", "запуск без аргумента"), None))

    root = clean_root(rng)
    gone = root.requirement_numbers[3]
    root.tasks[2] = Task(3, "Order the plan", [requirement_id(root.requirement_numbers[0])])
    finding("C1", "требование не перечислено в задачах", root, requirement_id(gone))
    root = clean_root(rng)
    gone = root.requirement_numbers[3]
    root.tasks[2] = Task(3, f"Order the plan for {requirement_id(gone)} later", [requirement_id(root.requirement_numbers[0])])
    finding("C1", "требование названо в заголовке задачи, но не в Requirements", root, requirement_id(gone))
    for rule_name, where in (("метка теста", "test"), ("задача", "task")):
        root = clean_root(rng)
        missing = rng.choice([n for n in range(11, 99) if n not in root.requirement_numbers])
        if where == "test":
            stem = next(iter(root.tests))
            root.tests[stem].append(f"test_{label(missing)}_{_word(rng)}")
        else:
            # A todo task, so that the missing requirement's absent test is not also a C3 finding.
            root.tasks[1].requirements.append(requirement_id(missing))
            root.tasks[1].status = "todo"
        finding("C2", f"{rule_name} ссылается на требование, которого нет", root, requirement_id(missing))
    for name, index in (("требование выполненной задачи без теста", 2), ("одно из двух требований задачи без теста", 0)):
        root = clean_root(rng)
        number = root.requirement_numbers[1] if index == 0 else root.requirement_numbers[2]
        stem = next(iter(root.tests))
        root.tests[stem] = [n for n in root.tests[stem] if label(number) not in n]
        finding("C3", name, root, requirement_id(number))
    root = clean_root(rng)
    root.adrs = [Adr(1), Adr(2), Adr(4)]
    finding("C4", "дыра в нумерации ADR", root, "ADR-0003")
    root = clean_root(rng)
    target = rng.choice(range(5, 9))
    root.adrs = [Adr(1), Adr(2, f"superseded by ADR-{target:04d}")]
    finding("C4", "superseded by на несуществующий ADR", root, f"ADR-{target:04d}")
    for name, adr in (("в ADR нет строки Status", Adr(2, None)),
                      ("недопустимый Status в ADR", Adr(2, rng.choice(("approved", "draft", "done")))),
                      ("номер в заголовке не равен номеру файла", Adr(2, title=f"# ADR-{rng.randrange(3, 10):04d}: Late decision")),
                      ("ADR заменяет сам себя", Adr(2, "superseded by ADR-0002"))):
        root = clean_root(rng)
        adr.slug = _word(rng)
        root.adrs = [Adr(1), adr]
        finding("C4", name, root, f"0002-{adr.slug}.md")
    root = clean_root(rng)
    slugs: set[str] = set()
    while len(slugs) < 2:
        slugs.add(_word(rng))
    first, second = sorted(slugs)
    root.adrs = [Adr(1), Adr(2, slug=first), Adr(2, slug=second)]
    finding("C4", "два ADR с одним номером", root, f"0002-{first}.md", f"0002-{second}.md")
    root = clean_root(rng)
    root.adrs = [Adr(1, "superseded by ADR-0002"), Adr(2)]
    finding("C5", "спецификация ссылается на заменённый ADR", root, "ADR-0001")
    root = clean_root(rng)
    root.adrs = [Adr(1), Adr(2, "deprecated")]
    root.tasks[0].extra = ["Notes: see ADR-0002."]
    finding("C5", "задача ссылается на устаревший ADR", root, "ADR-0002")
    root = clean_root(rng)
    root.adrs = [Adr(1), Adr(2, "deprecated")]
    root.spec_lines = ["", "### Escalation (ADR-0002)", "", "Escalation is planned daily."]
    finding("C5", "заголовок спецификации ссылается на устаревший ADR", root, "ADR-0002")
    root = clean_root(rng)
    root.adrs = [Adr(1), Adr(2, "deprecated")]
    root.tasks[2].check = "python3 scripts/escalate.py --adr ADR-0002"
    finding("C5", "строка Check: ссылается на устаревший ADR", root, "ADR-0002")
    root = clean_root(rng)
    word = root.avoid_word
    root.requirement_texts[root.requirement_numbers[1]] = f"по счёту пришли {word}s из отдела продаж THE SYSTEM SHALL plan a reminder"
    finding("C6", "английское слово во множественном числе внутри русского требования", root, f"{word}s")
    root = clean_root(rng)
    stem = next(iter(root.tests))
    root.tests[stem][0] = f"test_{label(root.requirement_numbers[0])}_{root.avoid_word}2"
    finding("C6", "избегаемое слово в имени теста", root, root.avoid_word)
    root = clean_root(rng)
    root.tasks[1].title = f"Stop the {root.avoid_word} after the final reminder"
    finding("C6", "избегаемое слово в названии задачи", root, root.avoid_word)
    return cases


def run_linter(linter: Path, scratch: Path, root_dir: Path | None) -> tuple[int | None, str, str]:
    """One process: a fresh copy of the linter, fresh HOME and TMPDIR, the process group killed after.

    The other `*.py` files of `scripts/` (the starter's `artifact_text.py` helper, or the learner's own
    modules) are copied next to it, so a linter that imports them runs as it does in the workspace.
    """
    run_dir = Path(tempfile.mkdtemp(dir=scratch))
    for sibling in linter.parent.glob("*.py"):
        if sibling.is_file():
            shutil.copy(sibling, run_dir / sibling.name)
    copy = run_dir / "check_artifacts.py"
    shutil.copy(linter, copy)
    python_dir = Path(shutil.which("python3") or sys.executable).parent
    env = {"PATH": f"{python_dir}:/usr/bin:/bin", "HOME": tempfile.mkdtemp(dir=run_dir),
           "TMPDIR": tempfile.mkdtemp(dir=run_dir)}
    command = [sys.executable, "-I", "-B", str(copy)] + ([str(root_dir)] if root_dir is not None else [])
    process = subprocess.Popen(command, cwd=run_dir, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, start_new_session=True)
    try:
        out, err = process.communicate(timeout=RUN_TIMEOUT_SEC)
        code: int | None = process.returncode
    except subprocess.TimeoutExpired:
        out, err, code = b"", b"", None
    finally:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
        process.wait()
    return code, out.decode("utf-8", "replace"), err.decode("utf-8", "replace")


def judge(case: Case, code: int | None, out: str, err: str) -> str:
    if code is None:
        return f"{case.name}: линтер не уложился в {RUN_TIMEOUT_SEC} с"
    if case.kind == "clean":
        if code != 0 or out.strip() or err.strip():
            return f"чистый корень ({case.name}): ожидался exit 0 без вывода, получен exit {code}" + (
                ", есть вывод" if out.strip() or err.strip() else "")
        return ""
    if case.kind == "error":
        if code != 2 or out.strip() or not err.strip():
            return (f"ошибка запуска или разбора ({case.name}): ожидался exit 2, пустой stdout и сообщение в stderr, "
                    f"получен exit {code}")
        return ""
    lines = [line for line in out.splitlines() if line.strip()]
    unmatched = list(lines)
    found = 0
    for token in case.tokens:
        line = next((line for line in unmatched if line.startswith(case.rule + " ") and token in line), None)
        if line is not None:
            unmatched.remove(line)
            found += 1
    if code != 1 or found == 0:
        return f"не найдено нарушение {case.rule} ({case.name}), exit {code}"
    if found < len(case.tokens):
        return f"{case.rule} ({case.name}): ожидалось строк находок {len(case.tokens)}, с нужным токеном найдено {found}"
    if unmatched:
        expected = "одно нарушение" if len(case.tokens) == 1 else f"нарушений {len(case.tokens)}"
        return f"{case.rule} ({case.name}): в корне {expected}, а строк находок {len(lines)}"
    return ""


def main() -> int:
    seed = int(sys.argv[2]) if len(sys.argv) == 3 and sys.argv[1] == "--seed" else secrets.randbits(48)
    if not LINTER.is_file():
        print(f"Не пройдено:\n- {LINTER}: файл не найден")
        return 1
    rng = random.Random(seed)
    cases = build_cases(rng)
    secrets.SystemRandom().shuffle(cases)
    scratch = Path(tempfile.mkdtemp(prefix="linter-"))
    os.chmod(scratch, 0o700)
    problems: list[str] = []
    try:
        for case, root in cases:
            root_dir = None
            if root is not None:
                root_dir = Path(tempfile.mkdtemp(dir=scratch)) / "root"
                write(root, root_dir)
            problem = judge(case, *run_linter(LINTER.resolve(), scratch, root_dir))
            if problem:
                problems.append(problem)
        code, out, err = run_linter(LINTER.resolve(), scratch, Path(".").resolve())
        if code != 0 or out.strip():
            problems.append(f"рабочая папка: ожидался exit 0 без находок, получен exit {code}")
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
    if problems:
        print("Не пройдено:")
        for problem in sorted(problems):
            print(f"- {problem}")
        print(f"seed {seed}", file=sys.stderr)
        return 1
    print("Пройдено: линтер находит каждое из правил C1-C6, молчит на чистых корнях и сообщает об ошибках разбора.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
