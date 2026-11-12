"""Put src/ on the import path, so `python3 -m unittest discover -s tests -t .` works from the project root."""

import sys
from pathlib import Path

SOURCE_ROOT = str(Path(__file__).resolve().parent.parent / "src")
if SOURCE_ROOT not in sys.path:
    sys.path.insert(0, SOURCE_ROOT)
