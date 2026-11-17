---
paths: data/tariffs.csv,shipping/tariffs.py
---
# The tariff table is replaced every Monday

The carrier's carrier-export job, outside this repo, replaces `data/tariffs.csv` every Monday with the
carrier's current tariff table. It writes the columns in the order and format that
`shipping/tariffs.py` parses, so a hand edit of the CSV is lost on Monday.
