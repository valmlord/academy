# Issue #29 code review, round 3: architecture

Judge: architecture. Branch `feat/29-sign-in-dashboard`, HEAD `320bde9`. Read: my round-2 review, the tester's
"Re-test after judge_code round 2" (including the M1-M3 mutation table), `git diff b8fa8ab..HEAD` (12 files),
`git range-diff main..b8fa8ab main..HEAD`, every commit message, `design/system/proto.css` (`.button`, `.input`,
`.card`, `.alert`, `.dropdown-*`, `.spinner`, the reduced-motion block), `design/system/README.md` (type scale,
component inventory), `.claude/feedback/coder_mistakes.md`, `.claude/feedback/judge_mistakes.md`.

## Verdict

FAIL - 1 issue found:

1. [apps/web/components/ui/button.tsx:8-10] The why-comment over the class string makes two claims that the code
   and the prototype contradict, the same defect the round-1 and round-2 lessons name ("a design/system comment
   above a class list that still contradicts it"):
   - "when it is also aria-busy the progress cursor wins, as in proto.css." In proto.css it does not win:
     `.button[aria-disabled="true"]:hover` (specificity 0,3,0) outranks `.button[aria-busy="true"]` (0,2,0), so the
     prototype computes `not-allowed` under the pointer (tester, difference 3). The app computes `progress`
     (e2e AC3 `toHaveCSS("cursor", "progress")`, watched red by M2). The app is right (ruling below); the comment
     tells the next reader the prototype agrees, and someone checking the prototype in a browser sees the
     opposite.
   - "keeps the muted fill on hover too, so it is listed again under hover" says the hover classes are what keep
     the fill muted. They are not: in the built CSS `aria-disabled:bg-muted` already wins on hover (same
     specificity as `hover:bg-[...]`, later in Tailwind's variant order); M3 removed both `aria-disabled:hover:*`
     classes and e2e AC3, which hovers the busy button and compares computed colours, stayed green.
   Fix (one commit, `3b18271`, no behaviour change): drop `aria-disabled:hover:bg-muted
   aria-disabled:hover:text-muted-foreground` from `button.tsx` and the two matching names from the
   `toHaveClass` call in `sign-in-form.test.tsx:105-110` (ruling below), and rewrite the comment's last sentence
   to what is true, e.g. "aria-disabled (R1: the busy sign-in button) stays muted on hover because its variant
   sorts after hover. With aria-busy the cursor is progress: proto.css declares that, but its
   `[aria-disabled]:hover` rule outranks it, a prototype bug (DESIGN note)." Keeping the hover classes is
   acceptable only if the comment then says they are a hedge against variant order, not what makes it work.

Who: coder. Lesson appended to `.claude/feedback/coder_mistakes.md`.

## Rulings

**Difference 3, busy cursor: prototype bug, DESIGN note; the app is right.** The busy "Войти" is always
`aria-disabled` as well (AC3), so a `[aria-busy] { cursor: progress }` rule that loses to `[aria-disabled]:hover`
never applies where a cursor is visible: the rule exists only for this state and its order (declared after) shows
the intent. Fix for `proto.css`: `.button[aria-busy="true"], .button[aria-busy="true"]:hover { cursor: progress; }`.
No "Design deviations" row; the orchestrator adds it to the DESIGN note with the 2px overshoot (#79 or a small
DESIGN issue).

**Difference 4, dropdown label 36px vs 32px: prototype bug, DESIGN note; the app is right.** `.dropdown-label`
(`proto.css:300`) sets `font-size: var(--text-sm)` without a line height, so it inherits the body's
`--text-base-line` (24px). Every other text-sm rule in proto.css pairs the size with `--text-sm-line`
(`.label`, `.dropdown-item`, `.card-description`, `.disabled-reason`, `.icon-note`, `.text-sm` utility), and the
README type scale defines `text-sm` as 0.875rem / 1.25rem. The app's `text-sm` (20px line, 32px row) is the
contract. Fix for `proto.css`: add `line-height: var(--text-sm-line)` to `.dropdown-label`.

**Redundant `aria-disabled:hover:*` classes: drop them**, together with their unit assertions. They change no
computed value (M3), and the unit assertion on them pins class names only, a test that restates the
implementation. The e2e hover check stays and is the real guard: if a Tailwind upgrade ever reordered the
variants so hover won, it goes red (M1 shows it catches a non-muted busy button). The two `aria-disabled:bg-muted`
/ `aria-disabled:text-muted-foreground` names in the unit test may stay as a cheap pre-e2e check.

**Differences 1 and 2** (2px overshoot, icon glyphs, including the spinner glyph under reduced motion: proto
draws a static dotted ring, the app stops the lucide loader): settled, not re-opened.

## What I checked, and found right

**Round-2 item 1.** `ui/input.tsx` has no `md:text-sm`; `text-base` at every width, the comment gives the iOS
reason. `disabled:opacity-50` and `dark:disabled:bg-input/80` gone, disabled is `bg-muted` /
`text-muted-foreground`. Tester: inputs compute 16px at 1280 and 375, both themes.

**Round-2 item 2, every sub-item.** `button.tsx` base: `aria-disabled:bg-muted text-muted-foreground
border-border cursor-not-allowed`, no `opacity` anywhere; `default` hover is
`color-mix(in_oklab,var(--primary)_90%,var(--background))` (= `proto.css:160`); `ghost` hover `bg-accent
text-accent-foreground` with no `dark:` override (= `:168`); `secondary` / `outline` hover `accent` (= `:162`,
`:166`); `destructive` solid with the 90 % foreground mix (= `:175-177`); `link` `foreground` plus underline and
`px-0` via `data-variant`, which `Button` sets. Sizes are exactly README's three (default `h-9 px-4`, sm `h-8
px-3`, icon `size-9`); radius `rounded-md`, gap `gap-2`, transition 150ms on background only with
`motion-reduce:transition-none` (proto's reduced-motion block zeroes durations). e2e AC3 compares the busy
button's computed background and colour with probe-resolved `--muted` / `--muted-foreground` before and while
hovered, with no colour literal, and was watched red on the round-2 `button.tsx` (M1).

**The rest of the walk.** `card.tsx` spacing 6, border plus shadow mixes, no `overflow-hidden` (the comment's
reason, focus ring clipping, is true); `alert.tsx` = `.alert` (px-4 py-3, gap-x-3 gap-y-1, icon 1.25rem spanning 3
rows with `mt-0.5`, title 600); `dropdown-menu.tsx` content and items = `.dropdown-menu` / `.dropdown-item`
(min-w-56, rounded-md, border, shadow-md mixes, items `px-2 py-1.5 rounded-sm items-start`, disabled muted, no
animation); `empty.tsx`, `field.tsx`, `label.tsx` lose every `opacity` for `muted-foreground`; `spinner.tsx` 800ms
and stopped under reduced motion. Removed API (`AlertAction`, `CardAction`, `Card size`, Button `xs` / `lg` /
`icon-*`, menu item `variant`): `grep` over `apps/web/{app,components,lib,e2e}` finds no consumer (the only
`variant="destructive"` is an `Alert`, which keeps it). `sign-in-form.tsx` drops the overrides the new Card
defaults now cover; no visual change per the tester's card comparison. No Russian text in comments, no `any` /
`as` / bare catch in the diff.

**Commit rewrite.** `git range-diff`: commits 1-7 identical SHAs, 9-10 `=` (same patch, new SHAs `d1c8399`,
`320bde9`), only `3b18271` changed, and its diff is exactly the 12 files plus one body paragraph describing the
alignment: the fix sits in its natural commit (the one that adds the sign-in page and vendors the components).
10 commits, subjects 52-71 characters, every body ends `Refs #29`, author and committer Stepan Korshukov;
`grep -iE 'claude|co-authored|generated|fixup|squash|amend!|assistant'` over all messages hits only the three
known body phrases ("generated, masked password", "app-generated text ids", "generated by drizzle-kit"). Working
tree: only the three feedback files and untracked `plans/`.

**Regression.** Tester's run at `320bde9`: lint, typecheck (`--force`, 5/5), unit 152/0, build without secrets,
e2e 18/0 twice on the rebuilt image, computed styles equal to the prototype in both themes at 1280 and 375 apart
from differences 1-4. Per-commit build/test from the coder's `fix3/percommit2.out` (10 current SHAs), not re-run by
me.

FAIL
