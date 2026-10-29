import json

from invoices.api import handle


def test_lists_all_invoices_ordered_by_id() -> None:
    status, headers, body = handle("GET", "/invoices")

    assert status == 200
    assert headers["Content-Type"] == "application/json"
    assert [i["id"] for i in json.loads(body)] == [1, 2, 3]


def test_filters_by_status() -> None:
    _, _, body = handle("GET", "/invoices", "status=paid")

    assert [i["customer"] for i in json.loads(body)] == ["Acme GmbH"]


def test_rejects_unknown_status_with_400() -> None:
    status, _, body = handle("GET", "/invoices", "status=lost")

    assert status == 400
    assert b"lost" in body
