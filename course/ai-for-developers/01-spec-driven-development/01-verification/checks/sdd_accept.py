"""Acceptance cases drawn fresh for every run of check (A) (design #41, section 2.6).

Fixed acceptance inputs can be recorded by the learner's module, which receives every call in the
seam server, and answered from a lookup table on the next submission (student run A, cheat 12). So
every run of (A) also draws inputs from the interface domain D with `secrets`, per requirement, and
takes the expected answers from the reference in a seam server of its own. A table of earlier inputs
covers none of them; only behaviour that follows the requirements passes. Shared by L1, L5 and L7;
copied unchanged into each lesson's checks.

Inputs are built in the wire form of `fixtures/seam_interface.py` (JSON shaped by the type spec), so
the grader needs no model import; the acceptance tests decode them with the same interface module.
"""

import json
import secrets
import string
from collections.abc import Callable
from datetime import date, timedelta

from sdd_seam import OracleError, SeamLesson, oracle_answers

PLACEHOLDER = "DRAWN: dict[str, list[list[object]]] = {}  # replaced per run by the grader\n"
ARGUMENTS_OUTSIDE = "arguments outside the interface domain"
CASES_PER_REQUIREMENT = 30
LATE_FEE_CASES_PER_REQUIREMENT = 60  # cheap calls; enough that each boundary is drawn in every run

# Bounds of D, the same numbers as fixtures/seam_interface.py and the requirement documents.
LATE_FEE_LIMIT = 1_000_000_000
MONEY_LIMIT = 1_000_000_000
FIRST_DAY = date(2000, 1, 1)
LAST_DAY = date(2099, 12, 31)
# Every drawn date lies within this many days before `today`, so `today` keeps that margin from the
# bounds of D and no drawn date leaves it.
DATE_MARGIN_DAYS = 600

# Requirement numbers of docs/late-fee.md (L1).
GRACE_DAYS = 5
CAP_FROM_DAYS = 105  # (days - 5) * 0.1% reaches the 10% cap at 100 charged days
# Requirement numbers of docs/spec.md (L5/L7).
FIRST_AFTER_DAYS = 7
ESCALATION_DAYS = 14
MIN_BALANCE_CENTS = 500

LEVELS = ("FIRST", "SECOND", "FINAL")
STATUSES = ("DRAFT", "ISSUED", "PAID", "CANCELLED")
CURRENCIES = ("EUR", "USD", "GBP", "SEK", "CHF")

Rng = secrets.SystemRandom
Call = list[object]


# ---------------------------------------------------------------------------------------------------
# L1 late_fee(amount_cents, days_late)
# ---------------------------------------------------------------------------------------------------


def _late_fee_case(rng: Rng, requirement: str) -> Call:
    positive = rng.randint(1, LATE_FEE_LIMIT) if rng.random() < 0.5 else rng.randint(1, 99_999)
    pick = rng.random()
    if requirement == "req_01":
        # The grace boundary on both sides, then the whole range up to it.
        if pick < 0.5:
            return [rng.randint(1_000, LATE_FEE_LIMIT), rng.randint(GRACE_DAYS, GRACE_DAYS + 1)]
        days = rng.randint(-LATE_FEE_LIMIT, GRACE_DAYS) if pick < 0.75 else rng.randint(-10, GRACE_DAYS)
        return [positive, days]
    if requirement in ("req_02", "req_03"):
        if requirement == "req_02" and rng.random() < 0.3:
            positive = rng.randint(1, 1_000_000) * 1_000  # whole per-mille amounts: no rounding involved
        return [positive, rng.randint(GRACE_DAYS + 1, CAP_FROM_DAYS - 1)]
    if requirement == "req_04":
        days = rng.randint(CAP_FROM_DAYS, LATE_FEE_LIMIT) if rng.random() < 0.5 else rng.randint(CAP_FROM_DAYS - 5, 400)
        return [positive, days]
    if pick < 0.4:
        amount = rng.randint(-1, 0)  # the boundary of "positive"
    else:
        amount = rng.randint(-LATE_FEE_LIMIT, 0) if pick < 0.7 else rng.randint(-10, 0)
    return [amount, rng.randint(-LATE_FEE_LIMIT, LATE_FEE_LIMIT)]


def draw_late_fee(rng: Rng) -> dict[str, list[Call]]:
    return {
        requirement: [_late_fee_case(rng, requirement) for _ in range(LATE_FEE_CASES_PER_REQUIREMENT)]
        for requirement in ("req_01", "req_02", "req_03", "req_04", "req_05")
    }


# ---------------------------------------------------------------------------------------------------
# L5/L7 plan_reminders(invoices, sent_reminders, today)
# ---------------------------------------------------------------------------------------------------


