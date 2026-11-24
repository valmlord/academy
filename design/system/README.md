# Design system v1

Issue #50. The token file `tokens.css` is the contract with `apps/web` (ADR-0006 section 1); `proto.css`
and `proto.js` serve the prototypes only and are never imported by the app; `components.html` shows every
component below in both themes. Base: shadcn/ui, default neutral theme
(ui.shadcn.com/docs/theming, fetched through Context7 `/websites/ui_shadcn` on 2026-10-29) and the
`new-york-v4` Button source (github.com/shadcn-ui/ui, `apps/v4/registry/new-york-v4/ui/button.tsx`,
fetched 2026-10-29). RadioGroup and Checkbox (#70): the `new-york-v4` sources `ui/radio-group.tsx` and
`ui/checkbox.tsx` of the same repository and ui.shadcn.com/docs/components/radix/radio-group, fetched
2026-11-10. Validator: `python3 -I scripts/design_tokens.py check design`.

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
| `success`, `warning`, `info` (+ `-foreground`) | both | absent | see `tokens.css` | check statuses of `checks.md` (#50 design notes §2); light fills are dark with near-white text, dark fills are light with near-black text |
| `terminal`, `terminal-foreground` | both, same value | absent | `oklch(0.18 0 0)`, `oklch(0.92 0 0)` | the terminal is dark in both themes because xterm's ANSI palette is tuned for a dark background (#50 design notes §2) |
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
  (#50 design notes §2), never a filled `destructive` badge: filled colour is reserved for the one
  destructive action on the page.
- `destructive` as text (field errors, the destructive Alert title, the fail badge) sits only on
  `background` or `card`: measured in both themes.

## Type scale

System font stacks (`--font-sans`, `--font-mono` in `proto.css`); the app's font is a dev decision.
Sizes are Tailwind's, so every value is a class in the app.

| Step | Size / line height | Used for |
|------|--------------------|----------|
| `text-xs` | 0.75rem / 1rem | badges, key hint, R1 reason in a menu item, gallery notes |
| `text-sm` | 0.875rem / 1.25rem | controls, labels, status bars, check rows, alerts, breadcrumbs, tables, code; the h4 of a mentor block (weight 600) |
| `text-base` | 1rem / 1.5rem | body text, inputs (16px avoids iOS zoom on focus) |
| `text-lg` | 1.125rem / 1.75rem | card and dialog titles; empty-state titles; h3 on pages (quiz question); h4 in prose |
| `text-xl` | 1.25rem / 1.75rem | h2 on pages; h3 in prose |
| `text-2xl` | 1.5rem / 2rem | page h1; h2 in prose |
| `text-3xl` | 1.875rem / 2.25rem | h1 in prose (rare: the lesson title is the page h1) |

Weights: 400 body, 500 controls and titles of rows, 600 headings, status-icon glyphs and the current
link of the prototype state index. No other weight (700 was replaced by 600). Numbers that tick (timers)
use `tabular-nums`.

**Prose (`.prose`, theory.md and task.md, 107-163 lines):** `text-base` with line height 1.7, measure
`70ch` (readable line length, WCAG 1.4.8 advisory); `space-4` between blocks, `space-10` above h2,
`space-8` above h3, `space-6` above h4; lists indented `space-6`; inline `code` in `text-sm` (`--text-sm`,
not an `em` factor); tables full width in a horizontally scrollable wrapper
(`.table-wrap`), `text-sm`, row rules in `border`; inline `code` on `muted`; code blocks (`.code-block`)
on `muted` with a header holding "Копировать", scrolling sideways inside the block only; a block that
overflows takes Tab ("Scrollable code"); headings that
"Содержание" jumps to carry `tabindex="-1"`.

## Spacing scale

Tailwind's 0.25rem step, as `--space-*` in `proto.css`: 0.5 (0.125rem), 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12,
16 (4rem). Controls: height 2.25rem (`--control-height`: buttons, the icon button as a square, inputs), small 2rem
(`--control-height-sm`: small buttons, tab triggers); every pointer target at least 24px
(WCAG 2.5.8), the split handle included: its grid column `--handle-width` equals `--hit-min` (1.5rem), so
the 24px target sits between the panes and never overlaps a pane's scrollbar. Page gutter `space-4`, card
padding `space-6`.

Border widths: 1px for boundaries (cards, inputs, separators, rules), 2px for strokes (status icons, the
Collapsible chevron, blockquote rule, the focus ring); in a Badge the status icon
uses 1px. Fixed sizes: status icon 1.25rem (`space-5`, one `text-sm` line), in a Badge 1rem (one
`text-xs` line, glyph `text-xs`); radio and checkbox 1rem (shadcn `size-4`, also the review's
`.choice-indicator`); the radio dot and the "Ваш ответ" dot `space-2`; chevron `space-1-5`.

Links: underline offset `--underline-offset` (0.2em, so it scales with the text and clears descenders),
hover thickens the underline to `--underline-hover-width` (2px, the stroke width above); both in
`proto.css`, used by `a` and the link Button. Heading link `.heading-link`: on an `h2` whose whole
text is one `a` (the dashboard course block heading, `ia.md` "Rules (#218)" row "course
block"). The heading keeps its level, size and weight; the link inherits them and the heading's colour,
keeps the underline and hover of every `a`, and is an `inline-block` with `max-width: 100%`, so a long name
wraps inside it and the target is the whole box, at least one heading line tall. Focus: the global ring ("Focus ring"), outside
the link. Page column `--column-max` (48rem, Tailwind `max-w-3xl`).

## Radius

`--radius: 0.625rem` (shadcn default) and the steps of `@theme inline`, aliased with identical values in
`proto.css`: sm 0.6x (controls inside menus, kbd, the checkbox and its review indicator, the warning status
icon), md 0.8x (buttons, inputs, badges, tabs, code blocks), lg 1x (alerts, dialogs, tab lists, check list),
xl 1.4x (cards), full (`--radius-full: calc(infinity * 1px)`, Tailwind's `rounded-full`; the Progress track,
status icons, the radio and its review indicator, the radio dot, the "Ваш ответ" dot and the top of the lock
shackle). 2xl-4xl exist for parity and are unused in v1. `--radius-full` lives only in `proto.css`:
`rounded-full` is a Tailwind utility, not a theme token. One value is not a step: the corners of a code
block's `pre` that meet the block's corners are `calc(var(--radius-md) - 1px)`, the block's inner radius
inside its 1px border, so the inset focus ring the `pre` takes when it overflows ("Scrollable code") follows
the block's corners. Which corners: all four in a header-less block (a quiz prompt, a quiz explanation), the
bottom two under a header (lesson prose), whose top corners are square (0). In the app per corner:
`rounded-[calc(var(--radius-md)-1px)]` header-less, `rounded-b-[calc(var(--radius-md)-1px)]` under a header.

## Motion and reduced motion

`--duration-fast` 150ms (hover, chevrons), `--duration-normal` 200ms (progress width); easing
`cubic-bezier(0.2, 0, 0, 1)`. Spinner 800ms per turn, skeleton pulse 1.6s. Nothing moves on its own
except the spinner, the running status icon and the skeleton. Under `prefers-reduced-motion: reduce`
every duration is 0, the spinner and the `running` icon stop and turn into a static dotted ring, and the
skeleton stops pulsing. `running-still` is the other still form: it never moves in any motion setting and
keeps its open side, so the reduced-motion rule does not select it. Spinners always sit next to a word
("Создаём окружение", "Входим..."), so stopping them removes no information.

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
"Contrast runs"). A code block's `pre` that is a Tab stop (it overflows, "Scrollable code") draws the ring
inset (`outline-offset: calc(var(--focus-offset) * -1)`), inside the block, so it lies on `muted`: the
4.349:1 / 5.857:1 above. Two `tabindex="-1"` targets draw the ring outside instead (2px offset), and only these two: a
received hint level (`.hint-level`) and the busy display (`.mentor-busy`), because neither has padding and an
inset ring would lie on its first glyph; outside, it lies on the check row panel's `background`, the pair the
validator measures for `ring`. The other mentor focus targets keep the inset ring of `tabindex="-1"`: the
block's `h4`, the review text (`pre.check-row-message`, which has padding) and a failed call's
`p.alert-title`. The browser decides `:focus-visible`: the ring Radix Tabs draws on the first mouse click
on a tab is accepted (ia.md R4).

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
| Button | `.button` | all | default, secondary, outline, ghost, link, destructive; sizes default, sm, icon; `aria-disabled` + `.disabled-reason` (R1), cursor `not-allowed`; busy: `aria-busy` plus `aria-disabled` with Spinner, the busy label is the reason (R1), cursor `progress` |
| Card | `.card`, `.card-header`, `.card-title`, `.card-description`, `.card-footer` | sign-in, dashboard | one |
| Field, Label, Input | `.field`, `.label`, `.input`, `.field-description`, `.field-error` | sign-in; lesson, Квиз (`.field-description` and `.field-error` in the question block) | default, `aria-invalid="true"` |
| RadioGroup | `.choice-group` (`role="radiogroup"`), `label.choice`, `input.radio`, `.choice-text` | lesson, Квиз (from #36) | unchecked, checked, focused, locked (`aria-disabled="true"` on the group and every option). Not in `apps/web` yet |
| Checkbox | `.choice-group` (`role="group"`), `label.choice`, `input.checkbox`, `.choice-text` | lesson, Квиз (from #36) | as RadioGroup. Not in `apps/web` yet (only the menu's `DropdownMenuCheckboxItem`, `ui/dropdown-menu.tsx:76`, a menu item, not a form control) |
| Alert | `.alert`, `.alert-title`, `.alert-description`, `.alert-actions`, `.alert-links` | all | default, destructive, warning (custom: border in `warning`, words in `foreground`; for the prerequisite alert F6.2 and the API key note). A message that takes focus instead of a live region (sign-in, R2; the quiz result block, error summary and send error) is `<div class="alert" role="group" tabindex="-1" aria-labelledby="<title id>" [aria-describedby="<description ids>"]>`: a name on a `div` without a role is not exposed. A load error whose failed retry focuses its title (`ia.md` R2 page-level retry table: the dashboard course error, the lesson text load error, the quiz load error) keeps the plain Alert (no role, no tabindex on the Alert) and makes its title a heading, `h1`-`h3` by its place, with `class="alert-title text-sm"` and `tabindex="-1"`, as the catalog course error. Every part after the leading icon sits in the text column, however many `p.alert-description` lines follow (the app's `col-start-2`, `ui/alert.tsx:47`, `:58`). `.alert-links`: a `ul role="list"` of links after the title (the quiz error summary), each link at least `--hit-min` tall |
| DropdownMenu | `.dropdown`, `.dropdown-menu`, `.dropdown-item`, `.dropdown-item-reason`, `.dropdown-check`, `.dropdown-label`, `.dropdown-separator` | top bar, lesson | item (`button`), link item (`a.dropdown-item`, for an item that navigates: "Выйти"; no underline), checkbox item, `aria-disabled` item with a reason line (`.dropdown-item-reason` is `aria-hidden="true"` with an `id`, tied to the item by `aria-describedby` only, so the name is the label alone). The user menu is named by its trigger (`aria-labelledby="<trigger id>"`, the email), never by an `aria-label`. A menu owns only items, groups and separators, so a `.dropdown-label` is `role="presentation"` with an `id` and names a `<div role="group" aria-labelledby="<label id>">` wrapping the label, the separator and the items it heads |
| Breadcrumb | `.breadcrumb` (`nav > ol > li`) | lesson | links plus `aria-current="page"` |
| Tabs | `.tabs`, `.tabs-list`, `.tabs-trigger`, `.tabs-content` | lesson | left pane, environment, one-pane switch (`.pane-switch`) |
| Badge | `.badge` | dashboard, catalog, lesson | default, secondary, outline (+ `data-tone="muted"` or `"destructive"`), success, warning, info, muted (custom fills: one per status token). Check-status badges are deferred: no v1 page draws them (v1 check rows show the status icon and the word, F13.3); they serve no designed page (the dashboard's recent attempts, F18.3, show a `.status-icon` and the attempt summary text) |
| Progress | `.progress`, `.progress-indicator` (`--progress-value`) | dashboard | one; track bordered in `input` |
| Item | `.item-group`, `.item`, `.item-content`, `.item-title`, `.item-description`, `.item-actions`, `.item-note` | catalog, dashboard, lesson | link row, static row; Item content in the attempt row ("Attempt row" below); `.item-note`: a note under a row (the prerequisite note F6.1), a `p` after the `.item` in the same `li`, so its links are not nested in the row link |
| Collapsible | `[data-collapsible]` trigger, `.collapsible-trigger` chevron | lesson | outcomes, check row, attempt row, "Подробности" (environment status bar and check row panel: a ghost sm `.collapsible-trigger` controlling one `pre.error-details`) |
| Resizable | `.lesson-layout`, `.resizable-handle` | lesson | horizontal, presets 50 / 35 / 65 |
| ScrollArea | `.scroll-area` | lesson | native overflow (a styled scrollbar is the app's) |
| AlertDialog | `dialog.alert-dialog`, `.alert-dialog-title`, `.alert-dialog-description`, `.alert-dialog-list`, `.alert-dialog-footer` | lesson | reset (F11.3: destructive action "Сбросить"); budget confirmation (F13.1, from #37 / #39: default action "Запустить", the checks in a `.alert-dialog-list` after the description) |
| Spinner | `.spinner` | lesson, sign-in | one |
| Kbd | `.kbd` | lesson | one |
| Tooltip | `.tooltip-anchor`, `.tooltip` (`data-side`) | lesson | top, right, left; the anchor may itself be the trigger (split handle) |
| Skeleton | `.skeleton` | dashboard, catalog, lesson | one |
| Empty | `.empty`, `.empty-title`, `.empty-description` | dashboard, catalog | one |
| Separator | `.separator` (`data-orientation`) | catalog, lesson | horizontal, vertical |
| none: a composition of Button, Alert and Spinner ("Hint ladder" below) | `.mentor-block`, `.hint-levels`, `.hint-level`, `.hint-level-name`, `.mentor-actions`, `.mentor-action`, `.mentor-busy` | lesson, Проверки (check row panel, attempt panel) and Квиз (closed quiz block) (from #37) | review block: pending, done (with the transcript note and the cost line), failed and budget spent (destructive Alert with "Повторить" in its `.alert-actions`); ladder: nothing received, levels received, a locked level (its controls `aria-disabled` with one lock reason), every control `aria-disabled` with one reason (a call running, no mentor key), a failed hint (destructive Alert); busy display: plain (review block) and focusable (ladder). shadcn has no ladder or stepper; ButtonGroup (`ui/button-group.tsx`, new-york-v4) joins its buttons into one segmented control (`rounded-l-none`, `border-l-0` on every button after the first, `w-fit`, no wrap), so it leaves no room for each control's "до $N" and cannot wrap at 320px |

Custom pieces, each with its reason: `.status-icon` (`data-status` success, destructive, warning, info,
queued, running, running-still, muted, closed, chosen): one icon per status with a different shape, except
`running-still`, the motionless form of `running`, which keeps its shape; shapes differ because colour is
never the only signal (`checks.md`) and the app will use lucide icons with the same meaning; `running-still`
is the `running` ring (`info`, right side open) with no animation in any motion setting, for a snapshot of a
run that is not updated until the next load (dashboard "Последние попытки", "Идёт проверка"; the app's icon:
lucide `LoaderCircle`, imported as `Loader2Icon` like `apps/web/components/ui/spinner.tsx:2`, without the
spin class); `closed` is a lock in the
`destructive` ring, drawn by `::before` (shackle) and `::after` (body) on the same empty `aria-hidden` span as
every other status, never an SVG child or a glyph, so it differs from the failed cross by shape (the app's
icon: lucide `Lock`, `lucide-react` `^1.65.0` in `apps/web/package.json:23`); `chosen` is not a status but the
quiz review mark "Ваш ответ": a solid `foreground` ring with a dot, a shape no status uses, so the mark never
reads as a result ("Верный ответ" takes the `success` check mark); `.choice-indicator`
(`data-type="radio|checkbox"`, `data-checked="true"`, `aria-hidden`): the RadioGroup or Checkbox drawing on a
span, for the quiz review, which shows answers without inputs; `.disabled-reason`: the R1
reason text, next to its control, or, for a row of adjacent controls that share a reason (R1's row form: the
hint ladder's controls, `ia.md` A71-6, A71-7), one `p.disabled-reason` right after the row, its `id` in the
`aria-describedby` of every `aria-disabled` control of the row and of no enabled one; `.timer`: a standalone
elapsed time, `role="timer"`, used in the check bar, the environment status bar and the mentor busy display
(`.mentor-busy`, `ia.md` A71-7, from #37), a sibling of their `[data-live-key]` container or of the busy
display's words, never inside a button or a live container;
`.check-row-time`: the running time inside a check row button ("0:42 из 2:00"), no role, read as part of
the button's name, because a button's children are presentational and a role there is dropped; one rule
gives both the same look (`tabular-nums`, `muted-foreground`); `.icon-note`: a muted `text-sm` line with a leading `.status-icon`
("Прогресс недоступен" on dashboard and catalog), on a `p` or a heading (weight 400, the heading keeps
its level), the icon on the first line when the text wraps. shadcn has no such piece; the Alert is too
heavy for a one-line note. `.sr-only-inline`: visually hidden text that stays in its line, for the ". "
joins between the fields of an attempt row and a "Где трудно" row (`progress.md` A72-19), where the layout
shows no punctuation. `.sr-only` is `position: absolute`, which blockifies the span, and Chromium then puts a
space before it when it computes a name from content: "модели . 5 ноября, 15:20 . Идёт проверка" (measured
with CDP `Accessibility.getFullAXTree`, #72). `.sr-only-inline` (`font-size: 0`, `line-height: 0`,
`clip-path: inset(50%)`, `white-space: nowrap`) keeps the span inline, so the name is "модели. 5 ноября, 15:20. Идёт проверка",
and leaves the line box unchanged (the row measures the same height with either class). It stays inline
only inside a text run: a child of a flex or grid container (`.tabs-trigger`, `.check-row-trigger`,
`.item-content`) is blockified and the space comes back, so it sits inside the field's own span
(`<span class="item-title">№ 3<span class="sr-only-inline">. </span></span>`), or the text and it are wrapped
in one span. Use `.sr-only` for hidden headings and live containers, which are blocks of their own;
`.sr-only-inline` only for hidden text joined to visible text. The app's equivalent is a span with the same
four declarations (Tailwind's `sr-only` is the absolute one, so it is not that).

Compositions (no new primitives): `.topbar` (with `.topbar-brand`, `.topbar-nav`, `.topbar-end`,
`.user-email`), `.notifications` (R2), `.env-statusbar` (`.env-status`, `.env-status-text`,
`.env-status-note`, `.env-status-note[data-tone="warning"]` with a leading warning `.status-icon` for
the API key note F8.3, `.env-actions`, `.env-hint`, `.error-details`), `.check-bar` (`.check-bar-controls`,
`.check-bar-status`), `.check-list` / `.check-row-trigger` (`.check-row-title`, `.check-row-status`,
`.check-row-meta` with `.check-row-time` and `[data-tone="warning"]`) / `.check-row-panel` /
`.check-row-message` / `.error-details`, the mentor block and hint ladder (`.mentor-block`, `.hint-levels`,
`.hint-level`, `.hint-level-name`, `.mentor-actions`, `.mentor-action`, `.mentor-busy`; "Hint ladder" below), the attempt row and attempt panel (`.history-plain`,
`.history-results`, `.history-result-title`; below),
`.prose` (`.table-wrap`, `.code-block`, `.toc`), `.terminal-frame` (`.terminal-output`, `.ansi-<color>`,
`.ansi-bright-<color>`, `.terminal-cursor`, `.terminal-selection`, `data-connection="lost"`,
`.terminal-placeholder`), `.lesson-layout` with `.pane`, `.pane-switch`, `.lesson-header`,
`.lesson-meta`, `.toc` (sizes its heading `text-sm` at any level); `.quiz` (`.quiz-intro`, `.quiz-header`,
`.question`, `.verdict`, `.review-options`, `.review-option`, `.review-option-body`, `.review-marks`,
`.review-mark`, `.explanation`; "Quiz panel" below); page shell `.app`, `.page`, `.column`, `.skip-link`, `.sr-only`, `.sr-only-inline`; `.outcomes`; prototype chrome `.proto-chrome`
(state index, theme toggle; not product UI).

`.column` is the one readable column inside `.page` (dashboard, catalog): `<div class="column">`, children
`space-8` apart, at most `--column-max`. `.outcomes` is the "Чему научитесь" block on catalog and lesson,
one structure: `<div class="outcomes"><hN>Чему научитесь</hN><ul><li>...</li></ul></div>`, the heading
at the page's level (`h3` in a catalog module section, `h2` in the lesson header), set in `text-sm`;
lists indented `space-6`, `text-sm`, items `space-1` apart; extra wrappers inside keep the list rules.
The collapsible variant (lesson, gallery "Collapsible") wraps the lists and the trigger in one stack:
`<div class="outcomes"><hN>...</hN><div class="stack" data-gap="2"><ul>...</ul><ul id="..." hidden>...</ul>
<button ... data-collapsible>...</button></div></div>`. Pages define neither.

Check row (F13.3, F14; `design/flows/checks.md` "Check row fields" decides which item shows for which status
word):
- Collapsed: `button.check-row-trigger` holds, in order, the status icon, `.check-row-title`,
  `.check-row-status` and, when the meta table says so, `.check-row-meta` with the running time
  (`span.check-row-time`), "лимит M:SS" (a plain `span`), then the last-attempt warning
  `<span data-tone="warning"><span class="status-icon" data-status="warning" aria-hidden="true"></span>Осталась 1 попытка</span>`.
  The warning's words are `foreground`, not muted (S4 asks for a visible warning, and colour alone is not
  one), `accent-foreground` on the trigger's hover surface as the trigger itself; the 1.25rem icon equals
  the `text-sm` line, so it stays on the first line when the words wrap. Same pattern as
  `.env-status-note[data-tone="warning"]`. The quiz header shows the same element with the same markup
  (`.quiz-header > [data-tone="warning"]`, one rule with the row's in `proto.css`), because one string has
  one look wherever it shows (`quiz.md`, "Quiz panel, in DOM order").
- Open: `.check-row-panel` holds, in order, the closed note and the sticky-pass note (`p.text-sm`), the
  grader message (`pre.check-row-message`), "Подробности" (`button.button.collapsible-trigger`, ghost, sm,
  `data-collapsible`, collapsed by default, controlling one `pre.error-details`: the environment's markup
  and class), the cost and the counter (`p.text-sm.muted`), then the quiz row's "Пройти квиз". Items are
  `space-2` apart; a hidden item takes no space.
- The quiz check row (F15, from #36; `quiz.md` "Quiz check row in Проверки"): status "Ответы не
  отправлялись" with the `muted` dotted ring before any attempt; no closed note; the panel holds the counter,
  then, while an attempt can be made, "Пройти квиз": `button.button`, outline, sm, a direct child of the
  panel drawn on a line of its own (`.check-row-panel > .button`). Outline, not default, because the page's
  one default action in the check area is "Проверить" and this is a way into another tab; sm, as
  "Подробности", the other button a panel holds; 2rem tall, above the 24px target minimum. Its boundary is
  `input` on `background` (3.641:1 / 3.606:1, validator).
- `.error-details` is the one class for every "Подробности" block (environment status bar F8, check row
  runner error F13): mono `text-xs` on `muted`, wrapping. It replaces `.env-details` (#69); the class was
  renamed, not aliased, so a page still using `.env-details` renders unstyled.

Attempt row (F18.3 dashboard "Последние попытки", F19.1 lesson "История попыток"; `progress.md` A72-19):
one row content on both pages, Item content after a leading `.status-icon` (`aria-hidden`):
`<span class="item-content"><span class="item-title">FIELD 1<span class="sr-only-inline">. </span></span>
<span class="item-description"><time datetime="...">4 ноября, 14:05</time><span class="sr-only-inline">. </span></span>
<span class="item-description">SUMMARY</span></span>`. Field 1 is the lesson title on the dashboard and "№ N"
in the history; a field that already ends in ".", "!", "?", "…" or ":" takes `<span class="sr-only-inline"> </span>`
(A72-19). The row element differs by what it does:
- dashboard: `a.item` in an `.item-group` (the Item link row);
- history, an attempt with check results: `button.check-row-trigger` (`data-collapsible`, `aria-expanded`,
  `aria-controls`) in a `.check-list`, its panel a `.check-row-panel`;
- history, an attempt with no check result (A72-14): `li.history-plain` with `tabindex="-1"`, the same
  children directly in the `li`: the trigger's grid and padding (one rule with `.check-row-trigger`), no
  hover, no Tab stop.

The "Где трудно" row (F18.4) is the same Item link row without the status icon: check title, lesson title,
note, joined the same way.

Attempt panel (F19.2): `.check-row-panel` > `ul.history-results`, one `li` per check result, in order
`p.history-result-title` (the check title, or `<code>` id plus "Этой проверки больше нет в уроке"), `p` >
`.check-row-status` (status icon and word), `pre.check-row-message`, the "Подробности" trigger and
`pre.error-details`, the cost `p.text-sm.muted`; results `space-4` apart, a result's items `space-2` apart,
as in a check row panel. A quiz result (the quiz attempt record, `#state-history-quiz-open`) shows its score
line "Верно C из Q." as `p.text-sm` (14px, `foreground`) in place of the grader message: no `pre`, no cost
line. Where the history sits on the Проверки panel (the `.history` section and its gaps)
is page layout.

The history status container (`role="status"`, `ia.md` R2) stays page script, not `proto.js`: it is written
in one state only, once per page view, only while the Проверки panel is shown, and only after the check
status line holds that state's end text (`progress.md` F19 error states); those conditions are F19's, and no
other container has them. Its one dependency on the system, the gap, it reads from
`window.proto.statusTextGapMs` ("proto.js API", status-text gap), so the gap has one value.

The quiz load status container (`role="status"`, `ia.md` R2, `quiz.md` "The quiz load status container")
is page script too, for the same reason: it is written in one case only, once per failed load, with
"Не удалось загрузить квиз" (a load fails with the Квиз panel shown and no focus move announces it), only
while the Квиз panel is shown, after the panel's `aria-busy` is removed, `window.proto.statusTextGapMs` after
a recent check bar text, and no sooner than `QUIZ_LOAD_STATUS_MIN_AGE_MS` (100 ms) after the panel was shown;
it is emptied when a load starts.

AlertDialog with a list (the budget confirmation): `p.alert-dialog-description` then
`ul.alert-dialog-list`, siblings, because a `ul` cannot sit inside the description's `p` (shadcn's
`AlertDialogDescription` renders Radix `Description`, `Primitive.p` in `@radix-ui/react-dialog` 1.3.1
`dist/index.mjs:297`); `aria-describedby` names both ids. Radix points the content's `aria-describedby` at
the Description's id alone, so the app either passes `aria-describedby` with both ids or renders the
Description `asChild` on a `div` that holds the paragraph and the list. The list
is on the `.outcomes` list scale (indent `space-6`, `text-sm`, items `space-1` apart; the app's outcome list
is `list-disc pl-6 text-sm [&>li+li]:mt-1`, `apps/web/components/lesson/outcomes.tsx:56`) and muted like
the description. Buttons: "Отмена" outline with initial focus, "Запустить" default; filled `destructive`
stays reserved for "Сбросить".

`apps/web` ships none of the check pieces yet: no check bar, check row, status icon, AlertDialog or
Collapsible under `apps/web/components` (rechecked for #70 on 2026-11-10; its `components/ui` holds alert,
badge, breadcrumb, button, card, dropdown-menu, empty, field, input, item, label, progress, separator,
spinner, tabs). The environment status bar and its timer shipped with #105
(`components/environment/environment-panel.tsx:178`, `:262`), after this paragraph was first written. #34
builds the check pieces from this section and `checks.md`; nothing here describes a shipped difference.

### Hint ladder and mentor busy display (F16, F17, from #37)

`design/flows/ia.md` A71-1, A71-2, A71-4 to A71-8, A71-10. None of it is in `apps/web`; #37 builds it from
this section. No new token: every colour is one the check row panel and the Alert already use
(`foreground`, `muted-foreground` on `background` and on `card`, `muted`, the outline, secondary and
disabled Button, the destructive Alert), each measured in "Contrast runs" or by the validator.

- Mentor block: `div.mentor-block`, led by an `h4` ("Подсказки", or "Разбор ментора" for the review block,
  which reuses the same class) in `text-sm`, weight 600, its own items `space-2` apart; a hidden item takes
  no space. Placements, each with its parent and the gap above the block (`proto.css` "mentor block"):

  | Placement (flows) | Parent | Gap above | Why this gap |
  |-------------------|--------|-----------|--------------|
  | check row panel, Проверки: review block and ladder (A71-5, A71-6) | `.check-row-panel` | `space-4` | one step above the panel's `space-2`, so the `h4` starts a part of the row |
  | closed quiz block, Квиз: review block (A71-5) | `.quiz` (a direct child, after the closed result Alert) | `space-6` | the quiz panel's part gap: the review is one of its parts, as the result block and each question; no override |
  | attempt panel, Проверки history: done review (A71-10) | `.history-results > li` | `space-2` | results are `space-4` apart; a larger gap would put the review as far from its result as from the next result |

  "Разобрать с ментором" sits in the same parent at the same gap: after the counter in the check row panel
  (`space-2`, a panel item), after the closed result Alert in the quiz (`space-6`).
- Score line (A71-4): `p.text-sm` in `foreground`, "Оценка S%, нужно P%", the first item of a rubric row's
  panel, right before the grader message, `space-2` apart like every panel item. Not muted: it says why the
  row failed or passed, as the grader message does; the muted lines (cost, counter) are bookkeeping. Not in
  attempt panels.
- Review block forms (A71-5), in the `h4`'s block: pending, the busy display (below); done, the review in
  `pre.check-row-message` with `tabindex="-1"` and an `id` (the A71-8 focus target), then the transcript note
  `p.icon-note` with the `info` status icon ("Ментор не видел транскрипт работы с агентом") when it applies,
  then "Стоимость разбора: $N" as `p.text-sm.muted`; failed and budget spent, the destructive Alert (no live
  role) with its `p.alert-title` ("Ментор не ответил", "Бюджет на разбор исчерпан") with `tabindex="-1"` and
  an `id`, the A71-8 focus target; the budget form puts "Стоимость разбора: $N" in the Alert as a
  `p.alert-description` after the title (A71-5: the Alert "with the cost line"). Then, inside the Alert, the
  retry: `div.alert-actions` holding one `div.mentor-action` with a secondary sm Button "Повторить" and its
  `span.text-sm.muted` "до $N" (`aria-describedby`, A71-2). Its cost sits beside it as on every mentor
  control; `muted-foreground` on `card` measures
  5.251:1 / 6.939:1 ("Contrast runs"). When it is `aria-disabled` (another call on the check, no mentor key:
  A71-7) its reason is a `p.disabled-reason` right after `.alert-actions`, still in the Alert's text column,
  and the Button lists it first: `aria-describedby="<reason id> <cost id>"`. The attempt panel draws the done
  form only, without a control (A71-10).
- Levels: `ol.hint-levels` with `role="list"` (WebKit drops the list role when `list-style` is none), four
  `li.hint-level` in ladder order, each `p.hint-level-name` ("Вопрос", "Направление", "Скелет", "Скажи
  прямо"). A level not received shows its name only, `muted-foreground`; a received level is
  `data-received="true"` and `tabindex="-1"` (A71-8 focuses it when its hint arrives), its name in
  `foreground` at weight 500, followed by the hint in `pre.check-row-message`, `space-1` below the name.
  The grader message's `pre` is reused because a hint is data shown verbatim (A71-6) and the "Скелет" level
  holds code whose line breaks and indentation `pre-wrap` keeps; it wraps, so it never overflows and is no
  Tab stop. A locked level looks like any level not received: the lock is on its controls, with its reason
  text, because the copy set "mentor (D3)" has no lock word for an item and colour or an icon alone would
  say it without words.
- Controls: `div.mentor-actions` after the list, one `div.mentor-action` per control: an outline sm Button
  ("Попросить подсказку" or "Следующая подсказка", then "Скелет" and "Скажи прямо" where A71-6 offers
  them), then its visible cost `span.text-sm.muted` "до $N" with an `id`, named in the Button's
  `aria-describedby` (A71-2). Outline, as "Пройти квиз": the check area's one default action is
  "Проверить". Pairs are `space-4` apart and wrap as whole pairs; inside a pair the cost moves under its
  Button when the panel is too narrow (320px). An `aria-disabled` control lists the reason first, then its
  cost: `aria-describedby="<reason id> <cost id>"`. The reason is one `p.disabled-reason` right after
  `.mentor-actions` (R1 row form): "Откроется, когда проверка будет закрыта" on the controls that ask
  "Скелет" or "Скажи прямо" (the others stay enabled), "Дождитесь ответа ментора" or "Ключ API для ментора
  не задан" on all of them. "Разобрать с ментором" is one `.mentor-action` directly in the check row
  panel or the `.quiz`, on a line of its own (`width: fit-content`), its reason a `p.disabled-reason` right
  after it.
- Failed hint: the destructive Alert after the controls and their reason, no live role, its `p.alert-title`
  ("Ментор не ответил", "Бюджет на подсказку исчерпан") with `tabindex="-1"` and an `id`, the A71-8 focus
  target. The review's failed Alert without `.alert-actions`: A71-6 gives the hint no retry in the Alert (the
  controls stay and a press of the same ladder button asks again), so there is no "Повторить" here and the
  secondary retry look does not apply.
- Busy display: `div.mentor-busy` holding `span.spinner` (`aria-hidden`), the words in a `span` ("Ментор
  читает попытку", "Ментор готовит подсказку") and `span.timer` with `role="timer"`, never a live region
  (R2). In the ladder it comes after the controls and their reason and takes focus after a press (A71-6):
  `role="group"`, `tabindex="-1"`, `aria-labelledby` the words' `id`, so it is named by its words and not
  by the ticking time (the Alert's focus form, for the same reason: a name on a `div` without a role is not
  exposed). In the review block it follows the `h4`, which holds focus, so it has no role and no tabindex.
  The time counts from the server's request time (A71-7); the prototypes draw it still, as every timer.

### Quiz panel (F15, from #36)

The Квиз tab panel, `design/flows/quiz.md` "Quiz panel, in DOM order" and "Question block". None of it is in
`apps/web` yet: no RadioGroup, Checkbox, quiz component or `chosen` icon; #36 builds them from this section.
Markup, in DOM order (ids are the page's):

```html
<div class="quiz">
  <div class="quiz-intro">
    <h2 id="quiz-heading" tabindex="-1"><!-- the quiz check title --></h2>
    <div class="sr-only" role="status" aria-live="polite" id="quiz-load-status"></div>
    <div class="quiz-header">
      <p>Нужно 5 из 6</p>
      <p>Попытка 3 из 3</p>
      <span data-tone="warning"><span class="status-icon" data-status="warning" aria-hidden="true"></span>Осталась 1 попытка</span>
    </div>
  </div>
  <!-- result block, error summary: focusable Alerts (below) -->
  <div class="question" data-anchor-block>
    <h3 id="q5-heading">Вопрос 5 из 6</h3>
    <div class="prose" id="q5-prompt"><!-- the prompt Markdown --></div>
    <p class="field-description" id="q5-note">Засчитывается только точный набор ответов</p>
    <p class="field-error" id="q5-error">Выберите хотя бы один вариант</p>
    <div class="choice-group" role="group" aria-labelledby="q5-heading" aria-describedby="q5-prompt q5-note q5-error">
      <label class="choice"><input class="checkbox" type="checkbox" name="q5" id="q5-a"><span class="choice-text">...</span></label>
    </div>
  </div>
  <!-- send error: a focusable destructive Alert -->
  <button class="button" type="button" id="quiz-send">Отправить ответы</button>
</div>
```

- `.quiz`: parts `space-6` apart; `.quiz-intro` keeps the heading and the header `space-2` apart. The button
  keeps its own width.
- `.quiz-header`: muted `text-sm` items, wrapping, as in `.lesson-meta` (the colour, size and wrap; not its
  gap): `space-4` between items in a line, `space-1` between wrapped lines; the warning is the
  check row's `[data-tone="warning"]` element (Check row, above).
- `.question`: `space-3` between its parts; `scroll-margin-top: space-4`. A `single` question uses
  `role="radiogroup"` and `input.radio` with one `name`; a `multiple` one `role="group"` and `input.checkbox`
  plus the note. The note is `.field-description` (the app's `FieldDescription`, `ui/field.tsx:123-136`, the
  same muted `text-sm`); the message is `.field-error`, plain text: never the app's `FieldError`, which renders
  `role="alert"` (`ui/field.tsx:204`), but a plain `p` as sign-in's `FieldErrorText`
  (`components/sign-in-form.tsx:208-215`). `aria-describedby` lists prompt, note, error, only those shown.
- RadioGroup and Checkbox (`.choice-group`, `.choice`, `.radio`, `.checkbox`): native inputs drawn after
  shadcn's `new-york-v4` `ui/radio-group.tsx` and `ui/checkbox.tsx`. Boundary `input` (3.641:1 / 3.606:1 on
  `background`; never `border`, 1.260:1). The app vendors both files and changes exactly the tokens marked
  changed or removed below, nothing else; every token of the upstream class strings is listed.
  - Kept, radio (`RadioGroupItem`): `aspect-square size-4 shrink-0 rounded-full border border-input
    text-primary`; indicator `relative flex items-center justify-center`; `CircleIcon` `absolute top-1/2
    left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary`. So a checked radio is only the `size-2`
    `primary` dot, the border stays `input`. `RadioGroup` keeps `grid gap-3`.
  - Kept, checkbox: `peer size-4 shrink-0 border border-input data-[state=checked]:border-primary
    data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground
    dark:data-[state=checked]:bg-primary`; indicator `grid place-content-center text-current transition-none`.
    `text-primary` is the radio's only: upstream's checkbox has no text colour until checked.
  - checkbox `rounded-[4px]` -> `rounded-sm` (6px, the sm step, "Radius"): an arbitrary 4px is off the scale
    every other control uses.
  - `outline-none` (both) -> removed: the utility beats the global `:focus-visible` outline in `@layer base`
    (`apps/web/app/globals.css:222`), so kept it would leave both controls with no visible focus (WCAG 2.4.7);
    `ui/tabs.tsx:11` records the same removal.
  - `focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50` (both) -> removed; the
    global 2px `ring` outline with a 2px offset ("Focus ring") draws focus, because the 50 % halo halves its
    measured contrast. The border stays `input` on focus.
  - `dark:bg-input/30` (both) -> removed: the control sits on `background` in both themes (a translucent fill
    is not measured).
  - `shadow-xs` (both) -> removed: shadows only on cards, menus and dialogs ("Dark-mode rules", Elevation).
  - `transition-[color,box-shadow]` (radio), `transition-shadow` (checkbox) -> removed: with no halo and no
    shadow nothing is left to animate.
  - `disabled:cursor-not-allowed disabled:opacity-50` (both) -> kept in the file, not reached: options are
    never `disabled`, only `aria-disabled` while sending, which keeps the look and sets `cursor-not-allowed`
    (below); no opacity on text ("Dark-mode rules").
  - `aria-invalid:border-destructive aria-invalid:ring-destructive/20` and `dark:aria-invalid:ring-destructive/40`
    (both) -> kept in the file, not reached: no option carries `aria-invalid`; a question's error is the
    `.field-error` text in the group's `aria-describedby`.
  - Check mark: the app keeps upstream's lucide `CheckIcon className="size-3.5"`. The prototype draws a
    `\2713` glyph at `text-xs` 600 in its place because it loads no icon set; the glyph is not the target.
  `.choice-group` is one class for both groups, `space-3` apart (shadcn's RadioGroup `grid gap-3`; shadcn has
  no checkbox group), a custom name because neither shadcn name covers both. The `label.choice` wraps the
  control and `.choice-text`, so the whole label is the target: `text-base` 400 (option text is content, not a
  control label), at least `--hit-min` (24px) tall, as wide as its text. shadcn's examples pair
  `RadioGroupItem` and `Label` by `id` / `htmlFor`; the app may wrap instead, as the "Choice Card" example does
  with `FieldLabel`, as long as the label text is the target. No hover fill: an `accent` row would put the
  `input` boundary on `muted`, 2.757:1 in dark. `.choice-text` wraps anywhere, so an option of long inline code
  (`.choice-text code`, the `.prose code` look) never widens the page at 320px (WCAG 1.4.10). No letter
  prefixes. Forced colours: the inputs fall back to the native controls (`appearance: auto`). The review drawing
  has no native control: the chosen radio's dot, the "Ваш ответ" dot and the closed lock's body are
  `background: currentColor`, which forced colours paint `Canvas`, and the text backplate behind a glyph cuts
  the top and bottom of the checked checkbox box and of the glyph status rings. So `.choice-indicator` and
  `.status-icon` take `forced-color-adjust: none` and draw in system colours: `CanvasText` strokes, dots and
  glyphs on `Canvas` (the `running` and `running-still` icons keep their open right side). The app checks the same states (chosen
  radio, checked checkbox, review marks, closed lock) under forced colours and does the same for any fill or
  glyph it draws there.
- Locked while sending: `aria-disabled="true"` on every option input and on its group, never `disabled`
  (R1). The look stays (a muted fill fails as above; the busy button holds the reason); only the cursor turns
  `not-allowed`. proto.js cancels the change (click, Space, arrow keys); the app cancels value changes and the
  arrow keys before Radix handles them (`quiz.md` "Sending").
- Prompt code: the `.code-block` composition without its header; the `pre` carries
  `data-scroll-label="Код к вопросу"`, and proto.js gives it `tabindex="0"`, `role="group"` and that
  `aria-label` only while it overflows. The rule and the inset ring: "Scrollable code".
- Result block, error summary, send error: the focusable-message Alert (inventory, Alert), never
  `role="alert"`; the app's `Alert` renders `role="alert"` (`ui/alert.tsx:36`) and is overridden with
  `role="group" tabIndex={-1}` as sign-in does (`components/sign-in-form.tsx:232-238`). Result block: default
  variant, leading icon by outcome (`destructive` cross failed, `success` check mark passed, `closed` lock
  closed, `warning` refused), the title, then one `p.alert-description` per line, the lesson line last, every
  line id in `aria-describedby`. Error summary: destructive variant, the title, then `ul.alert-links`, one link
  per unanswered question to its first option (`href="#<option id>"`). Each link is at least 24px tall, so it
  meets WCAG 2.5.8 by size; the spacing exception is not needed. Send error: destructive variant, the title
  only. Load error: the plain destructive Alert (no role, no tabindex on the Alert), its title an
  `h3.alert-title.text-sm` with `tabindex="-1"` (`#quiz-load-error-title`, focused when "Повторить" fails
  again), with "Повторить" (secondary, sm) described by the title; on the page a visually hidden
  `role="status" aria-live="polite"` container (`#quiz-load-status`) sits right after the panel heading.
- Review (F15.5): the group is replaced by `ul.review-options` (`role="list"`, because `list-style: none`
  drops the list role in Safari). Each `li.review-option` holds the `.choice-indicator` (`aria-hidden`, the
  control's look, `data-checked="true"` for the learner's choice), then `.review-option-body` with
  `.choice-text` and, when a mark applies, `.review-marks`: `span.review-mark` "Ваш ответ" with the `chosen`
  icon, "Верный ответ" with the `success` check mark, `text-sm` in `foreground`, a space between the two
  marks. Not inputs: `readonly` does not apply to radios and checkboxes, `disabled` drops Tab and contrast
  (`quiz.md` "Question block").
- Verdict in the h3: `<h3 id="q5-heading">Вопрос 5 из 6 <span class="verdict"><span class="status-icon"
  data-status="destructive" aria-hidden="true"></span>Неверно</span></h3>` (`success` check mark with
  "Верно"). Inline, not flex, so the space before the verdict is rendered and the heading's name reads "Вопрос
  5 из 6 Неверно" (checked in Chromium's accessibility tree); the heading keeps its size and weight, which
  `.icon-note` would drop.
- Explanation: `div.explanation` holding `h4` "Пояснение" (the base h4: `text-base`, 600) and the rendered
  Markdown in `.prose`, `space-2` apart, after the review list.
- Quiz notice (P9): the idle warning's composition (default Alert, info icon, title, sm "Открыть квиз" in
  `.alert-actions`, no role on the Alert) in a third container of `.notifications`; no new class.

Top bar rules, the same on every page: `<header class="topbar" data-region>` is the banner; the lesson
page may name it with the register's region name "Верхняя панель" (an F6 stop). `.topbar-nav` is the
bar's only `nav` and carries no label; its links never wrap inside it. `.user-email` sits inside the
user menu trigger and is cut with an ellipsis only visually (14rem; 6rem below a 480px viewport, which keeps one row at 375px, where
the bar's gaps tighten to `space-2`): the trigger's accessible name stays the full email and the menu's
`.dropdown-label` shows it in full, wrapping. When the row still does not fit (320px, 400 % zoom) the bar
wraps and `.topbar-end` moves to a second row, right-aligned. Pages add no top bar overrides. The nav's links
follow the release, the same on every page (`ia.md` R6, "Before the catalog ships"): "Главная" before #30,
"Главная" and "Курс" from #30 until #220; from #220 the nav is `ia.md` A218-3 (R6 "Top bar by release").

### Scrollable code

The one statement of the rule for a code block that is wider than its box (WCAG 2.1.1, #136; #70 had it
for the quiz prompt only). The flows point here: `design/flows/lesson-environment.md` "Code blocks that
scroll" and `design/flows/quiz.md` "Question block".

- Applies to every `.code-block` `pre`: in lesson prose (Теория and Задание) with a header holding
  "Копировать"; in a quiz prompt and a quiz explanation without one.
- The block keeps its lines and scrolls sideways inside itself; the page never scrolls sideways.
- Only while `scrollWidth > clientWidth` the `pre` has `tabindex="0"`, `role="group"` and `aria-label` with
  its name; otherwise none of them, because a block that fits has nothing to scroll. A focused `pre` that
  stops overflowing keeps them until it loses focus, so focus never falls to `body`.
- Names (`design/flows/ia.md` page copy): "Блок кода" (Теория, Задание, quiz explanations), "Код к вопросу"
  (quiz prompt). Several blocks may share the name.
- The attributes are not redundant in any browser; do not remove them. The reasons (role, name, Safari):
  `design/flows/lesson-environment.md` "Code blocks that scroll".
- Focus ring: on the `pre`, inset (`outline-offset: calc(var(--focus-offset) * -1)`), so it stays inside
  the block and never crosses the header's bottom border. The `pre`'s corners take the block's inner radius
  where they meet the block's corners and are square under the header ("Radius"). Contrast: on `muted`
  ("Focus ring").
- Over a classic (non-overlay) scrollbar the ring's bottom edge is drawn on top of the track (checked
  2026-11-18 in headless Chromium with classic scrollbars, `components.html` "Composition: prose" and the
  quiz demo, light and dark; WebKit draws overlay scrollbars there). The track is light in both themes,
  because neither the prototype nor the app sets `color-scheme`: Chromium's track `#fafafa`, thumb
  `#c1c1c1`. Bottom edge, inner side: light 4.543:1 on the track, 2.634:1 on the thumb; dark 2.475:1 on the
  track, 1.435:1 on the thumb. Outer side, on the block's border: light 3.764:1 (`#e5e5e5`), dark 4.270:1
  (`#3c3c3c`). So in dark the edge is below 3:1 on the track and the thumb, and every segment keeps 3:1
  against at least one neighbour (the block's border). The other three sides keep 4.349:1 / 5.857:1 on
  `muted`. A dark scrollbar (`color-scheme` on `.dark`) is valmlord/academy#211.
- Decided on load, on showing again and on every width change: in the prototype by proto.js ("Scrollable
  code (proto.js)" below), in the app by FU17 (`design/flows/ia.md`).

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
- **Live containers (R2).** Put each container in the page once, empty, with `data-live-key="<key>"`,
  its `role` and an explicit `aria-live` matching it (`polite` with `role="status"`, `assertive` with
  `role="alert"`), because a modal menu or dialog's `hideOthers` spares only `[aria-live]` nodes (`ia.md`
  R2); content placed in it carries no live role of its own (an Alert there has no `role`). Its content per state comes from `<template data-live-source="<key>"
  data-state="<names>">`; the container is never removed, only its children are replaced. Initial content:
  a container may hold children with `data-state` in the page markup (the nothing-to-run states of the check
  status line, A69-6); on the first render the children whose `data-state` lists the loaded state stay and no
  template is applied, so the text is there before any script runs and is not announced; the other children
  are removed. Every later state takes the container's content from its templates, so such a state also needs
  a template for arrival by a transition. Notifications
  wrapper: `<div class="notifications" data-notifications data-region>` holding `<h2 class="sr-only"
  id="..." data-notifications-heading>Уведомления</h2>` and its containers (F2.1 `page-alert`, F10.1
  `page-status`, and on a lesson with a quiz the quiz notice's, in that order); proto.js gives it
  `role="region"` and `aria-labelledby` only while a container has content.
- **Status-text gap (check status line only).** Every content change of the container
  `data-live-key="check-status"` goes through one queue (`PROTO_STATUS_TEXT_GAP_MS` = 150, the prototype's
  value of `CHECK_STATUS_TEXT_GAP_MS`, `checks.md` "Live regions"): two consecutive texts, the empty one of a
  re-set included, are at least the gap apart, and the gap also counts from the last dialog close, so a text
  due to a dialog button or to a state change that closes a dialog lands after the modal has gone and focus has
  moved (B6, B23). A text due sooner waits; only the newest waiting text is set. A text equal to the one shown
  sets nothing (B11) and drops a text still waiting (a waiting text that came back to the shown one), except a
  `window.proto.setState` to another state while nothing waits, which stands for B9: the container is
  emptied, then the text is set again a gap later.
  Controls follow the state at once; only this text waits. Other containers and pages keep the immediate
  replacement. `window.proto.statusTextGapMs` is the gap's value, for a page script that writes its own
  container after this line (the lesson's history status container, "Attempt row" above, and the quiz load
  status container, "Quiz panel" above).
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
  heading is the landing point), else on the target made `tabindex="-1"`. A target inside a
  `[data-anchor-block]` (the quiz question block) scrolls that block's top into view instead, then the target
  if it is still out of view, so an error summary link shows the question's heading above the focused option;
  focusing selects nothing. Arrival with an anchor hash
  (`catalog#<moduleId>`, e.g. `catalog#introduction`, from the dashboard) does the same once the page has loaded (after `load`, one
  task later, so the browser's own fragment navigation cannot leave focus on `body`); a typed or
  history-restored anchor hash does it on the history move ("History moves" below). No page script is
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
  new history entry (`proto.js:844`; Back returns to the previous state as a history move, "History
  moves" below), shows the state, then
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
  `data-dialog-open="<id>"`, close with `data-dialog-close`; initial focus on `[autofocus]`. On close focus
  returns to the opener while it is rendered; else, when focus was left on nothing, it goes to the first
  rendered match of the dialog's own `data-focus-fallback="<selector>"`. A dialog opened by
  `data-open-in-states` has no opener and sits outside the region it returns to, so it needs that attribute
  (the budget confirmation: the shown "Проверить" variant) for Esc, "Отмена" and a state change that closes
  it.
- **Background focus repair.** A state change the learner did not activate here (`window.proto.setState`, a
  hash, Back or Forward) that leaves focus on nothing (`body`, or a hidden or removed element) moves it to the
  first rendered match of `data-focus-fallback="<selector>"` on the nearest ancestor of the element that had
  focus (the check bar: the shown "Проверить" variant; `.check-row-panel`: its row button; a dialog: its own
  attribute), else the next ancestor's, else `main`. A dialog's opener, while rendered, wins over the
  fallback. Focus a page moved itself in `proto:statechange`, or focus still on a rendered control, stays.
  `data-goto-state` does not repair: its `data-focus` names the target (A69-19, `ia.md` R2).
- **History moves.** Back, Forward and a typed hash are handled on `popstate` and on `hashchange`
  (`proto.js:1058-1086`): Back or Forward between two entries whose query differs as well as the hash (the
  lesson writes `?tab=` with `replaceState`) fires `popstate` and no `hashchange`. A move that fires both is
  handled once, by `popstate`, which comes first: the following `hashchange` is skipped when the hash and
  `history.state.protoEntry` are still the ones `popstate` saw. A `#state-` hash or no hash shows that
  state (focus return below, else the background focus repair); any other hash is an in-page anchor and
  leaves the state as it is.
- **Back focus.** `data-goto-state` remembers, for the history entry it leaves, the control that was
  activated (`proto.js:325-347`, `:843`); Back (or Forward) to that entry focuses it while it is rendered,
  else the background focus repair applies (`proto.js:250-252`). A remembered control inside a dialog is
  not the target: the dialog's initial control is (`[autofocus]`, else its first focusable). A remembered
  control that is no longer in the document (a clone of a live container's template, as "Открыть квиз" in
  the quiz notice, which the next state change replaced) is found again by its `id`, so the template the
  returned-to state renders repeats that `id` (the quiz notice's templates all use `open-quiz`); a control
  without an `id` gets the background focus repair (`proto.js:255-268`). Prototype only: the app pushes
  no history entry per action. Entries are marked in `history.state.protoEntry`; a page that calls
  `history.replaceState` passes `history.state` on to keep it, or Back focus loses the entry.
- **Collapsible.** `data-collapsible aria-expanded aria-controls`, optional `data-label-collapsed` /
  `data-label-expanded` (text goes into `[data-collapsible-label]` or the button).
- **Tooltip.** Wrap in `.tooltip-anchor`; trigger `data-tooltip="<tip id>" aria-describedby="<tip id>"`;
  `<span class="tooltip" role="tooltip" id>`; the anchor may itself be the trigger. Hover and keyboard
  focus (`:focus-visible`) open it, it stays while hovered, Esc closes; leaving the anchor with the pointer
  closes it unless the trigger has keyboard focus (a click's focus does not pin it). A transparent
  `.tooltip::before` bridge covers the `space-2` gap on the tip's side, so the pointer can travel from the
  trigger onto the tip without the tip closing (WCAG 1.4.13; traced on the split handle).
- **R1.** Any click on `[aria-disabled="true"]` is swallowed in the capture phase. For a radio or checkbox
  inside `[aria-disabled="true"]` (itself or its group: the quiz answers while sending) Space and the arrow
  keys are cancelled too, in the capture phase: the click capture alone keeps the checked state (a
  cancelled click restores it), but an arrow key would still move focus to an unchecked radio; with the keys
  cancelled nothing changes and focus stays on the option (Chromium and WebKit, headless; Firefox not run).
- **Scrollable code (proto.js).** `data-scroll-label="<name>"` on a `pre` (every `.code-block` `pre`; the
  rule and the names: "Scrollable code"): while its lines overflow it has `tabindex="0"`, `role="group"` and
  `aria-label="<name>"`, otherwise none of them, decided by a `ResizeObserver` (load, state changes, the
  one-pane switch, the window width); a focused one that stops overflowing keeps them until it loses focus.
  Only elements present at start are observed.
- **Copy.** `data-copy="<selector>"` copies that element's text; on denial the label becomes
  `data-copy-denied`.
- `window.proto` exposes `setState(name)` (a change the learner did not make here: focus repair and the B9
  re-set above), `showPane(name)`, `syncNotifications()`, `setTheme(isDark)`,
  `focusAnchor(id)` (the in-page anchor behaviour above; returns false when the target is missing or
  hidden), and `statusTextGapMs` (a number, the status-text gap in ms above, for a page script that writes a
  container of its own after the check status line).

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

Check row and budget confirmation (#69), light then dark: every status icon colour on `accent`, the check
row trigger's hover surface (icons 3:1), `muted-foreground` on `accent` (the meta items on hover),
`accent-foreground` on `accent` (the warning words on hover), `foreground` on `background` (the warning
words at rest), `foreground` on `muted` (`.error-details`, `.check-row-message`), `muted-foreground` on
`background` (the dialog list on the dialog). No token changed.

```
## :root
--destructive on --accent: oklch(0.55 0.2 27.325) on oklch(0.97 0 0): 4.940:1
--warning on --accent: oklch(0.5 0.11 60) on oklch(0.97 0 0): 5.664:1
--success on --accent: oklch(0.5 0.13 150) on oklch(0.97 0 0): 5.173:1
--info on --accent: oklch(0.5 0.15 255) on oklch(0.97 0 0): 5.569:1
--muted-foreground on --accent: oklch(0.53 0 0) on oklch(0.97 0 0): 4.816:1
--accent-foreground on --accent: oklch(0.205 0 0) on oklch(0.97 0 0): 16.444:1
--foreground on --background: oklch(0.145 0 0) on oklch(1 0 0): 19.798:1
--foreground on --muted: oklch(0.145 0 0) on oklch(0.97 0 0): 18.160:1
--muted-foreground on --background: oklch(0.53 0 0) on oklch(1 0 0): 5.251:1
## .dark
--destructive on --accent: oklch(0.704 0.182 22.216) on oklch(0.269 0 0): 5.307:1
--warning on --accent: oklch(0.8 0.15 80) on oklch(0.269 0 0): 7.960:1
--success on --accent: oklch(0.75 0.17 150) on oklch(0.269 0 0): 7.264:1
--info on --accent: oklch(0.75 0.12 240) on oklch(0.269 0 0): 6.936:1
--muted-foreground on --accent: oklch(0.708 0 0) on oklch(0.269 0 0): 5.857:1
--accent-foreground on --accent: oklch(0.985 0 0) on oklch(0.269 0 0): 14.499:1
--foreground on --background: oklch(0.985 0 0) on oklch(0.145 0 0): 18.968:1
--foreground on --muted: oklch(0.985 0 0) on oklch(0.269 0 0): 14.499:1
--muted-foreground on --background: oklch(0.708 0 0) on oklch(0.145 0 0): 7.663:1
```

Quiz controls and review (#70), light then dark: `primary` on `background` (the checked radio border and
dot, the checked checkbox fill: 3:1 as a control state, WCAG 1.4.11), `primary-foreground` on `primary` (the
check mark), `foreground` on `background` (the `chosen` mark, the verdict and mark words) and on `card` (the
error summary links), `input` on `muted` in dark (why options have no hover fill: below 3:1, a reason, not
a pass). Pairs the validator already measures are not repeated: `input` and `ring` on `background` (the
unchecked boundary and the focus ring), `muted-foreground` on `background` (the quiz header, the exact-set
note), `destructive` on `background` (the per-question error). The locked options keep every value above.
No token changed.

```
## :root
--primary on --background: oklch(0.205 0 0) on oklch(1 0 0): 17.928:1
--primary-foreground on --primary: oklch(0.985 0 0) on oklch(0.205 0 0): 17.176:1
--foreground on --background: oklch(0.145 0 0) on oklch(1 0 0): 19.798:1
--foreground on --card: oklch(0.145 0 0) on oklch(1 0 0): 19.798:1
## .dark
--primary on --background: oklch(0.922 0 0) on oklch(0.145 0 0): 15.717:1
--primary-foreground on --primary: oklch(0.205 0 0) on oklch(0.922 0 0): 14.232:1
--foreground on --background: oklch(0.985 0 0) on oklch(0.145 0 0): 18.968:1
--foreground on --card: oklch(0.985 0 0) on oklch(0.205 0 0): 17.176:1
--input on --muted: oklch(0.52 0 0) on oklch(0.269 0 0): 2.757:1
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
