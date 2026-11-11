"""The `make ci` gate of module 04 (design #44, 4.L7; reused by 4.L8 visible-change-gate and hidden-change).

One gate run is, in this order:
1. `make -s ci` with no CALENDAR_API_URL must exit 0 (the learner's suite against his own server);
2. one run per variant, in a shuffled order, each against a fresh grader-owned refserver (7.5) whose address
   is CALENDAR_API_URL: the correct server (GREEN_RUNS times) must pass, every mutant must fail. The K1-K7
   cosmetics are drawn for every run by one sampler that never sees the variant (`draw_cosmetics`);
3. seven drift runs without CALENDAR_API_URL, in a shuffled order: (3a) a generated property removed from the
   client must fail, (3b) a contract change without regenerating must fail, (3c) the same kind of change after
   the learner's own `make -s gen` must pass, (3d) a contract change, `make -s gen`, then a property line added
   to the client by hand must fail, (3e) a contract change, `make -s gen`, then a second contract change (a
   client generated from an older contract) must fail, (3f) `string` and `number` swapped in one generated
   property of the client must fail, (3g) one field's type in contract/ swapped for another of the same length
   without regenerating must fail. (3a)-(3e) add or remove whole lines and operations; (3f) and (3g) keep every
   file's line and byte count, every route and every property name, so a drift step that compares only counts or
   names cannot pass both (B7).

Every run gets a fresh full copy of the snapshot with a new git repository holding one commit (the workspace as
it is, not as last committed), CALENDAR_NOW and CALENDAR_BOOKING_DELAY_MS, and at most RUN_TIMEOUT_SEC. A drift
case is planted before that one commit (B6): there is no earlier commit, and every run's commit has the same
message, so git cannot tell which files the case changed; only regenerating the client and comparing it can. The grader's own git commands run as learner children with a fixed identity; no verdict is
read from git or from the learner's output, only from the exit code of `make -s ci` against a known variant.
"""

from __future__ import annotations

import random
import re
import secrets
import shutil
import string
from dataclasses import dataclass, field
from pathlib import Path

import final_runtime as runtime

CI_NOW = "2026-03-01T08:00:00Z"  # design 4.L7: fixed and published (the replay recommendation's now)
DELAY_RANGE_MS = (150, 250)
GREEN_RUNS = 5
RUN_TIMEOUT_SEC = 60
GIT_TIMEOUT_SEC = 60
TAIL = 40
SCHEMA = "frontend/app/api/schema.d.ts"
ENTRY_TSP = "contract/main.tsp"
GRADER_IDENTITY = ("-c", "user.name=Academy grader", "-c", "user.email=grader@academy.invalid", "-c",
                   "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null")
# Never committed: the learner's installed packages and build output (a learner .gitignore may lack them).
EXCLUDED_FROM_COMMIT = ("node_modules/", ".nuxt/", ".output/", "/bin/", "/tsp-output/")
MAX_NAMESPACE_CANDIDATES = 10
# (3g) compiles the contract once per tried field; a contract has dozens of fields, a few tries always find one
# whose new type compiles, and the cap keeps a pathological contract from eating the 1800 s budget.
MAX_TYPE_CANDIDATES = 8

# The behaviour classes a surviving mutant is named by (design 4.L7 failure messages): the engine classes are
# model.py's decision classes; the requirement is the one of the starter's docs/spec.md (L3 D7 rule). Every behaviour
# names the bug, as the L7 task.md table does: it is printed after "make ci прошёл на API с ошибкой:".


@dataclass(frozen=True)
class Variant:
    id: str  # the refserver's variant id ("" is the correct server)
    behaviour: str  # Russian, names the bug, never a position or a cosmetic
    requirement: str


