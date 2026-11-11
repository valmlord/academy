"""Check role-call (L2, design #43 revision 6, 5.L2): `call_role` against the grader's fake `claude`.

Run from the workspace as `python3 -I "$ACADEMY_CHECKS_DIR/verify_role_call.py"`. Exit 0 pass, 1 fail.

One graded run makes 10 calls in a shuffled order: coder 4, reviewer 3, summarizer 3. Every call gets a fresh
grader-written roles file whose model and budget for the called role differ from that role's previous call.
Every row of the brief's outcome table appears at least once (the 4.4 scenarios plus `no-result`, a refusal
that prints no `result` message); the other calls succeed. The calls run in a child process
(`call_child.py`, the 4.1 pre-imports and sys.path) from a copy of the workspace; `claude` on its PATH is the
grader's thin client, and the server here records each request and draws its reply.

A request belongs to the planned call whose marker its prompt carries. Each request's line is graded by
C3, C4 and C6-C10 (orchestra_runtime.grade_call, the 4.3 precedence) and C11 (here, under the same precedence), C9 against the project configuration
the lesson ships and the user-scope configuration as it was when the grader started (empty HOME). C9 looks at
the configuration when the request arrives and every 10 ms while the reply is held: one call of each role
holds LONG_HOLD_SEC, the others a short random time (re-run fix round, B1). Under stream-json the
`system/init` line reaches the caller as the hold starts and a working turn (an assistant text, a Read tool
use, its tool result) inside its first half, as the real CLI prints them while it works, so none of them
marks the end of the polling (hold-and-poll round, B2). A call whose every request passes the line rules is then graded on its outcome: the returned object
deep-equal to the drawn `structured_output` (C4), or a RoleCallError with the brief's kind and `result`
deep-equal to the printed result message, None for `no-result` (C5). Messages name the requirement and the situation only.
"""

import ctypes
import sys

if sys.platform.startswith("linux"):
    # First statement, as in every grader of the course: this process holds the drawn replies.
    if ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0) != 0:  # 4 = PR_SET_DUMPABLE
        raise SystemExit("prctl(PR_SET_DUMPABLE) failed")

import json  # noqa: E402
import secrets  # noqa: E402
import shutil  # noqa: E402
import tempfile  # noqa: E402
from dataclasses import dataclass  # noqa: E402
from pathlib import Path  # noqa: E402

CHECKS_DIR = Path(__file__).resolve().parent
sys.dont_write_bytecode = True  # the checks directory gets no __pycache__
sys.path.insert(0, str(CHECKS_DIR))

import orchestra_runtime as rt  # noqa: E402

DATA = CHECKS_DIR / "data"
CONTRACTS = Path("pipeline") / "contracts"
CALLS_PER_ROLE = {"coder": 4, "reviewer": 3, "summarizer": 3}
REVIEW_ROLES = ("reviewer",)
MODEL_POOL = ("sonnet", "opus", "haiku", "fable", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5",
              "claude-fable-5-2", "claude-fable-5-1")
# Budgets are 2-decimal values in [0.05, 9.99], drawn in cents.
BUDGET_MIN_CENTS, BUDGET_MAX_CENTS = 5, 999
CHILD_TIMEOUT_SEC = 60
# Re-run fix round, B1: a settings file written after `claude` started and deleted after it ended reaches a
# real call (Claude Code reloads settings files while it runs), so the fake must still be running when such a
# write lands. One call of each role, drawn at random, holds LONG_HOLD_SEC; any write made earlier than that
# in every call of a role is seen. The other calls hold 0.1-0.5 s. Together about 11 s per run.
LONG_HOLD_SEC = 3.0
SHORT_HOLD_MIN_MS, SHORT_HOLD_MAX_MS = 100, 500
MAX_FINDINGS = 3
SUCCESS_SCENARIO = "ok"
# The brief's last outcome row: `claude` exits non-zero and prints no `result` message. The shared templates
# describe only replies that carry one, so this lesson answers it itself (MarkedResponder).
NO_RESULT_SCENARIO = "no-result"
NO_RESULT_KIND = "failed"
NO_RESULT_STDERR = "Error: the grader's claude refused to start this call; no result message was printed"
# The role names of every message, shared with role-contracts.
ROLE_GENITIVE = rt._str_dict(rt.load_json(DATA / "output_shapes.json")["roleNames"])
SCENARIO_SITUATION = {
    "ok": "успешным ответом со структурным выводом",
    "no-structured": "успешным ответом без структурного вывода",
    "retries": "исчерпанными попытками структурного вывода",
    "budget": "ошибкой лимита расходов",
    "max-turns": "исчерпанным лимитом ходов",
    "execution": "ошибкой во время выполнения",
    "auth": "ошибкой аутентификации",
    NO_RESULT_SCENARIO: "отказом запуска без сообщения result",
}
PROMPTS = {
    "coder": "Исправь округление пени в src/invoices/late_fee.py и запиши diff.",
    "reviewer": "Проверь изменение пени по критериям приёмки и перечисли находки.",
    "summarizer": "Напиши тимлиду итог ревью по переданным находкам.",
}
MESSAGE_C5 = ("C5: сбой вызова не возвращается как ответ: каждый сбой поднимает RoleCallError с видом из брифа, "
              "а его result равен напечатанному сообщению result (None, если сообщения не было)")
