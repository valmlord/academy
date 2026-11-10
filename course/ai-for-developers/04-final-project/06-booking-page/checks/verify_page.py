"""page-ssr (design #44, 4.L6): the built booking page renders the API's slots on the server, in the invitee's zone.

1. The grader builds checks/data/refserver/ (7.5) before any learner process starts and hands it, through the
   AF_UNIX handshake, random schedules and event types and a fixed `now`. The refserver answers the read side
   of the contract with the L3 reference engine; the grader asserts its slots equal checks/data/model.py.
2. In a fresh copy of the workspace it runs `make -s build-web`, then `make -s serve-web` (HOST, PORT), both with
   CALENDAR_API_URL = the refserver's address in the 7.1 environment, one after the other.
3. Three pages /book/{eventTypeId}?date=YYYY-MM-DD&tz=<IANA> are fetched without JavaScript, one on a date when
   the invitee zone changes its clocks. Every element with `data-slot-start` is one slot: the set of instants
   must equal the slots whose start falls on that local date in tz, each exactly once, and the element's text
   must be the local start as HH:MM (24 h) in tz.
4. GET /api/event-types through the Nuxt server must return the refserver's items.
"""

from __future__ import annotations

import json
import random
import secrets
import shutil
import string
import sys
import time
import urllib.parse
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from zoneinfo import ZoneInfo

CHECKS_DIR = Path(__file__).resolve().parent
# `python3 -I` leaves the script directory off sys.path; the shared modules live next to this script.
sys.path.insert(0, str(CHECKS_DIR))
sys.path.insert(0, str(CHECKS_DIR / "data"))

import final_runtime as runtime  # noqa: E402
import model  # noqa: E402
import slot_probes  # noqa: E402

DATA = CHECKS_DIR / "data"
BUILD_WEB_TIMEOUT_SEC = 300
READY_TIMEOUT_SEC = 60
PAGE_TIMEOUT_SEC = 20
PAGES = 3
MAX_SHOWN = 6
BOOKING_WINDOW_DAYS = 60


@dataclass(frozen=True)
class Page:
    event_type_id: str
    day: date
    tz: str
    is_dst_day: bool
    expected: list[model.Slot]

    @property
    def path(self) -> str:
        query = urllib.parse.urlencode({"date": self.day.isoformat(), "tz": self.tz}, quote_via=urllib.parse.quote)
        return f"/book/{self.event_type_id}?{query}"

    @property
    def label(self) -> str:
        kind = ", день перевода часов в этом поясе" if self.is_dst_day else ""
        return f"страница {self.path} (дата {self.day.isoformat()} в поясе {self.tz}{kind})"


@dataclass
class Scenario:
    now: datetime
    schedules: list[dict[str, object]]
    event_types: list[dict[str, object]]
    pages: list[Page]


def random_id(rng: random.Random) -> str:
    return "".join(rng.choice(string.ascii_letters + string.digits) for _ in range(rng.randint(10, 24)))


def local_day(day: date, zone: ZoneInfo) -> tuple[datetime, datetime]:
    return model.resolve_local(day, 0, zone), model.resolve_local(day + timedelta(days=1), 0, zone)


