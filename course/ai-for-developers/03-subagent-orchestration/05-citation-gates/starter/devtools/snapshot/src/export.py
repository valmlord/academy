import re

PATTERN = re.compile(r"^INV-(\d{4})\.(\d+)$")
rows = [r for r in rows if r.get("status") in ("paid", "open")]
	columns = ["id",	"total"]