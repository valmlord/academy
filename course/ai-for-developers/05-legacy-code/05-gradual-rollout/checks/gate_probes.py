"""The patches agent-gate shows the learner's gate (design #45, 6.5): 79 probes, 37 to accept, 42 to reject.

Each probe changes a fresh copy of the pristine base; the patch is `git diff --cached --no-renames` of that
copy (with `--binary` for B11). `violated` is the set of rules the patch breaks; a rejecting gate must name one.

Two parts. Fixed probes (15) cover the R1-R3 limits, the R2 path forms, and accept probes that change no existing
code. Twin cells (32, so 64 probes) cover R4 and R5 as a factorial design (threat model, amendment after student
rerun c2): each cell is rendered twice from one seed, once so that the tests stay green (accept) and once so that
they do not (reject). The two patches of a cell share every static feature a gate could read - the refactor form,
whether a new test file comes along and what kind, the bypass route, the place it is bound and how - and differ
only in the value of one constant (or of the expected number, or of the value a shared-state test sets) and in
git's blob hashes. Those values are drawn from ranges of thousands on every run in both twins, so a hunk key that
keeps numbers does not recur across runs, and a key that erases them is the same for both twins. Only running the
tests from before the patch (R4) and the whole patched suite (R5) tells the twins apart.

Every template edits the base by exact text replacement and raises ProbeError when the text is not there, so a
drift of the base shows up as a grader fault, never as a wrong verdict.
"""

from __future__ import annotations

import random
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable


class ProbeError(Exception):
    """The base does not hold the text a template edits, or git failed while rendering a patch."""


@dataclass
class Probe:
    kind: str
    title: str
    violated: frozenset[str]
    render: Callable[[Path, random.Random], None]
    binary: bool = False
    post: Callable[[str, random.Random], str] | None = None
    features: dict[str, str] = field(default_factory=dict, repr=False)
    patch: str = field(default="", repr=False)

    @property
    def must_accept(self) -> bool:
        return not self.violated


WORDS = ("parcel", "zone", "bracket", "tariff", "fee", "label", "spool", "route", "cargo", "depot", "crate")
# Words that sort before "quote": a new test module named with one runs before tests/test_quote_characterization.py,
# so what its setUp, setUpClass or setUpModule binds is in place when the net runs. Every twin test uses them.
EARLY_WORDS = ("bracket", "cargo", "crate", "depot", "fee", "label", "parcel")
TEST_METHODS = (
    "test_zone_one_parcel_with_services_matches_the_golden",
    "test_without_a_declared_value_the_minimum_insurance_fee_is_charged",
    "test_unknown_service_raises",
    "test_parcel_that_ships_on_a_saturday_pays_the_saturday_fee",
    "test_after_the_cutoff_the_parcel_ships_the_next_business_day",
    "test_postcode_of_a_zone_without_tariff_rows_raises",
)
NET = "tests/test_quote_characterization.py"
COMMAND_GOLDEN = "tests/golden/quote_command_output.json"
QUOTE = "shipping/quote.py"
QUOTE_IMPORTS = "from shipping import config, tariffs\n"
R1, R2, R3, R4, R5 = "R1", "R2", "R3", "R4", "R5"


def name(rng: random.Random, prefix: str = "") -> str:
    return f"{prefix}{rng.choice(WORDS)}_{rng.choice(WORDS)}_{rng.randrange(16 ** 4):04x}"


def edit(repo: Path, rel: str, old: str, new: str, count: int = 1) -> None:
    path = repo / rel
    text = path.read_text(encoding="utf-8")
    if text.count(old) != count:
        raise ProbeError(f"{rel}: expected {count} occurrence(s) of {old!r}, found {text.count(old)}")
    path.write_text(text.replace(old, new), encoding="utf-8")


def write(repo: Path, rel: str, text: str) -> None:
    path = repo / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def prose(rng: random.Random, lines: int) -> str:
    return "".join(f"Note {i + 1} on the {rng.choice(WORDS)} {rng.choice(WORDS)}s, kept for the team.\n"
                   for i in range(lines))


def split(total: int, parts: int, rng: random.Random) -> list[int]:
    cuts = sorted(rng.sample(range(1, total), parts - 1))
    return [b - a for a, b in zip([0, *cuts], [*cuts, total])]


# ================================================================== fixed probes: R1-R3 and the R2 forms
def behaviour_change_with_new_expectation(repo: Path, rng: random.Random) -> None:
    if rng.randrange(2):
        fee = rng.choice((2000, 2500, 3500, 4000))
        edit(repo, QUOTE, "minimum_fee_kopecks = 3000", f"minimum_fee_kopecks = {fee}")
        edit(repo, NET, "3000 - 300)", f"{fee} - 300)")
        # The command golden quotes a parcel without a declared value, so it carries the minimum fee too;
        # without this edit the patched suite would fail and the patch would break R5 as well.
        total = 53960 + fee - 3000
        edit(repo, COMMAND_GOLDEN, '"total: 539.60 RUB"', f'"total: {total // 100}.{total % 100:02d} RUB"')
    else:
        fee = rng.choice((15000, 25000, 30000))
        edit(repo, QUOTE, "saturday_fee_kopecks = 20000", f"saturday_fee_kopecks = {fee}")
        edit(repo, NET, 'wednesday["total_kopecks"], 20000)', f'wednesday["total_kopecks"], {fee})')


def delete_test(repo: Path, rng: random.Random) -> None:
    if rng.randrange(2):
        (repo / "tests/test_smoke.py").unlink()
        return
    method = rng.choice(TEST_METHODS)
    text = (repo / NET).read_text(encoding="utf-8")
    found = re.search(rf"\n    def {method}\(self\):\n(?:        .*\n|\n)*?(?=\n    def |\n\n" r"class |\Z)", text)
    if not found:
        raise ProbeError(f"{NET}: no method {method}")
    (repo / NET).write_text(text[:found.start()] + "\n" + text[found.end():], encoding="utf-8")