def draw_scenario(rng: random.Random, transitions: dict[str, list[slot_probes.Transition]]) -> Scenario:
    for _ in range(500):
        now = datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(minutes=rng.randrange(0, 2 * 365 * 24 * 60))
        changes = [(zone, t) for zone in slot_probes.DST_ZONES for t in transitions[zone]
                   if timedelta(days=2) < t.instant - now < timedelta(days=BOOKING_WINDOW_DAYS - 5)]
        if changes:
            break
    else:
        raise runtime.GraderError("генератор проб не справился (нет перевода часов в окне)")
    dst_zone, change = rng.choice(changes)
    schedules: list[dict[str, object]] = []
    event_types: list[dict[str, object]] = []
    # The DST page: a schedule open all day, so the local day of the change shows the missing or repeated hour.
    full_zone = rng.choice((dst_zone, "UTC", rng.choice(model.ZONES)))
    schedules.append({"id": random_id(rng), "name": "Хост, весь день", "timeZone": full_zone, "overrides": [],
                      "weekly": [{"weekday": d, "start": "00:00", "end": "24:00"} for d in range(1, 8)]})
    other_zone = rng.choice(model.ZONES)
    weekly = []
    for weekday in range(1, 8):
        start = rng.randrange(6 * 60, 12 * 60, 30)
        end = start + rng.randrange(180, 600, 30)
        weekly.append({"weekday": weekday, "start": slot_probes.hhmm(start), "end": slot_probes.hhmm(end)})
        # A second window to 24:00 on about half the days, never overlapping the first one.
        if rng.random() < 0.5 and end <= 22 * 60:
            late = rng.randrange(max(18 * 60, end), 22 * 60 + 1, 30)
            weekly.append({"weekday": weekday, "start": slot_probes.hhmm(late), "end": "24:00"})
    schedules.append({"id": random_id(rng), "name": "Хост, рабочие часы", "timeZone": other_zone, "weekly": weekly, "overrides": []})
    for schedule in schedules:
        duration = rng.choice((15, 30, 45, 60))
        event_types.append({"id": random_id(rng), "title": rng.choice(("Знакомство", "Консультация", "Intro call")),
                            "durationMinutes": duration, "slotIncrementMinutes": rng.choice((15, 30, duration)),
                            "bufferBeforeMinutes": rng.randint(0, 15), "bufferAfterMinutes": rng.randint(0, 15),
                            "minimumNoticeMinutes": rng.choice((0, 60, 240)), "bookingWindowDays": BOOKING_WINDOW_DAYS,
                            "scheduleId": schedule["id"]})
    parsed = {s["id"]: model.parse_schedule({k: v for k, v in s.items() if k != "id"}, "schedule") for s in schedules}
    parsed_types = {e["id"]: model.parse_event_type({k: v for k, v in e.items() if k not in ("id", "scheduleId")}, "eventType")
                    for e in event_types}

    def page_for(et: dict[str, object], day: date, tz: str, is_dst_day: bool) -> Page | None:
        request = model.SlotsRequest(now, parsed[str(et["scheduleId"])], parsed_types[str(et["id"])], (), *local_day(day, ZoneInfo(tz)))
        expected = model.available_slots(request)
        return Page(str(et["id"]), day, tz, is_dst_day, expected) if expected else None

    pages: list[Page] = []
    dst_page = page_for(event_types[0], change.instant.astimezone(ZoneInfo(dst_zone)).date(), dst_zone, True)
    if dst_page is None:
        raise runtime.GraderError("генератор проб не справился (пустой день перевода часов)")
    pages.append(dst_page)
    for _ in range(400):
        if len(pages) == PAGES:
            break
        et = rng.choice(event_types)
        tz = rng.choice(model.ZONES)
        day = (now + timedelta(days=rng.randint(2, BOOKING_WINDOW_DAYS - 5))).astimezone(ZoneInfo(tz)).date()
        page = page_for(et, day, tz, False)
        if page is not None and all(p.path != page.path for p in pages):
            pages.append(page)
    if len(pages) < PAGES:
        raise runtime.GraderError("генератор проб не справился (страницы без слотов)")
    rng.shuffle(pages)
    return Scenario(now, schedules, event_types, pages)


class SlotElements(HTMLParser):
    """Every element carrying data-slot-start, with all the text inside it (comments and tags dropped)."""

    VOID = frozenset({"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"})

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.found: list[tuple[str, list[str]]] = []
        self.open: list[tuple[str, int]] = []  # (tag, index in found)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = [value for name, value in attrs if name == "data-slot-start"]
        if values:
            self.found.append((values[0] or "", []))
            if tag not in self.VOID:
                self.open.append((tag, len(self.found) - 1))
            return
        if self.open and tag not in self.VOID:
            self.open.append((tag, -1))

    def handle_endtag(self, tag: str) -> None:
        while self.open:
            open_tag, _ = self.open.pop()
            if open_tag == tag:
                break

    def handle_data(self, data: str) -> None:
        for _, index in self.open:
            if index >= 0:
                self.found[index][1].append(data)

    def slots(self) -> list[tuple[str, str]]:
        return [(value, "".join(parts).strip()) for value, parts in self.found]


