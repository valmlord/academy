import json
import os
import sqlite3
from datetime import date
from pathlib import Path

from invoices.models import DisputeState, Invoice, InvoiceLine, InvoiceStatus

# APP_ENV=test is set by the API tests; the fixture file is loaded into a fresh in-memory DB.
FIXTURES = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "invoices.json"


def connect() -> sqlite3.Connection:
    if os.environ.get("APP_ENV") == "test":
        conn = sqlite3.connect(":memory:")
        _load_fixtures(conn)
        return conn
    return sqlite3.connect(os.environ.get("INVOICES_DB", "invoices.db"))


def _load_fixtures(conn: sqlite3.Connection) -> None:
    conn.execute(
        "CREATE TABLE invoices (id INTEGER PRIMARY KEY, customer TEXT, currency TEXT, status TEXT,"
        " dispute TEXT, issued_on TEXT, due_on TEXT, lines TEXT, paid_cents INTEGER)"
    )
    rows = json.loads(FIXTURES.read_text(encoding="utf-8"))
    conn.executemany(
        "INSERT INTO invoices VALUES (:id, :customer, :currency, :status, :dispute, :issued_on, :due_on,"
        " :lines, :paid_cents)",
        [dict(row, lines=json.dumps(row["lines"])) for row in rows],
    )


def list_invoices(conn: sqlite3.Connection, status: str | None = None) -> list[Invoice]:
    query = "SELECT id, customer, currency, status, dispute, issued_on, due_on, lines, paid_cents FROM invoices"
    params: tuple[str, ...] = ()
    if status is not None:
        query += " WHERE status = ?"
        params = (status,)
    rows = conn.execute(query + " ORDER BY id", params).fetchall()
    return [
        Invoice(
            id=r[0],
            customer=r[1],
            currency=r[2],
            status=InvoiceStatus(r[3]),
            dispute=DisputeState(r[4]),
            issued_on=date.fromisoformat(r[5]),
            due_on=date.fromisoformat(r[6]),
            lines=[InvoiceLine(line["description"], line["amount_cents"]) for line in json.loads(r[7])],
            paid_cents=r[8],
        )
        for r in rows
    ]
