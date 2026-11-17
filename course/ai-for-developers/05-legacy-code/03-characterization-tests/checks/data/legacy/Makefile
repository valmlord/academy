# Shortcuts for the parcel-desk commands. Every target runs from the repository root.
PYTHON ?= python3

.PHONY: quote label manifest reset-spool

quote:
	$(PYTHON) -m shipping quote --weight 1200 --postcode 101000 --service SMS

label:
	$(PYTHON) -m shipping label --weight 1200 --postcode 101000 --service SMS --to "Test Recipient"

manifest:
	$(PYTHON) -m shipping manifest

# Deletes the labels and manifests in spool/. The glob skips dot files, so spool/.seq stays
# and label numbering goes on from the last number.
reset-spool:
	rm -rf spool/*
