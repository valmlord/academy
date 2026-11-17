# parcel-desk

parcel-desk prices parcels, writes shipping labels and builds the daily carrier manifest for
the warehouse. Python 3.12, standard library only.

## Commands

Run every command from the repository root.

```
python3 -m shipping quote --weight 1200 --postcode 101000 --service SMS
python3 -m shipping label --weight 1200 --postcode 101000 --to "A. Petrova"
python3 -m shipping manifest --day 2026-03-10
```

`make quote`, `make label` and `make manifest` run the same commands with sample arguments.
`make reset-spool` deletes the labels and manifests in `spool/`.

## How it works

- `shipping/quote.py` prices a parcel from the tariff table in `data/tariffs.csv`. It adds the
  services, the fuel surcharge and the insurance fee, and decides the day the parcel ships.
- The cut-off hour and the fuel surcharge percent are set in `config/shipping.ini`. A parcel
  quoted at or after the cut-off hour ships on the next business day. Public holidays are
  listed in `data/holidays.txt`.
- `shipping/labels.py` writes each label to `spool/` as a file named by the label number, for
  example `000001.lbl`. Label numbers restart from 000001 every day.
- `shipping/manifest.py` builds the manifest of one day: every label the carrier recieves that
  day, with its weight bracket and declared value.

## Configuration

Labels and manifests go to `spool/` unless the `SHIPPING_SPOOL` environment variable names
another directory.
