"""Check pipeline-chain (L3, design #43 revision 6, 5.L3): `pipeline/run.py` against the grader's fake `claude`.

Run from the workspace as `python3 -I "$ACADEMY_CHECKS_DIR/verify_pipeline.py"`. Exit 0 pass, 1 fail.

One graded run copies the workspace once (4.1, nested or flat layout) and runs the pipeline six times with the
4.1 launch line: 2 runs where every call succeeds and 4 runs where one call fails, each at a drawn joint with a
drawn failure kind (the 4 failures cover all three joints and 4 distinct kinds). Before each run the grader
writes a fresh task, acceptance criteria and roles file into the copy; the generator does the same work in
every run. The fake answers each call by the run's plan; the coder's successful call writes the run's diff into
the copy at the drawn `diff_path`.

Requirements graded (messages name the requirement and the run kind only):
- C3, C4, C6-C10 on every call line (orchestra_runtime.grade_call, the 4.3 precedence);
- H1 call order and count; H2 / H3 on the material each call received (4.6: the prompt texts and every file
  their references reach, resolved when the request arrives and again at run end), searched in every form
  `orchestra_runtime.material_search_texts` gives (letter case ignored, JSON escapes undone, UTF-16/32 files
  decoded); H4 the stop on the first failure; H5 the handoff log; H6 the report; H7 the scratch and copy trees
  before each run, as each call request arrives, while a held call waits, and after the run; from the coder's
  reply on, the coder's own files must keep the content the coder left.

Hold-and-poll (Stepan 2026-11-04, student L3 re-run 2, X1 and X3). In each graded run one call of each role,
drawn among the runs whose plan calls that role, each in a different run, is held LONG_HOLD_SEC before its reply; every other call is
answered at once. While a call is held the server polls every HOLD_POLL_SEC: the scratch and copy trees
(`hold_snapshot`, read by H7 through `rt.call_snapshots`) and the call's material (`watch_material_during_hold`:
every named path is stat'ed again and re-read when it changed, read by H2/H3 through `Material.all_versions`).
A stash written into the project, or into a file the prompt names, at any time before the hold ends is seen.
A write later than the hold is the residual RS-C9a, as in lesson 2.
"""

import ctypes
import gc
import sys

if sys.platform.startswith("linux"):
    # First statement, as in every grader of the course: this process holds the drawn replies.
    if ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0) != 0:  # 4 = PR_SET_DUMPABLE
        raise SystemExit("prctl(PR_SET_DUMPABLE) failed")

import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import secrets  # noqa: E402
import shutil  # noqa: E402
import tempfile  # noqa: E402
import threading  # noqa: E402
from collections.abc import Callable  # noqa: E402
from dataclasses import dataclass, field  # noqa: E402
from decimal import Decimal  # noqa: E402
from pathlib import Path  # noqa: E402

CHECKS_DIR = Path(__file__).resolve().parent
sys.dont_write_bytecode = True  # the checks directory gets no __pycache__
sys.path.insert(0, str(CHECKS_DIR))

import orchestra_runtime as rt  # noqa: E402

DATA = CHECKS_DIR / "data"
CONTRACTS = Path("pipeline") / "contracts"
ROLES = ("coder", "reviewer", "summarizer")
REVIEW_ROLES = ("reviewer",)
SUCCESS_SCENARIO = "ok"
OK_RUNS = 2
FAILURE_RUNS = 4
RUN_TIMEOUT_SEC = 25
# Hold-and-poll: the held call of each role waits this long before its reply, the top of the decision's 1-3 s and
# lesson 2's LONG_HOLD_SEC. A fixed value, not a drawn one: a pipeline that writes a stash D seconds into every
# call of a role is then seen whenever D < 3, in every graded run, so retrying cannot pass it. The three holds add
# about 9 s to the check, at most 3 s to any one pipeline run (`draw_held_runs`).
LONG_HOLD_SEC = 3.0
# H3: the text a summarizer call carries inline (stdin, positional prompt, system-prompt values).
H3_INLINE_LIMIT_BYTES = 16 * 1024
# H5/H6: costs are drawn with 6 decimals; a float sum differs from the exact one by far less than this.
COST_TOLERANCE_USD = 1e-9
MODEL_POOL = ("sonnet", "opus", "haiku", "fable", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5",
              "claude-fable-5-2", "claude-fable-5-1")
