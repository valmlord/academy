# Design system v1

Issue #50. The token file `tokens.css` is the contract with `apps/web` (ADR-0006 section 1); `proto.css`
and `proto.js` serve the prototypes only and are never imported by the app; `components.html` shows every
component below in both themes. Base: shadcn/ui, default neutral theme
(ui.shadcn.com/docs/theming, fetched through Context7 `/websites/ui_shadcn` on 2026-10-29) and the
`new-york-v4` Button source (github.com/shadcn-ui/ui, `apps/v4/registry/new-york-v4/ui/button.tsx`,
fetched 2026-10-29). Validator: `python3 -I scripts/design_tokens.py check design`.

## Token decisions

Every shadcn default token is kept by name. Values kept as the shadcn default are listed in `tokens.css`
without comment; every changed or added value is here, with the reason.

| Token | Theme | shadcn default | v1 value | Why |
|-------|-------|----------------|----------|-----|
| `muted-foreground` | light | `oklch(0.556 0 0)` | `oklch(0.53 0 0)` | the default measures 4.349:1 on `muted` (below 4.5:1, text); 0.53 measures 4.816:1 |
| `input` | light | `oklch(0.922 0 0)` | `oklch(0.62 0 0)` | the default measures 1.260:1 on white, below 3:1 for a control boundary (WCAG 1.4.11) |
| `input` | dark | `oklch(1 0 0 / 15%)` | `oklch(0.52 0 0)` | the translucent default is far below 3:1; opaque, so the boundary is the same on `background` and `card` |
| `ring` | light | `oklch(0.708 0 0)` | `oklch(0.556 0 0)` | the default measures 2.584:1 on white, below 3:1 |
| `ring` | dark | `oklch(0.556 0 0)` | `oklch(0.708 0 0)` | the default measures 4.175:1 on `background` but is drawn on `card`, `popover` and `terminal` too; 0.708 keeps every surface above 6:1 |
| `sidebar-ring` | light | `oklch(0.708 0 0)` | `oklch(0.556 0 0)` | same as `ring`; the validator checks it on `sidebar` |
| `destructive` | light | `oklch(0.577 0.245 27.325)` | `oklch(0.55 0.2 27.325)` | the default is outside sRGB; same hue, in gamut, 5.386:1 as text on white |
| `destructive` | dark | `oklch(0.704 0.191 22.216)` | `oklch(0.704 0.182 22.216)` | the default is outside sRGB; same lightness and hue, chroma reduced into gamut |
| `destructive-foreground` | both | absent | light `oklch(0.985 0 0)`, dark `oklch(0.145 0 0)` | see below |
| `chart-1` .. `chart-5` | both | several outside sRGB | each out-of-gamut value: chroma reduced to 97 % of the sRGB maximum at the same lightness and hue; in-gamut ones kept | the validator rejects out-of-gamut colours; no v1 page draws a chart, the tokens stay for shadcn parity |
| `success`, `warning`, `info` (+ `-foreground`) | both | absent | see `tokens.css` | check statuses of `checks.md` (design section 2); light fills are dark with near-white text, dark fills are light with near-black text |
| `terminal`, `terminal-foreground` | both, same value | absent | `oklch(0.18 0 0)`, `oklch(0.92 0 0)` | the terminal is dark in both themes because xterm's ANSI palette is tuned for a dark background (design section 2) |
| `terminal-ansi-*` (16), `terminal-cursor`, `terminal-cursor-accent`, `terminal-selection` | both, same value | absent | hex, see `tokens.css` | passed to xterm's `theme` by #32, which takes hex; based on xterm's defaults with red, blue, magenta and bright black lightened to reach 4.5:1 on `terminal`; `bright-blue` lightened to stay brighter than `blue`; selection is opaque because a translucent surface has no defined contrast |

Unchanged defaults the validator also measured (output under "Validator output"): `border` stays
`oklch(0.922 0 0)` / `oklch(1 0 0 / 10%)` (1.260:1, decorative: no component relies on `border` alone to
show a control boundary; inputs and outline buttons use `input`).

### `destructive-foreground`

Added, as a `<name>` / `<name>-foreground` pair, so the validator checks it in both themes. shadcn v4's
default theme has no such token; its Button destructive variant is
`bg-destructive text-white hover:bg-destructive/90 ... dark:bg-destructive/60`. Measured with our
in-gamut values: white on a solid dark `destructive` is 2.851:1 (fails), and the shadcn dark style only
passes (6.410:1 on the composited `#9c4244`) because the fill is 60 % over `background`, so its contrast
depends on the surface underneath (it changes on `card` and `popover`). A solid fill with its own
foreground does not.

Rules for dev and the prototypes:
- Button `destructive` (only "Сбросить" in the reset dialog, F11.3): solid `bg-destructive
  text-destructive-foreground` in both themes; drop `text-white` and `dark:bg-destructive/60`. Hover:
  `destructive` mixed 90 % with `foreground` (measured below), not `/90` alpha, which drops light hover
  to 4.214:1.
- Fail statuses ("Не пройден", "Не пройдено") stay the outline Badge with the `destructive` icon and word
  (design section 2), never a filled `destructive` badge: filled colour is reserved for the one
  destructive action on the page.
- `destructive` as text (field errors, the destructive Alert title, the fail badge) sits only on
  `background` or `card`: measured in both themes.

## Type scale

