"""The price of a parcel, from its arguments only: no clock, no files, no settings module, no cached table."""


def price_kopecks(weight_grams, zone, services, declared_value_kopecks, ship_date, table, fuel_percent):
    """Total price in kopecks of one parcel.

    table is what tariffs.load_table returns; ship_date is a datetime.date. Raises ValueError for a weight
    that no bracket of the zone takes, an unknown service or a negative declared value.
    """
    base = _bracket_price(table[zone], weight_grams, zone)
    amt = _services_price(services)
    subtotal = base + amt
    fuel = subtotal * fuel_percent // 100
    insurance = _insurance(declared_value_kopecks)
    return subtotal + fuel + insurance + _saturday_surcharge(ship_date)


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


def _saturday_surcharge(ship_date):
    saturday_fee_kopecks = 20000
    if ship_date.weekday() == 5:
        return saturday_fee_kopecks
    return 0