BUDGET_MIN_CENTS, BUDGET_MAX_CENTS = 5, 999
MAX_FINDINGS = 5
QUOTE_MAX, CLAIM_MAX, FILE_MAX = 80, 120, 60
TOKEN_PATTERN = re.compile(r"nt[0-9a-f]{12}")
# A source line the diff quotes must not name a writable root or `..` (assessment round 3, note 5): a relative
# import such as `from ..shared import x` would put `..` into grader-generated text.
UNSAFE_LINE_PARTS = ("..", "~", "/tmp", "/var", "/home")
ROLE_GENITIVE = {"coder": "кодера", "reviewer": "ревьюера", "summarizer": "роли summarizer"}
FAILURE_SITUATION = {
    "no-structured": "успешным ответом без структурного вывода",
    "retries": "исчерпанием попыток структурного вывода",
    "budget": "ошибкой лимита расходов",
    "max-turns": "исчерпанием лимита ходов",
    "execution": "ошибкой во время выполнения",
    "auth": "ошибкой аутентификации",
}
MESSAGES = {
    "H1": "H1: кодер, затем ревьюер, затем summarizer, каждый ровно один раз, без повторов",
    "H1-timeout": f"H1: пайплайн завершается сам (прогон не уложился в {RUN_TIMEOUT_SEC} с)",
    "H2-leak": "H2: ревьюер не получает ничего из пояснений кодера (его summary и текста result), "
               "ни в промпте, ни через файлы, на которые промпт ссылается",
    "H2-presence": "H2: ревьюер получает изменение и критерии приёмки, текстом или ссылкой на файл",
    "H3-leak": "H3: summarizer не получает ничего из пояснений кодера и ревьюера, "
               "ни в промпте, ни через файлы, на которые промпт ссылается",
    "H3-presence": "H3: summarizer получает каждую находку ревьюера (id, файл, строка, цитата, утверждение), "
                   "текстом или ссылкой на файл",
    "H3-size": "H3: текст, который несёт вызов роли summarizer (stdin, позиционный промпт, значения системного "
               "промпта), не больше 16 КБ",
    "H4": "H4: первый упавший вызов останавливает пайплайн: дальше ни одного вызова, код выхода 1, отчёта нет",
    "H5": "H5: журнал передач: по строке на каждый сделанный вызов, упавшие тоже, по порядку, с полями брифа и "
          "значениями, которые вернул вызов",
    "H6": "H6: при успехе пайплайн завершается с кодом 0 и пишет отчёт: итог и id находок роли summarizer и точную "
          "сумму стоимости всех вызовов",
    "H7": "H7: файлы прогона только в каталоге прогона, в проекте только изменение кодера, в том числе пока идёт "
          "вызов роли; каждый вызов идёт из каталога проекта",
    "C4-unknown": "вызов передаёт схему вывода своей роли из её контракта прямо в строке вызова "
                  "(схема вызова не совпала ни с одной ролью)",
}
# Student fix round: the task and the acceptance text always hold non-ASCII characters (the header lines below
# and some criteria), so a handoff log that counts characters instead of UTF-8 bytes differs from the check.
CRITERIA = ("The late fee is rounded down to whole cents (пени до целых центов)",
            "An invoice paid on the due date gets no late fee",
            "A test covers the payment made on the due date", "make check is green",
            "The statement shows the fee on its own line", "No public function changes its signature",
            "Existing tests are not edited to pass", "The fee is at most 2 % of the invoice total, fee ≤ total")
ACCEPTANCE_HEADER = "# Acceptance criteria / Критерии приёмки\n\n"
TASK_TITLE = "Пени за просрочку"
DIFF_NOTES = ("round the fee down to whole cents", "no fee on the due date", "keep the old signature",
              "fee shown on its own line", "test for the due date")
FILLER = ("check", "the", "fee", "rounding", "is", "off", "by", "one", "cent", "for", "late", "invoices",
          "when", "paid", "near", "due", "date")


def draw_index(size: int) -> int:
    return secrets.randbelow(size)


def shuffled(items: list[object]) -> list[object]:
    result = list(items)
    for position in range(len(result) - 1, 0, -1):
        other = secrets.randbelow(position + 1)
        result[position], result[other] = result[other], result[position]
    return result


def filler_text(max_length: int) -> str:
    words: list[str] = []
    while True:
        word = FILLER[draw_index(len(FILLER))]
        if len(" ".join(words + [word])) > max_length:
            return " ".join(words)
        words.append(word)


# ---------------------------------------------------------------------------------------------------------
# Plans and inputs (4.7: every kind is planned, then shuffled; all inputs written before the child starts)
# ---------------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class RunPlan:
    number: int
    failing_role: str | None
    failure: str | None

    def situation(self) -> str:
        if self.failing_role is None or self.failure is None:
            return "в прогоне без сбоев"
        return f"в прогоне, где вызов {ROLE_GENITIVE[self.failing_role]} закончился {FAILURE_SITUATION[self.failure]}"


def draw_held_runs(plans: list[RunPlan]) -> dict[str, int]:
    """For each role, the number of the run whose first call of that role is held LONG_HOLD_SEC, drawn among the
    runs whose plan reaches that role (a failure at an earlier joint stops the run before it).

    The three runs differ, so no pipeline run carries more than one hold: a run must end within RUN_TIMEOUT_SEC,
    and under a heavy load three holds in one run left too little of it. The summarizer is drawn first, since
    fewest runs reach it (at least 3: two without failure and one failing at the summarizer); at least 4 reach
    the reviewer and all 6 the coder, so a free run is always left.
    """
    held: dict[str, int] = {}
    for position in reversed(range(len(ROLES))):
        reaching = [plan.number for plan in plans
                    if (plan.failing_role is None or ROLES.index(plan.failing_role) >= position)
                    and plan.number not in held.values()]
        held[ROLES[position]] = reaching[draw_index(len(reaching))]
    return held


def draw_plans() -> list[RunPlan]:
    joints = shuffled([*ROLES, ROLES[draw_index(len(ROLES))]])
    failures = shuffled(list(FAILURE_SITUATION))[:FAILURE_RUNS]
    kinds: list[tuple[str | None, str | None]] = [(None, None)] * OK_RUNS
    kinds += [(str(joint), str(failure)) for joint, failure in zip(joints, failures)]
    return [RunPlan(number, role, failure) for number, (role, failure) in enumerate(shuffled(kinds))]


@dataclass(frozen=True)
class SnapshotLine:
    file: str
    line: int
    text: str