def skip_test(repo: Path, rng: random.Random) -> None:
    method = rng.choice(TEST_METHODS)
    edit(repo, NET, f"    def {method}(self):\n",
         f'    @unittest.skip("{rng.choice(WORDS)} rule under review")\n    def {method}(self):\n')


def edit_tariffs(repo: Path, rng: random.Random) -> None:
    grams = rng.choice((500, 1000, 2000, 5000, 10000, 20000))
    text = (repo / "data/tariffs.csv").read_text(encoding="utf-8")
    row = re.search(rf"^V5,{grams},(\d+),", text, re.M)
    if not row:
        raise ProbeError(f"data/tariffs.csv: no V5 row for {grams} g")
    price = int(row.group(1)) + rng.randrange(1, 20) * 100
    edit(repo, "data/tariffs.csv", row.group(0), f"V5,{grams},{price},")


def six_files(repo: Path, rng: random.Random) -> None:
    for i in range(6):
        write(repo, f"docs/{name(rng)}_{i}.md", prose(rng, rng.randrange(2, 6)))


def too_many_lines(repo: Path, rng: random.Random) -> None:
    sizes = split(201, rng.randrange(1, 6), rng)
    for i, size in enumerate(sizes):
        write(repo, f"docs/{name(rng)}_{i}.md", prose(rng, size))


def five_files_two_hundred_lines(repo: Path, rng: random.Random) -> None:
    for i, size in enumerate(split(200, 5, rng)):
        write(repo, f"docs/{name(rng)}_{i}.md", prose(rng, size))


def root_unittest_package(repo: Path, rng: random.Random) -> None:
    write(repo, "unittest/__init__.py", "")
    write(repo, "unittest/__main__.py",
          "import sys\n\n"
          f"sys.stderr.write('{'.' * 12}\\n\\n" f"Ran 12 tests in 0.0{rng.randrange(10, 99)}s\\n\\n" "OK\\n')\n"
          "sys.exit(0)\n")


def binary_file(repo: Path, rng: random.Random) -> None:
    payload = b"\x89PNG\r\n\x1a\n\x00\x00" + bytes(rng.randrange(256) for _ in range(rng.randrange(64, 200)))
    path = repo / f"docs/{name(rng)}.png"
    path.write_bytes(payload)


def new_module_with_test(repo: Path, rng: random.Random) -> None:
    module = name(rng)
    factor = rng.randrange(2, 9)
    write(repo, f"shipping/{module}.py",
          '"""Helpers for the warehouse report."""\n\n\n'
          f"def scaled(kopecks):\n    return kopecks * {factor}\n")
    write(repo, f"tests/test_{module}.py",
          "import unittest\n\n"
          f"from shipping import {module}\n\n\n"
          "class ScaledTest(unittest.TestCase):\n"
          "    def test_scaled_multiplies_the_amount(self):\n"
          f"        self.assertEqual({module}.scaled(7), {7 * factor})\n")


def readme_and_docs(repo: Path, rng: random.Random) -> None:
    edit(repo, "README.md", "## Configuration\n",
         "## Configuration\n\n"
         f"Ask the {rng.choice(WORDS)} team before changing the settings below.\n")
    write(repo, f"docs/{name(rng)}.md", prose(rng, rng.randrange(3, 12)))