MESSAGE_NOT_REACHED = "запрос до claude из PATH не дошёл"
# Judge round 1, B1: a call_role that never hands the role its contract passed every other requirement. The
# check is lesson-local: L3-L5 grade the call line through orchestra_runtime.grade_call, which is unchanged.
MESSAGE_C11 = ("C11: каждый вызов передаёт роли её контракт pipeline/contracts/<роль>.md целиком: файлом в "
               "--append-system-prompt-file или --system-prompt-file, текстом в --append-system-prompt или "
               "--system-prompt, или в промпте")
MESSAGE_NO_MARKER = "в вызове нет промпта, который передала функции проверка"


@dataclass(frozen=True)
class PlannedCall:
    index: int
    role: str
    scenario: str
    model: str
    budget_usd: float
    roles_path: Path
    marker: str
    prompt: str
    structured_output: dict[str, object]
    hold_sec: float


def draw_other(pool: list[str], previous: str | None) -> str:
    choices = [value for value in pool if value != previous]
    return choices[secrets.randbelow(len(choices))]


def draw_text(prefix: str) -> str:
    return f"{prefix} {rt.draw_token()}"


def draw_output(role: str) -> dict[str, object]:
    """A structured_output the role's brief shape allows, carrying fresh 48-bit tokens in every string."""
    if role == "coder":
        return {"diff_path": f"runs/{rt.draw_token()}/coder.diff", "summary": draw_text("Late fee rounding fixed;")}
    if role == "reviewer":
        return {"findings": [
            {"id": rt.draw_finding_id(), "file": "src/invoices/late_fee.py", "line": 1 + secrets.randbelow(60),
             "quote": draw_text("    days ="), "claim": draw_text("Off by one day:"),
             "severity": ("high", "medium", "low")[secrets.randbelow(3)]}
            for _ in range(1 + secrets.randbelow(MAX_FINDINGS))]}
    return {"summary": draw_text("The change has one blocking finding."),
            "finding_ids": [rt.draw_finding_id() for _ in range(1 + secrets.randbelow(MAX_FINDINGS))]}


def shuffled(items: list[str]) -> list[str]:
    result = list(items)
    for position in range(len(result) - 1, 0, -1):
        other = secrets.randbelow(position + 1)
        result[position], result[other] = result[other], result[position]
    return result


