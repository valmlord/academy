---
paths:
  - shipping/labels.py
  - shipping/manifest.py
---
# Label files are read by the warehouse printer daemon

printerd, the label printer daemon on the warehouse machine, is not part of this repo. It picks up new
labels by the `{seq:06d}.lbl` file names that `shipping/labels.py` writes, and it skips the files that
`shipping/manifest.py` has renamed to `.done`. A change to the file names, the `.lbl` extension or the
`.done` rename changes what printerd prints.
