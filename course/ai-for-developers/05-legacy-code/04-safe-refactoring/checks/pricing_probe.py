"""Child of pricing-extracted (design #45, 6.4): run the drawn inputs against one copy of parcel-desk.

Started as `python3 -I -B pricing_probe.py <oracle|learner> <record fd>` with cwd = a copy of shipping/,
config/ and data/. The nonce and the inputs come on stdin; the record goes out on the fd.

Before parcel-desk is imported, the clock is frozen through datetime.datetime, datetime.date, time.time,
time.time_ns, time.localtime and time.gmtime, so both copies see the same instant per case. The instant is a
local time of the zone the child runs in (TZ); now(tz) and utcnow() return that same instant in tz and in UTC, so
code that reads the clock in another zone than the original sees what it would see on a real machine.
- oracle (pristine copy): P1 and P2 outcomes, and P3's expected totals computed by the pristine quote_parcel
  with the drawn table, zone, fuel percent and a clock on the drawn ship date before the cut-off;
- learner: an import-time wrap adds a mutable delta to shipping.pricing.price_kopecks (P2: the P2 quotes with
  delta 0 and with the drawn delta); P1 runs with delta 0; P3 calls price_kopecks directly while the clock, open,
  io.open and os.open raise and the settings module and the table cache hold decoys, once in the drawn order and once
  reversed, then once more with the real clock reads and openers and only the decoys. open and io.open are the same
  function in every pass, as in a normal process, so a body cannot tell the probe from `open is io.open`.
"""

import builtins
import contextlib
import copy
import datetime as datetime_module
import importlib
import importlib.abc
import importlib.machinery
import io
import json
import os
import sys
import time


class ForbiddenRead(Exception):
    """Raised by the clock and the file openers while P3 calls price_kopecks."""


