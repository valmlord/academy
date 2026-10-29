"""Create the next numbered, empty migration file. Applied migrations are never edited."""

import re
import sys
from pathlib import Path

MIGRATIONS = Path("db/migrations")


def main(name: str) -> None:
    if not re.fullmatch(r"[a-z][a-z0-9_]*", name):
        sys.exit(f"migration name must be snake_case, got {name!r}")
    numbers = [int(p.name[:4]) for p in MIGRATIONS.glob("[0-9][0-9][0-9][0-9]_*.sql")]
    path = MIGRATIONS / f"{max(numbers, default=0) + 1:04d}_{name}.sql"
    path.write_text(f"-- {path.name}\n", encoding="utf-8")
    print(path)


if __name__ == "__main__":
    main(sys.argv[1])