@dataclass
class RunInputs:
    """What the generator wrote into the copy for one run, kept in grader memory."""
    roles: dict[str, tuple[str, float]]
    diff_path: str
    diff_text: str
    diff_markers: list[str]
    acceptance_markers: list[str]


def snapshot_lines(copy: Path) -> list[SnapshotLine]:
    """Lines a finding can point at: printable ASCII lines of the project's Python sources."""
    found = []
    for path in sorted((copy / "src").rglob("*.py")) if (copy / "src").is_dir() else []:
        relative = path.relative_to(copy).as_posix()
        if len(relative) > FILE_MAX or not rt.RUN_FILE_NAME.match(relative.replace("/", "")):
            continue
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeDecodeError):
            continue
        for number, text in enumerate(lines, start=1):
            if (text.strip() and len(text) <= QUOTE_MAX and all(" " <= ch <= "~" for ch in text)
                    and not any(part in text for part in UNSAFE_LINE_PARTS)):
                found.append(SnapshotLine(relative, number, text))
    return found or [SnapshotLine("src/invoices/late_fee.py", 1, "from __future__ import annotations")]


def write_run_inputs(copy: Path, lines: list[SnapshotLine]) -> RunInputs:
    """The task, the acceptance criteria and the roles file of one run, and the diff the coder will "write".

    It takes no run plan, so it does the same work and writes the same files whatever the run's scenario.
    """
    budgets = [cents / 100 for cents in range(BUDGET_MIN_CENTS, BUDGET_MAX_CENTS + 1)]
    roles = {role: (MODEL_POOL[draw_index(len(MODEL_POOL))], budgets[draw_index(len(budgets))]) for role in ROLES}
    (copy / "pipeline").mkdir(exist_ok=True)
    (copy / "pipeline" / "roles.json").write_text(
        json.dumps({role: {"model": model, "max_budget_usd": budget} for role, (model, budget) in roles.items()},
                   indent=2) + "\n", encoding="utf-8")
    acceptance_markers = [f"AC-{secrets.token_hex(4)}" for _ in range(3 + draw_index(3))]
    criteria = shuffled(list(CRITERIA))
    acceptance = ACCEPTANCE_HEADER + "".join(
        f"- {marker}: {criteria[index]}\n" for index, marker in enumerate(acceptance_markers))
    task = (f"# Task REQ-{secrets.token_hex(4)}: {TASK_TITLE}\n\nThe late fee in the invoice service is computed with "
            "fractional cents. Round it down to whole cents and add a test for an invoice paid on the due date.\n")
    (copy / "task").mkdir(exist_ok=True)
    (copy / "task" / "request.md").write_text(task, encoding="utf-8")
    (copy / "task" / "acceptance.md").write_text(acceptance, encoding="utf-8")
    target = lines[draw_index(len(lines))]
    diff_markers = [f"DF-{secrets.token_hex(4)}" for _ in range(2 + draw_index(2))]
    added = "".join(f"+# change {marker}: {DIFF_NOTES[draw_index(len(DIFF_NOTES))]}\n" for marker in diff_markers)
    diff_text = (f"diff --git a/{target.file} b/{target.file}\n--- a/{target.file}\n+++ b/{target.file}\n"
                 f"@@ -{target.line},1 +{target.line},{1 + len(diff_markers)} @@\n{added} {target.text}\n")
    return RunInputs(roles, f"work/change-{secrets.token_hex(4)}.diff", diff_text, diff_markers, acceptance_markers)


# ---------------------------------------------------------------------------------------------------------
# The fake's plan for one run
# ---------------------------------------------------------------------------------------------------------


def draw_findings(lines: list[SnapshotLine]) -> list[dict[str, object]]:
    findings = []
    for _ in range(1 + draw_index(MAX_FINDINGS)):
        line = lines[draw_index(len(lines))]
        marker = f"cm{secrets.token_hex(5)}"
        findings.append({"id": rt.draw_finding_id(), "file": line.file, "line": line.line, "quote": line.text,
                         "claim": f"{marker} {filler_text(CLAIM_MAX - len(marker) - 1)}",
                         "severity": ("high", "medium", "low")[draw_index(3)]})
    return findings


