"""Check role-contracts (L2, design #43 revision 6, 5.L2): the three contracts (C1) and output schemas (C2).

Run from the workspace as `python3 -I "$ACADEMY_CHECKS_DIR/verify_contracts.py"`. Exit 0 pass, 1 fail. No
learner code runs: the check reads `pipeline/contracts/<role>.md` and `<role>.schema.json`.

- C1: each contract has the sections "Цель", "Формат вывода", "Границы", each non-empty (form only; the
  rubric grades the meaning).
- C2: each schema is in the course subset (course rule D-S8, the message names the keyword), accepts the
  brief's samples and 30 generated usable outputs, rejects every unusable output generated from the brief's
  rules (field missing; a field of any other JSON type: null, boolean, number, string, array, object, so a
  nullable or union type fails; severity outside the enum, probed with the brief's miss, case and whitespace
  variants of each allowed value, a fresh random string and every `enum`/`const` value the schema itself
  names outside the allowed set; an output that is not an object, null included),
  and differs from the other roles' schemas (4.5 pre-flight).

Expected shapes come only from checks/data/output_shapes.json. `--seed N` reproduces the generated outputs;
a failing run prints its seed on stderr.
"""

from __future__ import annotations

import argparse
import random
import re
import secrets
import sys
from collections.abc import Callable
from pathlib import Path

CHECKS_DIR = Path(__file__).resolve().parent
sys.dont_write_bytecode = True  # the checks directory gets no __pycache__
sys.path.insert(0, str(CHECKS_DIR))

import orchestra_runtime as rt  # noqa: E402

DATA = CHECKS_DIR / "data"
CONTRACTS = Path("pipeline") / "contracts"
ROLES = ("coder", "reviewer", "summarizer")
GENERATED_USABLE = 30
CONTRACT_BYTES_MAX = 256 << 10
HEADING = re.compile(r"^(#{1,6})[ \t]+(.*?)[ \t#]*$")
HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
FENCE = re.compile(r"^(```|~~~)")
STRING_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789 _-./:абвгдеёжзийклмнопрстуфхцчшщыэюя"
MAX_LINE = 5000
MAX_ARRAY = 4

MESSAGE_C1 = "C1: контракт каждой роли называет цель, формат вывода и границы"
MESSAGE_C2_FILE = "C2: схема каждой роли лежит в своём файле и читается как JSON"
MESSAGE_C2_SUBSET = "C2 (правило курса): схема вывода написана в подмножестве JSON Schema из task.md"
MESSAGE_C2_ACCEPT = "C2: схема вывода принимает каждый пригодный вывод из брифа"
MESSAGE_C2_REJECT = "C2: схема вывода отклоняет каждый вывод, который бриф называет непригодным"
MESSAGE_C2_DISTINCT = "C2: схемы ролей различаются"
REJECT_SITUATIONS = {
    "missing": "принят вывод без обязательного поля",
    "type": "принят вывод, где у поля другой тип",
    "enum": "принят вывод со значением вне перечисленных в брифе",
    "root": "принят вывод, который не объект JSON",
}

Shape = dict[str, object]


def contract_sections(text: str) -> dict[str, str]:
    """Section name (casefolded, trailing colon dropped) -> body up to the next heading of the same or a
    higher level. Headings inside code fences do not count."""
    lines = text.splitlines()
    headings: list[tuple[int, int, str]] = []
    in_fence = False
    for index, line in enumerate(lines):
        if FENCE.match(line.strip()):
            in_fence = not in_fence
            continue
        match = None if in_fence else HEADING.match(line)
        if match is not None:
            headings.append((index, len(match.group(1)), match.group(2).strip().rstrip(":").strip().casefold()))
    sections: dict[str, str] = {}
    heading_lines = {index for index, _, _ in headings}
    for position, (index, level, name) in enumerate(headings):
        end = next((later for later, later_level, _ in headings[position + 1:] if later_level <= level), len(lines))
        body = "\n".join(line for number, line in enumerate(lines[index + 1:end], index + 1)
                         if number not in heading_lines)
        sections[name] = sections.get(name, "") + body
    return sections


