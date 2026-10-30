# #29 judge_code round 1: security

Reviewed: `git diff main...HEAD` on `feat/29-sign-in-dashboard` (10 commits, 1fd256c..df0910b), read file by
file, against design Revision 3, ADR-0008 (Proposed), the amended ADR-0007 and my design-round reviews.
Better Auth 1.7.14 sources read in the pnpm store where a claim depends on them.

## Verdict: FAIL (1 blocking finding, 1 condition)

### F1 (blocking) [apps/web/components/sign-in-form.tsx:152] the sign-in form submits the password in the URL before hydration

`<form noValidate onSubmit={onSubmit} ...>` has no `method` and no `action`. Server-rendered, it is a plain
`<form novalidate="" class="...">` (checked: `react-dom/server` renders exactly that, no method attribute).
Until React hydrates, the `onSubmit` handler does not exist, so pressing Enter in the password field (the
email field is `autoFocus`, which works natively before hydration; a password manager fills both) makes the
browser submit a GET to the current URL: `/sign-in?email=<email>&password=<password>`. `/sign-in` is a
public path for the proxy, so the page renders and nothing stops it. The password then sits in the address
bar, in the persisted browser history, in the `Referer` of every same-origin subresource request of that
page, and in any request log or Playwright trace that records URLs. The window is short on the built stack
and long under `pnpm dev` (first compile). The design is silent here (section 8 starts from "Submit" after
hydration; the static prototype's `method="get"` is a prototype navigation, not a contract), so this is the
implementation's credential form leaking its secret into a query string, a checklist item ("credentials
leaked in URLs / query strings").

Fix: `method="post"` on the `<form>` (keep `noValidate`; no `action`). Before hydration the browser then
posts the fields in the body to `/sign-in?next=...`, never in the URL (the tester confirms what Next answers
to that POST; expected: the page renders again, no session, nothing logged). Test: U-form asserts the
rendered form's `method` attribute is `post`; mutation "remove `method`" turns it red (watch it go red).
Optionally an e2e with `javaScriptEnabled: false` that submits and asserts the URL holds no `password=`.

### C1 (condition, fix in the same round) [docs/adr/0008-authentication.md, residual "Playwright traces"]

Tester finding (2), my ruling: **accept as an ADR-0008 residual, keep uploading `test-results`, no stripping.**
Because: the CI seed password is `openssl rand -hex 24` per run, the session cookie belongs to that run's
throw-away database, which `docker compose down -v` destroys in `if: always()`; neither value is valid
anywhere after the job; the repo is private and the artifact is kept 7 days and only on failure; the traces
are the main debugging evidence of a failed e2e run. `BETTER_AUTH_SECRET` never reaches a trace (it is not
sent to the browser, and no code path in the diff logs it; the web container's output in `compose.log` is
the redacted L1-L5 lines).
But the ADR text is wrong: it says a failed CI trace "can hold a session cookie" only. It also holds the
run's seed password (the `fill()` action and the body of `POST /api/auth/sign-in/email`), and the HTML
report in `playwright-report` embeds the same traces. Correct the residual to say so, and why it is
accepted (per-run random, ephemeral DB, private repo, 7 days). A residual that understates what leaks
misinforms the person accepting the ADR.

### Tester finding (4), ruling: not an open redirect; no change required

`proxy.ts:24-33` copies the request's own `Host` into the absolute `Location`. The `Host` header is chosen by
the requester itself: a third party cannot make a victim's browser send `Host: evil.example` to
`127.0.0.1:3080`, except by DNS rebinding, and then the victim's browser is already on `evil.example`, so the
redirect stays on the origin the browser is on and moves nobody off-site. There is no shared cache or
reverse proxy in the stack, so no cache poisoning either. Better Auth refuses every non-loopback `Host`
before its router (`allowedHosts`), so the redirected request cannot authenticate anywhere. Malformed
values are handled: `own.host === host.toLowerCase()` rejects userinfo (`a@evil`), default-port
normalisation and anything `URL` rewrites, falling back to `nextUrl`'s origin.
Optional hardening (non-blocking, would also survive a future reverse proxy): honour the `Host` only when it
matches `LOOPBACK_HOST_PATTERNS`, else use `nextUrl`'s origin. When TLS or a proxy arrives (ADR-0008
Consequences), this must be revisited.

## What I checked (and found correct)

- **Secret** (`lib/auth/env.ts`): `BETTER_AUTH_SECRETS` non-empty refused first; missing/empty; the public
  default (string matches BA 1.7.14 `create-context`); `< 32` chars. Messages name the variable and rule;
  only the length is printed, never the value. Called from `getAuth()` (`lib/auth/index.ts:34`), startup
  (`lib/startup.ts:41`, before `migrate`, exit 1 on refusal, rethrows anything else) and the seed
  (`lib/seed-cli.ts:35`). `startup-node.ts` passes both env values. Image checks I3/I3b/I3c assert exit,
  no `MigrationError` (order), no DB password and no refused value in output.