def draw_plan(scenarios: list[str], roots: Path) -> list[PlannedCall]:
    """10 calls, every scenario at least once, models and budgets rotated per role; roles files written here."""
    roles = shuffled([role for role, count in CALLS_PER_ROLE.items() for _ in range(count)])
    extra = len(roles) - len(scenarios)
    plan_scenarios = shuffled(scenarios + [SUCCESS_SCENARIO] * extra)
    budgets = [f"{cents / 100:.2f}" for cents in range(BUDGET_MIN_CENTS, BUDGET_MAX_CENTS + 1)]
    current: dict[str, tuple[str, str]] = {role: (draw_other(list(MODEL_POOL), None), draw_other(budgets, None))
                                           for role in CALLS_PER_ROLE}
    long_hold = {role: secrets.randbelow(count) for role, count in CALLS_PER_ROLE.items()}
    seen_per_role = {role: 0 for role in CALLS_PER_ROLE}
    calls = []
    for index, (role, scenario) in enumerate(zip(roles, plan_scenarios)):
        is_long = seen_per_role[role] == long_hold[role]
        seen_per_role[role] += 1
        hold = LONG_HOLD_SEC if is_long else (
            SHORT_HOLD_MIN_MS + secrets.randbelow(SHORT_HOLD_MAX_MS - SHORT_HOLD_MIN_MS + 1)) / 1000
        model = draw_other(list(MODEL_POOL), current[role][0])
        budget = draw_other(budgets, current[role][1])
        current[role] = (model, budget)
        roles_path = roots / f"call-{index}-{secrets.token_hex(4)}" / "roles.json"
        roles_path.parent.mkdir(parents=True)
        roles_path.write_text(json.dumps({name: {"model": value[0], "max_budget_usd": float(value[1])}
                                          for name, value in current.items()}, indent=2), encoding="utf-8")
        marker = f"rc-{secrets.token_hex(8)}"
        calls.append(PlannedCall(index, role, scenario, model, float(budget), roles_path, marker,
                                 f"{PROMPTS[role]}\n\n[вызов {marker}]", draw_output(role), hold))
    return calls


def request_text(request: rt.CallRequest) -> str:
    return "\n".join(request.argv) + "\n" + request.stdin.decode("utf-8", "replace")


def marked_call(request: rt.CallRequest, calls: list[PlannedCall]) -> PlannedCall | None:
    text = request_text(request)
    return next((call for call in calls if call.marker in text), None)


class MarkedResponder(rt.StandardResponder):
    """Ties each request to its planned call by the marker in its prompt, not by the role's call count."""

    def __init__(self, calls: list[PlannedCall], **kwargs: object) -> None:
        super().__init__(**kwargs)  # type: ignore[arg-type]
        self.planned_calls = calls

    def __call__(self, request: rt.CallRequest) -> tuple[rt.FakeReply, dict[str, object]]:
        reply, details = self.reply(request)
        parsed = details["parsed"]
        assert isinstance(parsed, rt.ParsedCall)
        # C11 reads the `-file` targets on arrival: a temporary contract copy may be gone by grading time.
        details["callTexts"] = rt.call_texts(parsed, request.stdin, request.cwd, self.role_flags)
        return reply, details

    def reply(self, request: rt.CallRequest) -> tuple[rt.FakeReply, dict[str, object]]:
        call = marked_call(request, self.planned_calls)
        if call is None or call.scenario != NO_RESULT_SCENARIO:
            return super().__call__(request)
        # The same CLI refusals as every other call, then an exit with no `result` message on stdout.
        parsed = rt.parse_call_line(request.argv, self.table)
        details = self.request_details(request, parsed)
        cli_error = self._cli_error(parsed, request, rt._str_dict(self.templates["cliErrors"]))
        if cli_error is not None:
            details["cliError"] = cli_error
            return rt.FakeReply(1, "", cli_error + "\n"), details
        return rt.FakeReply(1, "", NO_RESULT_STDERR + "\n", call.hold_sec, self.hold_watch(request, details),
                            self.init_stream(parsed, request)), details

    def planned_reply(self, request: rt.CallRequest, role: str | None) -> rt.PlannedReply:
        call = marked_call(request, self.planned_calls)
        if call is None:
            return rt.PlannedReply("execution", None)
        return rt.PlannedReply(call.scenario, call.structured_output, call.hold_sec)


# ---------------------------------------------------------------------------------------------------------
# Grading
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


def reference_config_snapshot(scratch_root: Path) -> dict[str, str]:
    """The lesson's shipped Claude Code configuration, laid out as a project, snapshotted like a call's cwd."""
    project = Path(tempfile.mkdtemp(dir=scratch_root))
    shutil.copytree(DATA / "l1-reference-claude-config", project / ".claude")
    return rt.claude_config_snapshot(project)


def schema_problems(schemas: list[rt.RoleSchema]) -> list[str]:
    problems = [f"{CONTRACTS.as_posix()}/{schema.error}" for schema in schemas if schema.error]
    for schema in schemas:
        if schema.schema is not None and rt.schema_subset_problems(schema.schema):
            problems.append(f"схема {ROLE_GENITIVE[schema.role]} не в подмножестве курса")
    return problems + rt.schema_preflight(schemas)