class _Call:
    """One plan_reminders call under construction: ids, customers and dates share one context."""

    def __init__(self, rng: Rng) -> None:
        self.rng = rng
        span = (LAST_DAY - FIRST_DAY).days
        self.today = FIRST_DAY + timedelta(days=rng.randint(DATE_MARGIN_DAYS, span - DATE_MARGIN_DAYS))
        # Capitalised ASCII names: code-point order and case-insensitive order agree, so "ordered by
        # Customer" has one reading.
        self.customers = [self._name() for _ in range(rng.randint(2, 4))]
        self.used_ids: set[int] = set()
        self.invoice_ids: list[int] = []
        self.invoices: list[dict[str, object]] = []
        self.history: list[dict[str, object]] = []

    def _name(self) -> str:
        rng = self.rng
        return rng.choice(string.ascii_uppercase) + "".join(
            rng.choice(string.ascii_lowercase) for _ in range(rng.randint(2, 8)))

    def new_id(self) -> int:
        rng = self.rng
        while True:
            candidate = rng.randint(1, 9_999) if rng.random() < 0.5 else rng.randint(0, MONEY_LIMIT)
            if candidate not in self.used_ids:
                self.used_ids.add(candidate)
                return candidate

    def day(self, days_ago: int) -> str:
        return (self.today - timedelta(days=days_ago)).isoformat()

    def lines_for(self, balance: int, big: bool) -> tuple[list[dict[str, object]], int]:
        """Invoice lines and a paid amount whose difference is `balance` (any difference when `big`)."""
        rng = self.rng
        count = rng.randint(1, 6 if big else 4)
        if big:
            amounts = [rng.randint(0, MONEY_LIMIT) for _ in range(count)]
            paid = rng.randint(0, min(sum(amounts), MONEY_LIMIT))
        else:
            total = max(balance, 0) + rng.randint(0, 50_000)
            cuts = sorted(rng.randint(0, total) for _ in range(count - 1))
            amounts = [high - low for low, high in zip([0, *cuts], [*cuts, total])]
            paid = total - balance
        lines = [{"description": f"line-{index}-{rng.randint(0, 999)}", "amount_cents": amount}
                 for index, amount in enumerate(amounts)]
        return lines, paid

    def invoice(self, *, overdue: int, balance: int | None = None, status: str = "ISSUED",
                dispute: str = "NONE", invoice_id: int | None = None, big: bool = False) -> int:
        rng = self.rng
        if balance is None:
            balance = rng.randint(MIN_BALANCE_CENTS, 2_000_000)
        lines, paid = self.lines_for(balance, big)
        identifier = self.new_id() if invoice_id is None else invoice_id
        self.invoice_ids.append(identifier)
        self.invoices.append({
            "id": identifier,
            "customer": rng.choice(self.customers),
            "currency": rng.choice(CURRENCIES),
            "status": status,
            "dispute": dispute,
            "issued_on": self.day(overdue + rng.randint(0, 60)),
            "due_on": self.day(overdue),
            "lines": lines,
            "paid_cents": paid,
        })
        return identifier

    def sent(self, invoice_id: int, level: str, days_ago: int) -> None:
        self.history.append({"invoice_id": invoice_id, "level": level, "sent_on": self.day(days_ago)})

    def escalated(self, top: str, days_since_top: int, *, status: str = "ISSUED", dispute: str = "NONE") -> None:
        """An invoice whose reminders went up to `top`, the latest of level `top` sent `days_since_top`
        days ago. Sometimes an earlier reminder of level `top` is in the history too (docs/spec.md: the
        latest one counts). Dates run in level order: every lower level was sent before."""
        rng = self.rng
        identifier = self.new_id()
        self.sent(identifier, top, days_since_top)
        days_ago = days_since_top
        if rng.random() < 0.4:
            days_ago += rng.randint(1, ESCALATION_DAYS - 1)
            self.sent(identifier, top, days_ago)
        for level in reversed(LEVELS[:LEVELS.index(top)]):
            days_ago += rng.randint(ESCALATION_DAYS, 40)
            self.sent(identifier, level, days_ago)
        overdue = days_ago + rng.randint(FIRST_AFTER_DAYS, 30)
        self.invoice(overdue=overdue, status=status, dispute=dispute, invoice_id=identifier)

    def noise(self) -> None:
        """Reminders of invoices that are not in the input: they must not change the plan."""
        for _ in range(self.rng.randint(0, 3)):
            self.sent(self.new_id(), self.rng.choice(LEVELS), self.rng.randint(0, 120))

    def any_invoice(self, *, status: str = "ISSUED", dispute: str = "NONE") -> None:
        rng = self.rng
        top = rng.choice((None, *LEVELS))
        if top is None:
            self.invoice(overdue=rng.randint(-10, 60), status=status, dispute=dispute)
        else:
            self.escalated(top, rng.randint(0, 40), status=status, dispute=dispute)

    def encoded(self) -> Call:
        self.rng.shuffle(self.history)
        return [self.invoices, self.history, self.today.isoformat()]


