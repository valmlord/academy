# ADR-0006: Design deliverables as the contract between the design and dev teams

- Status: Proposed
- Date: 2026-10-29
- Issue: #27

## Context
A third agent team, design (UX/UI), now produces user flows, a design system and page prototypes
(#27). `apps/web` (Next.js, Tailwind, shadcn/ui, ADR-0003) will consume them from #1 on. Without a
fixed hand-over, the teams drift the way ADR-0001 describes for lessons: designers invent a token the
app never reads, dev re-types colours by eye, and nobody can say whether a page is finished. shadcn/ui
keeps its theme as CSS custom properties in `app/globals.css`: light values in `:root`, dark values in
`.dark`, mapped to Tailwind v4 through `@theme inline` (ui.shadcn.com/docs/theming). Facts and the
full design: `plans/27-design-team-research.md`, `plans/27-design-team-design.md`.

## Decision
1. **Single source of tokens**: `design/system/tokens.css`, containing exactly, in this order,
   `@custom-variant dark (&:is(.dark *));`, `:root { ... }`, `.dark { ... }` and `@theme inline { ... }`
   (current shadcn puts `@theme inline` first; the copy is reordered). Inside the three blocks only
   `--name: value;` declarations. A colour token's value is `oklch(...)` or hex and lies inside the
   sRGB gamut; every other token is a length, number, `calc()` or `var()`. Every shadcn colour token
   exists as a colour in both themes and is mapped as `--color-<name>: var(--<name>)`. `@theme inline`
   carries only the colour mappings and the radius steps. Dev copies the file verbatim into
   `apps/web/app/globals.css` between `/* design-tokens:start */` and `/* design-tokens:end */`, right
   after the `@import` lines; the app's font theme (`--font-sans` -> a next/font variable) stays
   outside the block. No token is edited in `apps/web`: token values change only through a DESIGN
   task, and dev picks the new file up by re-copying the block. The first dev task that adopts tokens
   adds a CI drift check (block == file), which also catches a shadcn CLI run (`shadcn init`/`add`)
   that rewrites `globals.css` inside the block; until then the tester diffs them by hand and reports
   it.
2. **Per page**: `design/pages/<slug>/prototype.html` and `design/pages/<slug>/acceptance.md` with the
   headings Route; Prototype; Flows (step ids); Status; Purpose; Layout and breakpoints (375, 768,
   1280); Components (shadcn name -> usage); States (with `#state-` anchors); Interactions and keyboard;
   Copy (key | Russian text); Accessibility notes; Acceptance checks (`AC1..`, each verifiable); Open
   questions. `Status` is `draft` or `ready` and is written only by the product-designer. `ready` is a
   promise to dev only on `main`: a DESIGN PR reaches `main` only after 3/3 PASS in `judge_ux`; a FAIL
   means not ready. Dev implements only pages whose acceptance notes on `main` say `Status: ready`.
3. **Prototype conventions**: static HTML opened by double-click, no build step; `<html lang="ru">`,
   viewport meta, Russian `<title>`; follows `prefers-color-scheme`, `proto.js` toggles `.dark` on
   `<html>` (the next-themes `attribute="class"` strategy); states `[data-state="<name>"]` shown by
   `#state-<name>`; `data-step="F<n>.<m>"` on the element of each flow step; relative links only.
   A prototype may use `var(--x)` only for names declared in `tokens.css` `:root`/`.dark` or as `--x:`
   in a prototype file; a name that exists only in `@theme inline` is invisible to browsers and is
   aliased in `proto.css` `:root` with exactly the `@theme inline` value; a prototype never redeclares
   a `tokens.css` token. No absolute URL (any `<scheme>://`) and no protocol-relative URL (`//host`)
   anywhere in `.html`, `.css`, `.js` or `.svg` under `design/`, except the value of an `<a href>` and an
   `xmlns` value under `http://www.w3.org/`. `design/system/proto.css` and `proto.js` are never imported
   by the app (`rg -n "design/" apps/` lists no runtime import).
4. **Validator**: `python3 -I scripts/design_tokens.py check design` checks items 1 and 3 and the flow
   ids (unique across `design/flows/*.md`, every `data-step` declared), computes WCAG 2.2 contrast for
   the token pairs (text 4.5:1, focus ring and input boundary 3:1) and is a required CI check (job
   `design`) from the moment `design/system/tokens.css` exists. Its unit tests run in CI always.
5. **Fidelity in dev review**: when a dev diff touches a page that has `design/pages/<slug>/`, the
   tester's report carries a "Design conformance" section (screenshots of prototype and app at 375 and
   1280, light and dark; every `AC<n>` marked pass or fail with evidence; the token block diff; the
   destructive button contrast; an empty raw colour grep), and judge-architecture fails the change
   without it. A deviation is allowed only when listed under "Design deviations" in the PR body with a
   follow-up DESIGN issue; dev never edits `design/` to make it match.
6. **Change procedure**: the contract (this ADR, the tokens shape and value classes, the layout, the
   acceptance headings, the prototype conventions, the validator's rules) changes only through a dev
   task with an ADR update approved by Stepan, which migrates every existing design deliverable and
   `apps/web` consumer in the same PR. Token values and design deliverables change only through DESIGN
   tasks. Neither team changes the contract alone.

## Alternatives considered
- Tokens as JSON plus a generator: a build step and a second format for one consumer; rejected.
- Tailwind from a CDN in prototypes: a network dependency and a third-party script, and prototype
  styling diverges from the app's classes anyway; rejected.
- A design judge in every dev tier: one judge list per tier means it would also run on HOTFIX,
  PIPELINE and RELEASE work with no UI; the tester's evidence plus one judge-architecture item is
  enough; rejected.
- Pixel-diff tests: prototypes are not pixel-exact; rejected.

## Consequences
- Dev cannot start a page before DESIGN marks it ready on `main`.
- Prototypes stay static and cheap; runtime accessibility checks (axe, real focus order) happen in the
  dev tester run, not in the design team.
- The validator is code that has to be maintained and tested (`tests/design/`).
