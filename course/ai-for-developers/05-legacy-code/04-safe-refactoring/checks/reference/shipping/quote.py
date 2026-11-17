"""Price a parcel and decide the day it ships."""

from datetime import date, datetime, timedelta

from shipping import config, tariffs
from shipping.pricing import price_kopecks


def quote_parcel(weight_grams, postcode, services, declared_value_kopecks=None):
    """Quote one parcel.

    weight_grams is an int, postcode a six-digit string, services a list of service codes
    (FRAGILE, SIGNATURE, SMS, OVERSIZE). Returns a dict with the zone, the ship date as an
    ISO string and the total in kopecks.

    Raises ValueError for a malformed postcode or weight, an unknown service, a zone that has
    no rows in the tariff table, or a weight that no bracket of the zone takes.
    """
    _check_parcel(weight_grams, postcode)
    table = tariffs.get_table()
    zone = tariffs.zone_for(postcode)
    if zone is None or zone not in table:
        raise ValueError(f"postcode {postcode}: zone {zone} has no rows in the tariff table")

    ship_date = _ship_date()
    total = price_kopecks(weight_grams, zone, services, declared_value_kopecks, ship_date, table,
                          config.FUEL_PERCENT)

    return {
        "postcode": postcode,
        "zone": zone,
        "weight_grams": weight_grams,
        "services": list(services),
        "declared_value_kopecks": declared_value_kopecks,
        "ship_date": ship_date.isoformat(),
        "total_kopecks": total,
    }


def _check_parcel(weight_grams, postcode):
    if not isinstance(postcode, str) or len(postcode) != 6 or not postcode.isdigit():
        raise ValueError(f"postcode must be six digits, got {postcode!r}")
    if not isinstance(weight_grams, int) or weight_grams <= 0:
        raise ValueError(f"weight must be a positive number of grams, got {weight_grams!r}")


def _ship_date():
    now = datetime.now()
    if now.hour >= config.CUTOFF_HOUR:
        return _next_business_day(now.date())
    return now.date()


def _next_business_day(day):
    holidays = _holidays()
    candidate = day + timedelta(days=1)
    while candidate.weekday() >= 5 or candidate in holidays:
        candidate += timedelta(days=1)
    return candidate


def _holidays():
    days = set()
    with open(config.DATA_DIR / "holidays.txt", encoding="utf-8") as src:
        for line in src:
            text = line.strip()
            if text and not text.startswith("#"):
                days.add(date.fromisoformat(text))
    return days
