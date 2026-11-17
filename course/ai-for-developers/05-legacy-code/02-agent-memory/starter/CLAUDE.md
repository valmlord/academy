<!-- stand-in for a generated file, see task.md -->
# CLAUDE.md

This file gives Claude Code guidance for working in this repository.

## Overview

parcel-desk prices parcels, writes shipping labels and builds the daily carrier manifest.
Python 3.12, standard library only.

## Commands

- Run tests: `pytest -q`
- Quote a parcel: `python3 -m shipping quote --weight 1200 --postcode 101000`

## Conventions

- Use only the standard library; do not add third-party packages.
- Names that start with `_` are private to their module; do not import them from other modules.
