"""Spec model of the booking calendar (design #44, section 3.1) and its decision mutants.

This is the customer's model: every expected value a module 04 check uses comes from here, never from
the workspace. The same file is copied unchanged into the checks of every lesson that needs it.

Correct rules (3.1), each one switched off by exactly one flag of `Decisions`:
- local time to instant: a time that exists once is that instant; a repeated time is the EARLIER
  instant; a time inside a gap is read with the offset in force BEFORE the transition (Python
  `fold=0`, PEP 495), which moves it forward by the gap length;
- days are local calendar dates in the schedule zone; the weekday is the ISO weekday of the local
  date; a date override replaces the weekly rules of its date, and an override with no intervals is a
  day off;
- window `[s, e)` resolves to `[resolve(s), resolve(e))`, `24:00` is 00:00 of the next local date; a
  window whose resolved end is not after its resolved start gives no slots;
- candidates are `resolved start + k * increment` in elapsed minutes; a candidate is valid when
  `start + duration <= resolved end`;
- conflict: the candidate meeting must not overlap a confirmed booking's buffered interval, and the
  candidate's buffered interval must not overlap a confirmed meeting; intervals are half-open;
  cancelled bookings never block;
- notice: `start >= now + minimumNotice`; window: `start < now + bookingWindowDays * 24 h`;
- the result holds the slots whose start is in `[from, to)`, one per start, sorted by start.

Requests are parsed from strict JSON objects (`parse_request`), with the closed key sets and the
bounds of design 4.L1 / 4.L3. Parse errors carry a Russian message naming the field path.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

# Closed probe-zone set (design 3.1): both hemispheres, +05:30 and +05:45, no-DST zones, no link names.
ZONES = (
    "Europe/Berlin",
    "America/New_York",
    "America/Los_Angeles",
    "Australia/Sydney",
    "Asia/Kolkata",
    "Asia/Kathmandu",
    "Europe/Moscow",
    "UTC",
)
# The fixed clock L7 passes as CALENDAR_NOW; the L1/L3 replay recommendation uses it (design 4.L1).
REPLAY_NOW = "2026-03-01T08:00:00Z"

# Bounds of the EventType model (design 3.2), shared by the contract and the examples.
EVENT_TYPE_BOUNDS = {
    "durationMinutes": (5, 480),
    "slotIncrementMinutes": (5, 240),
    "bufferBeforeMinutes": (0, 240),
    "bufferAfterMinutes": (0, 240),
    "minimumNoticeMinutes": (0, 43200),
    "bookingWindowDays": (1, 365),
}
BUFFER_BOUNDS = (0, 240)
NAME_LENGTH = (1, 120)
# Case bounds of design 4.L3, which the L1 examples share.
MAX_RANGE = timedelta(days=14)
MAX_BOOKINGS = 30

SCHEDULE_KEYS = frozenset({"name", "timeZone", "weekly", "overrides"})
WEEKLY_KEYS = frozenset({"weekday", "start", "end"})
OVERRIDE_KEYS = frozenset({"date", "intervals"})
INTERVAL_KEYS = frozenset({"start", "end"})
EVENT_TYPE_KEYS = frozenset({"title", *EVENT_TYPE_BOUNDS})
BOOKING_KEYS = frozenset({"start", "end", "bufferBeforeMinutes", "bufferAfterMinutes", "status"})
REQUEST_KEYS = frozenset({"now", "schedule", "eventType", "bookings", "from", "to"})
SLOT_KEYS = frozenset({"start", "end"})
BOOKING_STATUSES = frozenset({"confirmed", "cancelled"})

RFC3339 = re.compile(
    r"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:(Z)|([+-])(\d{2}):(\d{2}))$"
)
LOCAL_TIME = re.compile(r"^(\d{2}):(\d{2})$")
LOCAL_DATE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
MINUTES_PER_DAY = 24 * 60


class RequestFormatError(Exception):
    """A request object outside the closed format; `str()` is a Russian message with the field path."""


@dataclass(frozen=True)
class Decisions:
    """One flag per decision of 3.1; every flag False is the customer's model."""

    gap_uses_later_offset: bool = False
    overlap_takes_later_instant: bool = False
    adjacent_intervals_conflict: bool = False
    candidate_buffers_ignored: bool = False
    notice_from_start_of_day: bool = False
    window_one_day_longer: bool = False
    override_merged_with_weekly: bool = False
    weekday_of_utc_date: bool = False
    day_step_is_24_hours: bool = False
    slot_ending_at_window_end_dropped: bool = False
    cancelled_booking_blocks: bool = False
    increment_counted_from_hour: bool = False