ENGINE_VARIANTS = (
    Variant("gap", "несуществующее местное время (разрыв при переходе на летнее время) читается по смещению после "
            "перевода", "REQ-03 в спецификации стартера"),
    Variant("overlap", "из двух моментов повторяющегося местного времени (переход на зимнее время) берётся второй",
            "REQ-04 в спецификации стартера"),
    Variant("adjacency", "смежные интервалы, которые только касаются, считаются пересекающимися", "REQ-07 в спецификации стартера"),
    Variant("one-side-buffer", "буферы с одной стороны: собственные буферы нового слота не учитываются",
            "REQ-06 в спецификации стартера"),
    Variant("notice-from-day-start", "минимальное уведомление отсчитывается от местной полуночи дня now, а не от текущего "
            "момента", "REQ-08 в спецификации стартера"),
    Variant("window-extra-day", "окно бронирования на день длиннее (bookingWindowDays + 1)", "REQ-09 в спецификации стартера"),
    Variant("override-merged", "окна исключения даты добавляются к недельным, а не заменяют их", "REQ-02 в спецификации стартера"),
    Variant("weekday-utc", "день недели берётся по дате в UTC момента местной полуночи", "REQ-01 в спецификации стартера"),
    Variant("day-step-24h", "следующий день получается прибавлением 24 часов, а не по календарной дате", "REQ-01 в спецификации стартера"),
    Variant("last-slot-dropped", "слот, который кончается ровно в конце окна доступности, отброшен", "REQ-05 в спецификации стартера"),
    Variant("cancelled-blocks", "отменённое бронирование занимает время", "REQ-10 в спецификации стартера"),
    Variant("increment-from-hour", "шаг слотов отсчитывается от начала часа, а не от начала окна", "REQ-05 в спецификации стартера"),
)
API_VARIANTS = (
    Variant("idempotency-ignored", "повтор с тем же Idempotency-Key создаёт новое бронирование вместо повтора ответа",
            "REQ-17 в спецификации стартера"),
    Variant("offsetless-accepted", "метка времени без смещения принимается как местное время вместо 400", "REQ-15 в спецификации стартера"),
    Variant("extra-fields-accepted", "лишние поля в теле запроса принимаются вместо 400", "REQ-15 в спецификации стартера"),
    Variant("text-plain-errors", "ошибки приходят как text/plain, а не application/problem+json", "REQ-14 в спецификации стартера"),
    Variant("conflict-status-swapped", "409 и 422 перепутаны (занятый слот и недоступный слот)", "REQ-16 в спецификации стартера"),
    Variant("racy-store", "двойное бронирование при параллельных запросах", "REQ-18 в спецификации стартера"),
)
V1_RED = ENGINE_VARIANTS + API_VARIANTS
# Design 4.L8: the visible change (contract v2) and the hidden change (contract v3).
V2_RED = (
    Variant("v2-unknown-id-found", "GET /bookings/{bookingId} отвечает 200 на неизвестный id вместо 404 not_found",
            "новое требование о GET /bookings/{bookingId}"),
    Variant("v2-cancelled-as-confirmed", "GET /bookings/{bookingId} показывает отменённое бронирование подтверждённым",
            "новое требование о GET /bookings/{bookingId}"),
)
V3_RED = (
    Variant("v3-limit-all-event-types", "лимит maxBookingsPerDay считает бронирования всех видов встреч хоста, а не только "
            "этого вида встречи", "новое требование о maxBookingsPerDay"),
    Variant("v3-limit-counts-cancelled", "отменённые бронирования считаются в лимит maxBookingsPerDay",
            "новое требование о maxBookingsPerDay"),
    Variant("v3-limit-day-utc", "день лимита maxBookingsPerDay берётся по дате в UTC, а не по местной дате в поясе "
            "расписания", "новое требование о maxBookingsPerDay"),
)
CORRECT = Variant("", "", "")

# K1-K7 of design 4.L7 (closed sets, listed in task.md).
ID_SCHEMES = ("uuid4", "crockford26", "prefixhex", "counter")
PROBLEM_CODES = ("validation_failed", "not_found", "unknown_reference", "slot_unavailable", "idempotency_mismatch",
                 "slot_taken", "idempotency_in_progress", "daily_limit_reached")
MEDIA_PARAMS = ("", "; charset=utf-8", "; charset=UTF-8")
HEADER_FIELDS = ("content-type", "content-length", "date", "allow", "connection")
METHODS = ("GET", "HEAD", "POST")
LATENCY_BASES_MS = (0, 10, 30)
LATENCY_JITTER_MS = 10


def draw_cosmetics(rng: random.Random) -> dict[str, object]:
    """K1-K7 for one run. It takes only the random stream: the variant is never an input (S5)."""
    letters = string.ascii_lowercase
    header_order = list(HEADER_FIELDS)
    rng.shuffle(header_order)
    method_order = list(METHODS)
    rng.shuffle(method_order)
    return {
        "seed": rng.getrandbits(63),
        "idScheme": rng.choice(ID_SCHEMES),
        "idPrefixes": {kind: rng.choice(letters) + rng.choice(letters) for kind in ("schedule", "eventType", "booking")},
        "idCounterStart": rng.randrange(1, 1_000_000),
        "titles": {code: rng.randrange(3) for code in PROBLEM_CODES},
        "details": {code: rng.randrange(-1, 3) for code in PROBLEM_CODES},
        "mediaParam": rng.choice(MEDIA_PARAMS),
        "headerOrder": header_order,
        "methodOrder": method_order,
        "allowHead": rng.random() < 0.5,
        "latencyBaseMs": rng.choice(LATENCY_BASES_MS),
        "latencyJitterMs": LATENCY_JITTER_MS,
    }


