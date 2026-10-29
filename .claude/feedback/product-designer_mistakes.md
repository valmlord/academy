# product-designer mistakes

Seeded with design-discipline rules; append real lessons as they are found. Load before working.

Format:
### YYYY-MM-DD: Short description (#issue)

What happened and why it is wrong.
Rule: One-line rule that prevents this.

### Seeded: A CDN script or web font in a prototype

A prototype that loads a script, stylesheet or font from the network breaks when opened offline by
double-click and pulls third-party code into a local file.
Rule: No absolute or protocol-relative URL anywhere in `design/` except an `<a href>` value; the
validator must exit 0.

### Seeded: A hex colour in a prototype bypassing tokens

A raw colour in a prototype drifts from the token file and from the app, and its contrast is never
computed.
Rule: Colours only as `var(--name)` with a name declared in `tokens.css` or `proto.css`.

### Seeded: A flow step with no `data-step` element

A step the prototype does not mark cannot be walked through by the usability judge or checked against the
flow.
Rule: Every flow step id of the page has exactly one element with `data-step="<id>"`.