CORRECT = Decisions()


@dataclass(frozen=True)
class Mutant:
    id: str
    decisions: Decisions
    decision_class: str  # Russian, names the behaviour, never an example


# The 8 decision mutants of L1 (design 4.L1 check 2) and the 4 more of L3 (design 4.L3).
L1_MUTANTS = (
    Mutant("gap", Decisions(gap_uses_later_offset=True),
           "правило для несуществующего локального времени (время в разрыве при переходе на летнее время)"),
    Mutant("overlap", Decisions(overlap_takes_later_instant=True),
           "правило для повторяющегося локального времени (время, которое при переходе на зимнее время "
           "встречается дважды)"),
    Mutant("adjacency", Decisions(adjacent_intervals_conflict=True),
           "смежные встречи (слот, который кончается ровно там, где начинается занятое время, или "
           "начинается ровно там, где оно кончается)"),
    Mutant("one-side-buffer", Decisions(candidate_buffers_ignored=True),
           "буферы с обеих сторон (буферы нового слота против уже назначенной встречи)"),
    Mutant("notice-from-day-start", Decisions(notice_from_start_of_day=True),
           "минимальное уведомление (отсчёт от текущего момента, а не от начала дня)"),
    Mutant("window-extra-day", Decisions(window_one_day_longer=True),
           "окно бронирования (последний день, на который ещё можно записаться)"),
    Mutant("override-merged", Decisions(override_merged_with_weekly=True),
           "исключение даты (оно заменяет недельное правило этой даты, а не добавляется к нему)"),
    Mutant("weekday-utc", Decisions(weekday_of_utc_date=True),
           "день недели в поясе хоста (а не по дате в UTC)"),
)
L3_EXTRA_MUTANTS = (
    Mutant("day-step-24h", Decisions(day_step_is_24_hours=True),
           "переход к следующему дню по календарной дате, а не прибавлением 24 часов"),
    Mutant("last-slot-dropped", Decisions(slot_ending_at_window_end_dropped=True),
           "последний слот, который кончается ровно в конце окна доступности"),
    Mutant("cancelled-blocks", Decisions(cancelled_booking_blocks=True),
           "отменённое бронирование не занимает время"),
    Mutant("increment-from-hour", Decisions(increment_counted_from_hour=True),
           "шаг слотов отсчитывается от начала окна, а не от начала часа"),
)


@dataclass(frozen=True)
class Interval:
    start_minute: int  # minutes after local midnight, 0..1439
    end_minute: int  # 1..1440; 1440 is 24:00


@dataclass(frozen=True)
class Schedule:
    zone_name: str
    weekly: dict[int, tuple[Interval, ...]]
    overrides: dict[date, tuple[Interval, ...]]

    @property
    def zone(self) -> ZoneInfo:
        return ZoneInfo(self.zone_name)


@dataclass(frozen=True)
class EventType:
    duration: int
    increment: int
    buffer_before: int
    buffer_after: int
    notice: int
    window_days: int


@dataclass(frozen=True)
class Booking:
    start: datetime
    end: datetime
    buffer_before: int
    buffer_after: int
    is_confirmed: bool


@dataclass(frozen=True)
class SlotsRequest:
    now: datetime
    schedule: Schedule
    event_type: EventType
    bookings: tuple[Booking, ...]
    range_from: datetime
    range_to: datetime


Slot = tuple[datetime, datetime]


# ---------------------------------------------------------------------------------------------------
# Timestamps
# ---------------------------------------------------------------------------------------------------