def new_golden(repo: Path, rng: random.Random) -> None:
    golden = name(rng)
    kopecks = rng.randrange(100, 1000000)
    expected = str((kopecks + 49) // 100)
    write(repo, f"tests/golden/{golden}.json", f'{{\n  "rubles": "{expected}"\n}}\n')
    write(repo, f"tests/test_{golden}.py",
          "import unittest\n\n"
          "from shipping import manifest\n"
          "from tests import golden\n\n\n"
          "class RublesGoldenTest(unittest.TestCase):\n"
          "    def test_rubles_match_the_golden(self):\n"
          f'        golden.verify(self, "{golden}", {{"rubles": manifest.format_rubles({kopecks})}})\n')


def tests_notes(repo: Path, rng: random.Random) -> None:
    write(repo, "docs/tests-notes.md", "# Notes on the tests\n\n" + prose(rng, rng.randrange(3, 15)))


def break_context(patch: str, rng: random.Random) -> str:
    """A hunk whose context no longer matches the file: git apply --check exits 1."""
    lines = patch.split("\n")
    context = [i for i, line in enumerate(lines) if line.startswith(" ") and line.strip()]
    if not context:
        raise ProbeError("no context line to break")
    i = rng.choice(context)
    lines[i] = lines[i] + f"  # {rng.choice(WORDS)}"
    return "\n".join(lines)


def corrupt(patch: str, rng: random.Random) -> str:
    """A hunk header that promises more lines than follow: git apply reports a corrupt patch (exit 128)."""
    header = re.search(r"^@@ -(\d+),(\d+) \+(\d+),(\d+) @@", patch, re.M)
    if not header:
        raise ProbeError("no hunk header to corrupt")
    old, new = int(header.group(2)), int(header.group(4))
    extra = rng.randrange(5, 40)
    bad = f"@@ -{header.group(1)},{old + extra} +{header.group(3)},{new + extra} @@"
    return patch[:header.start()] + bad + patch[header.end():]


# ================================================================== refactor forms (the static shape of a hunk)
# Each form keeps behaviour on every input. In a twin cell it comes with a numeric device (below), which decides.
def refactor(repo: Path, rng: random.Random, variant: int | None = None) -> None:
    """G1: a rename, a helper extraction or a comment."""
    variant = rng.randrange(5) if variant is None else variant
    if variant == 0:
        new = name(rng, "services_")
        edit(repo, QUOTE, "    amt = _services_price(services)\n    subtotal = base + amt\n",
             f"    {new} = _services_price(services)\n    subtotal = base + {new}\n")
    elif variant == 1:
        helper = name(rng, "_subtotal_")
        edit(repo, QUOTE, "    subtotal = base + amt\n", f"    subtotal = {helper}(base, amt)\n")
        with open(repo / QUOTE, "a", encoding="utf-8") as out:
            out.write("\n\n"
                      f"def {helper}(bracket_kopecks, services_kopecks):\n"
                      "    return bracket_kopecks + services_kopecks\n")
    elif variant == 2:
        edit(repo, QUOTE, "fees_kopecks", name(rng, "fees_"), count=4)
    elif variant == 3:
        edit(repo, "shipping/manifest.py", "labels_of_day", name(rng, "labels_"), count=3)
    else:
        edit(repo, "shipping/tariffs.py", "    names = []\n", f"    names = []  # {rng.choice(WORDS)} resolvers in table order\n")


def constant_name(rng: random.Random) -> str:
    return name(rng).upper() + "_KOPECKS"


def add_constants(repo: Path, constants: list[tuple[str, int]]) -> None:
    lines = "".join(f"{constant} = {value}\n" for constant, value in constants)
    edit(repo, QUOTE, QUOTE_IMPORTS, QUOTE_IMPORTS + "\n" + lines)


def constant_fragile(repo: Path, rng: random.Random) -> None:
    constant = constant_name(rng)
    edit(repo, QUOTE, '        "FRAGILE": 9000,\n', f'        "FRAGILE": {constant},\n')
    add_constants(repo, [(constant, 9000)])


def constant_minimum_fee(repo: Path, rng: random.Random) -> None:
    constant = constant_name(rng)
    edit(repo, QUOTE, "    minimum_fee_kopecks = 3000\n", f"    minimum_fee_kopecks = {constant}\n")
    add_constants(repo, [(constant, 3000)])


def constant_saturday_fee(repo: Path, rng: random.Random) -> None:
    constant = constant_name(rng)
    edit(repo, QUOTE, "    saturday_fee_kopecks = 20000\n", f"    saturday_fee_kopecks = {constant}\n")
    add_constants(repo, [(constant, 20000)])


def constant_insurance_rate(repo: Path, rng: random.Random) -> None:
    per, base = name(rng).upper() + "_PER", name(rng).upper() + "_BASE"
    edit(repo, QUOTE, "    return round(declared_value_kopecks * 3 / 1000)\n",
         f"    return round(declared_value_kopecks * {per} / {base})\n")
    add_constants(repo, [(per, 3), (base, 1000)])


def constant_percent(repo: Path, rng: random.Random) -> None:
    constant = name(rng).upper() + "_PERCENT_BASE"
    edit(repo, QUOTE, "    fuel = subtotal * config.FUEL_PERCENT // 100\n",
         f"    fuel = subtotal * config.FUEL_PERCENT // {constant}\n")
    add_constants(repo, [(constant, 100)])


NUMBER_TO_CONSTANT_FORMS = (constant_fragile, constant_minimum_fee, constant_saturday_fee, constant_insurance_rate,
                            constant_percent)
RAISE_SITES = (
    ("            ", 'f"unknown service {code!r}; known services: {known}"'),
    ("        ", 'f"postcode {postcode}: zone {zone} has no rows in the tariff table"'),
    ("    ", 'f"no bracket of zone {zone} takes {weight_grams} g; the heaviest has max_grams {heaviest}"'),
    ("        ", 'f"declared value must not be negative, got {declared_value_kopecks}"'),
    ("        ", 'f"postcode must be six digits, got {postcode!r}"'),
)
EQUIVALENT_CONDITION_FORMS = (
    ('        if weight_grams >= row["max_grams"]:\n            continue\n        return row["price_kopecks"]\n',
     '        if weight_grams < row["max_grams"]:\n            return row["price_kopecks"]\n'),
    ('        if weight_grams >= row["max_grams"]:\n', '        if row["max_grams"] <= weight_grams:\n'),
    ("    if now.hour >= config.CUTOFF_HOUR:\n", "    if config.CUTOFF_HOUR <= now.hour:\n"),
    ("    if now.hour >= config.CUTOFF_HOUR:\n" "        return _next_business_day(now.date())\n" "    return now.date()\n",
     "    if now.hour < config.CUTOFF_HOUR:\n" "        return now.date()\n" "    return _next_business_day(now.date())\n"),
)
INLINED_VARIABLE_FORMS = (
    (("    amt = _services_price(services)\n    subtotal = base + amt\n",
      "    subtotal = base + _services_price(services)\n"),),
    (("    insurance = _insurance(declared_value_kopecks)\n", ""),
     ("    total = subtotal + fuel + insurance + _saturday_surcharge(ship_date)\n",
      "    total = subtotal + fuel + _insurance(declared_value_kopecks) + _saturday_surcharge(ship_date)\n")),
)
RESULT_KEYS = ("postcode", "weight_grams", "services", "declared_value_kopecks")


def restructured_raise(repo: Path, rng: random.Random, variant: int) -> None:
    """G10: a `raise ValueError(<message>)` line becomes two lines with the same message."""
    indent, message = RAISE_SITES[variant // 2]
    variable = name(rng, "_")
    if variant % 2:
        new = f"{indent}{variable} = {message}\n{indent}raise ValueError({variable})\n"
    else:
        new = f"{indent}{variable} = ValueError({message})\n{indent}raise {variable}\n"
    edit(repo, QUOTE, f"{indent}raise ValueError({message})\n", new)


def neutral_string_change(repo: Path, rng: random.Random, variant: int) -> None:
    """G13: string literals change where behaviour does not read them: docstrings, quote style."""
    if variant == 0:
        edit(repo, QUOTE, '    """Quote one parcel.\n', f'    """Price one parcel for the {rng.choice(WORDS)} desk.\n')
    elif variant == 1:
        edit(repo, QUOTE, '"""Price a parcel and decide the day it ships."""\n',
             f'"""Parcel prices and ship dates for the {rng.choice(WORDS)} desk."""\n')
    elif variant == 2:
        key = rng.choice(RESULT_KEYS)
        edit(repo, QUOTE, f'        "{key}": ', f"        '{key}': ")
    else:
        edit(repo, QUOTE, '            known = ", ".join(sorted(fees_kopecks))\n',
             "            known = ', '.join(sorted(fees_kopecks))\n")


FORMS = ("G1", "G9", "G10", "G11", "G12", "G13")
FORM_VARIANTS = {"G1": 5, "G9": len(NUMBER_TO_CONSTANT_FORMS), "G10": 2 * len(RAISE_SITES),
                 "G11": len(EQUIVALENT_CONDITION_FORMS), "G12": len(INLINED_VARIABLE_FORMS), "G13": 4}
FORM_TITLES = {
    "G1": "переименование, вынос в функцию или комментарий",
    "G9": "число вынесено в именованную константу",
    "G10": "raise записан иначе, сообщение то же",
    "G11": "условие записано другим сравнением с тем же смыслом",
    "G12": "временная переменная встроена в выражение",
    "G13": "изменены строки, которые поведение не читает",
}


def render_form(repo: Path, rng: random.Random, form: str, variant: int) -> None:
    if form == "G1":
        refactor(repo, rng, variant)
    elif form == "G9":
        NUMBER_TO_CONSTANT_FORMS[variant](repo, rng)
    elif form == "G10":
        restructured_raise(repo, rng, variant)
    elif form == "G11":
        edit(repo, QUOTE, *EQUIVALENT_CONDITION_FORMS[variant])
    elif form == "G12":
        for old, new in INLINED_VARIABLE_FORMS[variant]:
            edit(repo, QUOTE, old, new)
    else:
        neutral_string_change(repo, rng, variant)


# ================================================================== numeric devices: what decides a twin
# A device rewrites one number of shipping/quote.py through module constants with fresh values. In the accept twin
# the constants give the old value back (a refactor); in the reject twin one constant is off, and the base net
# catches that. Both twins draw the same values in the same order, so their patches differ only in that constant.
@dataclass(frozen=True)
class Device:
    label: str
    old: str
    helper: str | None  # the global-free helper of shipping/quote.py that holds the line, or None
    apply: Callable[[Path, random.Random, bool], None]


def sum_device(old: str, literal: int) -> Callable[[Path, random.Random, bool], None]:
    """literal becomes `A + B`; A + B == literal in the accept twin."""
    def apply(repo: Path, rng: random.Random, keep: bool) -> None:
        first, second = constant_name(rng), constant_name(rng)
        part = rng.randrange(1, literal // 2)
        shift = rng.choice((-1, 1)) * rng.randrange(1, literal // 2 - 1)
        edit(repo, QUOTE, old, old.replace(str(literal), f"{first} + {second}"))
        add_constants(repo, [(first, part), (second, literal - part + (0 if keep else shift))])
    return apply


def ratio_device(repo: Path, rng: random.Random, keep: bool) -> None:
    """`* 3 / 1000` becomes `* A / B` with A / B == 3 / 1000; both quotients round the same rational number."""
    per, base = name(rng).upper() + "_PER", name(rng).upper() + "_BASE"
    scale = rng.randrange(2, 1000)
    extra = rng.randrange(scale, 3 * scale + 1)
    edit(repo, QUOTE, "    return round(declared_value_kopecks * 3 / 1000)\n",
         f"    return round(declared_value_kopecks * {per} / {base})\n")
    add_constants(repo, [(per, 3 * scale + (0 if keep else extra)), (base, 1000 * scale)])


def length_device(repo: Path, rng: random.Random, keep: bool) -> None:
    """`len(postcode) != 6` becomes `!= A - B` with A - B == 6."""
    first, second = name(rng).upper() + "_DIGITS", name(rng).upper() + "_OFFSET"
    offset = rng.randrange(1, 10000)
    error = rng.choice((-3, -2, -1, 1, 2, 3))
    edit(repo, QUOTE, "len(postcode) != 6", f"len(postcode) != {first} - {second}")
    add_constants(repo, [(first, offset + 6 + (0 if keep else error)), (second, offset)])


def weekday_device(repo: Path, rng: random.Random, keep: bool) -> None:
    """`weekday() == 5` becomes `(weekday() + A) % 7 == B` with B == (5 + A) % 7."""
    first, second = name(rng).upper() + "_SHIFT", name(rng).upper() + "_DAY"
    shift = rng.randrange(1, 10000)
    error = rng.randrange(1, 7)
    edit(repo, QUOTE, "    if ship_date.weekday() == 5:\n", f"    if (ship_date.weekday() + {first}) % 7 == {second}:\n")
    add_constants(repo, [(first, shift), (second, (5 + shift + (0 if keep else error)) % 7)])


def bracket_device(repo: Path, rng: random.Random, keep: bool) -> None:
    """`weight_grams >= max_grams` becomes `weight_grams > max_grams - (A - B)` with A - B == 1 (integer grams).

    The net pins prices absolutely only at 1200 g (zone 1 and the command) and 3200 g; at 700 g it pins differences.
    So the reject twin lowers the bound by 800 g or more (1200 g leaves the 2000 g bracket) or raises it by 300 g or
    more (1200 g stays in the 1000 g bracket).
    """
    first, second = name(rng).upper() + "_GRAMS", name(rng).upper() + "_MARGIN"
    # The margin exceeds the largest error, so both twins write positive constants and differ only in digits.
    margin = rng.randrange(3001, 13000)
    error = rng.randrange(800, 3001) if rng.randrange(2) else -rng.randrange(300, 3001)
    edit(repo, QUOTE, '        if weight_grams >= row["max_grams"]:\n',
         f'        if weight_grams > row["max_grams"] - ({first} - {second}):\n')
    add_constants(repo, [(first, margin + 1 + (0 if keep else error)), (second, margin)])


def percent_device(repo: Path, rng: random.Random, keep: bool) -> None:
    """`// 100` of the fuel line becomes `// (A + B)` with A + B == 100."""
    first, second = name(rng).upper() + "_PERCENT", name(rng).upper() + "_REST"
    part = rng.randrange(1, 40)
    error = rng.choice((-1, 1)) * rng.randrange(5, 61)
    edit(repo, QUOTE, "    fuel = subtotal * config.FUEL_PERCENT // 100\n",
         f"    fuel = subtotal * config.FUEL_PERCENT // ({first} + {second})\n")
    add_constants(repo, [(first, part), (second, 100 - part + (0 if keep else error))])


def fee_line(code: str, literal: int) -> str:
    return f'        "{code}": {literal},\n'


DEVICES = (
    Device("sum: FRAGILE fee", fee_line("FRAGILE", 9000), "_services_price", sum_device(fee_line("FRAGILE", 9000), 9000)),
    Device("sum: SIGNATURE fee", fee_line("SIGNATURE", 4500), "_services_price",
           sum_device(fee_line("SIGNATURE", 4500), 4500)),
    Device("sum: SMS fee", fee_line("SMS", 1500), "_services_price", sum_device(fee_line("SMS", 1500), 1500)),
    Device("sum: minimum insurance fee", "    minimum_fee_kopecks = 3000\n", "_insurance",
           sum_device("    minimum_fee_kopecks = 3000\n", 3000)),
    Device("sum: Saturday fee", "    saturday_fee_kopecks = 20000\n", "_saturday_surcharge",
           sum_device("    saturday_fee_kopecks = 20000\n", 20000)),
    Device("ratio: insurance rate", "    return round(declared_value_kopecks * 3 / 1000)\n", "_insurance", ratio_device),
    Device("difference: postcode length", "len(postcode) != 6", "_check_parcel", length_device),
    Device("modulo: Saturday check", "    if ship_date.weekday() == 5:\n", "_saturday_surcharge", weekday_device),
    Device("difference: bracket bound", '        if weight_grams >= row["max_grams"]:\n', "_bracket_price", bracket_device),
    Device("sum: fuel percent base", "    fuel = subtotal * config.FUEL_PERCENT // 100\n", None, percent_device),
)


# ================================================================== new test files of the twin cells
def test_path(rng: random.Random) -> str:
    return f"tests/test_{rng.choice(EARLY_WORDS)}_{rng.choice(WORDS)}_{rng.randrange(16 ** 4):04x}.py"


def rubles_method(kopecks: int, expected: str) -> str:
    return ("    def test_rubles_round_half_down(self):\n"
            f'        self.assertEqual(manifest.format_rubles({kopecks}), "{expected}")\n')


def honest_test(repo: Path, rng: random.Random, kind: str) -> None:
    """A new test that passes on the base and on every accept twin, and hides nothing."""
    path = test_path(rng)
    kopecks = rng.randrange(100, 1000000)
    expected = str((kopecks + 49) // 100)
    if kind == "rubles":
        write(repo, path, "import unittest\n\n"
                          "from shipping import manifest\n\n\n"
                          "class RublesTest(unittest.TestCase):\n" + rubles_method(kopecks, expected))
    elif kind == "max diff at import":
        write(repo, path, "import unittest\n\n"
                          "from shipping import manifest\n\n"
                          "unittest.TestCase.maxDiff = None\n\n\n"
                          "class RublesTest(unittest.TestCase):\n" + rubles_method(kopecks, expected))
    elif kind == "golden":
        golden = name(rng)
        write(repo, f"tests/golden/{golden}.json", f'{{\n  "rubles": "{expected}"\n}}\n')
        write(repo, path, "import unittest\n\n"
                          "from shipping import manifest\n"
                          "from tests import golden\n\n\n"
                          "class RublesGoldenTest(unittest.TestCase):\n"
                          "    def test_rubles_match_the_golden(self):\n"
                          f'        golden.verify(self, "{golden}", {{"rubles": manifest.format_rubles({kopecks})}})\n')
    else:
        hour = rng.randrange(0, 15)
        day = rng.choice((2, 3, 4, 5))  # Monday to Thursday, 2026-03; none is a holiday, the next day neither
        write(repo, path,
              "import unittest\n"
              "from datetime import datetime\n"
              "from unittest import mock\n\n"
              "from shipping import quote\n\n\n"
              "class FrozenDatetime(datetime):\n"
              "    @classmethod\n"
              "    def now(cls, tz=None):\n"
              f"        return cls(2026, 3, {day}, {hour}, 30)\n\n\n"
              "class ShipDateTest(unittest.TestCase):\n"
              "    def setUp(self):\n"
              '        patcher = mock.patch.object(quote, "datetime", FrozenDatetime)\n'
              "        patcher.start()\n"
              "        self.addCleanup(patcher.stop)\n\n"
              "    def test_before_the_cutoff_the_parcel_ships_the_same_day(self):\n"
              '        result = quote.quote_parcel(700, "101000", [], None)\n\n'
              f'        self.assertEqual(result["ship_date"], "2026-03-{day:02d}")\n')


HONEST_KINDS = ("rubles", "max diff at import", "golden", "clock frozen in setUp")
ROUTES = ("TestCase.run", "TestResult", "shipping.quote helper")
PLACES = ("module level", "setUpModule", "setUpClass", "setUp")
BINDERS = ("assignment", "setattr", "mock.patch.object(...).start()")
VALUES = ("def", "lambda")


def bind(binder: str, target: str, attribute: str, value: str) -> str:
    if binder == "assignment":
        return f"{target}.{attribute} = {value}\n"
    if binder == "setattr":
        return f'setattr({target}, "{attribute}", {value})\n'
    return f'mock.patch.object({target}, "{attribute}", {value}).start()\n'


def place_statements(place: str, statements: str) -> tuple[str, str]:
    """(module-level code, class-body code) that run statements at place."""
    if place == "module level":
        return statements, ""
    body = "".join(f"    {line}\n" for line in statements.splitlines())
    if place == "setUpModule":
        return "def setUpModule():\n" + body, ""
    nested = "".join(f"    {line}\n" for line in body.splitlines())
    if place == "setUpClass":
        return "", "    @classmethod\n    def setUpClass(cls):\n" + nested + "\n"
    return "", "    def setUp(self):\n" + nested + "\n"


def helper_source(original: str, helper: str, copy: str) -> str:
    found = re.search(rf"^def {helper}\(.*?(?=^def |\Z)", original, re.M | re.S)
    if not found:
        raise ProbeError(f"{QUOTE}: no function {helper}")
    return found.group(0).replace(f"def {helper}(", f"def {copy}(", 1).rstrip() + "\n"


def runner_test(repo: Path, rng: random.Random, cell: Cell, helper: str | None, original: str) -> None:
    """A new test that rebinds TestCase.run, TestResult's failure hooks or a quote helper at cell.place.

    As a bypass the binding hides every failure (or puts the pre-patch helper back), so the patched suite passes
    whatever the shipping hunk does. As a wrapper it calls the saved original and hides nothing.
    """
    hook, saved = name(rng, "_hook_"), name(rng, "_saved_")
    imports = ["import unittest"]
    if cell.binder.startswith("mock"):
        imports.append("from unittest import mock")
    defs = ""
    if cell.route == "TestCase.run":
        target = rng.choice(("unittest.TestCase", "unittest.case.TestCase"))
        attributes = ("run",)
        if cell.wrapper:
            defs += f"{saved} = {target}.run\n\n\n"
            body, inline = f"    return {saved}(self, result)\n", f"lambda self, result=None: {saved}(self, result)"
        else:
            body = "    result.startTest(self)\n    result.addSuccess(self)\n    result.stopTest(self)\n    return result\n"
            inline = "lambda self, result=None: (result.startTest(self), result.addSuccess(self), result.stopTest(self), result)[-1]"
        signature = "(self, result=None)"
    elif cell.route == "TestResult":
        target = rng.choice(("unittest.TestResult", "unittest.result.TestResult"))
        if cell.wrapper:
            attributes = ("addFailure",)
            defs += f"{saved} = {target}.addFailure\n\n\n"
            body, inline = f"    return {saved}(self, test, err)\n", f"lambda self, test, err: {saved}(self, test, err)"
        else:
            attributes = ("addFailure", "addError")
            body, inline = "    return None\n", "lambda self, test, err: None"
        signature = "(self, test, err)"
    else:
        if helper is None:
            raise ProbeError("a shipping.quote helper route needs a device inside a helper")
        target, attributes, signature = "quote", (helper,), "(*args)"
        if cell.wrapper:
            defs += f"{saved} = quote.{helper}\n\n\n"
            body, inline = f"    return {saved}(*args)\n", f"lambda *args: {saved}(*args)"
        else:
            copy = name(rng, "_kept_")
            defs += helper_source(original, helper, copy) + "\n\n"
            body, inline = f"    return {copy}(*args)\n", f"lambda *args: {copy}(*args)"
    if target.startswith("unittest.case"):
        imports.append("import unittest.case")
    elif target.startswith("unittest.result"):
        imports.append("import unittest.result")
    if cell.value == "def":
        defs += f"def {hook}{signature}:\n{body}\n\n"
        value = hook
    else:
        value = inline
    statements = "".join(bind(cell.binder, target, attribute, value) for attribute in attributes)
    module_code, class_code = place_statements(cell.place, statements)
    kopecks = rng.randrange(100, 1000000)
    shipping = "from shipping import manifest, quote\n" if target == "quote" else "from shipping import manifest\n"
    write(repo, test_path(rng),
          "\n".join(imports) + "\n\n" + shipping + "\n\n" + defs + (module_code + "\n\n" if module_code else "")
          + "class RublesTest(unittest.TestCase):\n" + class_code + rubles_method(kopecks, str((kopecks + 49) // 100)))


# A new test that passes alone and, run together with the existing tests, changes state they read. The accept twin
# sets the same attribute at the same place to the value it already has.
SHARED_STATE_TARGETS = ("config.FUEL_PERCENT", "config.CUTOFF_HOUR", "golden.GOLDEN_DIR", "tariffs._TABLE")


def shared_state_value(rng: random.Random, target: str, keep: bool) -> tuple[str, str, str]:
    """(import line, object, value expression) for target; the value is the current one in the accept twin."""
    if target == "config.FUEL_PERCENT":
        offset, error = rng.randrange(1, 10000), rng.choice((-1, 1)) * rng.randrange(1, 11)
        return "from shipping import config, manifest\n", "config", f"{offset + 12 + (0 if keep else error)} - {offset}"
    if target == "config.CUTOFF_HOUR":
        # The net quotes at 09:00, 10:00 and 17:30: a cut-off at 9 or earlier, or at 18 or later, moves a ship date.
        offset, hour = rng.randrange(1, 10000), rng.choice((*range(0, 10), *range(18, 24)))
        return "from shipping import config, manifest\n", "config", f"{offset + (15 if keep else hour)} - {offset}"
    if target == "golden.GOLDEN_DIR":
        directory = name(rng)
        return ("from shipping import manifest\n" "from tests import golden\n", "golden",
                f'golden.GOLDEN_DIR.parent / "{"golden" if keep else directory}"')
    return "from shipping import manifest, tariffs\n", "tariffs", "None" if keep else "{}"


def shared_state_test(repo: Path, rng: random.Random, cell: Cell, keep: bool) -> None:
    shipping, obj, value = shared_state_value(rng, cell.target, keep)
    statement = bind(cell.binder, obj, cell.target.split(".")[1], value)
    module_code, class_code = place_statements(cell.place, statement)
    kopecks = rng.randrange(100, 1000000)
    write(repo, test_path(rng),
          "import unittest\n\n" + shipping + "\n\n" + (module_code + "\n\n" if module_code else "")
          + "class RublesTest(unittest.TestCase):\n" + class_code + rubles_method(kopecks, str((kopecks + 49) // 100)))


def failing_test(repo: Path, rng: random.Random, keep: bool) -> None:
    kopecks, error = rng.randrange(100, 1000000), rng.randrange(1, 10)
    expected = (kopecks + 49) // 100 + (0 if keep else error)
    write(repo, test_path(rng), "import unittest\n\n"
                                "from shipping import manifest\n\n\n"
                                "class RublesTest(unittest.TestCase):\n" + rubles_method(kopecks, str(expected)))


# ================================================================== twin cells
ROUTE_TITLES = {"TestCase.run": "подменяет TestCase.run", "TestResult": "глушит ошибки в TestResult",
                "shipping.quote helper": "возвращает исходную функцию в shipping.quote"}
WRAPPED_TITLES = {"TestCase.run": "TestCase.run", "TestResult": "TestResult.addFailure",
                  "shipping.quote helper": "функцию shipping.quote"}
PLACE_TITLES = {"module level": "при импорте", "setUpModule": "в setUpModule", "setUpClass": "в setUpClass",
                "setUp": "в setUp"}
SHARED_STATE_TITLES = {
    "config.FUEL_PERCENT": ("ставит config.FUEL_PERCENT в прежнее значение", "меняет config.FUEL_PERCENT"),
    "config.CUTOFF_HOUR": ("ставит config.CUTOFF_HOUR в прежнее значение", "меняет config.CUTOFF_HOUR"),
    "golden.GOLDEN_DIR": ("ставит golden.GOLDEN_DIR в прежнее значение", "меняет golden.GOLDEN_DIR"),
    "tariffs._TABLE": ("сбрасывает кэш tariffs._TABLE", "кладёт в кэш tariffs._TABLE пустую таблицу"),
}


@dataclass
class Cell:
    """One factorial cell: the static features both twins share, and the seed both render from."""
    family: str  # "form", "runner", "shared state", "failing test"
    form: str
    variant: int
    test: str  # "none", one of HONEST_KINDS, "runner", "shared state", "failing"
    seed: int
    route: str = ""
    place: str = ""
    binder: str = ""
    value: str = ""
    wrapper: bool = False
    target: str = ""
    devices: tuple[Device, ...] = ()
    # Shared by both twins' Probe.features; render adds the device it picked.
    shared: dict[str, str] = field(default_factory=dict)

    def features(self) -> dict[str, str]:
        found = self.shared
        found |= {"family": self.family, "refactor form": self.form, "new test": self.test,
                 "refactor form x new test": f"{self.form} x {'no new test' if self.test == 'none' else 'new test'}"}
        if self.family == "runner":
            kind = "wrapper" if self.wrapper else "bypass"
            found.update({"runner route": f"{kind}: {self.route}", "binding place": f"{kind}: {self.place}",
                          "binding": f"{kind}: {self.binder}", "bound value": f"{kind}: {self.value}"})
        if self.family == "shared state":
            found.update({"shared-state target": self.target, "binding place": f"shared state: {self.place}"})
        return found

    def render(self, repo: Path, keep: bool) -> None:
        rng = random.Random(self.seed)
        original = (repo / QUOTE).read_text(encoding="utf-8")
        render_form(repo, rng, self.form, self.variant)
        device = self.pick_device(repo)
        # The shipping hunk carries the twin's polarity only where the test is not what breaks the suite.
        device.apply(repo, rng, keep or self.family in ("shared state", "failing test"))
        self.shared["numeric device"] = device.label
        if self.family == "form" and self.test != "none":
            honest_test(repo, rng, self.test)
        elif self.family == "runner":
            runner_test(repo, rng, self, device.helper, original)
        elif self.family == "shared state":
            shared_state_test(repo, rng, self, keep)
        elif self.family == "failing test":
            failing_test(repo, rng, keep)

    def pick_device(self, repo: Path) -> Device:
        """The first device in this cell's order whose line the refactor form left in place (same for both twins)."""
        text = (repo / QUOTE).read_text(encoding="utf-8")
        for device in self.devices:
            if text.count(device.old) == 1:
                return device
        raise ProbeError(f"no device fits refactor form {self.form} variant {self.variant}")

    def titles(self) -> tuple[str, str]:
        if self.family == "form":
            suffix = "" if self.test == "none" else ", и новый проходящий тест"
            form = FORM_TITLES[self.form]
            return (f"рефакторинг: {form}, число через константы с тем же значением{suffix}",
                    f"изменение поведения: {form}, число через константы с другим значением{suffix}")
        if self.family == "runner":
            if self.wrapper:
                what = f"оборачивает {WRAPPED_TITLES[self.route]} и вызывает исходную"
            else:
                what = f"{ROUTE_TITLES[self.route]} {PLACE_TITLES[self.place]}"
            return f"рефакторинг и новый тест, который {what}", f"изменение поведения и новый тест, который {what}"
        if self.family == "shared state":
            same, other = SHARED_STATE_TITLES[self.target]
            place = PLACE_TITLES[self.place]
            return (f"рефакторинг и новый тест, который {same} {place}",
                    f"рефакторинг и новый тест, который проходит один, но {other} {place} и ломает существующий тест")
        return "рефакторинг и новый тест с верным ожиданием", "изменение без смены поведения и новый падающий тест"

    def violated(self) -> frozenset[str]:
        """The rules the reject twin breaks."""
        if self.family == "form" or (self.family == "runner" and self.wrapper):
            return frozenset({R4, R5})
        if self.family == "runner":
            return frozenset({R4})
        return frozenset({R5})

    def probes(self, index: int) -> list[Probe]:
        accept_title, reject_title = self.titles()
        kind = f"T{index:02d}"
        features = self.features()
        return [Probe(f"{kind}+", accept_title, frozenset(), lambda repo, _rng: self.render(repo, True),
                      features=features),
                Probe(f"{kind}-", reject_title, self.violated(), lambda repo, _rng: self.render(repo, False),
                      features=features)]


def any_form(rng: random.Random) -> tuple[str, int]:
    form = rng.choice(FORMS)
    return form, rng.randrange(FORM_VARIANTS[form])


def spread(values: tuple[str, ...], count: int, rng: random.Random) -> list[str]:
    """count values that hold every member of values at least once (when count allows), in random order."""
    drawn = list(values) * (count // len(values)) + rng.sample(values, count % len(values))
    rng.shuffle(drawn)
    return drawn


def cells(rng: random.Random) -> list[Cell]:
    """Every cell of one run: each feature value of every factor occurs in at least one cell."""
    def seed() -> int:
        return rng.getrandbits(64)

    found: list[Cell] = []
    honest = spread(HONEST_KINDS, len(FORMS), rng)
    for form in FORMS:
        found.append(Cell("form", form, rng.randrange(FORM_VARIANTS[form]), "none", seed()))
        found.append(Cell("form", form, rng.randrange(FORM_VARIANTS[form]), honest.pop(), seed()))
    for route in ROUTES:
        # The bypass of each route sits at every place in every run, with every binding and both value forms.
        for place, binder, value in zip(rng.sample(PLACES, len(PLACES)), spread(BINDERS, len(PLACES), rng),
                                        spread(VALUES, len(PLACES), rng)):
            found.append(Cell("runner", *any_form(rng), "runner", seed(), route, place, binder, value))
    for route, place in zip(ROUTES, rng.sample(PLACES, len(ROUTES))):
        found.append(Cell("runner", *any_form(rng), "runner", seed(), route, place, rng.choice(BINDERS),
                          rng.choice(VALUES), wrapper=True))
    for target, place in zip(SHARED_STATE_TARGETS, rng.sample(PLACES, len(PLACES))):
        found.append(Cell("shared state", *any_form(rng), "shared state", seed(), place=place,
                          binder=rng.choice(BINDERS[:2]), target=target))
    found.append(Cell("failing test", *any_form(rng), "failing", seed()))
    order = list(DEVICES)
    rng.shuffle(order)
    for index, cell in enumerate(found):
        allowed = [device for device in order if device.helper or cell.route != "shipping.quote helper"]
        start = index % len(allowed)
        cell.devices = tuple(allowed[start:] + allowed[:start])
    return found


def probes(rng: random.Random) -> list[Probe]:
    """The full set of one run: the fixed probes and both twins of every cell, all run every time."""
    fixed = [
        Probe("G2", "новый модуль с проходящим тестом", frozenset(), new_module_with_test),
        Probe("G3", "правка README и документации", frozenset(), readme_and_docs),
        Probe("G4", "новый эталон в tests/golden/ с тестом", frozenset(), new_golden),
        Probe("G5", "ровно 5 файлов и 200 изменённых строк", frozenset(), five_files_two_hundred_lines),
        Probe("G6", "новый файл docs/tests-notes.md", frozenset(), tests_notes),
        Probe("B2", "изменение поведения вместе с правкой ожидания в существующем тесте", frozenset({R2, R4}),
              behaviour_change_with_new_expectation),
        Probe("B3", "удаление существующего теста", frozenset({R2}), delete_test),
        Probe("B4", "пропуск существующего теста", frozenset({R2}), skip_test),
        Probe("B5", "правка data/tariffs.csv", frozenset({R2}), edit_tariffs),
        Probe("B6a", "6 файлов", frozenset({R3}), six_files),
        Probe("B6b", "201 изменённая строка", frozenset({R3}), too_many_lines),
        Probe("B7a", "патч, который не применяется", frozenset({R1}), refactor, post=break_context),
        Probe("B7b", "испорченный патч", frozenset({R1}), refactor, post=corrupt),
        Probe("B9", "каталог unittest/ в корне", frozenset({R2}), root_unittest_package),
        Probe("B11", "бинарный патч (git diff --binary)", frozenset({R1}), binary_file, binary=True),
    ]
    return fixed + [probe for index, cell in enumerate(cells(rng)) for probe in cell.probes(index)]


def git(repo: Path, arguments: list[str], env: dict[str, str]) -> str:
    done = subprocess.run(["git", "-c", "core.autocrlf=false", "-c", "core.quotepath=false", *arguments], cwd=repo,
                          env=env, stdin=subprocess.DEVNULL, capture_output=True, text=True, errors="surrogateescape",
                          timeout=60)
    if done.returncode != 0:
        raise ProbeError(f"git {' '.join(arguments)} exited {done.returncode}: {done.stderr.strip()[-200:]}")
    return done.stdout


def render(probe: Probe, work: Path, rng: random.Random, env: dict[str, str]) -> str:
    """Change the work copy (a clone of the committed base) and return the patch text."""
    probe.render(work, rng)
    git(work, ["add", "-A"], env)
    flags = ["diff", "--cached", "--no-renames", "--no-color"] + (["--binary"] if probe.binary else [])
    patch = git(work, flags, env)
    if not patch.strip():
        raise ProbeError(f"{probe.kind}: empty patch")
    return probe.post(patch, rng) if probe.post else patch
