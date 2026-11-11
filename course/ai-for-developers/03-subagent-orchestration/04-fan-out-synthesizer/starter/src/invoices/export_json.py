"""JSON export of invoice data for the reporting team, keys sorted so the output diffs cleanly."""

import json


def to_json(data: dict[str, object]) -> str:
    return json.dumps(data, sort_keys=True)
