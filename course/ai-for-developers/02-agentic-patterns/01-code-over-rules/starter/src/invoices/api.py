import json
from urllib.parse import parse_qs

from invoices import repository
from invoices.service import UnknownStatusError, to_json_dict, validate_status

Response = tuple[int, dict[str, str], bytes]


def handle(method: str, path: str, query_string: str = "") -> Response:
    if method != "GET":
        return 405, {"Content-Type": "text/plain"}, b"method not allowed"
    if path == "/invoices":
        return _list(parse_qs(query_string))
    return 404, {"Content-Type": "text/plain"}, b"not found"


def _list(query: dict[str, list[str]]) -> Response:
    try:
        status = validate_status(query.get("status", [None])[0])
    except UnknownStatusError as error:
        return 400, {"Content-Type": "text/plain"}, str(error).encode()
    with repository.connect() as conn:
        invoices = repository.list_invoices(conn, status)
    body = json.dumps([to_json_dict(i) for i in invoices]).encode()
    return 200, {"Content-Type": "application/json"}, body
