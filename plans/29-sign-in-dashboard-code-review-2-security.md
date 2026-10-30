# #29 judge_code round 2: security

Reviewed: `git diff main...HEAD` on `feat/29-sign-in-dashboard` (HEAD b8fa8ab, 10 commits after the autosquash),
against my round-1 review (`plans/29-sign-in-dashboard-code-review-1-security.md`) and the tester's
"Re-test after judge_code round 1" in `plans/29-sign-in-dashboard-test-report.md`. Points settled in round 1
(redaction L1-L5, Better Auth config, DAL guard, safe `next`, seed, proxy `Host`) are not re-opened: nothing in
the round-1 fixes touches them.

## Verdict: PASS

### F1 fixed as prescribed
- `apps/web/components/sign-in-form.tsx:154`: `<form method="post" noValidate onSubmit={onSubmit} ...>`, with no
  `action`. That matches the prescription: before hydration the browser POSTs the fields in the body to the
  current `/sign-in?next=...` URL and never puts them in the query string. The why-comment at 152-153 is accurate.
- Unit guard `components/sign-in-form.test.tsx:226-229`: parses the `renderToString` output, asserts
  `method === "post"` and that there is no `action`. The tester saw it go red under "remove method"
  (`expected null to be 'post'`).
- E2E guard `e2e/sign-in.spec.ts:191-213` ("before hydration", `javaScriptEnabled: false`): presses Enter in the
  password field, asserts the navigation request is `POST`, the request path and query equal
  `SIGN_IN_WITH_LESSON` exactly (so neither field is in the URL), the sign-in heading renders again and
  `page.url()` does not contain the password. The tester saw it go red at line 208 (`Received: "GET"`) on a
  rebuilt image without `method`.
- What the server does with that POST (tester, live stack): 200 `text/html`, no `Set-Cookie`, no `Location`, no
  canary in the body or in the web and db logs, with and without `Origin`. So the POST neither signs in nor logs
  the credentials, as round 1 expected.

### C1 fixed as prescribed
`docs/adr/0008-authentication.md:160-167` now says that a failed CI run's traces hold the seed password (the
`fill()` value and the `POST /api/auth/sign-in/email` body) and session cookies, and that `playwright-report`
embeds the same traces. It gives the reasons the residual is accepted and says `BETTER_AUTH_SECRET` never
reaches a trace. I checked every factual claim in that paragraph against `.github/workflows/ci.yml`:
`openssl rand -hex 24` plus `::add-mask::` (170-171), upload only `if: failure()` (183), artifact `e2e-report`
with both `playwright-report` and `test-results` (186-189), `retention-days: 7` (192), and
`docker compose down -v` under `if: always()` (194-195). All of them hold.

### The other judges' round-1 fixes: no security regression
- `.env.example`: the added lines are comments only. `BETTER_AUTH_SECRET=` and `SEED_PASSWORD=` are empty
  commented placeholders, and the suggested command appends a generated secret without printing it. It
  restates that `BETTER_AUTH_SECRETS` is refused and that the seed values never go on a command line. No value
  is committed.
- `SIGNED_OUT_PATH` move (`lib/next-path.ts:13`): it is a code constant (`/sign-in?signed-out=1`) with no user
  input, used by `lib/sign-out.ts:31` (the redirect stays outside the try) and as the `href` of the menu item in
  `components/user-menu.tsx:49-53`. That item still cancels both click and aux-click and runs the server action,
  so no GET signs out. A direct GET of the URL only shows the signed-out note.
- shadcn styling (`components/ui/*`): I grepped for `dangerouslySetInnerHTML`, `href`/`target` and type
  overrides and found none. `Input` passes `type` through, and the sign-in fields keep `type="email"` /
  `type="password"` and `autoComplete="username"` / `"current-password"`.
- Focus `waitFor` changes: test-only, with no change to what the tests assert about credentials or sessions.
- Commit rewrite: I re-grepped the whole diff, without the lockfile, for committed secrets, `NEXT_PUBLIC_`, new
  `console.*` sinks and `dangerouslySetInnerHTML`. The only `console.*` lines are the round-1 redacted sinks.
  The literal passwords are test fixtures (`"1234567"` for the length-refusal case, `"not-a-real-hash"`).

PASS