def show(instants: list[datetime], tz: str) -> str:
    zone = ZoneInfo(tz)
    shown = [model.format_local(i, zone) for i in instants[:MAX_SHOWN]]
    more = len(instants) - len(shown)
    return ", ".join(shown) + (f" и ещё {more}" if more > 0 else "") if shown else "нет"


def judge_page(page: Page, response: runtime.HttpResponse) -> list[str]:
    if response.status != 200:
        return [f"{page.label}: ответ {response.status}, а ожидалась страница 200"]
    media = runtime.media_type(response.header("content-type"))
    if media != "text/html":
        return [f"{page.label}: Content-Type {media or 'не указан'}, а ожидался text/html"]
    parser = SlotElements()
    parser.feed(response.body.decode("utf-8", "replace"))
    found = parser.slots()
    expected = {start: end for start, end in page.expected}
    zone = ZoneInfo(page.tz)
    if not found:
        return [f"{page.label}: в HTML от сервера нет ни одного элемента с data-slot-start, а у API на эту дату слотов "
                f"{len(expected)}. Слоты должны быть в HTML, который отдаёт сервер (SSR), без JavaScript в браузере"]
    problems: list[str] = []
    seen: list[datetime] = []
    wrong_text: str | None = None  # only the first wrong text is shown; every instant is still collected
    for value, text in found:
        instant = runtime.parse_response_date_time(value)
        if instant is None:
            problems.append(f"{page.label}: data-slot-start=\"{value[:60]}\" не метка времени RFC 3339 со смещением")
            continue
        seen.append(instant)
        local = instant.astimezone(zone).strftime("%H:%M")
        if instant in expected and text != local and wrong_text is None:
            wrong_text = (f"{page.label}: у слота {model.format_local(instant, zone)} текст \"{text[:40]}\", а должен быть "
                          f"{local}: начало слота в поясе {page.tz}, 24 часа")
    if wrong_text:
        problems.append(wrong_text)
    missing = sorted(set(expected) - set(seen))
    extra = sorted(set(seen) - set(expected))
    repeated = sorted({i for i in seen if seen.count(i) > 1})
    if missing or extra:
        problems.append(f"{page.label}: слоты на странице не те, что у API на эту местную дату.\n"
                        f"    нет на странице: {show(missing, page.tz)}\n"
                        f"    лишние на странице: {show(extra, page.tz)}")
    if repeated:
        problems.append(f"{page.label}: слоты {show(repeated, page.tz)} встречаются на странице несколько раз, а нужен один элемент на слот")
    return problems


def wait_ready(server: runtime.BackgroundChild, port: int) -> str | None:
    deadline = time.monotonic() + READY_TIMEOUT_SEC
    while time.monotonic() < deadline:
        if server.exit_code() is not None:
            return f"make -s serve-web завершился до начала проверки (код {server.exit_code()}):\n{server.tail()}"
        try:
            runtime.http_probe(port, "GET", "/", timeout_sec=5, extra_headers=(("Accept", "text/html"),))
            return None
        except runtime.ProbeTransportError:
            time.sleep(0.3)
    return f"make -s serve-web не начал отвечать на 127.0.0.1:{port} за {READY_TIMEOUT_SEC} с (HOST и PORT из окружения):\n{server.tail()}"


def assert_refserver(ref_port: int, scenario: Scenario) -> None:
    """The refserver and the model must agree on every page's day; otherwise the grader itself is wrong."""
    for page in scenario.pages:
        start, end = local_day(page.day, ZoneInfo(page.tz))
        query = urllib.parse.urlencode({"from": slot_probes.format_instant(start, 0), "to": slot_probes.format_instant(end, 0)},
                                       quote_via=urllib.parse.quote)
        response = runtime.http_probe(ref_port, "GET", f"/event-types/{page.event_type_id}/slots?{query}")
        items = json.loads(response.body)["items"] if response.status == 200 else None
        got = [(runtime.parse_response_date_time(i["start"]), runtime.parse_response_date_time(i["end"])) for i in items or []]
        if got != page.expected:
            raise runtime.GraderError("служебный сервер расходится с моделью заказчика")


