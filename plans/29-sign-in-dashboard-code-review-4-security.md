# #29 judge_code round 4: security

Branch `feat/29-sign-in-dashboard`, HEAD `2317f66`, main checkout. Scope: `git diff 320bde9 HEAD`. Settled points
from rounds 1-3 (`plans/29-sign-in-dashboard-code-review-3-security.md`) are not re-opened.

## What I checked

1. Scope of the rewrite. `git diff --stat 320bde9 HEAD`: only `apps/web/components/ui/button.tsx` and
   `apps/web/components/sign-in-form.test.tsx`, +7 / -10. `git range-diff main 320bde9 HEAD`: commits 1-7 identical
   SHAs, 9 and 10 `=` (rebased only), commit 8 (`3b18271` -> `72679fc`) differs by exactly these two hunks. No other
   file in the branch changed, so no auth, DAL, redirect, seed, secret or compose code moved.
2. `button.tsx`. The comment is rewritten (four lines of design rationale about Tailwind variant order and CSS
   specificity) and ` aria-disabled:hover:bg-muted aria-disabled:hover:text-muted-foreground` is removed from the base
   class string of `buttonVariants`. Presentation only: no prop, no `type`, no handler, no `disabled` or
   `aria-*` attribute changed. The busy sign-in button's double-submit guard is the `inFlight` ref in
   `sign-in-form.tsx`, which this diff does not touch (settled in round 3 point 3); hover colour classes never took
   part in it.
3. `sign-in-form.test.tsx`. The `toHaveClass` assertion drops the two hover class names and the comment is reworded.
   The security-relevant assertions of that test are untouched: `aria-busy="true"`, no `disabled` attribute, click on
   the busy button, `fetchImpl` called once.
4. Risky constructs. Grepped every added line of the diff for `dangerously`, `href`, `script`, `http(s)://`,
   `password`, `secret`, `token`, `url(`: no hits (grep exit 1). No new external resource, no credential literal.
5. Tester evidence. `plans/29-sign-in-dashboard-test-report.md`, "Re-test after judge_code round 3": unit 152/0,
   build without secrets ok, e2e 18/18 (twice), mutation restored with `cmp OK` and a clean
   `git diff --quiet HEAD -- apps packages docs .env.example`. Consistent with the diff above.

## Verdict

No security effect: the change is a comment and two redundant CSS utility classes plus the matching test assertion.

PASS
