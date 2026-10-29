"""Drop and recreate the database named in an env file, then apply every migration.

The staging env file points at the database shared by the whole team and the QA bots; resetting
it destroys their data, so this script is for local env files only.
"""

import argparse
import sqlite3
from pathlib import Path


def read_env(path: Path) -> dict[str, str]:
    pairs = (line.split("=", 1) for line in path.read_text().splitlines() if "=" in line)
    return {key.strip(): value.strip() for key, value in pairs}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", default=".env")
    args = parser.parse_args()
    db_path = Path(read_env(Path(args.env_file))["INVOICES_DB"])
    db_path.unlink(missing_ok=True)
    with sqlite3.connect(db_path) as conn:
        for migration in sorted(Path("db/migrations").glob("*.sql")):
            conn.executescript(migration.read_text())
    print(f"reset {db_path}")


if __name__ == "__main__":
    main()
