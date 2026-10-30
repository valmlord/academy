"""Typed interface domain D of the graded seams (design #41, section 2.6).

Shared by the seam server (variant side) and the seam proxy (test side). A value crosses the seam as
JSON shaped by a type spec, never by a tag the sender chooses, and both sides check it against the
spec: arguments against D before any variant code runs, answers against the declared return type
before any test sees them. Anything outside gets one fixed error that is the same for every variant.

The module is stdlib only and imports `invoices.models` lazily: the late_fee seam needs no model,
the plan_reminders seam reads the pristine model the grader put on `sys.path`.
"""

import dataclasses
import re
from datetime import date

ARGUMENTS_OUTSIDE = "{name}: arguments outside the interface domain"
RETURN_OUTSIDE = "{name}: return value outside the interface domain"
NOT_A_SEAM_NAME = "not a seam name"

# Builtin exception types forwarded by type and message; any other type becomes one fixed RuntimeError.
FORWARDED_EXCEPTIONS: dict[str, type[Exception]] = {
    "ValueError": ValueError,
    "TypeError": TypeError,
    "KeyError": KeyError,
    "IndexError": IndexError,
    "ZeroDivisionError": ZeroDivisionError,
    "ArithmeticError": ArithmeticError,
    "OverflowError": OverflowError,
    "AttributeError": AttributeError,
    "NotImplementedError": NotImplementedError,
}
OTHER_EXCEPTION = "implementation raised an exception outside the forwarded builtin types"

# L1 domain: docs/late-fee.md states the result for every value in this range.
LATE_FEE_LIMIT = 1_000_000_000
# L5/L7 domain: docs/feature-brief.md and task.md print these bounds (identifiers are integers too).
MONEY_LIMIT = 1_000_000_000
MAX_ITEMS = 50
FIRST_DAY = date(2000, 1, 1)
LAST_DAY = date(2099, 12, 31)
IDENTIFIER = re.compile(r"[A-Za-z0-9-]{1,64}")
ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")


class DomainError(Exception):
    """A value is outside the spec; the caller turns it into the fixed seam error."""


# Type specs: ("int", low, high) with None for an open bound, ("str",), ("date",),
# ("enum", class name), ("list", item spec, max length or None), ("dc", class name).
TypeSpec = tuple[object, ...]

ARGUMENT_FIELDS: dict[str, tuple[tuple[str, TypeSpec], ...]] = {
    "InvoiceLine": (("description", ("str",)), ("amount_cents", ("int", 0, MONEY_LIMIT))),
    "Invoice": (
        ("id", ("int", 0, MONEY_LIMIT)),
        ("customer", ("str",)),
        ("currency", ("str",)),
        ("status", ("enum", "InvoiceStatus")),
        ("dispute", ("enum", "DisputeState")),
        ("issued_on", ("date",)),
        ("due_on", ("date",)),
        ("lines", ("list", ("dc", "InvoiceLine"), MAX_ITEMS)),
        ("paid_cents", ("int", 0, MONEY_LIMIT)),
    ),
    "SentReminder": (
        ("invoice_id", ("int", 0, MONEY_LIMIT)),
        ("level", ("enum", "ReminderLevel")),
        ("sent_on", ("date",)),
    ),
}
# An outstanding balance sums up to 50 lines of 10^9 each, so it is not bounded by the argument limit.
# Exact types are still required.
RETURN_FIELDS: dict[str, tuple[tuple[str, TypeSpec], ...]] = {
    "Reminder": (
        ("invoice_id", ("int", 0, MONEY_LIMIT)),
        ("customer", ("str",)),
        ("level", ("enum", "ReminderLevel")),
        ("outstanding_cents", ("int", None, None)),
        ("currency", ("str",)),
    ),
}


@dataclasses.dataclass(frozen=True)
class SeamSpec:
    name: str
    parameters: tuple[str, ...]
    argument_specs: tuple[TypeSpec, ...]
    return_spec: TypeSpec
    fields: dict[str, tuple[tuple[str, TypeSpec], ...]]


SEAMS = {
    "late_fee": SeamSpec(
        "late_fee",
        ("amount_cents", "days_late"),
        (("int", -LATE_FEE_LIMIT, LATE_FEE_LIMIT), ("int", -LATE_FEE_LIMIT, LATE_FEE_LIMIT)),
        ("int", None, None),
        {},
    ),
    "plan_reminders": SeamSpec(
        "plan_reminders",
        ("invoices", "sent_reminders", "today"),
        (("list", ("dc", "Invoice"), MAX_ITEMS), ("list", ("dc", "SentReminder"), MAX_ITEMS), ("date",)),
        ("list", ("dc", "Reminder"), None),
        {**ARGUMENT_FIELDS, **RETURN_FIELDS},
    ),
}


