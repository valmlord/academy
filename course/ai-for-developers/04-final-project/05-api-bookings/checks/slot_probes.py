"""Stratified random slot probes (design #44, 4.L3 `slots-accepted` and 4.L4 `api-read-conformance`).

A probe is one slot request in the case format of 4.L1 (`{now, schedule, eventType, bookings, from, to}`)
plus the model's answer. Probes are drawn fresh for every check run from a `random.Random` the caller
seeds from the system; nothing here is secret, and every stratum is asserted in code:

- zone x day kind: the four DST zones x {gap, overlap, ordinary} and the four zones without DST x
  {ordinary}, 16 strata. A gap (overlap) probe has a window bound inside the non-existent (repeated) local
  hour of a real 2026-2028 transition, and the model's mutant for that decision must answer differently;
- feature: each feature names the decision mutants a probe of it must kill (FEATURE_KILLS), so a probe
  that would not tell a decision apart is redrawn. Drawing all candidates first and selecting afterwards
  keeps the time spent independent of anything a server could learn.

The same file is copied unchanged into the L3 and L4 checks; a demo asserts the copies are equal.
"""

from __future__ import annotations

import json
import random
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import model

DST_ZONES = ("Europe/Berlin", "America/New_York", "America/Los_Angeles", "Australia/Sydney")
FLAT_ZONES = ("Asia/Kolkata", "Asia/Kathmandu", "Europe/Moscow", "UTC")
DAY_KINDS = ("gap", "overlap", "ordinary")
STRATA = tuple((zone, kind) for zone in DST_ZONES for kind in DAY_KINDS) + tuple((zone, "ordinary") for zone in FLAT_ZONES)

# Each feature and the decision mutants (model mutant ids) its probes must distinguish from the model.
FEATURE_KILLS: dict[str, tuple[str, ...]] = {
    "plain": ("last-slot-dropped",),
    "grid": ("increment-from-hour",),
    "override-replace": ("override-merged",),
    "override-off": ("override-merged",),
    "buffers": ("one-side-buffer", "adjacency"),
    "cancelled": ("cancelled-blocks",),
    "notice": ("notice-from-day-start",),
    "window": ("window-extra-day",),
    "midnight": (),
    "multi-window": (),
}
FEATURES = tuple(FEATURE_KILLS)
# Features that need bookings; the HTTP read side (L4) has none.
BOOKING_FEATURES = frozenset({"buffers", "cancelled"})
KIND_KILLS = {"gap": ("gap",), "overlap": ("overlap",), "ordinary": ()}
MUTANTS = {mutant.id: mutant for mutant in model.L1_MUTANTS + model.L3_EXTRA_MUTANTS}
YEARS = (2026, 2027, 2028)
MAX_ATTEMPTS = 400
STEP_MINUTES = 5
# Offsets the probes may write `from` and `to` with, besides Z and the zone's own offset: the instants are
# the same, only the notation differs (3.2 decision 4).
EXTRA_OFFSETS_MINUTES = (345, 330, -210, 600, -480, 0)


class ProbeGenerationError(Exception):
    """The generator could not draw a stratum: a grader defect, reported as a grader error."""


@dataclass(frozen=True)
class Transition:
    instant: datetime
    old_offset: timedelta
    new_offset: timedelta

    @property
    def kind(self) -> str:
        return "gap" if self.new_offset > self.old_offset else "overlap"

    def local_span(self) -> tuple[datetime, datetime]:
        """Naive local [first, last) wall times that do not exist (gap) or occur twice (overlap)."""
        before = (self.instant + self.old_offset).replace(tzinfo=None)
        after = (self.instant + self.new_offset).replace(tzinfo=None)
        return (before, after) if before < after else (after, before)


@dataclass(frozen=True)
class Probe:
    zone: str
    kind: str
    feature: str
    request: dict[str, object]  # case-format request object, JSON-ready
    parsed: model.SlotsRequest
    expected: list[model.Slot]


