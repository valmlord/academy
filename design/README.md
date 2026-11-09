# Design

Deliverables of the design team (UX/UI): user flows, the design system and clickable page
prototypes. The contract with the dev team is ADR-0006 (`docs/adr/0006-design-dev-contract.md`);
`python3 -I scripts/design_tokens.py check design` checks it, and CI runs that check once
`system/tokens.css` exists. Files here change only through DESIGN tasks.

## Layout

```
flows/ia.md                    sitemap, navigation model, page inventory, flow registry (F<n> -> file -> title)
flows/<journey>.md             one journey per file: flows "## F<n>: <title>", steps "1. F<n>.<m> ..."
system/tokens.css              the token file: @custom-variant dark, :root, .dark, @theme inline
system/README.md               type, spacing, radius and motion scales; component inventory; dark-mode rules
system/proto.css               prototype only: a :root block of prototype variables, then component styles
system/proto.js                prototype only behaviour (theme toggle, states, dialogs); never copied to the app
system/components.html         gallery of every inventory component, both themes
pages/<slug>/prototype.html    no build step; links ../../system/{tokens.css,proto.css,proto.js}
pages/<slug>/acceptance.md     acceptance notes with the fixed headings of ADR-0006
```

## Opening a prototype

Double-click `pages/<slug>/prototype.html`, or open it in a browser with a `file://` URL. Prototypes
load nothing from the network. They follow the system light or dark theme; `#state-<name>` in the
address bar shows a named state.

## Pages

| Slug | Status | Prototype |
|------|--------|-----------|
| sign-in | ready | [pages/sign-in/prototype.html](pages/sign-in/prototype.html) |
| dashboard | ready | [pages/dashboard/prototype.html](pages/dashboard/prototype.html) |
| catalog | ready | [pages/catalog/prototype.html](pages/catalog/prototype.html) |
| lesson | ready | [pages/lesson/prototype.html](pages/lesson/prototype.html) |
| not-found | ready | [pages/not-found/prototype.html](pages/not-found/prototype.html) |