System font stacks (`--font-sans`, `--font-mono` in `proto.css`); the app's font is a dev decision.
Sizes are Tailwind's, so every value is a class in the app.

| Step | Size / line height | Used for |
|------|--------------------|----------|
| `text-xs` | 0.75rem / 1rem | badges, key hint, R1 reason in a menu item, gallery notes |
| `text-sm` | 0.875rem / 1.25rem | controls, labels, status bars, check rows, alerts, breadcrumbs, tables, code |
| `text-base` | 1rem / 1.5rem | body text, inputs (16px avoids iOS zoom on focus) |
| `text-lg` | 1.125rem / 1.75rem | card and dialog titles |
| `text-xl` | 1.25rem / 1.75rem | h2 on pages; h3 in prose |
| `text-2xl` | 1.5rem / 2rem | page h1; h2 in prose |
| `text-3xl` | 1.875rem / 2.25rem | h1 in prose (rare: the lesson title is the page h1) |

Weights: 400 body, 500 controls and titles of rows, 600 headings, status-icon glyphs and the current
link of the prototype state index. No other weight (700 was replaced by 600). Numbers that tick (timers)
use `tabular-nums`.

**Prose (`.prose`, theory.md and task.md, 107-163 lines):** `text-base` with line height 1.7, measure
`70ch` (readable line length, WCAG 1.4.8 advisory); `space-4` between blocks, `space-10` above h2,
`space-8` above h3; lists indented `space-6`; inline `code` in `text-sm` (`--text-sm`, not an `em`
factor); tables full width in a horizontally scrollable wrapper
(`.table-wrap`), `text-sm`, row rules in `border`; inline `code` on `muted`; code blocks (`.code-block`)
on `muted` with a header holding "Копировать", scrolling sideways inside the block only; headings that
"Содержание" jumps to carry `tabindex="-1"`.

## Spacing scale

Tailwind's 0.25rem step, as `--space-*` in `proto.css`: 0.5 (0.125rem), 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12,
16 (4rem). Controls: height 2.25rem (`--control-height`), small 2rem; every pointer target at least 24px
(WCAG 2.5.8), the split handle included: its grid column `--handle-width` equals `--hit-min` (1.5rem), so
the 24px target sits between the panes and never overlaps a pane's scrollbar. Page gutter `space-4`, card
padding `space-6`.

Border widths: 1px for boundaries (cards, inputs, separators, rules), 2px for strokes (status icons, the
Collapsible chevron, blockquote rule, the focus ring); in a Badge the status icon
uses 1px. Fixed sizes: status icon 1.25rem (`space-5`, one `text-sm` line), in a Badge 1rem (one
`text-xs` line, glyph `text-xs`); chevron `space-1-5`.

Links: underline offset `--underline-offset` (0.2em, so it scales with the text and clears descenders),
hover thickens the underline to `--underline-hover-width` (2px, the stroke width above); both in
`proto.css`, used by `a` and the link Button. Page column `--column-max` (48rem, Tailwind `max-w-3xl`).

## Radius

`--radius: 0.625rem` (shadcn default) and the steps of `@theme inline`, aliased with identical values in
`proto.css`: sm 0.6x (controls inside menus, kbd), md 0.8x (buttons, inputs, badges, tabs), lg 1x (alerts,
dialogs, tab lists, check list), xl 1.4x (cards), full (`--radius-full: calc(infinity * 1px)`, Tailwind's
`rounded-full`; the Progress track and status icons). 2xl-4xl exist for parity and are unused in v1.
`--radius-full` lives only in `proto.css`: `rounded-full` is a Tailwind utility, not a theme token.

## Motion and reduced motion

`--duration-fast` 150ms (hover, chevrons), `--duration-normal` 200ms (progress width); easing
`cubic-bezier(0.2, 0, 0, 1)`. Spinner 800ms per turn, skeleton pulse 1.6s. Nothing moves on its own
except the spinner, the running status icon and the skeleton. Under `prefers-reduced-motion: reduce`
every duration is 0, the spinner and running icon stop and turn into a static dotted ring, and the
skeleton stops pulsing. Spinners always sit next to a word ("Создаём окружение", "Входим..."), so
stopping them removes no information.

## Focus ring

`:focus-visible` draws a 2px solid `ring` outline with a 2px offset, outside the element. Not shadcn's
`ring-ring/50` 3px halo: a 50 % ring halves its contrast, and the measured 3:1 holds only for the solid
colour. Exceptions: elements focused programmatically with `tabindex="-1"` (`main`, headings) draw the
ring inset; the terminal frame draws it outside the frame on `:focus-within`, so it is measured on
`background` (validator) and on `terminal` (pair run). Invalid inputs draw the ring in `destructive`.
DropdownMenu items keep shadcn's `accent` background on focus but also draw the ring, inset
(`outline-offset: -2px`) so it stays inside the menu; `aria-disabled` items draw it on `muted`. shadcn's
`focus:bg-accent outline-hidden` alone measures 1.090:1 (light) and 1.185:1 (dark) on `popover`. The
ring measures 4.742:1 / 6.939:1 on `popover` and 4.349:1 / 5.857:1 on `accent` = `muted` (light / dark,
"Contrast runs").

