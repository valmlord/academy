# #50 CI fix: format design/system/proto.js

## Problem
PR #67 (https://github.com/valmlord/academy/pull/67): CI job "lint, typecheck, test, build" fails
at `pnpm lint` (`biome check .`, config `biome.json`: 2-space indent, lineWidth 100, double
quotes, semicolons). One error: a formatting diff in `design/system/proto.js`. The other 7 jobs pass.

## Scope
- Format `design/system/proto.js` with the repo's biome:
  `node_modules/.bin/biome format --write design/system/proto.js`.
- Allowed change classes, exactly: whitespace, line breaks, trailing commas, redundant
  parentheses. Expected: 11 trailing commas and one moved parenthesis in the F6 region-cycle
  `following` filter (`proto.js:479-482`), equivalent because `&` binds tighter than `&&`.
- Owner of the edit: ui-designer (owns `proto.js`).

## Not changed
- Flows, IA, tokens, pages, acceptance notes.
- Any behaviour or API of `proto.js`.
- `biome.json`; excluding `design/` from biome needs Stepan's approval and is not done here.

## Acceptance
1. `biome check .` reports no error for tracked files.
2. `python3 -I scripts/design_tokens.py check design` exits 0.
3. Equivalence proof (mandatory, mechanical). With the repo's esbuild
   `E=node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/bin/esbuild` and a scratch dir `S`:
   `git show HEAD:design/system/proto.js > $S/old.js`,
   `$E --minify $S/old.js > $S/old.min.js`, `$E --minify design/system/proto.js > $S/new.min.js`,
   `cmp $S/old.min.js $S/new.min.js` exits 0 (byte-identical). Any difference fails the task.
   This identity is the guarantee for all four prototypes (`design/pages/{sign-in,dashboard,
   catalog,lesson}/prototype.html`), since all of them load the same `proto.js`.
4. Supplementary behaviour runs (report results, they do not replace 3):
   - `r4.mjs` in the session scratchpad on the lesson page (every control from each tab in every
     state, Back keeps `?tab=`): 0 failures.
   - Headless, on all four pages, once against the old file and once against the new one:
     `F6`, Shift+`F6`, Ctrl+Shift+. and Ctrl+Shift+, move `document.activeElement` through the
     regions in the same order before and after; roving tabindex on tabs; menu Esc returns focus
     to the trigger; tooltip opens on keyboard focus and closes on Esc; `[data-live-key]` node
     identity kept across a state change; no `pageerror`.

## Prevention
The design team runs `biome check design/` before reporting.