def _model(class_name: str) -> type:
    from invoices import models  # the pristine copy; the grader controls sys.path on both sides

    found = getattr(models, class_name, None)
    if not isinstance(found, type):
        raise DomainError(class_name)
    return found


def _check_int(value: object, spec: TypeSpec) -> int:
    if type(value) is not int:
        raise DomainError("int")
    low, high = spec[1], spec[2]
    if (isinstance(low, int) and value < low) or (isinstance(high, int) and value > high):
        raise DomainError("int bound")
    return value


def _check_date(value: object) -> date:
    if type(value) is not date or not FIRST_DAY <= value <= LAST_DAY:
        raise DomainError("date")
    return value


def _item_spec(spec: TypeSpec) -> TypeSpec:
    item = spec[1]
    if not isinstance(item, tuple):
        raise DomainError("list item spec")
    return item


def _fields_of(seam: SeamSpec, class_name: str) -> tuple[tuple[str, TypeSpec], ...]:
    fields = seam.fields.get(class_name)
    if fields is None:
        raise DomainError(class_name)
    return fields


def encode(value: object, spec: TypeSpec, seam: SeamSpec) -> object:
    """Python value -> JSON value, raising DomainError when the value is outside the spec."""
    kind = spec[0]
    if kind == "int":
        return _check_int(value, spec)
    if kind == "str":
        if type(value) is not str or not IDENTIFIER.fullmatch(value):
            raise DomainError("str")
        return value
    if kind == "date":
        return _check_date(value).isoformat()
    if kind == "enum":
        enum_class = _model(str(spec[1]))
        if type(value) is not enum_class:
            raise DomainError("enum")
        return str(getattr(value, "name"))
    if kind == "list":
        limit = spec[2]
        if not isinstance(value, list) or type(value) is not list or (isinstance(limit, int) and len(value) > limit):
            raise DomainError("list")
        return [encode(item, _item_spec(spec), seam) for item in value]
    if kind == "dc":
        class_name = str(spec[1])
        if type(value) is not _model(class_name):
            raise DomainError("dataclass")
        return {name: encode(getattr(value, name), field_spec, seam) for name, field_spec in _fields_of(seam, class_name)}
    raise DomainError(f"unknown spec {kind!r}")


def decode(value: object, spec: TypeSpec, seam: SeamSpec) -> object:
    """JSON value -> Python value, raising DomainError when the value is outside the spec."""
    kind = spec[0]
    if kind == "int":
        return _check_int(value, spec)
    if kind == "str":
        if type(value) is not str or not IDENTIFIER.fullmatch(value):
            raise DomainError("str")
        return value
    if kind == "date":
        if type(value) is not str or not ISO_DATE.fullmatch(value):
            raise DomainError("date text")
        try:
            parsed = date.fromisoformat(value)
        except ValueError as error:
            raise DomainError("date text") from error
        return _check_date(parsed)
    if kind == "enum":
        enum_class = _model(str(spec[1]))
        members = getattr(enum_class, "__members__", {})
        if type(value) is not str or value not in members:
            raise DomainError("enum")
        return members[value]
    if kind == "list":
        limit = spec[2]
        if not isinstance(value, list) or type(value) is not list or (isinstance(limit, int) and len(value) > limit):
            raise DomainError("list")
        return [decode(item, _item_spec(spec), seam) for item in value]
    if kind == "dc":
        class_name = str(spec[1])
        fields = _fields_of(seam, class_name)
        if not isinstance(value, dict) or type(value) is not dict or set(value) != {name for name, _ in fields}:
            raise DomainError("dataclass")
        return _model(class_name)(**{name: decode(value[name], field_spec, seam) for name, field_spec in fields})
    raise DomainError(f"unknown spec {kind!r}")


def bind_arguments(seam: SeamSpec, args: tuple[object, ...], kwargs: dict[str, object]) -> list[object]:
    """Positional and keyword arguments -> the parameter list; a missing or extra argument is outside D."""
    if len(args) > len(seam.parameters):
        raise DomainError("too many arguments")
    bound: dict[str, object] = dict(zip(seam.parameters, args))
    for key, value in kwargs.items():
        if key not in seam.parameters or key in bound:
            raise DomainError("unexpected argument")
        bound[key] = value
    if set(bound) != set(seam.parameters):
        raise DomainError("missing argument")
    return [bound[name] for name in seam.parameters]