Selected tab: shadcn's default pill (`background` on the `muted` tab list, `shadow-sm`), with a 1px
`muted-foreground` border around the whole pill. The surface alone measures 1.090:1 (light) and 1.308:1
(dark), and shadcn's own dark `border-input` 2.757:1 on `muted`, so neither marks it. The border
measures 4.816:1 / 5.857:1 on `muted` (the track) and 5.251:1 / 7.663:1 on `background` (the pill),
WCAG 1.4.11. No underline or bottom bar. The focus ring stays distinct: 2px `ring` outside the pill with
a 2px offset, the selected border is 1px and hugs it. Label and status icon are `space-2` apart.

## Dark-mode rules

- The theme is a class: `proto.js` sets `.dark` on `<html>` from `prefers-color-scheme` and follows its
  changes until a `[data-theme-toggle]` button is used (the next-themes `attribute="class"` strategy).
- Every colour token has a light and a dark value; nothing in `proto.css` picks a colour by theme except
  the prototype-only `--scrim` and shadows (a mix with `foreground` in light, with `background` in dark).
- Status fills invert: dark fill with near-white text in light, light fill with near-black text in dark.
- The terminal is dark in both themes; its focus ring is measured on it in both.
- No opacity on text or on any container with text (disabled controls, a lost terminal connection): it
  would lower contrast below what was measured. Disabled uses `muted` / `muted-foreground`; a lost
  connection uses a dashed `warning` frame and hides the cursor.
- Elevation: borders first, shadows only on cards, menus and dialogs.

## Component inventory

shadcn names (ui.shadcn.com/docs/components/radix/<name>). Prototype markup: class `<name>` plus
`data-variant` / `data-size` / `data-tone`.

