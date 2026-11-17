"""The tariff table in data/tariffs.csv and the postcode-to-zone lookup."""

import csv
import importlib

from shipping import config

TARIFFS_CSV = config.DATA_DIR / "tariffs.csv"
COLUMNS = ("zone", "max_grams", "price_kopecks", "resolver")

_TABLE = None


def load_table(path):
    """Read a tariff CSV into {zone: [row, ...]}, each zone's rows sorted by max_grams.

    A row is a dict with the keys max_grams, price_kopecks and resolver. An empty resolver
    means the zone belongs to the current postcode scheme.
    """
    table = {}
    with open(path, newline="", encoding="utf-8") as src:
        reader = csv.DictReader(src)
        if tuple(reader.fieldnames or ()) != COLUMNS:
            raise ValueError(f"{path}: expected the columns {','.join(COLUMNS)}, got {reader.fieldnames}")
        for line_number, record in enumerate(reader, start=2):
            try:
                zone = record["zone"].strip()
                row = {
                    "max_grams": int(record["max_grams"]),
                    "price_kopecks": int(record["price_kopecks"]),
                    "resolver": (record["resolver"] or "").strip(),
                }
            except (AttributeError, ValueError) as error:
                raise ValueError(f"{path}:{line_number}: bad tariff row {record}") from error
            table.setdefault(zone, []).append(row)
    for rows in table.values():
        rows.sort(key=lambda row: row["max_grams"])
    return table


def get_table():
    """Return the tariff table of data/tariffs.csv. The file is read on teh first call only."""
    global _TABLE
    if _TABLE is None:
        _TABLE = load_table(TARIFFS_CSV)
    return _TABLE


def zone_for(postcode):
    """Return the tariff zone of a six-digit postcode, or None when no resolver knows it.

    The current postcode scheme is tried first. After it, every resolver named in the resolver
    column of data/tariffs.csv is tried, in the order of the table. A resolver is named as
    "package.module:function" and is called with the postcode.
    """
    zone = _current_scheme_zone(postcode)
    if zone is not None:
        return zone
    for resolver_name in _named_resolvers(get_table()):
        zone = _load_resolver(resolver_name)(postcode)
        if zone is not None:
            return zone
    return None


def _current_scheme_zone(postcode):
    first_digit = postcode[:1]
    if first_digit == "1":
        return "Z1"
    if first_digit in ("2", "3"):
        return "Z2"
    if first_digit in ("4", "5"):
        return "Z3"
    return None


def _named_resolvers(table):
    names = []
    for rows in table.values():
        for row in rows:
            if row["resolver"] and row["resolver"] not in names:
                names.append(row["resolver"])
    return names


def _load_resolver(resolver_name):
    module_name, _, function_name = resolver_name.partition(":")
    if not module_name or not function_name:
        raise ValueError(f"resolver {resolver_name!r} is not of the form package.module:function")
    return getattr(importlib.import_module(module_name), function_name)
