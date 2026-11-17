"""The carrier manifest: one CSV file per day that lists the day's labels."""

import csv
from datetime import date, datetime, timedelta

from shipping import config, tariffs


def build_manifest(day=None):
    """Collect the labels stamped on day into the carrier manifest and return the manifest's path.

    day is a datetime.date and defaults to today.
    """
    if day is None:
        day = date.today()
    spool = config.SPOOL_DIR
    spool.mkdir(parents=True, exist_ok=True)
    labels_of_day = sorted(_labels_stamped_on(spool, day), key=lambda label: label["seq"])
    bounds = _bracket_bounds(tariffs.get_table())

    path = spool / f"manifest-{day:%Y%m%d}.csv"
    with open(path, "w", newline="", encoding="utf-8") as out:
        writer = csv.writer(out)
        writer.writerow(["seq", "tracking", "weight_kg", "carrier_bracket", "declared_rub", "ship_date"])
        for label in labels_of_day:
            if label.get("status") == "VOID":
                continue
            weight_text = label["weight"].split()[0]
            writer.writerow([
                f"{label['seq']:06d}",
                label["tracking"],
                weight_text,
                _carrier_bracket(_grams(weight_text), bounds),
                format_rubles(int(label["declared"])),
                label["ship date"],
            ])

    for label in labels_of_day:
        label["path"].rename(label["path"].with_suffix(".done"))
    return path


def format_rubles(kopecks):
    """Whole rubles for the carrier manifest, as text."""
    return str((kopecks + 49) // 100)


def _labels_stamped_on(spool, day):
    start = datetime(day.year, day.month, day.day)
    end = start + timedelta(days=1)
    found = []
    for path in spool.glob("*.lbl"):
        label = _read_label(path)
        stamp = datetime.strptime(label["stamp"], "%d.%m.%Y %H:%M")
        if start <= stamp < end:
            found.append(label)
    return found


def _read_label(path):
    label = {"path": path}
    with open(path, encoding="utf-8") as src:
        for line in src:
            key, separator, value = line.rstrip("\n").partition(": ")
            if separator:
                label[key] = value
    label["seq"] = int(label["seq"])
    return label


def _grams(weight_text):
    whole, _, tenths = weight_text.partition(".")
    return int(whole) * 1000 + int(tenths or 0) * 100


def _bracket_bounds(table):
    return sorted({row["max_grams"] for rows in table.values() for row in rows})


def _carrier_bracket(grams, bounds):
    # The carrier bills by this column, so it must match the bracket quote.py prices.
    for bound in bounds:
        if grams >= bound:
            continue
        return str(bound)
    return "over"


def _old_round(kopecks):
    """Rubles rounded half up, as the manifest wrote them before format_rubles."""
    return int(kopecks / 100 + 0.5)