def normalised_text(text: str) -> str:
    return text.replace("\r\n", "\n")


def load_contracts(contracts_dir: Path) -> dict[str, str]:
    """Each role's contract as C11 looks for it: line endings normalised, blank edges dropped."""
    contracts = {}
    for role in CALLS_PER_ROLE:
        try:
            contracts[role] = normalised_text((contracts_dir / f"{role}.md").read_text(encoding="utf-8")).strip()
        except (OSError, UnicodeDecodeError):
            contracts[role] = ""
    return contracts


def carries_contract(record: rt.CallRecord, contract: str) -> bool:
    """C11: the role's whole contract is in stdin, the positional prompt, a system-prompt value or a file
    named by a `-file` form. An empty contract is never carried: it would match every call."""
    texts = rt._str_list(record.details.get("callTexts", []))
    return bool(contract) and any(contract in normalised_text(text) for text in texts)


def is_line_graded(parsed: rt.ParsedCall, stdin: bytes) -> bool:
    """The 4.3 precedence grade_call applies: an unlisted flag reports only C10, no prompt only C8."""
    return not parsed.c10_args and (bool(stdin) or bool(parsed.positionals))


def grade_requests(call: PlannedCall, records: list[rt.CallRecord], schema: object, contract: str,
                   base_env: dict[str, str], config: dict[str, str], role_flags: dict[str, object],
                   report: Report) -> bool:
    """Grade every request of one planned call by the line rules; True when all of them pass."""
    spec = rt.RoleSpec(call.role, call.role == "coder", call.role in REVIEW_ROLES, call.model, call.budget_usd)
    situation = f"в вызовах {ROLE_GENITIVE[call.role]}"
    is_clean = True
    for record in records:
        parsed = record.details["parsed"]
        assert isinstance(parsed, rt.ParsedCall)
        during_hold = rt._dict_list(record.details.get("claudeConfigDuringHold", []))
        facts = rt.CallFacts(stdin=record.request.stdin, environment=record.request.environment,
                             base_environment=base_env, contract_schema=schema,
                             is_config_unchanged=record.details["claudeConfig"] == config
                             and all(snapshot == config for snapshot in during_hold))
        for failure in rt.grade_call(parsed, facts, spec, role_flags):
            report.add(failure.rule_id, failure.message, situation)
            is_clean = False
        if is_line_graded(parsed, record.request.stdin) and not carries_contract(record, contract):
            report.add("C11", MESSAGE_C11, situation)
            is_clean = False
        if "cliError" in record.details:
            is_clean = False
    return is_clean


def grade_outcome(call: PlannedCall, last: rt.CallRecord, outcome: dict[str, object] | None,
                  templates: dict[str, object], messages: dict[str, str], report: Report) -> None:
    situation = f"в вызове {ROLE_GENITIVE[call.role]} с {SCENARIO_SITUATION[call.scenario]}"
    outcome = outcome or {}
    if call.scenario == NO_RESULT_SCENARIO:
        kind, expected_result = NO_RESULT_KIND, None
    else:
        kind = str(rt._obj(rt._obj(templates["scenarios"])[call.scenario])["kind"])
        if kind == "returned":
            if "returned" not in outcome or not rt.json_equal(outcome["returned"], call.structured_output):
                report.add("C4", messages["C4"], situation)
            return
        drawn = last.details["drawn"]
        assert isinstance(drawn, rt.DrawnResponse)
        expected_result = drawn.result_message
    error = outcome.get("roleCallError")
    is_ok = (isinstance(error, dict) and error.get("kind") == kind and error.get("resultIsJson") is True
             and rt.json_equal(error.get("result"), expected_result))
    if not is_ok:
        report.add("C5", MESSAGE_C5, situation)