def evaluate(workspace: Path) -> tuple[list[str], str]:
    rng = random.Random(secrets.randbits(64))
    scenario = draw_scenario(rng, slot_probes.load_transitions(DATA / "tzdata-expected.json"))
    bench = runtime.open_workbench(workspace, ("go", "make", "node"))
    launcher: runtime.RefServerLauncher | None = None
    reference: runtime.RefServer | None = None
    server: runtime.BackgroundChild | None = None
    try:
        launcher = runtime.RefServerLauncher(runtime.build_refserver(bench.layout, bench.root), bench.root)
        reference = launcher.start({"now": slot_probes.format_instant(scenario.now, 0), "schedules": scenario.schedules,
                                    "eventTypes": scenario.event_types})
        assert_refserver(reference.port, scenario)
        api_url = f"http://127.0.0.1:{reference.port}"
        copy = runtime.fresh_copy(bench.snapshot, bench.runs_dir)
        env = runtime.learner_run_env(bench, copy.parent, {"CALENDAR_API_URL": api_url}, rng)
        make = runtime.tool_path(bench.layout, "make")
        built = runtime.run_child([make, "-s", "build-web"], copy, env, BUILD_WEB_TIMEOUT_SEC)
        if built.timed_out:
            return [f"make -s build-web не уложился в {BUILD_WEB_TIMEOUT_SEC} с:\n{built.tail()}"], ""
        if built.exit_code != 0:
            return [f"make -s build-web завершился с кодом {built.exit_code}:\n{built.tail()}"], ""
        port = runtime.free_loopback_port()
        server = runtime.BackgroundChild([make, "-s", "serve-web"], copy, {**env, "HOST": "127.0.0.1", "PORT": str(port)})
        not_ready = wait_ready(server, port)
        if not_ready:
            return [not_ready], ""
        problems: list[str] = []
        for page in scenario.pages:
            try:
                response = runtime.http_probe(port, "GET", page.path, timeout_sec=PAGE_TIMEOUT_SEC, extra_headers=(("Accept", "text/html"),))
            except runtime.ProbeTransportError as error:
                problems.append(f"{page.label}: нет ответа ({error})")
                continue
            problems += judge_page(page, response)
        problems += judge_proxy(port, scenario)
        return problems, (f"Пройдено: страница отрисовала на сервере слоты из API на {PAGES} датах в поясе приглашённого, "
                          f"включая день перевода часов, и /api/ проксирует запросы на бэкенд (TZ процесса {env['TZ']}).")
    finally:
        if server is not None:
            server.stop()
        if reference is not None:
            reference.stop()
        if launcher is not None:
            launcher.close()
        shutil.rmtree(bench.root, ignore_errors=True)


def judge_proxy(port: int, scenario: Scenario) -> list[str]:
    label = "GET /api/event-types через сервер страницы"
    try:
        response = runtime.http_probe(port, "GET", "/api/event-types")
    except runtime.ProbeTransportError as error:
        return [f"{label}: нет ответа ({error})"]
    try:
        data = runtime.strict_json(response.body.decode("utf-8"))
    except (UnicodeDecodeError, runtime.StrictJsonError):
        data = None
    if response.status != 200 or not isinstance(data, dict) or data.get("items") != scenario.event_types:
        return [f"{label}: ответ {response.status} {runtime.media_type(response.header('content-type')) or ''}, а ожидался "
                "список видов встреч бэкенда из CALENDAR_API_URL: /api/** должен проксироваться на бэкенд"]
    return []


def main() -> int:
    runtime.make_grader_non_dumpable()
    try:
        runtime.tzdata_self_check(DATA / "tzdata-expected.json")
        problems, passed = evaluate(Path.cwd().resolve())
    except runtime.GraderError as error:
        print(error)
        return 1
    except runtime.InterferenceError as error:
        print(error)
        return 1
    if problems:
        print("\n".join(problems[:15]))
        return 1
    print(passed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
