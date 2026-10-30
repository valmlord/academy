# #29 judge_code round 3: security

Scope: `git diff b8fa8ab..HEAD`, read in full (12 files, all under `apps/web`; the diff outside
`apps/web` is empty). Settled points from rounds 1-2 are not reopened.

## What I checked

1. Sign-in form transport. `components/sign-in-form.tsx:154` is still
   `<form method="post" noValidate onSubmit={onSubmit}>`. The only change in this file is the Card /
   CardHeader / CardContent class names (lines 143-148 of the diff); the form, its fields and the
   submit handler are untouched.
2. Field types and autocomplete. Email input `type="email"` + `autoComplete="username"` (162-163),
   password input `type="password"` + `autoComplete="current-password"` (180-181), unchanged.
   `ui/input.tsx` still forwards `type` and `...props`; only its class string and comment changed.
3. Busy state and double submit. The busy button (194-197) is still `type="submit"` with
   `aria-disabled` / `aria-busy`, no `disabled`. The double-submit guard is the `inFlight` ref in
   `onSubmit` (`if (inFlight.current) return;`, line 121), unchanged by this diff. The `button.tsx`
   rewrite drops `disabled:pointer-events-none` and adds `aria-disabled:*` colour and cursor classes;
   that is presentation only: the busy button never had `disabled`, and nothing in the guard relied on
   pointer-events. The unit test still clicks the busy button and asserts `fetchImpl` was called once;
   the e2e AC3 test still presses Enter and force-clicks the busy button after the new paint checks.
4. New risky constructs. Grepped every added line of the diff for `dangerouslySetInnerHTML`, `href`,
   `target=`, `<script`, `http(s)://`, `password`, `secret`, `token`, `onClick`, `disabled=`: no hits.
   The new class strings use only `color-mix` over theme tokens; no `url(...)`, font or other external
   resource. The `link` variant changed classes only, it adds no `href`.
5. Removed exports. `AlertAction`, `CardAction`, the dropdown item `variant` and the extra button sizes
   are removed; grep over `app`, `components`, `lib` finds no remaining use (the only
   `variant="destructive"` hit is `Alert` in `components/notifications.tsx:48`, whose variant block is
   unchanged).
6. Test fixtures. The unit test adds only a `toHaveClass` assertion; the e2e helper `busyPaint` creates
   a probe `div` with `var(--muted)` styles, reads computed colours and removes it. No credential,
   secret or token literal added.
7. Spinner: still `role="status"` / `aria-label` by default and overridden in the form as before; the
   change is the animation timing and `motion-reduce`. No security relevance.

Tester evidence (`plans/29-sign-in-dashboard-test-report.md`, "Re-test after judge_code round 2"):
all green, e2e 18/18 twice, isolation intact; consistent with the above.

## Verdict

No security regression in round 3.

PASS