def load_transitions(path: Path) -> dict[str, list[Transition]]:
    """Transitions of the DST zones from checks/data/tzdata-expected.json (the table the self-check uses)."""
    table = json.loads(path.read_text(encoding="utf-8"))
    result: dict[str, list[Transition]] = {}
    for name, zone in table["zones"].items():
        offset = timedelta(minutes=zone["initialOffsetMinutes"])
        changes: list[Transition] = []
        for instant, minutes in zone["changes"]:
            new = timedelta(minutes=minutes)
            changes.append(Transition(datetime.fromisoformat(instant.replace("Z", "+00:00")), offset, new))
            offset = new
        result[name] = changes
    return result


def hhmm(minute: int) -> str:
    return f"{minute // 60:02d}:{minute % 60:02d}"


def format_instant(instant: datetime, offset_minutes: int) -> str:
    """RFC 3339 with uppercase T, seconds, and Z or ±hh:mm: the only forms the probes send (3.2 decision 4)."""
    local = instant.astimezone(timezone(timedelta(minutes=offset_minutes)))
    text = local.strftime("%Y-%m-%dT%H:%M:%S")
    if offset_minutes == 0:
        return text + "Z"
    sign = "+" if offset_minutes > 0 else "-"
    absolute = abs(offset_minutes)
    return f"{text}{sign}{absolute // 60:02d}:{absolute % 60:02d}"