- **Compose/CI/env**: `BETTER_AUTH_SECRET: ${...:?...}` only on `web`; `BETTER_AUTH_SECRETS` never passed;
  `.env.example` has only commented placeholders; no committed value (grepped the diff for assigned
  secrets/passwords). CI: `::add-mask::` before the value is written, secret goes to `.env` only; seed
  password masked before `$GITHUB_ENV`, passed as an env assignment (not argv of a process), the seed log
  greps only `seed: created`. `SEED_*` never in compose's web env, never `NEXT_PUBLIC_*`. turbo
  `passThroughEnv` lists only what each task needs. `.gitignore` / `.dockerignore` / biome exclude
  `playwright/.auth` (`git check-ignore` confirms; nothing under it tracked); CI does not upload it.
- **Redaction L1-L5 in code**: L1 `describeDbError` prints name only if an identifier, code only if
  `^[A-Z0-9_]{1,32}$`, constraint only if snake_case, cause depth 10, never message/params/stack/object.
  L2 `createAuthLog` drops `args`, first line only, withholds on `Failed query` / `params:`; it is the only
  logger handed to BA (server and seed). L3 `SessionReadError` without `cause`. L4 pool error logs
  `describeDbError` only. L5 seed prints exactly one line; the three domain errors print name+message
  (messages contain no values: checked every constructor call), everything else via `describeDbError` plus a
  code-chosen hint; sign-out logs `describeDbError`. Canaries use `test/serialised.ts`
  (`util.inspect` depth 10), not `String()` (the #28 lesson).
- **Better Auth config** (`lib/auth/options.ts`): sign-up disabled, password 8-128, limiter
  `enabled: true`, `disableOriginCheck: false`, `useSecureCookies: false` (loopback HTTP, as ADR item 6),
  loopback-only `allowedHosts` with `protocol: "http"`, telemetry off, `nextCookies()` last, no cookie cache.
  Integration tests drive the real handler: cookie HttpOnly + SameSite=Lax + not Secure, 401 for wrong
  password and unknown email, sign-up refused, 429 on the 4th attempt per address, foreign `Origin` on
  sign-out 403 with the session kept, non-loopback `Host` rejected with no session row. BA's limiter falls
  back to one shared bucket when it finds no IP (`api/rate-limiter/index.mjs:245`), so a missing header does
  not disable it; forged `X-Forwarded-For` stays the stated residual.
- **Route handler**: `toNextJsHandler((request) => getAuth().handler(request))`, lazy, so the limiter and
  origin checks apply on the real route; nothing else wraps it.
- **DAL**: `lib/session.ts` reads with `disableRefresh: true`, `cache()`d; `requireSession` redirects through
  `signInPath`. `(app)/page.tsx` calls `requireSession("/")`; `(app)/layout.tsx` without a session renders
  only `children`, which is the page that redirects, so nothing user-specific renders (coder deviation:
  accepted). Sign-in page uses `getSession()` only to redirect a signed-in visitor to the validated `next`.
- **Guard** (`lib/entry-guard.ts`, `app/entry-points.test.ts`): matches design 4.8 / S2-2 / S3-1 / S3-2:
  per-export allowlist, file entries refused for actions modules, stale/empty entries throw, unrecognised
  export forms flagged, inline directives flagged, `.js/.jsx/.mjs/.cjs` read, `node_modules`/`.next` skipped
  at any depth, `e2e`/`test` only at the root, test files skipped, scanner source free of the literal
  directive. The allowlist is exactly the four design entries with reasons. Known limits (non-blocking,
  reviewer's note): `DAL_CALL` also matches `getAuth().api.getSession(`; metadata route files
  (`sitemap.ts`, `robots.ts`, `icon.tsx`, `opengraph-image.tsx`) and `not-found.tsx` are not entry points to
  the scanner; none exists today.
- **`needsSeedHint`**: one `SELECT 1 FROM users LIMIT 1`, a constant query, returns a boolean only.
- **Safe `next`** (`lib/next-path.ts`): string only (arrays from `searchParams` fall to `/`), length cap 2048,
  leading single `/`, second char not `/` or `\`, no backslash, no C0/DEL control chars. Computed on the
  server; the form only receives the result and navigates with `window.location.assign(next)`.
  `isPublicPath` is exact `/sign-in` or the `/api/auth/` prefix (with slash).
- **Sign-out**: server action, Next's action origin check; `auth.api.signOut({ headers })` with the request
  headers; catch logs redacted and deletes both cookie names (the `__Secure-` delete is harmless over HTTP);
  `redirect` outside the try. The menu item prevents default on click and aux-click: no GET signs out.
  E-out-1 saves the cookie, proves it valid (positive control), signs out through the UI, and asserts
  `get-session` with the saved cookie returns `null`: server-side revocation is proven.
- **Seed**: no password on argv anywhere (README offers only `.env` or `read -rs`; CI uses an env
  assignment); conflict check before `createUser`; repair and re-key both call `deleteUserSessions(userId)`
  (BA `internal-adapter.mjs:518` deletes by `userId`); `updatePassword` targets the credential account with
  `accountId = userId`, which is what `linkAccount` writes; `findUserByEmail` lowercases
  (`internal-adapter.mjs:583`). Pool closed in `finally`. The seed never imports the `server-only` wiring.
- **Imports resolve**: every import in the changed `lib/`, `app/`, `scripts/` and `proxy.ts` files points at a
  file in the diff or an installed package (`better-auth/cookies`, `better-auth/next-js`,
  `better-auth/adapters/drizzle`, `server-only`).

FAIL
