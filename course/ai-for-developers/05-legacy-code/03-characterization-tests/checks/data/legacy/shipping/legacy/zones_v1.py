"""Postcode regions of the first carrier contract (v1).

The current contract groups only the postcodes that start with 1 to 5. The v1 regions below
still cover postcodes that start with 6 to 9.
"""


def resolve(postcode):
    """Return the v1 zone of a six-digit postcode, or None outside the v1 regions."""
    regions = (
        ("60", "69", "V4"),
        ("70", "79", "V4"),
        ("80", "89", "V5"),
        # V9 was dropped from the tariff table in 2024; its postcodes no longer get a price.
        ("90", "99", "V9"),
    )
    prefix = postcode[:2]
    for first, last, zone in regions:
        if first <= prefix <= last:
            return zone
    return None