# ---------------------------------------------------------------------------------------------------
# Drift plants (design 4.L7 (3))
# ---------------------------------------------------------------------------------------------------

PROPERTY_LINE = re.compile(r'^\s+"?[A-Za-z_$][\w$-]*"?\??: [^{}]*;\s*$')
PROPERTY_NAME = re.compile(r'^\s+"?([A-Za-z_$][\w$-]*)"?\??:')
PROPERTY_PARTS = re.compile(r'^(\s+"?[A-Za-z_$][\w$-]*"?\??: )([^{}]*?)(;\s*)$')
# (3f) and (3g) swap a type for another one of the same length, so line counts, byte counts, routes and property
# names all stay as they were; only a comparison of the content itself (a regeneration, or a hash written by
# gen) sees the edit. In the client: `string` and `number` (also as an array or with `| null`).
TS_SWAPPABLE = re.compile(r"^(string|number)((?:\[\])*(?: \| null)?)$")
TS_SWAP = {"string": "number", "number": "string"}
# In contract/: a TypeSpec scalar and the same-length scalars whose TS type differs (string, number or boolean
# after openapi-typescript; bytes is a base64 string). int8 has no such partner and is never picked.
TSP_SWAPS = {
    "string": ("uint16", "uint32", "uint64"),
    **{name: ("string",) for name in ("uint16", "uint32", "uint64")},
    "boolean": ("float32", "float64", "integer", "numeric", "safeint"),
    **{name: ("boolean",) for name in ("float32", "float64", "integer", "numeric", "safeint")},
    **{name: ("bytes",) for name in ("int16", "int32", "int64", "uint8", "float")},
    "bytes": ("int32", "int64"),
}
TSP_FIELD = re.compile(r"(?<![\w.])([A-Za-z_]\w*\??\s*:\s*)(" + "|".join(sorted(TSP_SWAPS, key=len, reverse=True))
                       + r")(?=\s*[;,)])")
NAMESPACE_NAME = re.compile(r"\bnamespace\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)")


class PlantError(Exception):
    """The grader cannot plant a drift case in this workspace; Russian message for the learner."""


class GenFailed(Exception):
    """The learner's `make -s gen` failed in (3c); carries its result."""

    def __init__(self, result: runtime.RunResult) -> None:
        super().__init__("make -s gen failed")
        self.result = result


def components_property_lines(text: str) -> list[int]:
    """Indexes of single-line properties inside `export interface components` of the generated client."""
    lines = text.split("\n")
    inside = False
    found = []
    for index, line in enumerate(lines):
        if line.startswith("export interface components"):
            inside = True
            continue
        if inside and line.startswith("}"):
            break
        if inside and PROPERTY_LINE.match(line):
            found.append(index)
    return found


def read_client(copy: Path) -> tuple[Path, str]:
    path = copy / SCHEMA
    if path.is_symlink() or not path.is_file():
        raise PlantError(f"нет файла {SCHEMA}: его создаёт make gen из contract/, и он хранится в репозитории")
    return path, path.read_text(encoding="utf-8", errors="replace")


def plant_hand_edit(copy: Path, rng: random.Random) -> str:
    """(3a): remove one generated property line from the client. Returns the removed line."""
    path, text = read_client(copy)
    candidates = components_property_lines(text)
    if not candidates:
        raise PlantError(f"в {SCHEMA} нет свойств в components: это не файл, который генерирует openapi-typescript")
    lines = text.split("\n")
    removed = lines.pop(rng.choice(candidates))
    path.write_text("\n".join(lines), encoding="utf-8")
    return removed.strip()


