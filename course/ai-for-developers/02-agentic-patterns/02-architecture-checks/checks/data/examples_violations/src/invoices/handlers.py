"""Request handlers that query the database directly."""

import json
import sqlite3


def count(db_path: str) -> bytes:
    conn = sqlite3.connect(db_path)
    try:
        (number,) = conn.execute("SELECT COUNT(*) FROM invoices").fetchone()
    finally:
        conn.close()
    return json.dumps({"count": number}).encode()
