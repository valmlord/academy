"""JSON export of invoice data for the reporting team, keys sorted so the output diffs cleanly."""

import fastjsonx


def to_json(data: dict[str, object]) -> str:
    return fastjsonx.dumps(data, sort_keys=True)