def _boundary_or(rng: Rng, boundary: int, low: int, high: int) -> int:
    return rng.randint(boundary - 2, boundary + 1) if rng.random() < 0.5 else rng.randint(low, high)


def _reminders_case(rng: Rng, requirement: str) -> Call:
    call = _Call(rng)
    count = rng.randint(1, 3)
    if requirement == "req_01":
        for _ in range(count):
            call.invoice(overdue=_boundary_or(rng, FIRST_AFTER_DAYS, -30, 60))
    elif requirement in ("req_02", "req_03"):
        for _ in range(count):
            call.escalated("FIRST" if requirement == "req_02" else "SECOND", _boundary_or(rng, ESCALATION_DAYS, 0, 60))
    elif requirement == "req_04":
        for _ in range(count):
            call.escalated("FINAL", rng.randint(0, 200))
    elif requirement == "req_05":
        for _ in range(count):
            # 499 and 500 straddle "below 500"; then the whole range around it, negative included.
            boundary = rng.random() < 0.5
            balance = MIN_BALANCE_CENTS - rng.randint(0, 1) if boundary else rng.randint(-5_000, 5_000)
            call.invoice(overdue=rng.randint(FIRST_AFTER_DAYS, 90), balance=balance)
    elif requirement == "req_06":
        for _ in range(count + 1):
            call.any_invoice(status=rng.choice(STATUSES))
    elif requirement == "req_07":
        for _ in range(count):
            call.invoice(overdue=rng.randint(FIRST_AFTER_DAYS, 90), big=rng.random() < 0.4)
    elif requirement == "req_08":
        for _ in range(rng.randint(3, 8)):
            if call.invoice_ids and rng.random() < 0.25:
                # The same id again: docs/spec.md says only the first occurrence counts.
                call.invoice(overdue=rng.randint(-10, 60), status=rng.choice(STATUSES),
                             invoice_id=rng.choice(call.invoice_ids))
            else:
                call.any_invoice(status=rng.choice(("ISSUED", "ISSUED", "ISSUED", "PAID")))
    else:  # the dispute change of L7
        for _ in range(count):
            call.any_invoice(dispute=rng.choice(("OPEN", "OPEN", "RESOLVED", "NONE")))
    call.noise()
    return call.encoded()


def draw_reminders(rng: Rng, with_dispute: bool) -> dict[str, list[Call]]:
    requirements = [f"req_{number:02d}" for number in range(1, 9)] + (["dispute"] if with_dispute else [])
    return {requirement: [_reminders_case(rng, requirement) for _ in range(CASES_PER_REQUIREMENT)]
            for requirement in requirements}


# ---------------------------------------------------------------------------------------------------
# The acceptance source of one run
# ---------------------------------------------------------------------------------------------------


Draw = Callable[[Rng], dict[str, list[Call]]]


def acceptance_source(lesson: SeamLesson, template: bytes, reference: bytes, draw: Draw) -> bytes:
    """The acceptance tests with this run's drawn cases and the reference's answers filled in.

    Raises OracleError when the template has no placeholder or the reference does not answer every
    call inside D: a grader fault, reported as such rather than as the learner's failure.
    """
    text = template.decode("utf-8")
    if text.count(PLACEHOLDER) != 1:
        raise OracleError("acceptance template without exactly one DRAWN placeholder")
    drawn = draw(secrets.SystemRandom())
    flat = [arguments for cases in drawn.values() for arguments in cases]
    try:
        answers = iter(oracle_answers(lesson, reference, flat))
    except (OSError, ValueError) as error:
        raise OracleError(f"reference server failed: {type(error).__name__}") from error
    filled = {category: [[arguments, next(answers)] for arguments in cases] for category, cases in drawn.items()}
    for cases in filled.values():
        for _, answer in cases:
            exception = answer.get("exc") if isinstance(answer, dict) else None
            if isinstance(exception, list) and ARGUMENTS_OUTSIDE in str(exception[-1]):
                raise OracleError("a drawn case lies outside the interface domain")
    line = f"DRAWN: dict[str, list[list[object]]] = json.loads({json.dumps(filled, separators=(',', ':'))!r})\n"
    return text.replace(PLACEHOLDER, line).encode("utf-8")