def grade_run(calls: list[PlannedCall], records: list[rt.CallRecord], child: dict[str, object],
              schemas: dict[str, object], contracts: dict[str, str], base_env: dict[str, str], config: dict[str, str],
              role_flags: dict[str, object], templates: dict[str, object], report: Report) -> None:
    messages = rt._str_dict(role_flags["messages"])
    outcomes = [rt._obj(o) for o in rt._list(child.get("outcomes", []))]
    by_call: dict[int, list[rt.CallRecord]] = {call.index: [] for call in calls}
    for record in records:
        call = marked_call(record.request, calls)
        if call is not None:
            by_call[call.index].append(record)
            continue
        parsed = record.details["parsed"]
        assert isinstance(parsed, rt.ParsedCall)
        if parsed.c10_args:
            report.add("C10", f"{messages['C10']}; {messages['C10-rest']}", MESSAGE_NO_MARKER)
        else:
            report.add("C8", messages["C8"], MESSAGE_NO_MARKER)
    for call in calls:
        mine = sorted(by_call[call.index], key=lambda r: r.request.t_start)
        if not mine:
            report.add("C8", messages["C8"], f"в вызове {ROLE_GENITIVE[call.role]}: {MESSAGE_NOT_REACHED}")
            continue
        if grade_requests(call, mine, schemas[call.role], contracts[call.role], base_env, config, role_flags,
                          report):
            grade_outcome(call, mine[-1], outcomes[call.index] if call.index < len(outcomes) else None,
                          templates, messages, report)


def main() -> int:
    role_flags = rt.load_json(DATA / "role_flags.json")
    templates = rt.load_json(DATA / "result_templates.json")
    table = rt.FlagTable(rt.load_json(DATA / "cli_flags.json"), role_flags)
    workspace = Path.cwd()
    loaded = rt.load_role_schemas(workspace / CONTRACTS, CALLS_PER_ROLE)
    contracts = load_contracts(workspace / CONTRACTS)
    problems = schema_problems(loaded)
    if problems:
        for problem in problems:
            print(f"не выполнено: C2: схемы ролей проходят проверку role-contracts, без этого роль вызова не "
                  f"определить ({problem})")
        return 1
    scratch = rt.make_scratch()
    try:
        environment = rt.child_environment(scratch)
        rt.assert_no_real_claude(environment, scratch)
        rt.install_fake_claude(scratch, CHECKS_DIR / "fake_claude.py")
        copy = rt.copy_workspace(workspace, scratch)
        config = reference_config_snapshot(scratch.root)
        calls = draw_plan([*rt._obj(templates["scenarios"]), NO_RESULT_SCENARIO], scratch.root / "roles")
        plan_path = scratch.root / "plan.json"
        plan_path.write_text(json.dumps([{"role": c.role, "prompt": c.prompt, "rolesPath": str(c.roles_path)}
                                         for c in calls]), encoding="utf-8")
        responder = MarkedResponder(calls, table=table, role_flags=role_flags, templates=templates, schemas=loaded,
                                    home=str(scratch.home), run_dir=None, plan=lambda role, index: rt.PlannedReply(
                                        "execution", None), watch_config_during_hold=True)
        with rt.FakeClaudeServer(scratch.socket_path, responder) as server:
            child, timed_out = rt.run_reporting_child(CHECKS_DIR / "call_child.py",
                                                      ["--copy", str(copy), "--plan", str(plan_path)], copy,
                                                      environment, CHILD_TIMEOUT_SEC)
            records = server.calls()
            handler_errors = list(server.handler_errors)
        if handler_errors:
            raise rt.PlatformError("; ".join(handler_errors))
        if child is None:
            reason = f"не уложились в {CHILD_TIMEOUT_SEC} с" if timed_out else "процесс с вызовами завершился с ошибкой"
            print(f"не выполнено: десять вызовов call_role проходят до конца ({reason})")
            return 1
        if "importError" in child:
            print(f"не выполнено: pipeline/claude_call.py импортируется, и в нём есть call_role ({child['importError']})")
            return 1
        report = Report()
        schemas = {schema.role: schema.schema for schema in loaded}
        grade_run(calls, records, child, schemas, contracts, environment, config, role_flags, templates, report)
    except rt.PlatformError as error:
        print(f"ошибка платформы проверки: {error}")
        return 1
    finally:
        shutil.rmtree(scratch.root, ignore_errors=True)
    lines = report.render()
    for line in lines:
        print(line)
    if lines:
        return 1
    print("пройдено: 10 вызовов ролей, все сценарии ответа распознаны")
    return 0


if __name__ == "__main__":
    sys.exit(main())
