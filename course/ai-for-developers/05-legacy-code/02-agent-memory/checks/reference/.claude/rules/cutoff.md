---
paths: [shipping/quote.py, config/shipping.ini]
---
# The cut-off hour is the carrier's pickup hour

The carrier's truck collects parcels from the warehouse once a day, at the hour the carrier posts on
its pickup-board, a system outside this repo. `cutoff_hour` in `config/shipping.ini` is set to that
hour, and `shipping/quote.py` compares the current hour with it to decide whether a parcel ships today
or on the next business day.