def parse_rfc3339(text: object) -> datetime | None:
    """An aware UTC datetime for RFC 3339 `date-time` with an uppercase `T` and `Z` or `+hh:mm`, else None.

    Seconds are required, a fraction of up to 9 digits is allowed (kept to microseconds by truncation),
    `-00:00`, lowercase `t`/`z`, a space separator and leap second 60 are refused.
    """
    if not isinstance(text, str):
        return None
    match = RFC3339.match(text)
    if not match:
        return None
    year, month, day, hour, minute, second = (int(match.group(i)) for i in range(1, 7))
    fraction = match.group(7) or ""
    if match.group(9) == "-" and match.group(10) == "00" and match.group(11) == "00":
        return None
    try:
        if match.group(8):
            offset = timedelta(0)
        else:
            offset_hours, offset_minutes = int(match.group(10)), int(match.group(11))
            if offset_hours > 23 or offset_minutes > 59:
                return None
            offset = timedelta(hours=offset_hours, minutes=offset_minutes)
            if match.group(9) == "-":
                offset = -offset
        microsecond = int((fraction + "000000")[:6])
        local = datetime(year, month, day, hour, minute, second, microsecond, tzinfo=timezone(offset))
    except ValueError:
        return None
    return local.astimezone(timezone.utc)


def format_local(instant: datetime, zone: ZoneInfo) -> str:
    """`2026-03-08T03:30:00-04:00`: RFC 3339 in the schedule zone, the form the check messages print."""
    local = instant.astimezone(zone)
    text = local.isoformat(timespec="seconds")
    return text[:-6] + "Z" if zone.key == "UTC" and text.endswith("+00:00") else text


# ---------------------------------------------------------------------------------------------------
# Request parsing (closed key sets, bounds)
# ---------------------------------------------------------------------------------------------------


def _object(value: object, path: str, keys: frozenset[str]) -> dict[str, object]:
    if not isinstance(value, dict):
        raise RequestFormatError(f"{path}: ожидался объект JSON")
    unknown = sorted(set(value) - keys)
    if unknown:
        raise RequestFormatError(f"{path}: неизвестные поля {', '.join(unknown)}; допустимы {', '.join(sorted(keys))}")
    missing = sorted(keys - set(value))
    if missing:
        raise RequestFormatError(f"{path}: нет полей {', '.join(missing)}")
    return value


def _integer(value: object, path: str, bounds: tuple[int, int]) -> int:
    if not isinstance(value, int) or isinstance(value, bool):
        raise RequestFormatError(f"{path}: ожидалось целое число")
    low, high = bounds
    if not low <= value <= high:
        raise RequestFormatError(f"{path}: {value} вне диапазона {low}..{high}")
    return value


def _string(value: object, path: str, length: tuple[int, int]) -> str:
    if not isinstance(value, str):
        raise RequestFormatError(f"{path}: ожидалась строка")
    if not length[0] <= len(value) <= length[1]:
        raise RequestFormatError(f"{path}: длина {len(value)} вне диапазона {length[0]}..{length[1]}")
    return value


def _instant(value: object, path: str) -> datetime:
    parsed = parse_rfc3339(value)
    if parsed is None:
        raise RequestFormatError(
            f"{path}: {value!r} не метка времени RFC 3339 со смещением (вида 2026-03-08T09:00:00Z "
            "или 2026-03-08T09:00:00-05:00, буква T заглавная, секунды обязательны)"
        )
    return parsed


def _local_minute(value: object, path: str, *, is_end: bool) -> int:
    match = LOCAL_TIME.match(value) if isinstance(value, str) else None
    if not match:
        raise RequestFormatError(f"{path}: ожидалось время вида HH:MM, получено {value!r}")
    hour, minute = int(match.group(1)), int(match.group(2))
    if hour == 24 and minute == 0:
        if not is_end:
            raise RequestFormatError(f"{path}: 24:00 допускается только как конец интервала")
        return MINUTES_PER_DAY
    if hour > 23 or minute > 59:
        raise RequestFormatError(f"{path}: {value!r} не время суток 00:00..23:59 (или 24:00 как конец)")
    return hour * 60 + minute


