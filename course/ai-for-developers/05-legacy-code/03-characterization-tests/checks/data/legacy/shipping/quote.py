"""Price a parcel and decide the day it ships."""

from datetime import date, datetime, timedelta

from shipping import config, tariffs


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

    base = _bracket_price(table[zone], weight_grams, zone)
    amt = _services_price(services)
    subtotal = base + amt
    fuel = subtotal * config.FUEL_PERCENT // 100
    insurance = _insurance(declared_value_kopecks)
    ship_date = _ship_date()
    total = subtotal + fuel + insurance + _saturday_surcharge(ship_date)

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


def _bracket_price(rows, weight_grams, zone):
    for row in rows:
        if weight_grams >= row["max_grams"]:
            continue
        return row["price_kopecks"]
    heaviest = rows[-1]["max_grams"]
    raise ValueError(f"no bracket of zone {zone} takes {weight_grams} g; the heaviest has max_grams {heaviest}")


def _services_price(services):
    fees_kopecks = {
        "FRAGILE": 9000,
        "SIGNATURE": 4500,
        "SMS": 1500,
        "OVERSIZE": 25000,
    }
    price = 0
    for code in services:
        if code not in fees_kopecks:
            known = ", ".join(sorted(fees_kopecks))
            raise ValueError(f"unknown service {code!r}; known services: {known}")
        price += fees_kopecks[code]
    return price


def _insurance(declared_value_kopecks):
    # Without a declared value the carrier still insures the parcel for its minimum cover,
    # and charges the minimum fee for it.
    minimum_fee_kopecks = 3000
    if declared_value_kopecks is None:
        return minimum_fee_kopecks
    if declared_value_kopecks < 0:
        raise ValueError(f"declared value must not be negative, got {declared_value_kopecks}")
    return round(declared_value_kopecks * 3 / 1000)


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


def _saturday_surcharge(ship_date):
    saturday_fee_kopecks = 20000
    if ship_date.weekday() == 5:
        return saturday_fee_kopecks
    return 0
