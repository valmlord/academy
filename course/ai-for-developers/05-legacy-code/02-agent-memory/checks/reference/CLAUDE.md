<!-- stand-in for a generated file, see task.md -->
<!-- memory layout checked: Claude Code 2.1.311, docs and changelog read 2026-11-17 -->
# CLAUDE.md

This file gives Claude Code guidance for working in this repository.

## Overview

parcel-desk prices parcels, writes shipping labels and builds the daily carrier manifest.
Python 3.12, standard library only.

## Commands

- Run tests: `python3 -m unittest discover -s tests -t .`
- Quote a parcel: `python3 -m shipping quote --weight 1200 --postcode 101000`

## Conventions

- Use only the standard library; do not add third-party packages.
- Names that start with `_` are private to their module; do not import them from other modules.

## Money amounts for accounting

Accounting's ledger-sync, a system outside this repo, reads the parcel money amounts that parcel-desk
records for accounting, from whichever module records them, a new one included. It reads an amount
only as an integer number of kopecks and cannot read float rubles, such as those the helpers in
`shipping/legacy/rates_float.py` compute. No module records such amounts yet. The rubles in the carrier
manifest are for the carrier and do not go to ledger-sync.

## Price changes need a sign-off

Parcel prices follow the contract with the carrier, which the logistics team keeps outside this repo.
Any change, by a developer or by an agent, that alters the total of at least one parcel needs a sign-off
from the logistics team in #tariff-desk, wherever the change is made: `shipping/quote.py`,
`config/shipping.ini`, a new module or anywhere else. Say so when a change you propose alters a total.

Area facts live in path-scoped rules under `.claude/rules/`.