class ChainResponder(rt.StandardResponder):
    """Answers each call by the run's plan: the failing role's first call fails, every other call succeeds.

    The coder's successful call writes the run's diff into the copy, as the real coder would write its change.
    `call_snapshot` (H7) is taken in every request, after the reply is built and before it is sent, while the
    pipeline still waits for this call; it lands in `details["treeSnapshot"]`, where `tree_changes_seen`
    reads it. It is taken after the material walk, not before it as the runtime's `request_snapshot` hook
    would: hashing a large tree right before the walk put its pauses into the walk's measured time.

    The snapshot of the call that wrote the coder's change also fixes `change_state`: the digests of the coder's
    created paths as the coder left them, which every later snapshot must still hold (`tree_changes_seen`).

    The first call of each role in `held_roles` is held LONG_HOLD_SEC (hold-and-poll); the server's polls during
    the hold land in `details["treeSnapshotsDuringHold"]` and in the call's `Material.hold_versions`. A call that
    is not held gets no watch: its arrival snapshot already covers the moment it is answered, and a poll of a
    large tree would only add time.
    """

    def __init__(self, run_plan: RunPlan, inputs: RunInputs, copy: Path, lines: list[SnapshotLine],
                 call_snapshot: Callable[[], dict[str, str]], held_roles: frozenset[str], **kwargs: object) -> None:
        super().__init__(**kwargs)  # type: ignore[arg-type]
        self.run_plan, self.inputs, self.copy, self.lines = run_plan, inputs, copy, lines
        self.held_roles = held_roles
        self._held_requests: set[int] = set()
        self.call_snapshot = call_snapshot
        self.created_paths: list[Path] = []
        self.change_state: dict[str, str] = {}
        self.findings: list[dict[str, object]] | None = None
        self._plan_lock = threading.Lock()
        self._calls_per_role: dict[str | None, int] = {}

    def __call__(self, request: rt.CallRequest) -> tuple[rt.FakeReply, dict[str, object]]:
        reply, details = super().__call__(request)
        snapshot = self.call_snapshot()
        details["treeSnapshot"] = snapshot
        with self._plan_lock:
            if details.get("role") == "coder" and self.created_paths and not self.change_state:
                created = {str(path) for path in self.created_paths}
                self.change_state = {path: digest for path, digest in snapshot.items() if path in created}
                details["wroteChange"] = True
        return reply, details

    def planned_reply(self, request: rt.CallRequest, role: str | None) -> rt.PlannedReply:
        with self._plan_lock:
            index = self._calls_per_role.get(role, 0)
            self._calls_per_role[role] = index + 1
            is_failing = role is not None and role == self.run_plan.failing_role and index == 0
            scenario = str(self.run_plan.failure) if is_failing else SUCCESS_SCENARIO
            output = self._output(role)
            if role == "coder" and scenario == SUCCESS_SCENARIO:
                self._write_change()
            is_held = role in self.held_roles and index == 0
            if is_held:
                self._held_requests.add(id(request))
            return rt.PlannedReply(scenario, output, LONG_HOLD_SEC if is_held else 0.0)

    def hold_watch(self, request: rt.CallRequest, details: dict[str, object]) -> Callable[[], None] | None:
        with self._plan_lock:
            is_held = id(request) in self._held_requests
        return super().hold_watch(request, details) if is_held else None

    def _output(self, role: str | None) -> dict[str, object] | None:
        if role == "coder":
            summary, _ = rt.draw_narrative(160)
            return {"diff_path": self.inputs.diff_path, "summary": summary}
        if role == "reviewer":
            findings = draw_findings(self.lines)
            self.findings = self.findings or findings
            return {"findings": findings}
        if role == "summarizer":
            ids = [str(f["id"]) for f in self.findings] if self.findings else [rt.draw_finding_id()]
            return {"summary": f"Summary sr{secrets.token_hex(5)}: {filler_text(100)}", "finding_ids": ids}
        return None

    def _write_change(self) -> None:
        target = self.copy / self.inputs.diff_path
        missing = [parent for parent in reversed(target.parents) if not parent.exists()]
        target.parent.mkdir(parents=True, exist_ok=True)
        self.created_paths.extend(missing)
        target.write_text(self.inputs.diff_text, encoding="utf-8")
        self.created_paths.append(target)


# ---------------------------------------------------------------------------------------------------------
# Grading one run
# ---------------------------------------------------------------------------------------------------------


class Report:
    """Unmet requirements, one line each, with the situations where they were seen."""

    def __init__(self) -> None:
        self.lines: dict[tuple[str, str], list[str]] = {}

    def add(self, rule_id: str, message: str, situation: str) -> None:
        situations = self.lines.setdefault((rule_id, message), [])
        if situation not in situations:
            situations.append(situation)

    def render(self) -> list[str]:
        rendered = []
        for (rule_id, message), situations in self.lines.items():
            head = message if message.startswith(rule_id) else f"{rule_id}: {message}"
            rendered.append(f"не выполнено: {head} ({'; '.join(situations)})")
        return rendered


@dataclass
class CallView:
    """One call as graded: its record, role, drawn reply and everything it received."""
    record: rt.CallRecord
    role: str | None
    drawn: rt.DrawnResponse | None
    files: dict[str, bytes]
    texts: list[str]
    expanded: list[str]
    seconds: float
    stat_calls: int
    versions: list[bytes] = field(default_factory=list)
    _forms: list[str] | None = None

    def search_texts(self) -> list[str]:
        """Every form a mark is searched in (`orchestra_runtime.material_search_texts`), built once: each prompt
        text and each decoding of every version of each file, casefolded, and also with JSON escapes undone
        (student fix round)."""
        if self._forms is None:
            versions = {str(index): content for index, content in enumerate(self.versions)}
            self._forms = rt.material_search_texts(self.texts, versions)
        return self._forms


@dataclass
class RunContext:
    plan: RunPlan
    inputs: RunInputs
    copy: Path
    run_dir: Path
    scratch: rt.Scratch
    base_env: dict[str, str]
    config: dict[str, str]
    role_flags: dict[str, object]
    templates: dict[str, object]
    schemas: dict[str, object]