def plant_type_edit(copy: Path, rng: random.Random) -> str:
    """(3f): swap `string` and `number` in one generated property line: same lines, bytes, names and routes.

    Returns `<object>.<property>: <old> -> <new>` for the message."""
    path, text = read_client(copy)
    lines = text.split("\n")
    blocks = property_blocks(text)
    # Properties of an object only: `responses: never;` and its siblings sit directly in `components`.
    candidates = []
    for opener, indexes in blocks.items():
        for index in indexes:
            parts = PROPERTY_PARTS.match(lines[index])
            swappable = TS_SWAPPABLE.match(parts.group(2)) if parts else None
            if not lines[opener].startswith("export ") and parts and swappable:
                candidates.append((opener, index, parts.group(1), parts.group(3), swappable))
    if not candidates:
        raise PlantError(f"в {SCHEMA} нет свойств типа string или number в components: это не файл, который генерирует "
                         "openapi-typescript")
    opener, index, head, end, swappable = rng.choice(candidates)
    declared = swappable.group(0)
    replacement = TS_SWAP[swappable.group(1)] + swappable.group(2)
    lines[index] = head + replacement + end
    path.write_text("\n".join(lines), encoding="utf-8")
    owner = lines[opener].strip().removesuffix("{").strip().removesuffix(":").strip('"')
    return f"{owner}.{head.strip().removesuffix(':').strip()}: {declared} -> {replacement}"


def property_blocks(text: str) -> dict[int, list[int]]:
    """Property lines of `components`, grouped by the line that opens their object (`Name: {`)."""
    lines = text.split("\n")
    blocks: dict[int, list[int]] = {}
    for index in components_property_lines(text):
        indent = len(lines[index]) - len(lines[index].lstrip())
        opener = next((i for i in range(index - 1, -1, -1) if lines[i].rstrip().endswith("{")
                       and len(lines[i]) - len(lines[i].lstrip()) < indent), None)
        if opener is not None:
            blocks.setdefault(opener, []).append(index)
    return blocks


def plant_hand_addition(copy: Path, rng: random.Random) -> str:
    """(3d): copy a generated property line of one object into another object that has no property of that name.

    The edit only adds a line, and its name already occurs in the client, so neither "the client only grew" nor
    "every name in the client comes from the contract" tells it from a regeneration. Returns the added line."""
    path, text = read_client(copy)
    lines = text.split("\n")
    blocks = property_blocks(text)

    def name(index: int) -> str:
        match = PROPERTY_NAME.match(lines[index])
        return match.group(1) if match else ""

    moves = [(source, target) for source_block, sources in blocks.items() for source in sources
             for target_block, targets in blocks.items() if target_block != source_block
             and name(source) not in {name(t) for t in targets} for target in targets]
    if not moves:
        raise PlantError(f"в {SCHEMA} меньше двух объектов со свойствами в components: это не файл, который генерирует "
                         "openapi-typescript")
    source, target = rng.choice(moves)
    indent = lines[target][: len(lines[target]) - len(lines[target].lstrip())]
    added = indent + lines[source].strip()
    lines.insert(target + 1, added)
    path.write_text("\n".join(lines), encoding="utf-8")
    return added.strip()


@dataclass(frozen=True)
class ContractChange:
    """A new namespace with one operation. Every name is the 8 random letters, with no fixed marker word, so the
    contract text says nothing about which run planted it."""

    kind: str  # "D1" (a GET operation) or "D2" (a POST operation with a body)
    suffix: str  # 8 random lowercase letters

    @property
    def path(self) -> str:
        return f"/{self.suffix}"

    @property
    def method(self) -> str:
        return "GET" if self.kind == "D1" else "POST"

    def text(self, outer: str | None) -> str:
        name = self.suffix.capitalize()
        namespace = f"{outer}.{name}" if outer else name
        if self.kind == "D1":
            body = (f"  model {name}Value {{ value: string; }}\n"
                    f'  @TypeSpec.Http.route("{self.path}")\n  @TypeSpec.Http.get\n'
                    f"  op read{name}(): {name}Value;\n")
        else:
            body = (f"  model {name}Input {{ value: string; }}\n  model {name}Value {{ value: string; }}\n"
                    f'  @TypeSpec.Http.route("{self.path}")\n  @TypeSpec.Http.post\n'
                    f"  op write{name}(@TypeSpec.Http.body body: {name}Input): {name}Value;\n")
        return f"\nnamespace {namespace} {{\n{body}}}\n"


def draw_change(rng: random.Random) -> ContractChange:
    return ContractChange(rng.choice(("D1", "D2")), "".join(rng.choice(string.ascii_lowercase) for _ in range(8)))


