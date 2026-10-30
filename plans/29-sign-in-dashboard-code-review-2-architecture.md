# Issue #29 code review, round 2: architecture

Judge: architecture. Diff: `git diff main...HEAD` (10 commits, 7ae73ee..b8fa8ab), branch `feat/29-sign-in-dashboard`.
Read: my round-1 review, the tester's re-test (R1-R7 of the test report), `git diff df0910b b8fa8ab` (round-1 tip to
current tip, 13 files), every commit message, design 5.3.1, `design/system/README.md` (type scale, controls, dark-mode
rules, component inventory) and `proto.css` (`.button`, `.input`, `.card`), sign-in acceptance notes (states table,
behaviour), `.claude/feedback/coder_mistakes.md`.

## Verdict

FAIL - 2 issues found:

1. [apps/web/components/ui/input.tsx:12] `md:text-sm` sets the input text to 14px from 768px up. README type scale:
   "`text-base` | 1rem / 1.5rem | body text, inputs (16px avoids iOS zoom on focus)"; `proto.css .input` has
   `font-size: var(--text-base)` at every width. The reason in the README applies exactly where `md:` starts: an iPad
   viewport is 768px or wider and Safari zooms on focus of a field under 16px. The coder edited this very class
   string in the fix round and put a "design/system" comment above it, so the file now claims design-system
   conformance while keeping a value the design system names and rejects. Unlisted, so it is an ADR-0006 item 5
   deviation. Fix: drop `md:text-sm` (height is fixed by `h-9`, so nothing else moves). Ruling on the tester's
   question: deviation, owner coder, fix in `bc803b5`.