def choose_offset(rng: random.Random, instant: datetime, zone: ZoneInfo) -> int:
    pick = rng.random()
    if pick < 0.4:
        offset = instant.astimezone(zone).utcoffset()
        assert offset is not None
        return int(offset.total_seconds() // 60)
    if pick < 0.7:
        return 0
    return rng.choice(EXTRA_OFFSETS_MINUTES)


class ProbeGenerator:
    def __init__(self, transitions: dict[str, list[Transition]], rng: random.Random) -> None:
        self.transitions = transitions
        self.rng = rng

    # -- dates ---------------------------------------------------------------------------------------

    def _transition(self, zone: str, kind: str, after: datetime | None, within_days: int | None) -> Transition | None:
        options = [t for t in self.transitions[zone] if t.kind == kind]
        if after is not None:
            options = [t for t in options if t.instant > after + timedelta(days=1)]
            if within_days is not None:
                options = [t for t in options if t.instant < after + timedelta(days=within_days)]
        return self.rng.choice(options) if options else None

    def _ordinary_date(self, zone: str, after: datetime | None, within_days: int | None) -> date:
        far = [t.instant.date() for t in self.transitions.get(zone, [])]
        while True:
            if after is None:
                day = date(self.rng.choice(YEARS), 1, 1) + timedelta(days=self.rng.randrange(365))
            else:
                day = (after + timedelta(days=self.rng.randrange(2, within_days or 60))).date()
            if all(abs((day - other).days) > 3 for other in far):
                return day

    # -- one probe -----------------------------------------------------------------------------------

    def draw(self, zone_name: str, kind: str, feature: str, fixed_now: datetime | None = None,
             max_range_days: int = 14) -> Probe:
        """A probe of the stratum whose model answer differs from every mutant the stratum names."""
        required = KIND_KILLS[kind] + FEATURE_KILLS[feature]
        for _ in range(MAX_ATTEMPTS):
            candidate = self._attempt(zone_name, kind, feature, fixed_now, max_range_days)
            if candidate is None:
                continue
            parsed = model.parse_request(candidate)
            expected = model.available_slots(parsed)
            if not expected:
                continue
            if all(model.available_slots(parsed, MUTANTS[mutant].decisions) != expected for mutant in required):
                if self._feature_holds(feature, parsed, expected):
                    return Probe(zone_name, kind, feature, candidate, parsed, expected)
        raise ProbeGenerationError(f"stratum {zone_name}/{kind}/{feature} not drawn in {MAX_ATTEMPTS} attempts")

    def _feature_holds(self, feature: str, parsed: model.SlotsRequest, expected: list[model.Slot]) -> bool:
        zone = parsed.schedule.zone
        if feature == "midnight":
            # A slot that ends at 24:00 local, i.e. at 00:00 of the next local date.
            return any(end.astimezone(zone).time() == datetime.min.time() for _, end in expected)
        if feature == "multi-window":
            local_dates = {start.astimezone(zone).date() for start, _ in expected}
            return len(local_dates) >= 2
        return True

    def _attempt(self, zone_name: str, kind: str, feature: str, fixed_now: datetime | None,
                 max_range_days: int) -> dict[str, object] | None:
        rng = self.rng
        zone = ZoneInfo(zone_name)
        within = 360 if fixed_now is not None else None
        if feature == "notice" and fixed_now is not None:
            within = 29
        transition: Transition | None = None
        if kind == "ordinary":
            day = self._ordinary_date(zone_name, fixed_now, within)
        else:
            transition = self._transition(zone_name, kind, fixed_now, within)
            if transition is None:
                return None
            day = transition.local_span()[0].date()

        intervals = self._day_intervals(kind, transition, feature)
        if intervals is None:
            return None
        weekday = day.isoweekday()
        weekly: list[dict[str, object]] = []
        overrides: list[dict[str, object]] = []
        if feature == "override-replace":
            # The override carries the probe's windows; the weekly rules of that weekday are different ones.
            weekly += [{"weekday": weekday, "start": hhmm(s), "end": hhmm(e)} for s, e in self._random_intervals(1, 2)]
            overrides.append({"date": day.isoformat(),
                              "intervals": [{"start": hhmm(s), "end": hhmm(e)} for s, e in intervals]})
        elif feature == "override-off":
            # `day` keeps its weekly windows; the next date is a day off although its weekday has rules.
            weekly += [{"weekday": weekday, "start": hhmm(s), "end": hhmm(e)} for s, e in intervals]
            weekly += [{"weekday": weekday % 7 + 1, "start": hhmm(s), "end": hhmm(e)} for s, e in self._random_intervals(1, 2)]
            overrides.append({"date": (day + timedelta(days=1)).isoformat(), "intervals": []})
        else:
            weekly += [{"weekday": weekday, "start": hhmm(s), "end": hhmm(e)} for s, e in intervals]
            if feature == "multi-window":
                for other in rng.sample([d for d in range(1, 8) if d != weekday], rng.randint(1, 3)):
                    weekly += [{"weekday": other, "start": hhmm(s), "end": hhmm(e)}
                               for s, e in self._random_intervals(1, 2)]
            if feature == "midnight":
                weekly += [{"weekday": weekday % 7 + 1, "start": "00:00", "end": hhmm(rng.randrange(60, 600, 30))}]
            if rng.random() < 0.3:
                other_day = day + timedelta(days=rng.choice((-6, -5, 5, 6)))
                overrides.append({"date": other_day.isoformat(), "intervals": []})
        rng.shuffle(weekly)

        duration = rng.choice((15, 20, 25, 30, 40, 45, 50, 60, 90))
        increment = duration if feature == "plain" else rng.choice((5, 10, 15, 20, 25, 30, 45, 60))
        if feature == "grid":
            increment = rng.choice((10, 20, 25, 35, 40, 45))
        buffer_before = rng.choice((0, 0, 5, 10, 15, 30))
        buffer_after = rng.choice((0, 0, 5, 10, 15, 30))
        if feature == "buffers":
            buffer_before, buffer_after = rng.choice((5, 10, 15, 20, 30)), rng.choice((5, 10, 15, 20, 30))

        day_start = model.resolve_local(day, 0, zone)
        if fixed_now is None:
            now = day_start - timedelta(days=rng.randint(1, 20), minutes=rng.randrange(0, 1440, 7))
        else:
            now = fixed_now
        notice = rng.choice((0, 0, 30, 60, 120))
        window_days = 365 if fixed_now is not None else rng.randint(25, 120)
        lead = (day_start - now) / timedelta(minutes=1)
        if lead <= notice:
            notice = 0
        if lead <= 0:
            return None

        if feature == "notice":
            first_window = model.resolve_local(day, intervals[0][0], zone)
            last_window = model.resolve_local(day, intervals[-1][1], zone)
            target = first_window + (last_window - first_window) * rng.uniform(0.2, 0.8)
            if fixed_now is None:
                now = target - timedelta(minutes=rng.randint(60, 900))
            notice = int((target - now) / timedelta(minutes=1))
            if not 1 <= notice <= model.EVENT_TYPE_BOUNDS["minimumNoticeMinutes"][1]:
                return None
        if feature == "window":
            first_window = model.resolve_local(day, intervals[0][0], zone)
            last_window = model.resolve_local(day, intervals[-1][1], zone)
            target = first_window + (last_window - first_window) * rng.uniform(0.2, 0.8)
            if fixed_now is None:
                window_days = rng.randint(1, 60)
                now = target - timedelta(days=window_days)
                notice = 0
            else:
                whole_days = int((target - now) / timedelta(days=1))
                if not 1 <= whole_days <= 364:
                    return None
                window_days = whole_days
            # The cutoff now + days lands inside `day`, and the mutant's (one day longer) lands a day later.

        bookings = self._bookings(feature, zone, day, intervals, duration, increment, buffer_before, buffer_after,
                                  now, notice, window_days, weekly, overrides)
        if bookings is None:
            return None

        span_days = rng.randint(2, 4) if feature in ("midnight", "multi-window", "override-off") else rng.randint(1, 2)
        span_days = min(span_days, max_range_days)
        lead_hours = rng.choice((0, 0, 1, 3, 6, 12))
        range_from = day_start - timedelta(hours=lead_hours)
        if feature in ("midnight", "multi-window"):
            range_from -= timedelta(days=1)
        range_to = model.resolve_local(day + timedelta(days=span_days), 0, zone) + timedelta(hours=rng.choice((0, 0, 2)))
        if range_to - range_from > timedelta(days=max_range_days):
            range_to = range_from + timedelta(days=max_range_days)

        return {
            "now": format_instant(now, choose_offset(rng, now, zone)),
            "schedule": {"name": rng.choice(("Ирина", "Host", "A" * rng.randint(1, 120))), "timeZone": zone_name,
                         "weekly": weekly, "overrides": overrides},
            "eventType": {"title": rng.choice(("Знакомство", "Intro call", "T" * rng.randint(1, 120))),
                          "durationMinutes": duration, "slotIncrementMinutes": increment,
                          "bufferBeforeMinutes": buffer_before, "bufferAfterMinutes": buffer_after,
                          "minimumNoticeMinutes": notice, "bookingWindowDays": window_days},
            "bookings": bookings,
            "from": format_instant(range_from, choose_offset(rng, range_from, zone)),
            "to": format_instant(range_to, choose_offset(rng, range_to, zone)),
        }

    # -- windows -------------------------------------------------------------------------------------

    def _random_intervals(self, low: int, high: int) -> list[tuple[int, int]]:
        """1-3 non-overlapping [start, end) minute pairs on the 5-minute grid within one local day."""
        rng = self.rng
        count = rng.randint(low, high)
        cuts = sorted(rng.sample(range(0, 24 * 60 // STEP_MINUTES + 1), count * 2))
        intervals = [(cuts[i] * STEP_MINUTES, cuts[i + 1] * STEP_MINUTES) for i in range(0, len(cuts), 2)]
        return [(s, e) for s, e in intervals if e - s >= 60] or [(9 * 60, 12 * 60)]

    def _day_intervals(self, kind: str, transition: Transition | None, feature: str) -> list[tuple[int, int]] | None:
        """Intervals of the probe date; for a gap/overlap kind one bound lies inside the DST span."""
        rng = self.rng
        if feature == "midnight":
            base = [(rng.randrange(12, 22) * 60, 24 * 60)]
        elif feature == "grid":
            start = rng.randrange(6, 14) * 60 + rng.choice((5, 10, 15, 25, 35, 40, 50))
            base = [(start, start + rng.randrange(120, 360, 5))]
        elif feature == "multi-window":
            base = self._random_intervals(2, 3)
        else:
            base = self._random_intervals(1, 2)
        if transition is None:
            return sorted(base)
        first, last = transition.local_span()
        span_start = first.hour * 60 + first.minute
        span_end = span_start + int((last - first) / timedelta(minutes=1))
        bound = rng.randrange(span_start, span_end, STEP_MINUTES)
        if rng.random() < 0.5:
            dst_interval = (bound, min(24 * 60, bound + rng.randrange(60, 300, 15)))
        else:
            dst_interval = (max(0, bound - rng.randrange(60, 240, 15)), bound)
        if dst_interval[0] >= dst_interval[1]:
            return None
        others = [(s, e) for s, e in base if e <= dst_interval[0] or s >= dst_interval[1]]
        return sorted([dst_interval, *others])

    # -- bookings ------------------------------------------------------------------------------------

    def _bookings(self, feature: str, zone: ZoneInfo, day: date, intervals: list[tuple[int, int]], duration: int,
                  increment: int, buffer_before: int, buffer_after: int, now: datetime, notice: int, window_days: int,
                  weekly: list[dict[str, object]], overrides: list[dict[str, object]]) -> list[dict[str, object]] | None:
        rng = self.rng
        if feature not in BOOKING_FEATURES:
            return []
        free_request = model.parse_request({
            "now": format_instant(now, 0),
            "schedule": {"name": "x", "timeZone": zone.key, "weekly": weekly, "overrides": overrides},
            "eventType": {"title": "x", "durationMinutes": duration, "slotIncrementMinutes": increment,
                          "bufferBeforeMinutes": buffer_before, "bufferAfterMinutes": buffer_after,
                          "minimumNoticeMinutes": notice, "bookingWindowDays": window_days},
            "bookings": [], "from": format_instant(model.resolve_local(day, 0, zone), 0),
            "to": format_instant(model.resolve_local(day + timedelta(days=1), 0, zone), 0)})
        free = model.available_slots(free_request)
        if len(free) < 3:
            return None
        bookings: list[dict[str, object]] = []
        if feature == "buffers":
            # One booking right after a candidate's own after-buffer (touching: adjacency), one that only the
            # candidate's before-buffer reaches (one-side buffer), with booking buffers of their own.
            start, end = rng.choice(free)
            touching = end + timedelta(minutes=buffer_after)
            bookings.append(self._booking(touching, rng.choice((15, 30, 45)), 0, rng.choice((0, 5, 10)), "confirmed"))
            start2, end2 = rng.choice(free)
            reached = start2 - timedelta(minutes=rng.randint(1, max(1, buffer_before)) + rng.choice((15, 30)))
            bookings.append(self._booking(reached, rng.choice((15, 30)), 0, 0, "confirmed"))
        else:
            start, end = rng.choice(free)
            bookings.append(self._booking(start, duration, rng.choice((0, 10)), rng.choice((0, 10)), "cancelled"))
            if rng.random() < 0.5:
                other_start, _ = rng.choice(free)
                bookings.append(self._booking(other_start, rng.choice((15, 30)), 0, 0, "confirmed"))
        rng.shuffle(bookings)
        return bookings

    @staticmethod
    def _booking(start: datetime, minutes: int, before: int, after: int, status: str) -> dict[str, object]:
        return {"start": format_instant(start, 0), "end": format_instant(start + timedelta(minutes=minutes), 0),
                "bufferBeforeMinutes": before, "bufferAfterMinutes": after, "status": status}


def engine_probe_set(generator: ProbeGenerator) -> list[Probe]:
    """L3: every stratum x every feature, 16 x 10 = 160 probes, shuffled."""
    probes = [generator.draw(zone, kind, feature) for zone, kind in STRATA for feature in FEATURES]
    generator.rng.shuffle(probes)
    assert_engine_coverage(probes)
    return probes


def assert_engine_coverage(probes: list[Probe]) -> None:
    seen = {(probe.zone, probe.kind, probe.feature) for probe in probes}
    missing = [(zone, kind, feature) for zone, kind in STRATA for feature in FEATURES if (zone, kind, feature) not in seen]
    if missing:
        raise ProbeGenerationError(f"strata missing: {missing[:5]}")
    for probe in probes:
        for mutant in KIND_KILLS[probe.kind] + FEATURE_KILLS[probe.feature]:
            if model.available_slots(probe.parsed, MUTANTS[mutant].decisions) == probe.expected:
                raise ProbeGenerationError(f"probe {probe.zone}/{probe.kind}/{probe.feature} keeps mutant {mutant}")


def with_range(probe: Probe, range_to: datetime) -> model.SlotsRequest:
    """The parsed request with another `to` (L4's 31-day edge; the case format caps a range at 14 days)."""
    return replace(probe.parsed, range_to=range_to)
