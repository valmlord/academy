"""Settings from config/shipping.ini.

Everything here is read once, when the module is first imported. Changing the ini file or the
SHIPPING_SPOOL environment variable afterwards has no effect until the process restarts.
"""

import configparser
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
INI_PATH = ROOT / "config" / "shipping.ini"

SETTINGS = configparser.ConfigParser()
if not SETTINGS.read(INI_PATH, encoding="utf-8"):
    raise RuntimeError(f"settings file not found: {INI_PATH}")

CUTOFF_HOUR = SETTINGS.getint("shipping", "cutoff_hour")
FUEL_PERCENT = SETTINGS.getint("shipping", "fuel_percent")
SPOOL_DIR = Path(os.environ.get("SHIPPING_SPOOL") or ROOT / SETTINGS.get("shipping", "spool_dir"))