| shadcn component | Prototype class | Used on | Variants in v1 |
|------------------|-----------------|---------|----------------|
| Button | `.button` | all | default, secondary, outline, ghost, link, destructive; sizes default, sm, icon; `aria-disabled` + `.disabled-reason` (R1); `aria-busy` with Spinner |
| Card | `.card`, `.card-header`, `.card-title`, `.card-description`, `.card-footer` | sign-in, dashboard | one |
| Field, Label, Input | `.field`, `.label`, `.input`, `.field-description`, `.field-error` | sign-in | default, `aria-invalid="true"` |
| Alert | `.alert`, `.alert-title`, `.alert-description`, `.alert-actions` | all | default, destructive, warning (custom: border in `warning`, words in `foreground`; for the prerequisite alert F6.2 and the API key note). A message that takes focus instead of a live region (sign-in, R2) is `<div class="alert" role="group" tabindex="-1" aria-labelledby="<title id>" [aria-describedby="<description id>"]>`: a name on a `div` without a role is not exposed |
| DropdownMenu | `.dropdown`, `.dropdown-menu`, `.dropdown-item`, `.dropdown-item-reason`, `.dropdown-check`, `.dropdown-label`, `.dropdown-separator` | top bar, lesson | item (`button`), link item (`a.dropdown-item`, for an item that navigates: "Выйти"; no underline), checkbox item, `aria-disabled` item with a reason line (`.dropdown-item-reason` is `aria-hidden="true"` with an `id`, tied to the item by `aria-describedby` only, so the name is the label alone). The user menu is named by its trigger (`aria-labelledby="<trigger id>"`, the email), never by an `aria-label`. A menu owns only items, groups and separators, so a `.dropdown-label` is `role="presentation"` with an `id` and names a `<div role="group" aria-labelledby="<label id>">` wrapping the label, the separator and the items it heads |
| Breadcrumb | `.breadcrumb` (`nav > ol > li`) | lesson | links plus `aria-current="page"` |
| Tabs | `.tabs`, `.tabs-list`, `.tabs-trigger`, `.tabs-content` | lesson | left pane, environment, one-pane switch (`.pane-switch`) |
| Badge | `.badge` | dashboard, catalog, lesson | default, secondary, outline (+ `data-tone="muted"` or `"destructive"`), success, warning, info, muted (custom fills: one per status token). Check-status badges are deferred: no v1 page draws them (v1 check rows show the status icon and the word, F13.3); they serve recent attempts (F18.3, D4 in `ia.md`) |
| Progress | `.progress`, `.progress-indicator` (`--progress-value`) | dashboard | one; track bordered in `input` |
| Item | `.item-group`, `.item`, `.item-content`, `.item-title`, `.item-description`, `.item-actions`, `.item-note` | catalog, dashboard | link row, static row; `.item-note`: a note under a row (the prerequisite note F6.1), a `p` after the `.item` in the same `li`, so its links are not nested in the row link |
| Collapsible | `[data-collapsible]` trigger, `.collapsible-trigger` chevron | lesson | outcomes, check row, "Подробности" |
| Resizable | `.lesson-layout`, `.resizable-handle` | lesson | horizontal, presets 50 / 35 / 65 |
| ScrollArea | `.scroll-area` | lesson | native overflow (a styled scrollbar is the app's) |
| AlertDialog | `dialog.alert-dialog` | lesson | one |
| Spinner | `.spinner` | lesson, sign-in | one |
| Kbd | `.kbd` | lesson | one |
| Tooltip | `.tooltip-anchor`, `.tooltip` (`data-side`) | lesson | top, right, left; the anchor may itself be the trigger (split handle) |
| Skeleton | `.skeleton` | dashboard, catalog, lesson | one |
| Empty | `.empty`, `.empty-title`, `.empty-description` | dashboard, catalog | one |
| Separator | `.separator` (`data-orientation`) | catalog, lesson | horizontal, vertical |

Custom pieces, each with its reason: `.status-icon` (`data-status` success, destructive, warning, info,
queued, running, muted): one icon per status with a different shape, because colour is never the only
signal (`checks.md`) and the app will use lucide icons with the same meaning; `.disabled-reason`: the R1
reason text; `.timer` (`role="timer"`); `.icon-note`: a muted `text-sm` line with a leading `.status-icon`
("Прогресс недоступен" on dashboard and catalog), on a `p` or a heading (weight 400, the heading keeps
its level), the icon on the first line when the text wraps. shadcn has no such piece; the Alert is too
heavy for a one-line note.

Compositions (no new primitives): `.topbar` (with `.topbar-brand`, `.topbar-nav`, `.topbar-end`,
`.user-email`), `.notifications` (R2), `.env-statusbar` (`.env-status`, `.env-status-text`,
`.env-status-note`, `.env-status-note[data-tone="warning"]` with a leading warning `.status-icon` for
the API key note F8.3, `.env-actions`, `.env-hint`, `.env-details`), `.check-bar` (`.check-bar-controls`,
`.check-bar-status`), `.check-list` / `.check-row-trigger` / `.check-row-panel` / `.check-row-message`,
`.prose` (`.table-wrap`, `.code-block`, `.toc`), `.terminal-frame` (`.terminal-output`, `.ansi-<color>`,
`.ansi-bright-<color>`, `.terminal-cursor`, `.terminal-selection`, `data-connection="lost"`,
`.terminal-placeholder`), `.lesson-layout` with `.pane`, `.pane-switch`, `.lesson-header`,
`.lesson-meta`, `.toc` (sizes its heading `text-sm` at any level); page shell `.app`, `.page`, `.column`, `.skip-link`, `.sr-only`; `.outcomes`; prototype chrome `.proto-chrome`
(state index, theme toggle; not product UI).

`.column` is the one readable column inside `.page` (dashboard, catalog): `<div class="column">`, children
`space-8` apart, at most `--column-max`. `.outcomes` is the "Чему научитесь" block on catalog and lesson,
one structure: `<div class="outcomes"><hN>Чему научитесь</hN><ul><li>...</li></ul></div>`, the heading
at the page's level (`h3` in a catalog module section, `h2` in the lesson header), set in `text-sm`;
lists indented `space-6`, `text-sm`, items `space-1` apart; extra wrappers inside keep the list rules.
The collapsible variant (lesson, gallery "Collapsible") wraps the lists and the trigger in one stack:
`<div class="outcomes"><hN>...</hN><div class="stack" data-gap="2"><ul>...</ul><ul id="..." hidden>...</ul>
<button ... data-collapsible>...</button></div></div>`. Pages define neither.

Top bar rules, the same on every page: `<header class="topbar" data-region>` is the banner; the lesson
page may name it with the register's region name "Верхняя панель" (an F6 stop). `.topbar-nav` is the
bar's only `nav` and carries no label; its links never wrap inside it. `.user-email` sits inside the
user menu trigger and is cut with an ellipsis only visually (14rem; 6rem below a 480px viewport, which keeps one row at 375px, where
the bar's gaps tighten to `space-2`): the trigger's accessible name stays the full email and the menu's
`.dropdown-label` shows it in full, wrapping. When the row still does not fit (320px, 400 % zoom) the bar
wraps and `.topbar-end` moves to a second row, right-aligned. Pages add no top bar overrides.

## proto.js API

All behaviour is delegated on `document`; no per-page script is needed.

- **Theme.** `<button data-theme-toggle aria-pressed="false">` toggles `.dark` on `<html>`.
  `<html data-theme-fixed>` (the gallery) disables the automatic theme.
- **States.** Any element with `data-state="<name> [<name>...]"` is shown only in those states. The
  state comes from `#state-<name>` in the URL, else `<html data-default-state="<name>">`, else the first
  name found. `<html data-active-state>` holds the current one. Any other hash (`#main`, `#sec-axes`,
  `#<moduleId>`, e.g. `#introduction`) is an anchor, not a state: the state shown stays. `data-state-label="..."` on any element of
  a state names it in `<nav class="proto-chrome" data-state-index>`, which proto.js fills with
  `#state-` links. Do not put `data-state` on `.pane` elements (the one-pane switch owns their
  `hidden`); put it on their children.
- **Live containers (R2).** Put each container in the page once, empty, with `data-live-key="<key>"`
  (and its `role`). Its content per state comes from `<template data-live-source="<key>"
  data-state="<names>">`; the container is never removed, only its children are replaced. Notifications
  wrapper: `<div class="notifications" data-notifications data-region>` holding `<h2 class="sr-only"
  id="..." data-notifications-heading>Уведомления</h2>` and its two containers; proto.js gives it
  `role="region"` and `aria-labelledby` only while a container has content.
- **State-driven openings.** `data-open-in-states="<names>"` on a menu trigger, a `<dialog>`, a tooltip
  trigger or a collapsible trigger opens it in those states; `data-select-in-states="<names>"` on a tab
  (or a one-pane switch tab) selects it. Focus is not moved. Tab selection follows decision A17:
  `data-select-in-states` applies on a hash load, a typed `#state-`, Back and `window.proto.setState`;
  a `data-goto-state` transition keeps the selected tab of every tab list while the new state still shows
  that tab (the tab has no `data-state`, or lists the state), so a simulated action never switches the
  learner's tab. A tab the new state hides gives way to its list's `data-select-in-states` tab for that
  state, else to the list's first shown tab. Only a control that names a tab switches it:
  `data-select-tab="<tab id>"` on a `data-goto-state` or `data-show-pane` control ("Открыть результаты"
  -> Проверки).
- **In-page anchors.** Any `a[href="#<id>"]` that is not `#state-` (the skip link, the lesson's
  "Содержание", catalog module links) moves focus to its target and scrolls it to the top, without
  changing the URL, so a reload keeps the `#state-` hash. The focus lands on the target when it is
  focusable or has `tabindex`, else on its first `h1`-`h4` with `tabindex="-1"` (a `section` whose
  heading is the landing point), else on the target made `tabindex="-1"`. Arrival with an anchor hash
  (`catalog#<moduleId>`, e.g. `catalog#introduction`, from the dashboard) does the same once the page has loaded (after `load`, one
  task later, so the browser's own fragment navigation cannot leave focus on `body`); a typed anchor hash
  does it on `hashchange`. No page script is
  needed; a missing or hidden target leaves the link to the browser.
- **Tabs.** `role="tablist"` / `role="tab"` with `aria-controls` and `aria-selected`, panels
  `role="tabpanel"`; roving tabindex, arrows, Home, End.
- **Lesson layout.** `<main class="lesson-layout" data-active-pane="lesson">` with children in DOM order
  `.pane[data-pane="lesson"]`, `.check-bar`, `.resizable-handle`, `.pane[data-pane="environment"]`.
  Below 1024px proto.js adds `.is-one-pane` and hides the inactive pane; `data-environment="none"` gives
  the full-width lesson (M0, no `workspace`): `proto.css` does not draw the environment pane and the
  split handle (`display: none`, so no Tab or `F6` stop), the markup stays; `data-force-layout="one-pane|two-pane"` is for the gallery.
  The environment pane scrolls as a whole (`overflow-y: auto`) and its tabs keep the terminal's 12rem
  minimum, so in a cell shorter than its content (one-pane mode at 375x667 or 320x500) it scrolls and
  never paints over the check bar row. Verified over http with `elementFromPoint` at the centre of every
  focused, rendered "Проверить" in all 44 lesson states, both panes shown in one-pane mode: 0 covered at
  375x667, 320x500, 320x200 and 1280x800 (27 covered at 375x667 with the pane's overflow forced back to
  visible).
  One-pane switch: a `.pane-switch` at the top of each pane with `<div class="tabs-list" role="tablist"
  data-pane-switch>` and tabs `data-show-pane="lesson|environment"` (no `aria-controls`). Any control
  with `data-show-pane="<pane>"` switches the area first, then selects the tab named by
  `data-select-tab="<tab id>"` and focuses `data-focus="<selector>"` ("К окружению", "Открыть
  результаты").
- **Simulated outcome ("go to state and focus").** The one API for a control that fakes its result
  ("Повторить", "Проверить", "Продолжить работу", "Запустить снова", a menu item, a dialog button):
  `data-goto-state="<name>"` plus `data-focus="<selector>"`. On click proto.js pushes `#state-<name>` as a
  new history entry (Back returns to the previous state through `hashchange`), shows the state, then
  focuses `data-focus` (a target that cannot take focus gets `tabindex="-1"`). It runs after the menu or
  dialog has closed, and a dialog does not return focus to its opener over it. `aria-disabled` controls
  do nothing (R1). `data-goto-focus` and `data-focus-after` are not read by proto.js: pages use
  `data-focus` and drop their own `[data-goto-state]` click handlers.
- **State hook.** Every state change (hash, Back, `setState`, `data-goto-state`) dispatches
  `proto:statechange` on `document` with `event.detail.state`, before `data-focus` is applied. A page's
  per-state setup (the lesson page's `data-environment`, shown pane, split value) listens to it instead
  of its own `hashchange` / `popstate` / click handlers, so the focus target is rendered when it moves.
- **Split handle.** `<div class="resizable-handle" role="separator" tabindex="0" aria-orientation="vertical"
  aria-label="Граница панелей" aria-valuemin="25" aria-valuemax="75" aria-valuenow="50"
  data-presets="50 35 65">`; a press that moves less than 4px cycles the presets, a longer one drags;
  Left/Right 5 %, Home/End to min/max, Enter cycles. After a free drag the next click goes to the first
  preset (50 %). It sets `--split-left` on the layout.
- **Region cycle (R3).** Mark every region root `data-region` in `F6` order (top bar `header`,
  notifications wrapper, the two panes, the check bar; on other pages `main`). `F6` / Shift+`F6` and
  Ctrl+Shift+. / Ctrl+Shift+, (`KeyboardEvent.code` `Period` / `Comma`) are caught in the capture phase;
  focus goes to the next region's first focusable element; a hidden pane is shown first; the
  notifications wrapper counts only while it is a region; from the split handle (no region) the next
  region in DOM order is taken. Disabled while a dialog is open.
- **DropdownMenu.** Trigger `data-menu-trigger aria-haspopup="menu" aria-expanded="false"
  aria-controls="<menu id>"`; menu `.dropdown-menu role="menu"` (a label: the group pattern in the
  inventory); items `role="menuitem"` or
  `role="menuitemcheckbox" aria-checked`; an item with `data-dialog-open="<id>"` opens that dialog and
  returns focus to the trigger on close.
- **AlertDialog.** `<dialog class="alert-dialog" role="alertdialog" id>`; open with
  `data-dialog-open="<id>"`, close with `data-dialog-close`; initial focus on `[autofocus]`.
- **Collapsible.** `data-collapsible aria-expanded aria-controls`, optional `data-label-collapsed` /
  `data-label-expanded` (text goes into `[data-collapsible-label]` or the button).
- **Tooltip.** Wrap in `.tooltip-anchor`; trigger `data-tooltip="<tip id>" aria-describedby="<tip id>"`;
  `<span class="tooltip" role="tooltip" id>`; the anchor may itself be the trigger. Hover and keyboard
  focus (`:focus-visible`) open it, it stays while hovered, Esc closes; leaving the anchor with the pointer
  closes it unless the trigger has keyboard focus (a click's focus does not pin it). A transparent
  `.tooltip::before` bridge covers the `space-2` gap on the tip's side, so the pointer can travel from the
  trigger onto the tip without the tip closing (WCAG 1.4.13; traced on the split handle).
- **R1.** Any click on `[aria-disabled="true"]` is swallowed in the capture phase.
- **Copy.** `data-copy="<selector>"` copies that element's text; on denial the label becomes
  `data-copy-denied`.
- `window.proto` exposes `setState(name)`, `showPane(name)`, `syncNotifications()`, `setTheme(isDark)`,
  `focusAnchor(id)` (the in-page anchor behaviour above; returns false when the target is missing or
  hidden).

## Contrast runs

Pairs the validator does not cover, run with `python3 -I scripts/design_tokens.py pair <fg> <bg>` on the
values of `tokens.css`. Thresholds: status colours as icons 3:1 and as text 4.5:1 (all are used as text
somewhere: field errors, the fail badge, the destructive Alert title, so all are held to 4.5:1); ANSI
colours, `terminal-foreground` on `terminal-ansi-black` and on `terminal-selection`, and
`terminal-cursor-accent` on `terminal-cursor` 4.5:1; `terminal-cursor` and `ring` on `terminal`, `input`
on `card` 3:1. Every run passes; none needed a threshold change.

```
## :root
--success on --background: oklch(0.5 0.13 150) on oklch(1 0 0): 5.640:1
--success on --card: oklch(0.5 0.13 150) on oklch(1 0 0): 5.640:1
--warning on --background: oklch(0.5 0.11 60) on oklch(1 0 0): 6.175:1
--warning on --card: oklch(0.5 0.11 60) on oklch(1 0 0): 6.175:1
--info on --background: oklch(0.5 0.15 255) on oklch(1 0 0): 6.071:1
--info on --card: oklch(0.5 0.15 255) on oklch(1 0 0): 6.071:1
--destructive on --background: oklch(0.55 0.2 27.325) on oklch(1 0 0): 5.386:1
--destructive on --card: oklch(0.55 0.2 27.325) on oklch(1 0 0): 5.386:1
--ring on --terminal: oklch(0.556 0 0) on oklch(0.18 0 0): 3.951:1
--input on --card: oklch(0.62 0 0) on oklch(1 0 0): 3.641:1
--muted-foreground on --card: oklch(0.53 0 0) on oklch(1 0 0): 5.251:1
--background on --foreground: oklch(1 0 0) on oklch(0.145 0 0): 19.798:1
--terminal-ansi-red on --terminal: #e05252 on oklch(0.18 0 0): 4.905:1
--terminal-ansi-green on --terminal: #0dbc79 on oklch(0.18 0 0): 7.571:1
--terminal-ansi-yellow on --terminal: #e5e510 on oklch(0.18 0 0): 13.869:1
--terminal-ansi-blue on --terminal: #3b8eea on oklch(0.18 0 0): 5.569:1
--terminal-ansi-magenta on --terminal: #c84fc8 on oklch(0.18 0 0): 4.825:1
--terminal-ansi-cyan on --terminal: #11a8cd on oklch(0.18 0 0): 6.696:1
--terminal-ansi-white on --terminal: #e5e5e5 on oklch(0.18 0 0): 14.872:1
--terminal-ansi-bright-black on --terminal: #8c8c8c on oklch(0.18 0 0): 5.571:1
--terminal-ansi-bright-red on --terminal: #f14c4c on oklch(0.18 0 0): 5.244:1
--terminal-ansi-bright-green on --terminal: #23d18b on oklch(0.18 0 0): 9.424:1
--terminal-ansi-bright-yellow on --terminal: #f5f543 on oklch(0.18 0 0): 16.079:1
--terminal-ansi-bright-blue on --terminal: #6cb0f5 on oklch(0.18 0 0): 8.177:1
--terminal-ansi-bright-magenta on --terminal: #d670d6 on oklch(0.18 0 0): 6.376:1
--terminal-ansi-bright-cyan on --terminal: #29b8db on oklch(0.18 0 0): 8.005:1
--terminal-ansi-bright-white on --terminal: #ffffff on oklch(0.18 0 0): 18.734:1
--terminal-foreground on --terminal-ansi-black: oklch(0.92 0 0) on #2e3436: 9.946:1
--terminal-cursor on --terminal: #e5e5e5 on oklch(0.18 0 0): 14.872:1
--terminal-cursor-accent on --terminal-cursor: oklch(0.18 0 0) on #e5e5e5: 14.872:1
--terminal-foreground on --terminal-selection: oklch(0.92 0 0) on #264f78: 6.681:1
## .dark
--success on --background: oklch(0.75 0.17 150) on oklch(0.145 0 0): 9.503:1
--success on --card: oklch(0.75 0.17 150) on oklch(0.205 0 0): 8.605:1
--warning on --background: oklch(0.8 0.15 80) on oklch(0.145 0 0): 10.413:1
--warning on --card: oklch(0.8 0.15 80) on oklch(0.205 0 0): 9.429:1
--info on --background: oklch(0.75 0.12 240) on oklch(0.145 0 0): 9.074:1
--info on --card: oklch(0.75 0.12 240) on oklch(0.205 0 0): 8.217:1
--destructive on --background: oklch(0.704 0.182 22.216) on oklch(0.145 0 0): 6.943:1
--destructive on --card: oklch(0.704 0.182 22.216) on oklch(0.205 0 0): 6.287:1
--ring on --terminal: oklch(0.708 0 0) on oklch(0.18 0 0): 7.251:1
--input on --card: oklch(0.52 0 0) on oklch(0.205 0 0): 3.266:1
--muted-foreground on --card: oklch(0.708 0 0) on oklch(0.205 0 0): 6.939:1
--background on --foreground: oklch(0.145 0 0) on oklch(0.985 0 0): 18.968:1
--terminal-ansi-red on --terminal: #e05252 on oklch(0.18 0 0): 4.905:1
--terminal-ansi-green on --terminal: #0dbc79 on oklch(0.18 0 0): 7.571:1
--terminal-ansi-yellow on --terminal: #e5e510 on oklch(0.18 0 0): 13.869:1
--terminal-ansi-blue on --terminal: #3b8eea on oklch(0.18 0 0): 5.569:1
--terminal-ansi-magenta on --terminal: #c84fc8 on oklch(0.18 0 0): 4.825:1
--terminal-ansi-cyan on --terminal: #11a8cd on oklch(0.18 0 0): 6.696:1
--terminal-ansi-white on --terminal: #e5e5e5 on oklch(0.18 0 0): 14.872:1
--terminal-ansi-bright-black on --terminal: #8c8c8c on oklch(0.18 0 0): 5.571:1
--terminal-ansi-bright-red on --terminal: #f14c4c on oklch(0.18 0 0): 5.244:1
--terminal-ansi-bright-green on --terminal: #23d18b on oklch(0.18 0 0): 9.424:1
--terminal-ansi-bright-yellow on --terminal: #f5f543 on oklch(0.18 0 0): 16.079:1
--terminal-ansi-bright-blue on --terminal: #6cb0f5 on oklch(0.18 0 0): 8.177:1
--terminal-ansi-bright-magenta on --terminal: #d670d6 on oklch(0.18 0 0): 6.376:1
--terminal-ansi-bright-cyan on --terminal: #29b8db on oklch(0.18 0 0): 8.005:1
--terminal-ansi-bright-white on --terminal: #ffffff on oklch(0.18 0 0): 18.734:1
--terminal-foreground on --terminal-ansi-black: oklch(0.92 0 0) on #2e3436: 9.946:1
--terminal-cursor on --terminal: #e5e5e5 on oklch(0.18 0 0): 14.872:1
--terminal-cursor-accent on --terminal-cursor: oklch(0.18 0 0) on #e5e5e5: 14.872:1
--terminal-foreground on --terminal-selection: oklch(0.92 0 0) on #264f78: 6.681:1
```

Extra runs behind the decisions above, in order: white on solid dark `destructive` (why
`destructive-foreground` exists); shadcn's dark `destructive/60` fill against `background` and white on
that composite (`#9c4244`, computed by compositing in sRGB); light destructive hover as a 90 % mix with
`background` (rejected) and with `foreground` (used); dark destructive hover with `foreground`; primary
hover (90 % with `background`) light and dark (every mix computed in OKLab, as CSS `color-mix(in oklab, ...)` does); the shadcn light `ring` and `input` defaults on white.

```
#ffffff on oklch(0.704 0.182 22.216): 2.851:1
oklch(0.704 0.182 22.216 / 60%) on oklch(0.145 0 0): 3.089:1
#ffffff on #9c4244: 6.410:1
oklch(0.985 0 0) on oklch(0.5950 0.1800 27.325): 4.214:1
oklch(0.985 0 0) on oklch(0.5095 0.1800 27.325): 6.043:1
oklch(0.145 0 0) on oklch(0.7321 0.1638 22.216): 7.786:1
oklch(0.985 0 0) on oklch(0.2845 0.0000 0.000): 13.752:1
oklch(0.205 0 0) on oklch(0.8443 0.0000 0.000): 11.164:1
oklch(0.708 0 0) on oklch(1 0 0): 2.584:1
oklch(0.922 0 0) on oklch(1 0 0): 1.260:1
```

Menu item focus and the selected tab (judge_ux round 1, A1 and the tab advisory), light then dark:
`ring` on `popover`, `ring` on `accent` (= `muted`, the focused and the disabled item), `accent` on
`popover` (the rejected background-only indicator), `background` on `muted` (selected tab surface
alone), `input` on `muted` (shadcn's dark active border, rejected), `muted-foreground` on `muted` and on
`background` (the selected-tab border). Thresholds 3:1 (WCAG 2.4.7 / 1.4.11); the background-only and
`input` pairs are the reason for the choice, not a pass.

```
## :root
--ring on --popover: oklch(0.556 0 0) on oklch(1 0 0): 4.742:1
--ring on --accent: oklch(0.556 0 0) on oklch(0.97 0 0): 4.349:1
--accent on --popover: oklch(0.97 0 0) on oklch(1 0 0): 1.090:1
--background on --muted: oklch(1 0 0) on oklch(0.97 0 0): 1.090:1
--input on --muted: oklch(0.62 0 0) on oklch(0.97 0 0): 3.339:1
--muted-foreground on --muted: oklch(0.53 0 0) on oklch(0.97 0 0): 4.816:1
--muted-foreground on --background: oklch(0.53 0 0) on oklch(1 0 0): 5.251:1
## .dark
--ring on --popover: oklch(0.708 0 0) on oklch(0.205 0 0): 6.939:1
--ring on --accent: oklch(0.708 0 0) on oklch(0.269 0 0): 5.857:1
--accent on --popover: oklch(0.269 0 0) on oklch(0.205 0 0): 1.185:1
--background on --muted: oklch(0.145 0 0) on oklch(0.269 0 0): 1.308:1
--input on --muted: oklch(0.52 0 0) on oklch(0.269 0 0): 2.757:1
--muted-foreground on --muted: oklch(0.708 0 0) on oklch(0.269 0 0): 5.857:1
--muted-foreground on --background: oklch(0.708 0 0) on oklch(0.145 0 0): 7.663:1
```

## Validator output

`python3 -I scripts/design_tokens.py check design`, exit 0:

```
contrast ok :root --accent-foreground on --accent: 16.444:1 (min 4.5:1)
contrast ok :root --card-foreground on --card: 19.798:1 (min 4.5:1)
contrast ok :root --destructive-foreground on --destructive: 5.160:1 (min 4.5:1)
contrast ok :root --info-foreground on --info: 5.817:1 (min 4.5:1)
contrast ok :root --muted-foreground on --muted: 4.816:1 (min 4.5:1)
contrast ok :root --popover-foreground on --popover: 19.798:1 (min 4.5:1)
contrast ok :root --primary-foreground on --primary: 17.176:1 (min 4.5:1)
contrast ok :root --secondary-foreground on --secondary: 16.444:1 (min 4.5:1)
contrast ok :root --sidebar-accent-foreground on --sidebar-accent: 16.444:1 (min 4.5:1)
contrast ok :root --sidebar-foreground on --sidebar: 18.968:1 (min 4.5:1)
contrast ok :root --sidebar-primary-foreground on --sidebar-primary: 17.176:1 (min 4.5:1)
contrast ok :root --success-foreground on --success: 5.403:1 (min 4.5:1)
contrast ok :root --terminal-foreground on --terminal: 14.734:1 (min 4.5:1)
contrast ok :root --warning-foreground on --warning: 5.916:1 (min 4.5:1)
contrast ok :root --muted-foreground on --background: 5.251:1 (min 4.5:1)
contrast ok :root --destructive on --background: 5.386:1 (min 4.5:1)
contrast ok :root --ring on --background: 4.742:1 (min 3.0:1)
contrast ok :root --input on --background: 3.641:1 (min 3.0:1)
contrast ok :root --sidebar-ring on --sidebar: 4.543:1 (min 3.0:1)
INFO :root --border on --background: 1.260:1
contrast ok .dark --accent-foreground on --accent: 14.499:1 (min 4.5:1)
contrast ok .dark --card-foreground on --card: 17.176:1 (min 4.5:1)
contrast ok .dark --destructive-foreground on --destructive: 6.943:1 (min 4.5:1)
contrast ok .dark --info-foreground on --info: 9.074:1 (min 4.5:1)
contrast ok .dark --muted-foreground on --muted: 5.857:1 (min 4.5:1)
contrast ok .dark --popover-foreground on --popover: 17.176:1 (min 4.5:1)
contrast ok .dark --primary-foreground on --primary: 14.232:1 (min 4.5:1)
contrast ok .dark --secondary-foreground on --secondary: 14.499:1 (min 4.5:1)
contrast ok .dark --sidebar-accent-foreground on --sidebar-accent: 14.499:1 (min 4.5:1)
contrast ok .dark --sidebar-foreground on --sidebar: 17.176:1 (min 4.5:1)
contrast ok .dark --sidebar-primary-foreground on --sidebar-primary: 6.546:1 (min 4.5:1)
contrast ok .dark --success-foreground on --success: 9.503:1 (min 4.5:1)
contrast ok .dark --terminal-foreground on --terminal: 14.734:1 (min 4.5:1)
contrast ok .dark --warning-foreground on --warning: 10.413:1 (min 4.5:1)
contrast ok .dark --muted-foreground on --background: 7.663:1 (min 4.5:1)
contrast ok .dark --destructive on --background: 6.943:1 (min 4.5:1)
contrast ok .dark --ring on --background: 7.663:1 (min 3.0:1)
contrast ok .dark --input on --background: 3.606:1 (min 3.0:1)
contrast ok .dark --sidebar-ring on --sidebar: 3.781:1 (min 3.0:1)
INFO .dark --border on --background: 1.260:1
```
