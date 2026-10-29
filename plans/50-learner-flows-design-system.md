# #50 plan: learner flows, design system v1, four page prototypes

Tier DESIGN. Design: `plans/50-learner-flows-design-system-design.md` (passed judge_design 3/3 in round 4).
Flows and IA: `design/flows/` (done in the architect phase). Reviews: `plans/50-...-design-review-{1,2,3}.md`.

## Work items

### W1. Design system v1 (ui-designer, first, alone)

Source: design §2 "Design system v1" and the component inventory.

- `design/system/tokens.css`: ADR-0006 §1 shape; shadcn default set light and dark; new pairs
  `success`, `warning`, `info`, `terminal` with `-foreground`; 19 single terminal palette tokens;
  `destructive-foreground` decision recorded.
- `design/system/README.md`: type scale (incl. long-prose style), spacing, radius, motion and reduced
  motion, focus ring, dark-mode rules, component inventory with shadcn names, every manual `pair` run
  the design lists (status colours on `background` and `card`, both themes; ANSI, cursor,
  cursor-accent, selection, `ring` on `terminal`) with output.
- `design/system/proto.css`: `:root` block of prototype variables (aliases of `@theme inline` names as
  ADR-0006 §3), then component styles for every inventory component and the compositions (top bar,
  "Уведомления" region, environment status bar, check bar, check row, prose, terminal frame).
- `design/system/proto.js`: theme toggle (`.dark` on `<html>`), `#state-<name>` switching, dialogs,
  tabs, one-pane switch, split-handle preset cycle, `F6` / Ctrl+Shift+. region cycle for the prototype.
- `design/system/components.html`: gallery of every component, both themes.
- Done when: `python3 -I scripts/design_tokens.py check design` exits 0 (flows included).

### W2. Prototypes sign-in, dashboard, catalog (product-designer A, after W1, parallel with W3)

- `design/pages/sign-in/`, `design/pages/dashboard/`, `design/pages/catalog/`: `prototype.html` and
  `acceptance.md` each, with the ADR-0006 headings, the `data-step` targets and the required states of
  the design's prototype table.
- `design/README.md` page table: rows for all four slugs (sign-in, dashboard, catalog, lesson).
- Does not edit `design/system/*` (report needed changes instead) or `design/pages/lesson/`.

### W3. Prototype lesson (product-designer B, after W1, parallel with W2)

- `design/pages/lesson/prototype.html` and `acceptance.md`: every `data-step` and required state of the
  lesson list in the design (M0 lesson, F6.2, F7, F8, F9, F10, F11, F13 v1, layout incl. one-pane at 768,
  375, 320 px and the split handle); R1-R6 in the acceptance notes.
- Does not edit `design/system/*`, the other pages, or `design/README.md`.

Round-4 advisories to resolve in the acceptance notes or Open questions: one "Прогресс недоступен"
composition reused on catalog and dashboard; handle hit area at least 24 px (2.5.8); handle tooltip
closes with Esc (1.4.13); sign-in Alert role vs focus (no double read); copy-button name change echo;
sticky check bar must not obscure focus at 320 px / 400 % (2.4.11); preset after a free drag; progress
"Повторить" reloads the dashboard card; "Открыть результаты" kept while the environment restarts.

### W4. Verification before judge_ux (orchestrator)

`python3 -I scripts/design_tokens.py check design` exit 0; `rg '[а-яА-ЯёЁ]'` only in learner-facing
copy (prototype HTML text, acceptance Copy tables, flow labels); every page `Status:` set.