def main():
    mode, record_fd = sys.argv[1], int(sys.argv[2])
    nonce = sys.stdin.readline().strip()
    inputs = json.loads(sys.stdin.read())
    write_, close_, exit_, dumps_ = os.write, os.close, os._exit, json.dumps

    def finish(record):
        data = dumps_(dict(record, nonce=nonce), default=repr).encode()
        while data:
            data = data[write_(record_fd, data):]
        close_(record_fd)
        exit_(0)

    real_datetime, real_date = datetime_module.datetime, datetime_module.date
    state = {"instant": real_datetime(2026, 1, 1, 10, 0), "forbid": False}
    touched = []

    def look(what):
        if state["forbid"]:
            touched.append(what)
            raise ForbiddenRead(what)

    real_mktime, real_gmtime = time.mktime, time.gmtime

    def epoch_seconds():
        look("clock")
        return real_mktime(state["instant"].timetuple())

    class FrozenDatetime(real_datetime):
        @classmethod
        def now(cls, tz=None):
            look("clock")
            moment = state["instant"]
            if tz is None:
                return cls(moment.year, moment.month, moment.day, moment.hour, moment.minute)
            converted = real_datetime.fromtimestamp(epoch_seconds(), tz)
            return cls(converted.year, converted.month, converted.day, converted.hour, converted.minute,
                       tzinfo=converted.tzinfo, fold=converted.fold)

        @classmethod
        def today(cls):
            return cls.now()

        @classmethod
        def utcnow(cls):
            return cls.now(datetime_module.timezone.utc).replace(tzinfo=None)

    class FrozenDate(real_date):
        @classmethod
        def today(cls):
            look("clock")
            moment = state["instant"]
            return cls(moment.year, moment.month, moment.day)

    real_localtime = time.localtime
    utc_offset_sec = real_localtime(real_mktime(state["instant"].timetuple())).tm_gmtoff
    datetime_module.datetime, datetime_module.date = FrozenDatetime, FrozenDate
    time.time = epoch_seconds
    time.time_ns = lambda: int(epoch_seconds() * 1_000_000_000)
    time.localtime = lambda seconds=None: real_localtime(epoch_seconds() if seconds is None else seconds)
    time.gmtime = lambda seconds=None: real_gmtime(epoch_seconds() if seconds is None else seconds)

    delta = [0]
    if mode == "learner":
        find_spec_ = importlib.machinery.PathFinder.find_spec

        class WrapPricing(importlib.abc.MetaPathFinder):
            def find_spec(self, name, path, target=None):
                if name != "shipping.pricing":
                    return None
                spec = find_spec_(name, path)
                if spec is None or spec.loader is None:
                    return spec
                inner = spec.loader

                class WrappingLoader(importlib.abc.Loader):
                    def create_module(self, module_spec):
                        return inner.create_module(module_spec)

                    def exec_module(self, module):
                        inner.exec_module(module)
                        original = getattr(module, "price_kopecks", None)
                        if callable(original):
                            def price_kopecks(*args, **kwargs):
                                return original(*args, **kwargs) + delta[0]

                            module.price_kopecks = price_kopecks

                spec.loader = WrappingLoader()
                return spec

        sys.meta_path.insert(0, WrapPricing())

    sys.path.insert(0, os.getcwd())
    try:
        config = importlib.import_module("shipping.config")
        tariffs = importlib.import_module("shipping.tariffs")
        quote = importlib.import_module("shipping.quote")
        cli = importlib.import_module("shipping.cli")
        pricing = importlib.import_module("shipping.pricing") if mode == "learner" else None
    except BaseException as error:  # noqa: BLE001 - the learner's import fault is the result
        finish({"importError": f"{type(error).__name__}: {error}"[:300]})

    def at(instant_text):
        state["instant"] = real_datetime.fromisoformat(instant_text)

    def outcome(call):
        try:
            return {"value": call()}
        except Exception as error:  # noqa: BLE001 - an exception is an observable outcome to compare
            return {"error": type(error).__name__, "message": str(error)[:300]}

    def run_cli(argv):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            result = outcome(lambda: cli.main(list(argv)))
        return {"stdout": out.getvalue(), **result}

    record = {"p1": [], "p1cli": [], "utcOffsetSec": utc_offset_sec}
    for case in inputs["p1"]:
        at(case["instant"])
        record["p1"].append(outcome(lambda: quote.quote_parcel(*copy.deepcopy(case["args"]))))
        record["p1cli"].append(run_cli(case["argv"]) if case["argv"] is not None else None)
    # P2 compares the learner's own totals with and without the delta, so a behaviour change that P1 reports does
    # not also read as "quote_parcel does not use price_kopecks".
    for key, shift in (("p2base", 0), ("p2", inputs["delta"] if mode == "learner" else 0)):
        delta[0] = shift
        record[key] = []
        for case in inputs["p2"]:
            at(case["instant"])
            record[key].append(outcome(lambda: quote.quote_parcel(*copy.deepcopy(case["args"]))["total_kopecks"]))
    delta[0] = 0

    if mode == "oracle":
        record["p3"] = []
        real_zone_for = tariffs.zone_for
        for case in inputs["p3"]:
            tariffs._TABLE = copy.deepcopy(case["table"])
            tariffs.zone_for = lambda postcode, zone=case["zone"]: zone
            config.FUEL_PERCENT = case["fuel_percent"]
            at(case["ship_date"] + "T10:00")
            weight, services, declared = case["weight_grams"], case["services"], case["declared_value_kopecks"]
            record["p3"].append(outcome(
                lambda: quote.quote_parcel(weight, "100000", list(services), declared)["total_kopecks"]))
        tariffs.zone_for = real_zone_for
        finish(record)

    def direct(case):
        ship_date = real_date.fromisoformat(case["ship_date"])
        return outcome(lambda: pricing.price_kopecks(
            case["weight_grams"], case["zone"], list(case["services"]), case["declared_value_kopecks"], ship_date,
            copy.deepcopy(case["table"]), case["fuel_percent"]))

    def forbidden_open(what):
        def opener(*args, **kwargs):
            touched.append(what)
            raise ForbiddenRead(what)

        return opener

    real_open, real_io_open, real_os_open = builtins.open, io.open, os.open
    config.FUEL_PERCENT = inputs["decoy_fuel_percent"]
    tariffs._TABLE = copy.deepcopy(inputs["decoy_table"])
    state["forbid"] = True
    file_opener = forbidden_open("file")
    builtins.open, io.open, os.open = file_opener, file_opener, forbidden_open("file")
    try:
        record["p3"] = [direct(case) for case in inputs["p3"]]
        record["p3reversed"] = [direct(case) for case in reversed(inputs["p3"])][::-1]
    finally:
        builtins.open, io.open, os.open = real_open, real_io_open, real_os_open
        state["forbid"] = False
    record["touched"] = sorted(set(touched))
    record["p3plain"] = [direct(case) for case in inputs["p3"]]
    finish(record)


main()
