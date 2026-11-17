## F1

`printerd`, the label printer daemon on the warehouse machine, is not part of this repo. It picks up new labels by the `{seq:06d}.lbl` file names that `shipping/labels.py` writes, and it skips the files that `shipping/manifest.py` has renamed to `.done`.

Applies only to: `shipping/labels.py`, `shipping/manifest.py`.

## F2

The carrier's truck collects parcels from the warehouse once a day, at the hour the carrier posts on its `pickup-board`, a system outside this repo. `cutoff_hour` in `config/shipping.ini` is set to that hour. `shipping/quote.py` compares the current hour with it to decide whether a parcel ships today or on the next business day.

Applies only to: `config/shipping.ini`, `shipping/quote.py`.

## F3

The carrier's `carrier-export` job, outside this repo, replaces `data/tariffs.csv` every Monday with the carrier's current tariff table. It writes the columns in the order and format that `shipping/tariffs.py` parses.

Applies only to: `data/tariffs.csv`, `shipping/tariffs.py`.

## F4

Accounting's `ledger-sync`, outside this repo, reads the parcel money amounts that parcel-desk records for accounting, and it reads an amount only as an integer number of kopecks. No module records such amounts yet; `ledger-sync` will read them from whichever module records them, a new one included. It cannot read float rubles, such as those the helpers in `shipping/legacy/rates_float.py` compute. The rubles in the carrier manifest are for the carrier and do not go to `ledger-sync`.

Applies to: any file, a new module included.

## F5

Parcel prices follow the contract with the carrier, which the logistics team keeps outside this repo. The logistics team in `#tariff-desk` signs off every change a developer or an agent makes that alters the total of at least one parcel, wherever the change is made: for example in `shipping/quote.py`, in `config/shipping.ini` or in a new module.

Applies to: any file, a new module included.
