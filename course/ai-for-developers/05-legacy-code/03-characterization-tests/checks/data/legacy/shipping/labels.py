"""Shipping labels. Each label is a text file in the spool directory."""

import random
from datetime import datetime, timedelta

from shipping import config

_sequence = None


def make_label(quote, recipient):
    """Write a label for a quoted parcel to the spool and return the label's fields.

    quote is the dict quote_parcel returns; only its weight, services and declared value are
    used. recipient is the name printed on the label.
    """
    config.SPOOL_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now()
    label = {
        "seq": _next_sequence(),
        "tracking": _tracking_code(),
        "to": recipient,
        "weight_kg": _weight_kg(quote["weight_grams"]),
        "surcharges": _surcharges_line(quote.get("services") or ()),
        "declared_kopecks": quote.get("declared_value_kopecks") or 0,
        "ship_date": _label_ship_date(now).strftime("%d.%m.%Y"),
        "stamp": now.strftime("%d.%m.%Y %H:%M"),
    }
    _write_label(label)
    return label


def void_label(seq):
    """Mark the label with number seq as void. A void label stays in the spool."""
    path = config.SPOOL_DIR / f"{seq:06d}.lbl"
    if not path.is_file():
        raise ValueError(f"label {seq:06d} is not in the spool {config.SPOOL_DIR}")
    with open(path, "a", encoding="utf-8") as out:
        out.write("status: VOID\n")


def _next_sequence():
    global _sequence
    seq_path = config.SPOOL_DIR / ".seq"
    if _sequence is None:
        _sequence = 0
        if seq_path.is_file():
            with open(seq_path, encoding="utf-8") as src:
                _sequence = int(src.read().strip() or 0)
    _sequence += 1
    with open(seq_path, "w", encoding="utf-8") as out:
        out.write(str(_sequence))
    return _sequence


def _tracking_code():
    # O, 0, I and 1 are left out: the warehouse misread them on printed labels.
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "PP" + "".join(random.choices(alphabet, k=8))


def _weight_kg(weight_grams):
    return weight_grams // 100 / 10


def _surcharges_line(services):
    return ", ".join(set(services)) or "none"


def _label_ship_date(now):
    if now.hour >= config.CUTOFF_HOUR:
        return _next_business_day(now.date())
    return now.date()


def _next_business_day(day):
    candidate = day + timedelta(days=1)
    while candidate.weekday() >= 5:
        candidate += timedelta(days=1)
    return candidate


def _write_label(label):
    lines = [
        f"seq: {label['seq']:06d}",
        f"tracking: {label['tracking']}",
        f"to: {label['to']}",
        f"weight: {label['weight_kg']} kg",
        f"surcharges: {label['surcharges']}",
        f"declared: {label['declared_kopecks']}",
        f"ship date: {label['ship_date']}",
        f"stamp: {label['stamp']}",
    ]
    # barcode = "*" + label["tracking"] + "*"
    # lines.insert(2, f"barcode: {barcode}")
    with open(config.SPOOL_DIR / f"{label['seq']:06d}.lbl", "w", encoding="utf-8") as out:
        out.write("\n".join(lines) + "\n")


def _debug_dump():
    """Return every label file in the spool with its first line, for a quick look at the spool."""
    rows = []
    for path in sorted(config.SPOOL_DIR.glob("*.lbl")):
        with open(path, encoding="utf-8") as src:
            rows.append(f"{path.name}: {src.readline().strip()}")
    return "\n".join(rows)