def view_calls(records: list[rt.CallRecord], context: RunContext) -> list[CallView]:
    """Each call with its material resolved at request time and again at run end (4.6), merged. The request-time
    material also holds every version the hold watch read while the call was held (`Material.all_versions`)."""
    views = []
    for record in sorted(records, key=lambda r: r.request.t_start):
        if "platformError" in record.details:
            raise rt.PlatformError(str(record.details["platformError"]))
        parsed = record.details["parsed"]
        assert isinstance(parsed, rt.ParsedCall)
        first = record.details.get("material")
        texts = rt.call_texts(parsed, record.request.stdin, record.request.cwd, context.role_flags)
        files: dict[str, bytes] = {}
        # Re-run fix round (N3): a file read at request time and changed back before run end holds two
        # contents; both are searched, so the run-end read cannot overwrite what the call saw.
        versions: dict[tuple[str, bytes], bytes] = {}
        expanded: list[str] = []
        seconds, stats = 0.0, 0
        materials = [first] if isinstance(first, rt.Material) else []
        if "cliError" not in record.details:
            materials.append(rt.resolve_material(texts, cwd=record.request.cwd, home=str(context.scratch.home),
                                                 run_dir=str(context.run_dir)))
        for material in materials:
            for path, content in material.all_versions():
                files.setdefault(path, content)
                versions.setdefault((path, content), content)
            expanded.extend(path for path in material.expanded if path not in expanded)
            seconds = max(seconds, material.seconds)
            stats = max(stats, material.stat_calls)
            texts = list(dict.fromkeys([*texts, *material.texts]))
        role = record.details.get("role")
        drawn = record.details.get("drawn")
        views.append(CallView(record, role if isinstance(role, str) else None,
                              drawn if isinstance(drawn, rt.DrawnResponse) else None, files, texts, expanded,
                              seconds, stats, list(versions.values())))
    return views


def grade_lines(views: list[CallView], context: RunContext, report: Report) -> None:
    situation = context.plan.situation()
    for view in views:
        parsed = view.record.details["parsed"]
        assert isinstance(parsed, rt.ParsedCall)
        if view.role is None:
            if parsed.c10_args:
                messages = rt._str_dict(context.role_flags["messages"])
                report.add("C10", f"{messages['C10']}; {messages['C10-rest']}", situation)
            else:
                report.add("C4", MESSAGES["C4-unknown"], situation)
            continue
        model, budget = context.inputs.roles[view.role]
        spec = rt.RoleSpec(view.role, view.role == "coder", view.role in REVIEW_ROLES, model, budget)
        facts = rt.CallFacts(stdin=view.record.request.stdin, environment=view.record.request.environment,
                             base_environment=context.base_env, contract_schema=context.schemas[view.role],
                             is_config_unchanged=view.record.details["claudeConfig"] == context.config)
        for failure in rt.grade_call(parsed, facts, spec, context.role_flags):
            report.add(failure.rule_id, failure.message, f"{situation}, в вызове {ROLE_GENITIVE[view.role]}")


def tokens_of(view: CallView) -> set[str]:
    """Narrative tokens a call's reply carried: its `result` text and, for the coder, its summary."""
    if view.drawn is None:
        return set()
    found = set(view.drawn.tokens)
    output = view.drawn.structured_output
    if isinstance(output, dict):
        found.update(TOKEN_PATTERN.findall(str(output.get("summary", ""))))
    return found


def inline_bytes(view: CallView, role_flags: dict[str, object]) -> int:
    parsed = view.record.details["parsed"]
    assert isinstance(parsed, rt.ParsedCall)
    values = [value for flag in rt._str_list(role_flags["materialValueFlags"]) for value in parsed.values(flag)]
    return len(view.record.request.stdin) + sum(len(text.encode("utf-8")) for text in [*parsed.positionals, *values])


def finding_noise(findings: list[dict[str, object]]) -> list[str]:
    """Drawn text that may hold digits next to a finding: quotes, claims and claim markers, raw and JSON-escaped."""
    pieces = [str(f[name]) for f in findings for name in ("quote", "claim")]
    pieces += [str(f["claim"]).split(" ", 1)[0] for f in findings]
    escaped = [json.dumps(piece, ensure_ascii=ascii_only)[1:-1] for piece in pieces for ascii_only in (True, False)]
    return sorted(set(pieces + escaped), key=len, reverse=True)


def is_finding_located(finding: dict[str, object], findings: list[dict[str, object]], forms: list[str]) -> bool:
    """H3: the finding's `file` and `line` reach the summarizer next to its `id`.

    "Next to" is the span around one occurrence of the id, bounded by the nearest occurrences of any finding id
    in the same text or file. A JSON object (any key order), a bullet line `- F-..: src/x.py:12 ...` and a file
    per finding all keep the fields inside that span; a list that drops `file` or `line` does not. Quotes and
    claims are blanked before the line number is looked for, so a digit inside them cannot stand in for it.
    `forms` are casefolded (`CallView.search_texts`), so every drawn value is casefolded before the search.
    """
    ids = re.compile("|".join(re.escape(str(f["id"]).casefold()) for f in findings))
    own_id, file_name = str(finding["id"]).casefold(), str(finding["file"]).casefold()
    line_number = re.compile(rf"(?<![0-9]){int(str(finding['line']))}(?![0-9])")
    noise = [piece.casefold() for piece in finding_noise(findings)]
    chunks = forms
    for chunk in chunks:
        hits = list(ids.finditer(chunk))
        for index, hit in enumerate(hits):
            if hit.group() != own_id:
                continue
            start = hits[index - 1].end() if index > 0 else 0
            end = hits[index + 1].start() if index + 1 < len(hits) else len(chunk)
            span = chunk[start:hit.start()] + " " + chunk[hit.end():end]
            if file_name not in span:
                continue
            for piece in noise:
                span = span.replace(piece, " ")
            if line_number.search(span):
                return True
    return False


