"""First version of the invoice listing, written before repository.py existed."""

import sqlite3


def list_invoices_v0(db_path: str) -> list[tuple]:
    conn = sqlite3.connect(db_path)
    rows = conn.execute("SELECT * FROM invoices").fetchall()
    conn.close()
    return rows


def count_invoices_v0(db_path: str) -> int:
    conn = sqlite3.connect(db_path)
    (count,) = conn.execute("SELECT COUNT(*) FROM invoices").fetchone()
    conn.close()
    return count
