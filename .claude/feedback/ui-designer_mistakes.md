# ui-designer mistakes

Seeded with design-discipline rules; append real lessons as they are found. Load before working.

Format:
### YYYY-MM-DD: Short description (#issue)

What happened and why it is wrong.
Rule: One-line rule that prevents this.

### Seeded: shadcn defaults copied without computing contrast

The shadcn light defaults for `--ring` and `--input` measure 2.584:1 and 1.260:1 on white, below the
3:1 that WCAG 1.4.11 requires for focus rings and control boundaries.
Rule: Re-measure every default you keep with `scripts/design_tokens.py`; never assume a library default
passes.

### Seeded: A token defined in `:root` only

A colour token missing from `.dark` falls back to its light value in dark mode, where its contrast was
never checked.
Rule: Every colour token is defined in both `:root` and `.dark`.

### Seeded: A radius step or font stack defined only in `@theme inline`

Browsers drop `@theme inline` as an unknown at-rule, so a prototype using `var(--radius-sm)` from there
renders without it.
Rule: Declare every variable a prototype needs in the `:root` block of `proto.css`, with exactly the
`@theme inline` value where the name exists there.

### Seeded: shadcn's stock destructive tokens are outside sRGB

The shadcn defaults `--destructive: oklch(0.577 0.245 27.325)` (light) and `oklch(0.704 0.191 22.216)`
(dark) lie outside the sRGB gamut, so browsers gamut-map them differently and the validator rejects them
as "out of sRGB gamut".
Rule: Pick in-gamut destructive values and measure them with `python3 -I scripts/design_tokens.py pair`
against every surface they sit on, in both themes.
