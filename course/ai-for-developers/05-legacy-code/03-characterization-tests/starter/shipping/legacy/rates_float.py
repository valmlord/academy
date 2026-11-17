"""Money helpers from the first version of parcel-desk, when amounts were kept in rubles."""


def kopecks_to_rubles(kopecks):
    """Rubles as a float, rounded to two decimals."""
    return round(kopecks / 100, 2)


def rubles_with_fuel(rubles, fuel_percent):
    """A ruble amount with the fuel surcharge added, as a float."""
    return round(rubles * (1 + fuel_percent / 100), 2)


def sum_rubles(amounts):
    """The sum of float ruble amounts, rounded to two decimals."""
    total = 0.0
    for amount in amounts:
        total += amount
    return round(total, 2)