def _intervals(items: list[tuple[str, object]], keys: frozenset[str]) -> tuple[Interval, ...]:
    """Parse `{start, end}` objects (plus `weekday` in weekly rules); start < end, no overlaps together."""
    parsed: list[tuple[str, Interval]] = []
    for path, item in items:
        fields = _object(item, path, keys)
        start = _local_minute(fields["start"], f"{path}.start", is_end=False)
        end = _local_minute(fields["end"], f"{path}.end", is_end=True)
        if start >= end:
            raise RequestFormatError(f"{path}: начало {fields['start']} должно быть раньше конца {fields['end']}")
        parsed.append((path, Interval(start, end)))
    parsed.sort(key=lambda pair: pair[1].start_minute)
    for (_, first), (path, second) in zip(parsed, parsed[1:]):
        if second.start_minute < first.end_minute:
            raise RequestFormatError(f"{path}: интервал пересекается с другим интервалом того же дня")
    return tuple(interval for _, interval in parsed)


def _list(value: object, path: str) -> list[object]:
    if not isinstance(value, list):
        raise RequestFormatError(f"{path}: ожидался массив JSON")
    return value


def parse_schedule(value: object, path: str) -> Schedule:
    fields = _object(value, path, SCHEDULE_KEYS)
    _string(fields["name"], f"{path}.name", NAME_LENGTH)
    zone_name = fields["timeZone"]
    if zone_name not in ZONES:
        raise RequestFormatError(f"{path}.timeZone: {zone_name!r} вне набора поясов курса: {', '.join(ZONES)}")
    by_weekday: dict[int, list[tuple[str, object]]] = {}
    for index, item in enumerate(_list(fields["weekly"], f"{path}.weekly")):
        item_path = f"{path}.weekly[{index}]"
        weekday = _integer(_object(item, item_path, WEEKLY_KEYS)["weekday"], f"{item_path}.weekday", (1, 7))
        by_weekday.setdefault(weekday, []).append((item_path, item))
    weekly = {weekday: _intervals(items, WEEKLY_KEYS) for weekday, items in by_weekday.items()}
    overrides: dict[date, tuple[Interval, ...]] = {}
    for index, item in enumerate(_list(fields["overrides"], f"{path}.overrides")):
        item_path = f"{path}.overrides[{index}]"
        override = _object(item, item_path, OVERRIDE_KEYS)
        raw_date = override["date"]
        match = LOCAL_DATE.match(raw_date) if isinstance(raw_date, str) else None
        try:
            day = date(int(match.group(1)), int(match.group(2)), int(match.group(3))) if match else None
        except ValueError:
            day = None
        if day is None:
            raise RequestFormatError(f"{item_path}.date: ожидалась дата вида YYYY-MM-DD, получено {raw_date!r}")
        if day in overrides:
            raise RequestFormatError(f"{item_path}.date: исключение для {raw_date} уже есть")
        raw_intervals = _list(override["intervals"], f"{item_path}.intervals")
        overrides[day] = _intervals([(f"{item_path}.intervals[{i}]", v) for i, v in enumerate(raw_intervals)],
                                    INTERVAL_KEYS)
    return Schedule(zone_name, weekly, overrides)


def parse_event_type(value: object, path: str) -> EventType:
    fields = _object(value, path, EVENT_TYPE_KEYS)
    _string(fields["title"], f"{path}.title", NAME_LENGTH)
    numbers = {key: _integer(fields[key], f"{path}.{key}", bounds) for key, bounds in EVENT_TYPE_BOUNDS.items()}
    return EventType(numbers["durationMinutes"], numbers["slotIncrementMinutes"], numbers["bufferBeforeMinutes"],
                     numbers["bufferAfterMinutes"], numbers["minimumNoticeMinutes"], numbers["bookingWindowDays"])


def parse_booking(value: object, path: str) -> Booking:
    fields = _object(value, path, BOOKING_KEYS)
    start = _instant(fields["start"], f"{path}.start")
    end = _instant(fields["end"], f"{path}.end")
    if end <= start:
        raise RequestFormatError(f"{path}: end должен быть позже start")
    status = fields["status"]
    if status not in BOOKING_STATUSES:
        raise RequestFormatError(f"{path}.status: ожидалось \"confirmed\" или \"cancelled\", получено {status!r}")
    return Booking(start, end, _integer(fields["bufferBeforeMinutes"], f"{path}.bufferBeforeMinutes", BUFFER_BOUNDS),
                   _integer(fields["bufferAfterMinutes"], f"{path}.bufferAfterMinutes", BUFFER_BOUNDS),
                   status == "confirmed")