def grade_material(views: list[CallView], context: RunContext, report: Report) -> None:
    situation = context.plan.situation()
    coder_tokens: set[str] = set()
    reviewer_tokens: set[str] = set()
    coder_ok = False
    findings: list[dict[str, object]] | None = None
    for view in views:
        if view.role == "reviewer":
            forms = view.search_texts()
            if any(rt.has_mark(forms, token) for token in coder_tokens):
                report.add("H2", MESSAGES["H2-leak"], situation)
            markers = context.inputs.diff_markers + context.inputs.acceptance_markers
            if coder_ok and not all(rt.has_mark(forms, marker) for marker in markers):
                report.add("H2", MESSAGES["H2-presence"], situation)
        elif view.role == "summarizer":
            forms = view.search_texts()
            if any(rt.has_mark(forms, token) for token in coder_tokens | reviewer_tokens):
                report.add("H3", MESSAGES["H3-leak"], situation)
            needed = [str(f[name]) for f in findings or [] for name in ("id", "quote")]
            needed += [str(f["claim"]).split(" ", 1)[0] for f in findings or []]
            if findings is not None and not (all(rt.has_mark(forms, piece) for piece in needed)
                                             and all(is_finding_located(f, findings, forms) for f in findings)):
                report.add("H3", MESSAGES["H3-presence"], situation)
            if inline_bytes(view, context.role_flags) > H3_INLINE_LIMIT_BYTES:
                report.add("H3", MESSAGES["H3-size"], situation)
        is_ok = view.drawn is not None and view.drawn.scenario == SUCCESS_SCENARIO
        if view.role == "coder":
            coder_tokens |= tokens_of(view)
            coder_ok = coder_ok or is_ok
        elif view.role == "reviewer":
            reviewer_tokens |= tokens_of(view)
            output = view.drawn.structured_output if view.drawn else None
            if is_ok and findings is None and isinstance(output, dict) and isinstance(output.get("findings"), list):
                findings = [rt._obj(f) for f in rt._list(output["findings"])]


def grade_order(views: list[CallView], code: int | None, context: RunContext, report: Report) -> None:
    situation = context.plan.situation()
    roles = [view.role for view in views]
    failing = context.plan.failing_role
    expected = list(ROLES) if failing is None else list(ROLES[:ROLES.index(failing) + 1])
    if roles != expected:
        if failing is not None and roles[:len(expected)] == expected:
            report.add("H4", MESSAGES["H4"], situation)
        else:
            report.add("H1", MESSAGES["H1"], situation)
    if code is None:
        report.add("H1", MESSAGES["H1-timeout"], situation)
    elif failing is not None:
        if code != 1 or (context.run_dir / "report.json").exists():
            report.add("H4", MESSAGES["H4"], situation)


def is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def read_log(path: Path) -> list[object] | None:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError):
        return None
    entries: list[object] = []
    for line in lines:
        if not line.strip():
            continue
        try:
            entries.append(json.loads(line))
        except ValueError:
            return None
    return entries


def log_entry_matches(entry: object, view: CallView, context: RunContext) -> bool:
    if not isinstance(entry, dict) or view.role is None:
        return False
    parsed = view.record.details["parsed"]
    assert isinstance(parsed, rt.ParsedCall)
    message = view.drawn.result_message if view.drawn is not None else None
    models = {context.inputs.roles[view.role][0], *parsed.values("--model")}
    if message is not None:
        models.update(rt._obj(message.get("modelUsage", {})).keys())
    cost = float(str(message["total_cost_usd"])) if message is not None else 0.0
    prompt_bytes = len(view.record.request.stdin) + sum(len(p.encode("utf-8")) for p in parsed.positionals)
    is_ok = view.drawn is not None and view.drawn.scenario == SUCCESS_SCENARIO
    return (entry.get("role") == view.role
            and entry.get("model") in models
            and entry.get("session_id") == (None if message is None else message.get("session_id"))
            and entry.get("subtype") == (None if message is None else message.get("subtype"))
            and is_number(entry.get("total_cost_usd"))
            and abs(float(entry["total_cost_usd"]) - cost) <= COST_TOLERANCE_USD
            and is_number(entry.get("prompt_bytes")) and entry["prompt_bytes"] == prompt_bytes
            and entry.get("status") == ("ok" if is_ok else "failed"))


def grade_log(views: list[CallView], context: RunContext, report: Report) -> None:
    path = context.run_dir / "handoffs.jsonl"
    if not views and not path.exists():
        return
    entries = read_log(path)
    is_ok = (entries is not None and len(entries) == len(views)
             and all(log_entry_matches(entry, view, context) for entry, view in zip(entries, views)))
    if not is_ok:
        report.add("H5", MESSAGES["H5"], context.plan.situation())


def grade_report(views: list[CallView], code: int | None, context: RunContext, report: Report) -> None:
    if context.plan.failing_role is not None:
        return
    summarizer = next((v for v in views if v.role == "summarizer" and v.drawn is not None), None)
    expected_cost = sum((Decimal(str(v.drawn.cost_usd)) for v in views if v.drawn is not None), Decimal(0))
    try:
        data = json.loads((context.run_dir / "report.json").read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, ValueError):
        data = None
    output = summarizer.drawn.structured_output if summarizer is not None and summarizer.drawn else None
    is_ok = (code == 0 and isinstance(data, dict) and isinstance(output, dict)
             and data.get("summary") == output["summary"]
             and isinstance(data.get("finding_ids"), list)
             and sorted(map(str, data["finding_ids"])) == sorted(map(str, rt._list(output["finding_ids"])))
             and len(data["finding_ids"]) == len(rt._list(output["finding_ids"]))
             and is_number(data.get("total_cost_usd"))
             and abs(Decimal(repr(float(data["total_cost_usd"]))) - expected_cost) <= Decimal(str(COST_TOLERANCE_USD)))
    if not is_ok:
        report.add("H6", MESSAGES["H6"], context.plan.situation())