def namespace_candidates(contract: Path) -> list[str]:
    names: list[str] = []
    for path in sorted(contract.rglob("*.tsp")):
        if path.is_symlink() or not path.is_file():
            continue
        for match in NAMESPACE_NAME.finditer(path.read_text(encoding="utf-8", errors="replace")):
            if match.group(1) not in names:
                names.append(match.group(1))
    return names[:MAX_NAMESPACE_CANDIDATES]


def emitted(document: object, change: ContractChange) -> bool:
    if not isinstance(document, str):
        return False
    try:
        parsed = runtime.strict_json(document)
    except runtime.StrictJsonError:
        return False
    paths = parsed.get("paths") if isinstance(parsed, dict) else None
    if not isinstance(paths, dict):
        return False
    return any(isinstance(key, str) and (key == change.path or key.endswith(change.path)) and isinstance(value, dict)
               and change.method.lower() in value for key, value in paths.items())


def plant_contract_change(copy: Path, change: ContractChange, bench: runtime.Workbench, allowlist: Path) -> str:
    """(3b)/(3c): append the change to contract/main.tsp so that the grader's compile emits it.

    It is tried as a top-level namespace first (inside a file-level `namespace X;` that is the service), then
    qualified with each namespace name found in contract/, until the grader's compile (7.2) emits the path."""
    entry = copy / ENTRY_TSP
    if entry.is_symlink() or not entry.is_file():
        raise PlantError(f"нет файла {ENTRY_TSP}: компиляция контракта начинается с него")
    original = entry.read_text(encoding="utf-8", errors="replace")
    for outer in [None, *namespace_candidates(copy / "contract")]:
        entry.write_text(original + change.text(outer), encoding="utf-8")
        try:
            outcome = runtime.compile_contract(copy / "contract", bench.root, bench.layout, allowlist)
        except runtime.ContractCopyError as error:
            raise PlantError(str(error)) from error
        record = outcome.record
        if record.get("hasError") and outer is None and not record.get("document"):
            continue
        if emitted(record.get("document"), change):
            return f"{change.method} {change.path}"
    entry.write_text(original, encoding="utf-8")
    raise PlantError("в contract/main.tsp не удалось добавить операцию так, чтобы она попала в OpenAPI при компиляции "
                     "проверки: проверьте, что контракт компилируется как в contract-matches (урок 2) и что сервис "
                     "объявлен через @service на пространстве имён")


def type_signature(document: object) -> list[tuple[str, str]]:
    """Every JSON-schema `type` of the compiled OpenAPI with its position, integer read as number (the TS type)."""
    found: list[tuple[str, str]] = []

    def walk(node: object, where: str) -> None:
        if isinstance(node, dict):
            kind = node.get("type")
            if isinstance(kind, str):
                found.append((where, "number" if kind == "integer" else kind))
            for key, value in node.items():
                walk(value, f"{where}/{key}")
        elif isinstance(node, list):
            for position, value in enumerate(node):
                walk(value, f"{where}/{position}")

    walk(document, "")
    return found


def compiled_signature(copy: Path, bench: runtime.Workbench, allowlist: Path) -> list[tuple[str, str]] | None:
    """The type signature of the grader's compile of contract/, or None when it does not compile cleanly."""
    try:
        record = runtime.compile_contract(copy / "contract", bench.root, bench.layout, allowlist).record
    except runtime.ContractCopyError as error:
        raise PlantError(str(error)) from error
    document = record.get("document")
    if record.get("hasError") or not isinstance(document, str):
        return None
    try:
        return type_signature(runtime.strict_json(document))
    except runtime.StrictJsonError:
        return None


def contract_fields(contract: Path) -> list[tuple[Path, int, int, int]]:
    """(file, line, start, end) of every `name: <scalar>` outside comments and string literals in contract/."""
    found = []
    for path in sorted(contract.rglob("*.tsp")):
        if path.is_symlink() or not path.is_file():
            continue
        for number, line in enumerate(path.read_text(encoding="utf-8", errors="replace").split("\n")):
            if line.lstrip().startswith(("//", "*", "/*")):
                continue
            for match in TSP_FIELD.finditer(line):
                if line[: match.start()].count('"') % 2 == 0 and "//" not in line[: match.start()]:
                    found.append((path, number, match.start(2), match.end(2)))
    return found