def has_text(body: str) -> bool:
    return bool(HTML_COMMENT.sub("", body).strip())


def check_contracts(workspace: Path, shapes: Shape) -> list[str]:
    failures = []
    names = rt._str_dict(shapes["roleNames"])
    for role in ROLES:
        path = workspace / CONTRACTS / f"{role}.md"
        try:
            raw = path.read_bytes()[:CONTRACT_BYTES_MAX]
        except OSError:
            failures.append(f"{MESSAGE_C1} (контракта {names[role]} нет)")
            continue
        sections = contract_sections(raw.decode("utf-8", "replace"))
        for section in rt._str_list(shapes["sections"]):
            if not has_text(sections.get(section.casefold(), "")):
                failures.append(f'{MESSAGE_C1} (контракт {names[role]}: раздел "{section}" пуст или его нет)')
    return failures


# ---------------------------------------------------------------------------------------------------------
# Generated outputs
# ---------------------------------------------------------------------------------------------------------


def draw_string(rng: random.Random) -> str:
    return "".join(rng.choice(STRING_ALPHABET) for _ in range(rng.randint(1, 40)))


def draw_value(kind: object, shapes: Shape, rng: random.Random, min_items: int = 0) -> object:
    if kind == "string":
        return draw_string(rng)
    if kind == "integer":
        return rng.randint(1, MAX_LINE)
    if isinstance(kind, dict) and "enum" in kind:
        return rng.choice(rt._list(kind["enum"]))
    if isinstance(kind, dict) and "arrayOf" in kind:
        item = kind["arrayOf"]
        return [draw_value(item, shapes, rng) for _ in range(rng.randint(min_items, MAX_ARRAY))]
    if kind == "finding":
        return draw_object(rt._obj(shapes["finding"]), shapes, rng)
    raise rt.PlatformError(f"output_shapes.json: unknown field kind {kind!r}")


def draw_object(fields: Shape, shapes: Shape, rng: random.Random, min_items: int = 0) -> dict[str, object]:
    return {name: draw_value(kind, shapes, rng, min_items) for name, kind in fields.items()}


def kind_name(kind: object) -> str:
    if isinstance(kind, dict) and "enum" in kind:
        return "enum"
    if isinstance(kind, dict) and "arrayOf" in kind:
        return "array"
    if kind == "finding":
        return "object"
    return str(kind)


def schema_literals(node: object) -> list[object]:
    """Every value listed under an `enum` or given as a `const` anywhere in a schema document."""
    found: list[object] = []
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "enum" and isinstance(value, list):
                found.extend(value)
            elif key == "const":
                found.append(value)
            found.extend(schema_literals(value))
    elif isinstance(node, list):
        for item in node:
            found.extend(schema_literals(item))
    return found


def outside_enum_values(allowed: list[object], document: object, shapes: Shape, rng: random.Random) -> list[object]:
    """Values an enum field must reject (re-run fix round, N2: `["high", "medium", "low", "High"]` passed when
    "critical" was the only probe). The enum must equal the brief's set, and in the course subset a schema can
    accept one extra string only by naming it in `enum` or `const`, or every string by naming none. So the
    probes are the brief's miss, case and whitespace variants of each allowed value, a fresh random string,
    and every literal the schema names that is not allowed."""
    probes: list[object] = list(rt._list(shapes["outsideEnum"]))
    for value in allowed:
        if isinstance(value, str):
            probes.extend((value.upper(), value.title(), f" {value}", f"{value} "))
    probes.append("x-" + draw_string(rng))
    probes.extend(schema_literals(document))
    unique: list[object] = []
    for probe in probes:
        is_allowed = any(rt.json_equal(probe, value) for value in allowed)
        if not is_allowed and not any(rt.json_equal(probe, seen) for seen in unique):
            unique.append(probe)
    return unique