def parse_request(value: object, path: str = "request") -> SlotsRequest:
    fields = _object(value, path, REQUEST_KEYS)
    now = _instant(fields["now"], f"{path}.now")
    schedule = parse_schedule(fields["schedule"], f"{path}.schedule")
    event_type = parse_event_type(fields["eventType"], f"{path}.eventType")
    raw_bookings = _list(fields["bookings"], f"{path}.bookings")
    if len(raw_bookings) > MAX_BOOKINGS:
        raise RequestFormatError(f"{path}.bookings: {len(raw_bookings)} бронирований, допускается не больше {MAX_BOOKINGS}")
    bookings = tuple(parse_booking(item, f"{path}.bookings[{i}]") for i, item in enumerate(raw_bookings))
    range_from = _instant(fields["from"], f"{path}.from")
    range_to = _instant(fields["to"], f"{path}.to")
    if range_to <= range_from:
        raise RequestFormatError(f"{path}: to должен быть позже from")
    if range_to - range_from > MAX_RANGE:
        raise RequestFormatError(f"{path}: диапазон from..to длиннее {MAX_RANGE.days} суток")
    return SlotsRequest(now, schedule, event_type, bookings, range_from, range_to)


def parse_slot_list(value: object, path: str) -> list[Slot]:
    slots: list[Slot] = []
    for index, item in enumerate(_list(value, path)):
        fields = _object(item, f"{path}[{index}]", SLOT_KEYS)
        slots.append((_instant(fields["start"], f"{path}[{index}].start"),
                      _instant(fields["end"], f"{path}[{index}].end")))
    return slots


# ---------------------------------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------------------------------


def resolve_local(day: date, minute: int, zone: ZoneInfo, decisions: Decisions = CORRECT) -> datetime:
    """The UTC instant of local `day` + `minute` (1440 = 00:00 of the next date) under the 3.1 rule."""
    naive = datetime.combine(day, datetime.min.time()) + timedelta(minutes=minute)
    earlier_offset = naive.replace(tzinfo=zone, fold=0)
    later_offset = naive.replace(tzinfo=zone, fold=1)
    first = earlier_offset.astimezone(timezone.utc)
    second = later_offset.astimezone(timezone.utc)
    if first == second:
        return first
    exists = first.astimezone(zone).replace(tzinfo=None) == naive
    if exists:
        return second if decisions.overlap_takes_later_instant else first
    return second if decisions.gap_uses_later_offset else first


def _overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime, decisions: Decisions) -> bool:
    if decisions.adjacent_intervals_conflict:
        return a_start <= b_end and b_start <= a_end
    return a_start < b_end and b_start < a_end


def _conflicts(start: datetime, end: datetime, event_type: EventType, booking: Booking, decisions: Decisions) -> bool:
    buffered_booking_start = booking.start - timedelta(minutes=booking.buffer_before)
    buffered_booking_end = booking.end + timedelta(minutes=booking.buffer_after)
    if _overlaps(start, end, buffered_booking_start, buffered_booking_end, decisions):
        return True
    if decisions.candidate_buffers_ignored:
        return False
    buffered_start = start - timedelta(minutes=event_type.buffer_before)
    buffered_end = end + timedelta(minutes=event_type.buffer_after)
    return _overlaps(buffered_start, buffered_end, booking.start, booking.end, decisions)


def _day_intervals(schedule: Schedule, day: date, decisions: Decisions) -> tuple[Interval, ...]:
    if decisions.weekday_of_utc_date:
        weekday = resolve_local(day, 0, schedule.zone, decisions).isoweekday()
    else:
        weekday = day.isoweekday()
    weekly = schedule.weekly.get(weekday, ())
    if day not in schedule.overrides:
        return weekly
    if decisions.override_merged_with_weekly:
        return weekly + schedule.overrides[day]
    return schedule.overrides[day]