def grade_trees(views: list[CallView], changes: list[str], context: RunContext, report: Report) -> None:
    if changes or any(view.record.request.cwd != str(context.copy) for view in views):
        report.add("H7", MESSAGES["H7"], context.plan.situation())


# ---------------------------------------------------------------------------------------------------------
# One graded run
# ---------------------------------------------------------------------------------------------------------


@dataclass
class GradeOptions:
    """Demo hooks; the graded entry point uses the defaults (a drawn layout, nothing planted)."""
    layout: str | None = None
    after_copy: Callable[[Path], None] | None = None


@dataclass
class Outcome:
    lines: list[str]
    calls: list[dict[str, object]] = field(default_factory=list)
    platform_error: str | None = None


def reference_config_snapshot(scratch_root: Path) -> dict[str, str]:
    """The lesson's shipped Claude Code configuration, laid out as a project, snapshotted like a call's cwd."""
    project = Path(tempfile.mkdtemp(dir=scratch_root))
    shutil.copytree(DATA / "l1-reference-claude-config", project / ".claude")
    snapshot = rt.claude_config_snapshot(project)
    shutil.rmtree(project)
    return snapshot


class HoldTreeSnapshot:
    """`rt.tree_snapshot` for the polls while a call is held: the same paths and the same digests, but an entry is
    hashed again only when its lstat signature (device, inode, mode, size, mtime ns, ctime ns) changed.

    Hashing the whole tree on every poll took about 2.5 s per poll with a 5000-object `.git` in the copy at a
    load average near 100, so the polls ate the run's 25 s. A write changes the ctime and `os.utime` cannot set it
    back, so an unchanged signature means unchanged content on a filesystem with nanosecond ctimes (RS-mw1).
    """

    def __init__(self, roots: list[Path], is_excluded: Callable[[str], bool]) -> None:
        self.roots, self.is_excluded = roots, is_excluded
        self.known: dict[str, tuple[tuple[int, ...], str]] = {}

    def __call__(self) -> dict[str, str]:
        snapshot: dict[str, str] = {}
        for root in self.roots:
            for directory, subdirs, files in os.walk(root, followlinks=False):
                subdirs[:] = [d for d in subdirs if not self.is_excluded(os.path.join(directory, d))]
                for name in subdirs + files:
                    path = os.path.join(directory, name)
                    if not self.is_excluded(path):
                        snapshot[path] = self._digest(path)
        return snapshot

    def _digest(self, path: str) -> str:
        try:
            info = os.lstat(path)
        except FileNotFoundError:
            return "gone"
        signature = (info.st_dev, info.st_ino, info.st_mode, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
        cached = self.known.get(path)
        if cached is not None and cached[0] == signature:
            return cached[1]
        digest = rt._entry_digest(path)
        self.known[path] = (signature, digest)
        return digest


def filtered(snapshot: dict[str, str], excluded: set[str]) -> dict[str, str]:
    return {path: digest for path, digest in snapshot.items() if path not in excluded}


def tree_changes_seen(before: dict[str, str], records: list[rt.CallRecord], after: dict[str, str],
                      responder: ChainResponder) -> list[str]:
    """H7 over every request snapshot, every snapshot taken while a call was held (`rt.call_snapshots`) and the
    run-end one. The coder's change is left out only until the reply that wrote it: from then on its paths must
    hold the digests the coder left (`responder.change_state`).

    Student re-run (N3): filtering the change out of every snapshot let a pipeline append the coder's summary to
    the coder's diff file during the reviewer call and restore it afterwards. Same approach as L5
    `verify_gate_wired.tree_changes_seen`.
    """
    excluded = {str(path) for path in responder.created_paths}
    settled_from = next((record.t_end for record in records if record.details.get("wroteChange")), None)
    unsettled = filtered(before, excluded)
    settled = {**unsettled, **responder.change_state}
    changed: set[str] = set()
    for record in sorted(records, key=lambda r: r.request.t_start):
        is_settled = settled_from is not None and record.request.t_start >= settled_from
        for snapshot in rt.call_snapshots([record]):
            if is_settled:
                changed.update(rt.tree_changes(settled, snapshot))
            else:
                changed.update(rt.tree_changes(unsettled, filtered(snapshot, excluded)))
    changed.update(rt.tree_changes(settled, after) if settled_from is not None
                   else rt.tree_changes(unsettled, filtered(after, excluded)))
    return sorted(changed)


def run_once(plan: RunPlan, held_roles: frozenset[str], copy: Path, scratch: rt.Scratch, lines: list[SnapshotLine],
             environment: dict[str, str], base: dict[str, object], loaded: list[rt.RoleSchema], report: Report,
             calls_out: list[dict[str, object]]) -> None:
    role_flags, templates, table = base["role_flags"], base["templates"], base["table"]
    assert isinstance(role_flags, dict) and isinstance(templates, dict) and isinstance(table, rt.FlagTable)
    inputs = write_run_inputs(copy, lines)
    run_dir = scratch.root / f"run-{plan.number}"
    run_dir.mkdir()
    is_excluded = rt.h7_exclusion(run_dir, [], scratch.tmp)

    def snapshot() -> dict[str, str]:
        taken = rt.tree_snapshot([scratch.root, copy], is_excluded)
        # A large tree leaves many new objects; collecting here keeps the collector's pause out of the next
        # request's material walk (measured: up to 0.1 s on a 5000-file tree).
        gc.collect()
        return taken

    # H7 per call (student fix round): a file put into the project before a call and removed after it is in
    # that call's snapshot only. The coder's change, written while its call is answered, is filtered out until
    # that reply; after it, the change must stay as the coder left it (`tree_changes_seen`).
    # Hold-and-poll: while a call is held, the tree is polled without the collection `snapshot` does and with
    # the digests cached by signature (`HoldTreeSnapshot`), so a poll stays a few ms.
    responder = ChainResponder(plan, inputs, copy, lines, snapshot, held_roles, table=table, role_flags=role_flags,
                               templates=templates, schemas=loaded, home=str(scratch.home), run_dir=str(run_dir),
                               plan=lambda role, index: rt.PlannedReply(SUCCESS_SCENARIO, None),
                               hold_snapshot=HoldTreeSnapshot([scratch.root, copy], is_excluded),
                               watch_material_during_hold=True)
    with rt.FakeClaudeServer(scratch.socket_path, responder) as server:
        before = snapshot()
        result = rt.run_process(rt.pipeline_command(CHECKS_DIR, copy, run_dir), copy, environment, RUN_TIMEOUT_SEC)
        records = server.calls()
        handler_errors = list(server.handler_errors)
        after = snapshot()
    if handler_errors:
        raise rt.PlatformError("; ".join(handler_errors))
    changes = tree_changes_seen(before, records, after, responder)
    context = RunContext(plan, inputs, copy, run_dir, scratch, environment, base["config"],  # type: ignore[arg-type]
                         role_flags, templates, {s.role: s.schema for s in loaded})
    views = view_calls(records, context)
    grade_lines(views, context, report)
    grade_order(views, result.code, context, report)
    grade_material(views, context, report)
    grade_log(views, context, report)
    grade_report(views, result.code, context, report)
    grade_trees(views, changes, context, report)
    for view in views:
        material = view.record.details.get("material")
        calls_out.append({"run": plan.number, "role": view.role, "files": sorted(view.files),
                          "expanded": view.expanded, "seconds": view.seconds, "statCalls": view.stat_calls,
                          "runDir": str(run_dir), "copy": str(copy), "scratch": str(scratch.root),
                          "holdSec": view.record.reply.hold_sec,
                          "holdSnapshots": len(rt._list(view.record.details.get("treeSnapshotsDuringHold", []))),
                          "holdVersions": sum(map(len, material.hold_versions.values()))
                          if isinstance(material, rt.Material) else 0})


def grade(workspace: Path, options: GradeOptions | None = None) -> Outcome:
    options = options or GradeOptions()
    role_flags = rt.load_json(DATA / "role_flags.json")
    templates = rt.load_json(DATA / "result_templates.json")
    table = rt.FlagTable(rt.load_json(DATA / "cli_flags.json"), role_flags)
    loaded = rt.load_role_schemas(workspace / CONTRACTS, ROLES)
    problems = [schema.error for schema in loaded if schema.error]
    problems += [f"схема роли {s.role} не в подмножестве курса" for s in loaded
                 if s.schema is not None and rt.schema_subset_problems(s.schema)]
    problems += rt.schema_preflight(loaded)
    if problems:
        return Outcome([f"не выполнено: C2: схемы ролей проходят проверку role-contracts урока 2, без этого роль "
                        f"вызова не определить ({problem})" for problem in problems])
    scratch = rt.make_scratch()
    report = Report()
    calls: list[dict[str, object]] = []
    try:
        environment = rt.child_environment(scratch)
        rt.assert_no_real_claude(environment, scratch)
        rt.install_fake_claude(scratch, CHECKS_DIR / "fake_claude.py")
        layout = options.layout or ("nested", "flat")[draw_index(2)]
        copy = rt.copy_workspace(workspace, scratch, layout)
        if options.after_copy is not None:
            options.after_copy(copy)
        lines = snapshot_lines(copy)
        base: dict[str, object] = {"role_flags": role_flags, "templates": templates, "table": table,
                                   "config": reference_config_snapshot(scratch.root)}
        plans = draw_plans()
        held = draw_held_runs(plans)
        for plan in plans:
            held_roles = frozenset(role for role, number in held.items() if number == plan.number)
            run_once(plan, held_roles, copy, scratch, lines, environment, base, loaded, report, calls)
    except rt.PlatformError as error:
        return Outcome([f"ошибка платформы проверки: {error}"], calls, str(error))
    finally:
        shutil.rmtree(scratch.root, ignore_errors=True)
    return Outcome(report.render(), calls)


def main() -> int:
    outcome = grade(Path.cwd())
    for line in outcome.lines:
        print(line)
    if outcome.lines:
        return 1
    print(f"пройдено: {OK_RUNS + FAILURE_RUNS} прогонов пайплайна, из них {FAILURE_RUNS} со сбоем на стыке")
    return 0


if __name__ == "__main__":
    sys.exit(main())