2. [apps/web/components/ui/button.tsx:8,12-17] The variants the app uses still carry `radix-nova` state styles that
   the design system replaces, and none is listed:
   - Busy "Войти" (`aria-disabled="true"`): the app styles nothing for `aria-disabled`, so the busy button stays the
     solid `primary` button. `proto.css:184-187` paints it `muted` / `muted-foreground` / `border` ("Contrast is
     kept: no opacity"), README dark-mode rules: "Disabled uses `muted` / `muted-foreground`". The prototype's
     `#state-submitting` and the app's AC3 state therefore look different. (The tester compared default states only.)
   - `default` hover `hover:bg-primary/80` is a translucent fill under the label; `proto.css:160` uses the opaque
     `color-mix(in oklab, var(--primary) 90%, var(--background))`, the mix the README contrast runs measured
     ("primary hover (90 % with `background`) light and dark"). README: "No opacity on text or on any container with
     text". Used by "Войти" and the notifications "Войти снова" (`size="sm"`).
   - `ghost` dark hover `dark:hover:bg-muted/50` (the user-menu trigger) is translucent; `proto.css:168` uses
     `accent` in both themes.
   - `disabled:opacity-50` in the base class (and `disabled:opacity-50` in `ui/input.tsx`) contradicts the same
     no-opacity rule; the app never sets `disabled` (the design forbids it), so this is latent, but it is the same
     line to touch.
   Fix: add `aria-disabled:bg-muted aria-disabled:text-muted-foreground aria-disabled:border-border
   aria-disabled:cursor-not-allowed` (hover included) to the base, replace `hover:bg-primary/80` with the 90 % mix,
   ghost hover `hover:bg-accent hover:text-accent-foreground` in both themes, and drop the `opacity` on disabled in
   favour of the muted pair; or list each item as a deviation with a DESIGN issue. Natural home `bc803b5`. A unit
   or e2e check that the busy "Войти" has the muted background would make it able to fail; at minimum the tester
   compares `#state-submitting` with the app's busy state in both themes.

Who: coder (the round-1 lesson already says "for every vendored shadcn component, compare its sizes, borders,
shadows and fills with README and proto.css, and fix or list each difference"; the fix covered only the three items
my review named). I also missed items 1-2 in round 1 (my list named sizes, card and input fill only); lesson
appended to `judge_mistakes.md`. Lesson appended to `coder_mistakes.md`.

## Ruling: the 2px prototype overshoot

Not a dev deviation. README is the contract ("Controls: height 2.25rem, small 2rem"); the app renders 36/36/32. The
prototype renders 38/38/34 because `proto.css` gives `.button` / `.input` a `min-height` and also padding plus line
height plus border that exceed it (`.input`: 6+6+24+2 = 38 > 36). That is a DESIGN note for `proto.css` (use
`height` or padding that fits the control height), not a #29 change. Recommend the orchestrator files it as a small
DESIGN issue or adds it to #79; it does not need a "Design deviations" row.

## What I checked, and found right

**Round-1 findings.**
1. Drizzle comment: `test/integration/db.ts` no longer has the clause; `git grep "two copies|do not mix|copies of
   drizzle"` over `apps` and `packages` at HEAD: no match. The removal landed in `9b0b4f7`, where the file is born.
2. `.env.example`: the 6.2 block (`# The seed creates the only user...`, `# Put them here, never on a command line.`,
   `# SEED_EMAIL=learner@example.com`, `# SEED_PASSWORD=`, plus `# SEED_NAME=` with its comment) is in `c8d7493`, the
   seed commit. Every env name read under `apps/web` and `packages/db` at HEAD (`BETTER_AUTH_SECRET`,
   `BETTER_AUTH_SECRETS`, `DATABASE_URL`, `E2E_BASE_URL`, `SEED_EMAIL`, `SEED_PASSWORD`, `SEED_NAME`; `NEXT_RUNTIME`
   is Next's own) is in the file.
3. Sizes, card, input fill: `Input` `h-9`, `Button` default `h-9`, `sm` `h-8`; the `h-9` className patch on "Войти"
   removed; `Card` `border` plus the `--shadow-sm` mixes (foreground 8 % light, background 60 % dark, tokens only);
   `Input` `bg-background` with `dark:bg-input/30` gone. Matches `proto.css` and the tester's computed styles (R4).
   The new comments in `card.tsx` / `input.tsx` / `button.tsx` state true reasons, apart from the font size in
   issue 1.

**`SIGNED_OUT_PATH`.** Now exported from `lib/next-path.ts` next to `SIGN_IN_PATH` (declared above it); `user-menu.tsx`
and `sign-out.test.ts` import it from there, `sign-out.ts` too; `lib/sign-out.ts` no longer exports it, so the client
graph of `user-menu` is route helpers plus copy. Value unchanged; it lands in `5549954` with the dashboard.

**Other fix-round code (security round-1).** `method="post"` on the form with a why-comment; the `renderToString`
unit test asserts `method` and no `action` and was watched red (tester R3); E-in-8 with `javaScriptEnabled: false`
asserts the navigation is a POST to the same path and the URL never holds the password. The four focus assertions
moved to `waitFor` with a comment saying why. No new `any`, `as`, Russian text or bare catch in the fix diff.

**`auth generate` summary (design 5.3.1).** The run exists (`scratchpad/fix1/authgen/auth.ts`, `auth-schema.ts`). I
compared its claims with the generated file and `packages/db/src/schema.ts`: generated `timestamp` without time zone
vs ours `withTimezone: true`; generated `sessions_userId_idx` / `accounts_userId_idx` vs our snake-case names;
`$onUpdate` on generated `updatedAt`, `defaultNow()` on ours with the schema comment "Better Auth sets `updatedAt`
itself"; `accounts_provider_account_unique` only in ours; generated `relations` import. The summary is accurate and
ready for the PR body.

**Commits.** 10 commits, subjects 52-71 characters; every body ends `Refs #29`; author Stepan Korshukov;
`grep -iE 'claude|co-authored|generated|fixup|squash|amend!'` over all messages hits only body prose ("generated,
masked password", "app-generated text ids", "generated by drizzle-kit"), no attribution, no fixup residue. Each fix
sits in its natural commit (`9b0b4f7` comment, `c8d7493` env lines, `bc803b5` form, ui and E-in-8, `5549954`
`SIGNED_OUT_PATH`, `b8fa8ab` ADR). Per-commit build/lint/typecheck/test: the coder's `percommit2.out` per the tester
(R5); I did not re-run it.

**Regression scan.** `git diff df0910b b8fa8ab`: 13 files, all accounted for above (plus the ADR-0008 residual-risk
text, which is the security judge's point). No change outside the findings' scope; the tester's e2e runs are green
three times on the rebuilt image.

## For the PR body (unchanged from round 1, plus)

- The 5.3.1 summary as written.
- If Stepan keeps any item of issue 2 instead of the fix, a "Design deviations" row with its DESIGN issue for each.

FAIL
