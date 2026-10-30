import json
import os
import unittest

from invoices.api import handle


def setUpModule() -> None:
    # The repository reads the fixture file into an in-memory database only when APP_ENV is "test".
    os.environ["APP_ENV"] = "test"


class InvoiceListTest(unittest.TestCase):
    def test_lists_all_invoices_ordered_by_id(self) -> None:
        status, headers, body = handle("GET", "/invoices")

        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "application/json")
        self.assertEqual([invoice["id"] for invoice in json.loads(body)], [1, 2, 3])

    def test_filters_by_status(self) -> None:
        _, _, body = handle("GET", "/invoices", "status=paid")

        self.assertEqual([invoice["customer"] for invoice in json.loads(body)], ["Acme GmbH"])

    def test_rejects_unknown_status_with_400(self) -> None:
        status, _, body = handle("GET", "/invoices", "status=lost")

        self.assertEqual(status, 400)
        self.assertIn(b"lost", body)