def _candidate_starts(window_start: datetime, window_end: datetime, interval: Interval, event_type: EventType,
                      decisions: Decisions) -> list[datetime]:
    step = timedelta(minutes=event_type.increment)
    duration = timedelta(minutes=event_type.duration)
    first = window_start
    if decisions.increment_counted_from_hour:
        top_of_hour = window_start - timedelta(minutes=interval.start_minute % 60)
        first = top_of_hour
        while first < window_start:
            first += step
    starts: list[datetime] = []
    candidate = first
    while True:
        end = candidate + duration
        fits = end < window_end if decisions.slot_ending_at_window_end_dropped else end <= window_end
        if not fits:
            return starts
        starts.append(candidate)
        candidate += step


def available_slots(request: SlotsRequest, decisions: Decisions = CORRECT) -> list[Slot]:
    """The slots of the request under the given decisions, sorted by start, one per start."""
    schedule, event_type = request.schedule, request.event_type
    zone = schedule.zone
    first_day = request.range_from.astimezone(zone).date() - timedelta(days=1)
    last_day = request.range_to.astimezone(zone).date() + timedelta(days=1)
    anchor_day = request.range_from.astimezone(zone).date()
    duration = timedelta(minutes=event_type.duration)
    if decisions.notice_from_start_of_day:
        notice_base = resolve_local(request.now.astimezone(zone).date(), 0, zone)
    else:
        notice_base = request.now
    earliest = notice_base + timedelta(minutes=event_type.notice)
    window_days = event_type.window_days + (1 if decisions.window_one_day_longer else 0)
    latest_exclusive = request.now + timedelta(days=window_days)
    blocking = [b for b in request.bookings if b.is_confirmed or decisions.cancelled_booking_blocks]

    found: dict[datetime, Slot] = {}
    day = first_day
    while day <= last_day:
        for interval in _day_intervals(schedule, day, decisions):
            if decisions.day_step_is_24_hours:
                shift = timedelta(days=(day - anchor_day).days)
                window_start = resolve_local(anchor_day, interval.start_minute, zone, decisions) + shift
                window_end = resolve_local(anchor_day, interval.end_minute, zone, decisions) + shift
            else:
                window_start = resolve_local(day, interval.start_minute, zone, decisions)
                window_end = resolve_local(day, interval.end_minute, zone, decisions)
            if window_end <= window_start:
                continue
            for start in _candidate_starts(window_start, window_end, interval, event_type, decisions):
                if not request.range_from <= start < request.range_to:
                    continue
                if start < earliest or start >= latest_exclusive:
                    continue
                end = start + duration
                if any(_conflicts(start, end, event_type, booking, decisions) for booking in blocking):
                    continue
                found.setdefault(start, (start, end))
        day += timedelta(days=1)
    return [found[start] for start in sorted(found)]


def is_replayable_booking(request: SlotsRequest, index: int) -> bool:
    """True when booking `index` can be created through POST /bookings at REPLAY_NOW in listed order.

    The event type is the request's own when duration and buffers match, otherwise a second one with
    the booking's duration and buffers and the request's increment, notice and window (design 4.L1).
    Earlier confirmed bookings block it; cancelled ones were cancelled right after creation.
    """
    booking = request.bookings[index]
    minutes = (booking.end - booking.start) / timedelta(minutes=1)
    if minutes != int(minutes) or not EVENT_TYPE_BOUNDS["durationMinutes"][0] <= minutes <= EVENT_TYPE_BOUNDS["durationMinutes"][1]:
        return False
    event_type = replace(request.event_type, duration=int(minutes), buffer_before=booking.buffer_before,
                         buffer_after=booking.buffer_after)
    replay_now = parse_rfc3339(REPLAY_NOW)
    assert replay_now is not None
    earlier = tuple(b for b in request.bookings[:index] if b.is_confirmed)
    probe = replace(request, now=replay_now, event_type=event_type, bookings=earlier,
                    range_from=booking.start, range_to=booking.start + timedelta(minutes=1))
    return available_slots(probe) == [(booking.start, booking.end)]