def plant_contract_type_change(copy: Path, bench: runtime.Workbench, allowlist: Path, rng: random.Random) -> str:
    """(3g): swap the type of one field in contract/ for one of the same length, without regenerating the client.

    Line and byte counts, operations and property names stay the same. A tried field is kept only when the grader's compile
    still succeeds and a JSON-schema type of the document changed, so the generated client would change too.
    Returns `<file>: <field> <old> -> <new>` for the message."""
    before = compiled_signature(copy, bench, allowlist)
    if before is None:
        raise PlantError(f"contract/ не компилируется проверкой: проверьте, что контракт компилируется как в "
                         "contract-matches (урок 2)")
    candidates = contract_fields(copy / "contract")
    rng.shuffle(candidates)
    for path, number, start, end in candidates[:MAX_TYPE_CANDIDATES]:
        original = path.read_text(encoding="utf-8", errors="replace")
        lines = original.split("\n")
        line = lines[number]
        declared = line[start:end]
        replacement = rng.choice(TSP_SWAPS[declared])
        lines[number] = line[:start] + replacement + line[end:]
        path.write_text("\n".join(lines), encoding="utf-8")
        after = compiled_signature(copy, bench, allowlist)
        if after is not None and after != before:
            field_name = line[:start].rstrip().removesuffix(":").rstrip().removesuffix("?").split()[-1]
            return f"{path.relative_to(copy).as_posix()}: {field_name}: {declared} -> {replacement}"
        path.write_text(original, encoding="utf-8")
    raise PlantError(f"в contract/ не нашлось поля типа string, boolean или числа, замену типа которого компиляция "
                     f"проверки принимает и переносит в OpenAPI (проверено полей: "
                     f"{min(len(candidates), MAX_TYPE_CANDIDATES)})")


# ---------------------------------------------------------------------------------------------------
# Runs
# ---------------------------------------------------------------------------------------------------


@dataclass
class GateRun:
    label: str
    variant: Variant | None = None  # set for the variant runs
    cosmetics: dict[str, object] | None = None
    drift: str | None = None  # "3a" to "3g"
    change: ContractChange | None = None
    second_change: ContractChange | None = None  # (3e): the change made after make gen
    planted: str | None = None  # (3f)/(3g): what the plant changed, for the message
    expect_pass: bool = True


@dataclass
class GateResult:
    problems: list[str] = field(default_factory=list)
    runs: int = 0


def git(bench: runtime.Workbench, copy: Path, env: dict[str, str], *args: str) -> runtime.RunResult:
    git_env = {**env, "GIT_CONFIG_NOSYSTEM": "1", "GIT_TERMINAL_PROMPT": "0"}
    return runtime.run_child([runtime.tool_path(bench.layout, "git"), *GRADER_IDENTITY, *args], copy, git_env,
                             GIT_TIMEOUT_SEC)


def commit_all(bench: runtime.Workbench, copy: Path, env: dict[str, str], message: str) -> None:
    for args in (("add", "-A"), ("commit", "-q", "--no-verify", "--allow-empty", "-m", message)):
        result = git(bench, copy, env, *args)
        if result.exit_code != 0:
            raise runtime.GraderError(f"git {args[0]} в копии рабочей папки не сработал ({result.tail(5)})")


def fresh_repository(bench: runtime.Workbench, copy: Path, env: dict[str, str]) -> None:
    """A new repository with no commit yet; `commit_all` then makes its one commit of the copy as it is."""
    dot_git = copy / ".git"
    if dot_git.is_dir() and not dot_git.is_symlink():
        shutil.rmtree(dot_git)
    elif dot_git.exists() or dot_git.is_symlink():
        dot_git.unlink()
    result = git(bench, copy, env, "init", "-q", "-b", "main")
    if result.exit_code != 0:
        raise runtime.GraderError(f"git init в копии рабочей папки не сработал ({result.tail(5)})")
    (copy / ".git" / "info").mkdir(parents=True, exist_ok=True)
    (copy / ".git" / "info" / "exclude").write_text("\n".join(EXCLUDED_FROM_COMMIT) + "\n", encoding="utf-8")


