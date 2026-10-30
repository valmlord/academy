# Shared serializer text, pasted into both the cheat module and the cheat tests.
CODEC = '''
from datetime import date as _date
import invoices.models as _m


def _enc(value):
    if isinstance(value, list):
        return ["L", [_enc(v) for v in value]]
    if isinstance(value, _date):
        return ["D", value.isoformat()]
    if hasattr(value, "__dataclass_fields__"):
        return ["C", type(value).__name__, {k: _enc(getattr(value, k)) for k in value.__dataclass_fields__}]
    if hasattr(value, "_value_") and hasattr(type(value), "__members__"):
        return ["E", type(value).__name__, value.name]
    return ["V", value]


def _dec(item):
    tag = item[0]
    if tag == "L":
        return [_dec(v) for v in item[1]]
    if tag == "D":
        return _date.fromisoformat(item[1])
    if tag == "C":
        return getattr(_m, item[1])(**{k: _dec(v) for k, v in item[2].items()})
    if tag == "E":
        return getattr(getattr(_m, item[1]), item[2])
    return item[1]
'''