def mutations(fields: Shape, base: dict[str, object], shapes: Shape, outside: Callable[[list[object]], list[object]]
              ) -> list[tuple[str, object]]:
    """Every unusable variant of `base`: each field missing, each field replaced by a value of every other JSON
    type (`wrongTypeValues`), each enum miss from `outside(allowed)`, recursively into the first element of
    every array. Returns (situation key, variant)."""
    wrong = rt._obj(shapes["wrongTypeValues"])
    variants: list[tuple[str, object]] = []
    for name, kind in fields.items():
        variants.append(("missing", {k: v for k, v in base.items() if k != name}))
        for value in rt._list(wrong[kind_name(kind)]):
            variants.append(("type", {**base, name: value}))
        if isinstance(kind, dict) and "enum" in kind:
            for value in outside(rt._list(kind["enum"])):
                variants.append(("enum", {**base, name: value}))
        if isinstance(kind, dict) and "arrayOf" in kind:
            items = rt._list(base[name])
            item_kind = kind["arrayOf"]
            for value in rt._list(wrong[kind_name(item_kind)]):
                variants.append(("type", {**base, name: [value, *items[1:]]}))
            if item_kind == "finding":
                for situation, inner in mutations(rt._obj(shapes["finding"]), rt._obj(items[0]), shapes, outside):
                    variants.append((situation, {**base, name: [inner, *items[1:]]}))
    return variants


def root_mutations(shapes: Shape) -> list[tuple[str, object]]:
    """The whole output replaced by a value of every other JSON type: null, a string, a number, a boolean,
    an array (student fix round: a schema with root type ["object", "null"] accepted `null`)."""
    return [("root", value) for value in rt._list(rt._obj(shapes["wrongTypeValues"])["object"])]


# ---------------------------------------------------------------------------------------------------------
# C2
# ---------------------------------------------------------------------------------------------------------


def check_schemas(workspace: Path, shapes: Shape, rng: random.Random) -> list[str]:
    names = rt._str_dict(shapes["roleNames"])
    loaded = rt.load_role_schemas(workspace / CONTRACTS, ROLES)
    failures = [f"{MESSAGE_C2_FILE} ({CONTRACTS.as_posix()}/{schema.error})" for schema in loaded if schema.error]
    roles = rt._obj(shapes["roles"])
    samples = rt._obj(shapes["samples"])
    for schema in loaded:
        if schema.schema is None:
            continue
        where = f"схема {names[schema.role]}"
        problems = rt.schema_subset_problems(schema.schema)
        if problems:
            failures.extend(f"{MESSAGE_C2_SUBSET} ({where}: {problem})" for problem in problems)
            continue
        document = rt._obj(schema.schema)
        fields = rt._obj(roles[schema.role])
        if not all(rt.validate_instance(document, sample) for sample in rt._list(samples[schema.role])):
            failures.append(f"{MESSAGE_C2_ACCEPT} ({where}: отклонён пример из брифа)")
        generated = [draw_object(fields, shapes, rng) for _ in range(GENERATED_USABLE)]
        if not all(rt.validate_instance(document, value) for value in generated):
            failures.append(f"{MESSAGE_C2_ACCEPT} ({where}: отклонён пригодный вывод той же формы)")
        base = draw_object(fields, shapes, rng, min_items=1)
        variants = mutations(fields, base, shapes,
                             lambda allowed: outside_enum_values(allowed, document, shapes, rng)) + root_mutations(shapes)
        accepted = {situation for situation, variant in variants if rt.validate_instance(document, variant)}
        failures.extend(f"{MESSAGE_C2_REJECT} ({where}: {REJECT_SITUATIONS[s]})" for s in sorted(accepted))
    failures.extend(f"{MESSAGE_C2_DISTINCT} ({problem})" for problem in rt.schema_preflight(loaded))
    return failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=None)
    seed = parser.parse_args().seed
    seed = secrets.randbits(32) if seed is None else seed
    workspace = Path.cwd()
    shapes = rt.load_json(DATA / "output_shapes.json")
    failures = check_contracts(workspace, shapes) + check_schemas(workspace, shapes, random.Random(seed))
    if failures:
        for failure in failures:
            print(f"не выполнено: {failure}")
        print(f"seed {seed}", file=sys.stderr)
        return 1
    print("пройдено: контракты трёх ролей и их схемы вывода")
    return 0


if __name__ == "__main__":
    sys.exit(main())
