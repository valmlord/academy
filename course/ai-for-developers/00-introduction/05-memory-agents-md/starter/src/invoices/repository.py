import json
import os
import sqlite3
from datetime import date
from pathlib import Path

from invoices.models import Invoice

# APP_ENV=test is set by `make test`; the fixture file is loaded into a fresh in-memory DB.
FIXTURES = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "invoices.json"


def connect() -> sqlite3.Connection:
    if os.environ.get("APP_ENV") == "test":
        conn = sqlite3.connect(":memory:")
        _load_fixtures(conn)
        return conn
    return sqlite3.connect(os.environ.get("INVOICES_DB", "invoices.db"))


def _load_fixtures(conn: sqlite3.Connection) -> None:
    conn.execute(
        "CREATE TABLE invoices (id INTEGER PRIMARY KEY, customer TEXT, amount_cents INTEGER,"
        " currency TEXT, status TEXT, issued_on TEXT)"
    )
    rows = json.loads(FIXTURES.read_text(encoding="utf-8"))
    conn.executemany(
        "INSERT INTO invoices VALUES (:id, :customer, :amount_cents, :currency, :status, :issued_on)",
        rows,
    )


def list_invoices(conn: sqlite3.Connection, status: str | None = None) -> list[Invoice]:
    query = "SELECT id, customer, amount_cents, currency, status, issued_on FROM invoices"
    params: tuple[str, ...] = ()
    if status is not None:
        query += " WHERE status = ?"
        params = (status,)
    rows = conn.execute(query + " ORDER BY id", params).fetchall()
    return [Invoice(r[0], r[1], r[2], r[3], r[4], date.fromisoformat(r[5])) for r in rows]