class Gate:
    """One check run of the gate: the bench, the refserver launcher, the delay and the random stream."""

    def __init__(self, bench: runtime.Workbench, launcher: runtime.RefServerLauncher, allowlist: Path, api: str,
                 rng: random.Random) -> None:
        self.bench = bench
        self.launcher = launcher
        self.allowlist = allowlist
        self.api = api
        self.rng = rng
        self.delay_ms = rng.randint(*DELAY_RANGE_MS)

    def env_extra(self, url: str | None) -> dict[str, str]:
        extra = {"CALENDAR_NOW": CI_NOW, "CALENDAR_BOOKING_DELAY_MS": str(self.delay_ms)}
        if url is not None:
            extra["CALENDAR_API_URL"] = url
        return extra

    def make_ci(self, run: GateRun) -> runtime.RunResult:
        """One `make -s ci` in a fresh copy, with the run's server and plant; the copy is deleted afterwards."""
        if shutil.disk_usage(self.bench.runs_dir).free < runtime.REQUIRED_FREE_BYTES // 2:
            raise runtime.GraderError("не хватает места")
        copy = runtime.fresh_copy(self.bench.snapshot, self.bench.runs_dir)
        server: runtime.RefServer | None = None
        try:
            url = None
            if run.variant is not None:
                server = self.launcher.start({"now": CI_NOW, "schedules": [], "eventTypes": [], "delayMs": self.delay_ms,
                                              "api": self.api, "variant": run.variant.id, "cosmetics": run.cosmetics})
                url = f"http://127.0.0.1:{server.port}"
            env = runtime.learner_run_env(self.bench, copy.parent, self.env_extra(url), self.rng)
            fresh_repository(self.bench, copy, env)
            if run.drift is not None:
                self.plant(run, copy, env)
            commit_all(self.bench, copy, env, "workspace as submitted")
            return runtime.run_child([runtime.tool_path(self.bench.layout, "make"), "-s", "ci"], copy, env, RUN_TIMEOUT_SEC)
        finally:
            if server is not None:
                server.stop()
            shutil.rmtree(copy.parent, ignore_errors=True)

    def gen(self, copy: Path, env: dict[str, str]) -> None:
        generated = runtime.run_child([runtime.tool_path(self.bench.layout, "make"), "-s", "gen"], copy, env, RUN_TIMEOUT_SEC)
        if generated.exit_code != 0:
            raise GenFailed(generated)

    def plant(self, run: GateRun, copy: Path, env: dict[str, str]) -> None:
        """The drift case, written into the copy before its one commit."""
        if run.drift == "3a":
            plant_hand_edit(copy, self.rng)
            return
        if run.drift == "3f":
            run.planted = plant_type_edit(copy, self.rng)
            return
        if run.drift == "3g":
            run.planted = plant_contract_type_change(copy, self.bench, self.allowlist, self.rng)
            return
        assert run.change is not None
        plant_contract_change(copy, run.change, self.bench, self.allowlist)
        if run.drift == "3b":
            return
        self.gen(copy, env)
        if run.drift == "3d":
            plant_hand_addition(copy, self.rng)
        elif run.drift == "3e":
            assert run.second_change is not None
            plant_contract_change(copy, run.second_change, self.bench, self.allowlist)

    def plan(self, reds: tuple[Variant, ...]) -> tuple[list[GateRun], list[GateRun]]:
        """The variant runs (shuffled, cosmetics drawn per run by one sampler) and the seven drift runs."""
        variants = [CORRECT] * GREEN_RUNS + list(reds)
        self.rng.shuffle(variants)
        variant_runs = [GateRun("variant", variant, draw_cosmetics(self.rng), expect_pass=variant is CORRECT)
                        for variant in variants]
        drift_runs = [GateRun("drift", drift="3a", expect_pass=False),
                      GateRun("drift", drift="3b", change=draw_change(self.rng), expect_pass=False),
                      GateRun("drift", drift="3c", change=draw_change(self.rng), expect_pass=True),
                      GateRun("drift", drift="3d", change=draw_change(self.rng), expect_pass=False),
                      GateRun("drift", drift="3e", change=draw_change(self.rng), second_change=draw_change(self.rng),
                              expect_pass=False),
                      GateRun("drift", drift="3f", expect_pass=False),
                      GateRun("drift", drift="3g", expect_pass=False)]
        self.rng.shuffle(drift_runs)
        return variant_runs, drift_runs


def tail(result: runtime.RunResult) -> str:
    return result.tail(TAIL)


def drift_label(run: GateRun) -> str:
    if run.drift == "3a":
        return (f"дрейф (3a), ручная правка сгенерированного клиента: из {SCHEMA} удалено одно сгенерированное свойство, "
                "контракт не менялся")
    if run.drift == "3f":
        changed = f" ({run.planted})" if run.planted else ""
        return (f"дрейф (3f), ручная правка типа в сгенерированном клиенте: в {SCHEMA} у одного сгенерированного свойства "
                f"тип заменён на месте{changed}, число строк и байтов, операции и имена свойств те же, контракт не менялся")
    if run.drift == "3g":
        changed = f" ({run.planted})" if run.planted else ""
        return (f"дрейф (3g), тип поля в контракте изменён без перегенерации: в contract/ у одного поля тип заменён на "
                f"месте{changed}, число строк и байтов, операции и имена свойств те же, {SCHEMA} не перегенерирован")
    assert run.change is not None
    operation = f"{run.change.method} {run.change.path}"
    if run.drift == "3b":
        return (f"дрейф (3b), контракт изменён без перегенерации: в {ENTRY_TSP} добавлена операция {operation}, "
                f"{SCHEMA} не перегенерирован")
    if run.drift == "3c":
        return (f"дрейф (3c), контракт изменён и клиент перегенерирован: в {ENTRY_TSP} добавлена операция {operation}, "
                "затем выполнен ваш make -s gen")
    if run.drift == "3d":
        return (f"дрейф (3d), перегенерация и ручная правка вместе: в {ENTRY_TSP} добавлена операция {operation}, выполнен "
                f"ваш make -s gen, потом в {SCHEMA} руками добавлено свойство, которого генератор там не создаёт")
    assert run.second_change is not None
    return (f"дрейф (3e), клиент от прежней версии контракта: в {ENTRY_TSP} добавлена операция {operation}, выполнен ваш "
            f"make -s gen, потом добавлена ещё одна операция {run.second_change.method} {run.second_change.path} без "
            "перегенерации")


def run_gate(gate: Gate, reds: tuple[Variant, ...]) -> GateResult:
    """All gate runs; problems in the order: (1), green runs that failed, surviving mutants, drift."""
    result = GateResult()
    variant_runs, drift_runs = gate.plan(reds)

    first = gate.make_ci(GateRun("no-url"))
    result.runs += 1
    if first.timed_out:
        result.problems.append(f"make ci без CALENDAR_API_URL не уложился в {RUN_TIMEOUT_SEC} с:\n{tail(first)}")
    elif first.exit_code != 0:
        result.problems.append(f"make ci без CALENDAR_API_URL упал:\n{tail(first)}")

    green_failures: list[str] = []
    survivors: list[Variant] = []
    for run in variant_runs:
        outcome = gate.make_ci(run)
        result.runs += 1
        assert run.variant is not None
        if run.expect_pass and outcome.timed_out:
            green_failures.append(f"make ci не уложился в {RUN_TIMEOUT_SEC} с (корректная реализация API):\n{tail(outcome)}")
        elif run.expect_pass and outcome.exit_code != 0:
            green_failures.append(f"make ci упал на корректной реализации API:\n{tail(outcome)}")
        elif not run.expect_pass and outcome.exit_code == 0:
            survivors.append(run.variant)
    result.problems.extend(green_failures)
    for variant in sorted(survivors, key=lambda v: reds.index(v)):
        result.problems.append(f"make ci прошёл на API с ошибкой: {variant.behaviour} ({variant.requirement}). Тест API "
                               "должен на ней падать")

    for run in drift_runs:
        try:
            outcome = gate.make_ci(run)
        except PlantError as error:
            result.problems.append(f"{drift_label(run)}: {error}")
            continue
        except GenFailed as failed:
            shown = f"не уложился в {RUN_TIMEOUT_SEC} с" if failed.result.timed_out else f"завершился с кодом {failed.result.exit_code}"
            result.problems.append(f"{drift_label(run)}: ваш make -s gen {shown}:\n{tail(failed.result)}")
            continue
        result.runs += 1
        # Design 4.L7: a run over the cap counts as failed, in the drift runs as in the variant runs. So a must-fail
        # drift run ((3a), (3b), (3d)-(3g)) that hits the cap is red as required; only (3c), which must pass, reports it.
        if outcome.timed_out and run.expect_pass:
            result.problems.append(f"{drift_label(run)}: make ci не уложился в {RUN_TIMEOUT_SEC} с:\n{tail(outcome)}")
        elif outcome.timed_out:
            continue
        elif run.expect_pass and outcome.exit_code != 0:
            result.problems.append(f"{drift_label(run)}: make ci должен пройти, а упал:\n{tail(outcome)}")
        elif not run.expect_pass and outcome.exit_code == 0:
            result.problems.append(f"{drift_label(run)}: make ci должен упасть, а прошёл")
    return result


def new_rng() -> random.Random:
    return random.Random(secrets.randbits(64))
