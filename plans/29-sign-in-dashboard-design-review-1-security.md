# #29 design review, round 1: security

Judge: security. Phase `judge_design`. Reviewed `plans/29-sign-in-dashboard-design.md` (all 723 lines),
`plans/29-sign-in-dashboard-research.md`, `docs/adr/0008-authentication.md`, and the context
`docker-compose.yml`, `.gitignore`, `.github/workflows/ci.yml` (e2e job), `apps/web/next.config.ts` and
`apps/web/lib/startup.ts`. I checked the Better Auth claims against the unpacked `better-auth@1.7.14` and
`@better-auth/core@1.7.14` tarballs in the session scratchpad (`.../scratchpad/ba/*/package/dist`).

## What I checked, and what holds

- **V1 (limiter only on the HTTP path).** `api/index.mjs:167-174`: `onRequestRateLimit` runs in the router's
  `onRequest`, before the origin middleware and before the endpoint, so the password is never checked
  for a request over the limit. `rate-limiter/index.mjs:293` returns early only when `enabled` is false.
  Sign-in over the HTTP route is the right choice.
- **V2/V3 defaults.** `create-context.mjs:172` (`enabled ?? isProduction`) and `:211` (`skipOriginCheck`
  is true under test unless `disableOriginCheck` is set). Both are confirmed, so M5 and M6 go red as
  claimed.
- **Origin and CSRF.** `origin-check.mjs`: `validateOrigin` with a `Cookie` header, otherwise Fetch
  Metadata plus a forced origin check when `Sec-Fetch-*` or `Origin` is present. A cross-site
  `fetch`/form to sign-in therefore gets 403 (Origin not trusted). The router accepts only
  `application/json` (`allowedMediaTypes`), so a plain HTML form cannot post either. Login CSRF is
  closed. Sign-out as a server action: `SameSite=Lax` plus Next's action Origin/Host check. Fine.
- **Dynamic base URL / DNS rebinding.** `context/helpers.mjs:116-120` and `utils/url.mjs:200-213`: the
  host comes from `Host` (no `X-Forwarded-Host` without `trustedProxyHeaders`) and is checked by
  `validateProxyHeader` (`url.mjs:50-64`: only `name(:digits)`, IPv4, `[v6]`, localhost). It is matched
  against `allowedHosts` with `wildcardMatch` (separator `/`, so `*` crosses dots). The header regex
  forces the port to be digits, so `127.0.0.1:*` cannot match `127.0.0.1:1.evil.example`. A rebinding
  page's Host (`evil.example:3080`) is refused **before the router runs** (`auth/base.mjs:33`), so no
  credentials are checked. Sound.
- **Cookies.** `useSecureCookies: false` on a loopback-only stack (compose publishes `127.0.0.1:...`
  for both services) is acceptable and recorded in the ADR. `HttpOnly` and `SameSite=Lax` stay.
- **XFF residual.** `@better-auth/core utils/ip.mjs:174-219`: one valid IP gives its own bucket, two or
  more give `null` (a shared bucket). A rotated single value dodges the limit. This is only reachable from
  local processes: cross-site pages cannot send the header without a preflight that Better Auth does not
  answer, and rebinding is refused by host. Accepted as residual, as Stepan decided.
- **Open redirect.** `safeNextPath` is server-side and the client receives only the result. One `/`,
  second character not `/` or `\`, no backslash or control character, 2048 cap. I traced `/.//x`,
  `/%2F%2Fx` and `/%5Cx`: each resolves same-origin. The rule set is sound (test gaps in F7).
- **Secret.** `readAuthSecret` before migrate, compose `:?`, CI-generated per run, no committed value,
  and messages never echo the value (I3b has a mutation for that). Sound, except F4.
- **Logging.** L1-L5 cover `DrizzleQueryError` (message and params), the router's `onError` (both
  branches, `api/index.mjs:196-220`) and pool errors. The custom `logger.log` replaces the console output
  completely (`core env/logger.mjs:57-69`). DAL errors are rethrown without `cause`. Sound, except the
  test defect in F2 and the residual in N2.
- **Seed.** It uses the internal adapter and the BA hash. A different user means conflict. Output is a
  status word or an error name only. Sound, except F5 and F8.
- **Sign-up disabled.** `disableSignUp` is checked inside the endpoint (research `sign-up.mjs:145`), and
  I-signin asserts no new user.

## Findings that block

**F1. I-dal's M14 cannot go red** (design 13.2 I-dal; also 10 "Session row refreshed but cookie not").
Better Auth decides whether to refresh from `expiresAt`, not from `updatedAt`. `api/routes/session.mjs:178`:
`shouldBeUpdated = expiresAt - expiresIn + updateAge <= now`. The test's precondition ("`updated_at`
older than a day") leaves a fresh `expires_at` (now + 7 d), so under M14 (refresh enabled) nothing is
refreshed and the assertion stays green. Fix: set `expires_at` to now + 5 days (any value at most
now + 6 d), then assert it is unchanged after the DAL read. Add a positive control in the same test: the
same row read through `GET /api/auth/get-session` (handler) moves `expires_at` forward. That proves the
precondition really triggers a refresh.

**F2. U-log's "withheld" mutation cannot go red, and the sink assertion is unspecified** (13.1 U-log,
7 L2). The canary `canary-l` sits on the **second** line (`"Failed query: x\nparams: canary-l"`), and L2
prints only the first line. Dropping the withheld rule prints `Failed query: x`, which is canary-free, so
the mutation stays green. Fix:
- Put a canary on the first line (`"Failed query: select canary-l1 ...\nparams: canary-l"`).
- Add a non-Drizzle multi-line case (`"boom\ncanary-l4"`) with the mutation "print the whole message".
- State that the assertion serialises **every argument of every sink and spied `console.*` call** with
  `util.inspect(arg, { depth: 10 })`. `String({ token })` is `[object Object]`, so a naive
  `String(arg).includes` stays green under M9. The same serialisation applies to I-redact's console spy.

**F3. I-host is specified so that it fails on correct code** (13.2 I-host). For a `Host` that is not in
`allowedHosts`, `auth.handler` does not return a response: `resolveRequestContext` throws
`BetterAuthError` before the router (`auth/base.mjs:33`, `helpers.mjs:119`, `url.mjs:213`). So
`const res = await auth.handler(req)` rejects, and "not 2xx, no set-cookie" never gets a response to
check. Fix:
- Assert `await expect(auth.handler(req)).rejects.toThrow(/not in the allowed hosts/)`.
- Assert that no `sessions` row was created.
- Keep M7 (`"*"` added): with it the call resolves with 200, which turns the test red.

The design should also say what the browser sees. Next turns the rejection into a 500, which the form
maps to AC6.

**F4. `BETTER_AUTH_SECRETS` silently replaces the validated secret** (6.1, 6.5, ADR item 9 "refuses in
every environment"). `create-context.mjs:76-85`: `secretsArray = options.secrets ??
parseSecretsEnv(env.BETTER_AUTH_SECRETS)`. When that env var is set, `secret = secretsArray[0].value`,
and BA only warns about length and entropy (`secret-utils.mjs:39-41`). So `BETTER_AUTH_SECRETS=1:x`
signs cookies with `x`, and the design's "refuses a short secret" is false. The root `.env` reaches
`pnpm dev` and the seed whole (`next.config.ts` `process.loadEnvFile`), so a stray line is enough. Fix:
`readAuthSecret` raises `InvalidAuthSecretError` ("BETTER_AUTH_SECRETS is not supported; use
BETTER_AUTH_SECRET") when `BETTER_AUTH_SECRETS` is set and non-empty. Add a U-secret case and a mutation
(ignore the variable -> red). Mention it in ADR-0008 item 9.

**F5. Re-keying the password leaves every existing session valid** (4.5, I-seed (3), ADR item 10). The
seed's "updated" branch is "the only recovery path on a platform without password reset". Someone who
re-keys because the password leaked keeps the attacker's sessions alive for up to 7 days (extended on
use). Better Auth's own reset flow revokes sessions as an option, and OWASP session management says
the same. Fix: the "updated" branch deletes the user's sessions (`internalAdapter.deleteSessions(userId)`)
after the password update. In I-seed (3): a session cookie obtained before the rerun returns `null` from
get-session afterwards. Mutation: skip the delete -> red. Mention it in ADR item 10 and in the README's
re-seed section.

**F6. The enforcing test covers pages only, while server actions and route handlers are public POST
endpoints** (4.8, 13.1 U-guard, ADR item 8 and Consequences). The ADR obliges every protected page,
**server action and route handler** to call the DAL. U-guard scans only `app/**/page.tsx`. A server action
runs on a POST to a page route with its action id, so with any cookie value present the proxy lets it
through, and one that forgets `requireSession` is open. Next's own auth guide says to verify inside each
server function. Fix: U-guard also scans every file under `app/` and `lib/` whose first statement is
`"use server"`, and every `app/**/route.ts`. Each must call `requireSession(` or `getSession(` unless
it is on an explicit allowlist in the test, with a reason per entry. #29's list:
- `app/sign-in/page.tsx`
- `app/sign-in/actions.ts` (`needsSeedHint`: reveals only whether any user exists)
- `app/api/auth/[...all]/route.ts` (Better Auth authenticates itself)
- `app/(app)/actions.ts` (sign-out needs no session)

Strip comments before matching, so a commented-out call does not count. Mutations: a new
`"use server"` fixture without the call -> red; remove an allowlist reason -> red.

**F7. The open-redirect tests miss the exploit spelling of the control-character rule, and one
mutation claim is wrong** (13.1 U-next).
- The rule exists because browsers strip tab and newline from URLs: `/\t/evil.example` becomes
  `//evil.example`, an off-site redirect. The table tests only `\t/a` (rejected by the leading-`/` rule
  anyway) and `/a\nb` (harmless). Add `/\t/evil.example`, `/\n/evil.example` and `/\r/evil.example`,
  and a named mutation **M-ctrl** "drop the control-character rule" -> red at those cases.
  E-in-5 should include `next=%2F%09%2Fevil.example`.
- M2 ("drop the backslash rule -> `/\evil.example` and `/a\b`"): `/\evil.example` stays rejected by the
  second-character rule. Only `/a\b` goes red. Correct the claim, or make M2 drop both backslash checks.

**F8. The rollout prescribes the seed password on the command line** (11.2:
`SEED_EMAIL=... SEED_PASSWORD=... pnpm seed`). That writes Stepan's real password into
`~/.zsh_history`. Fix: README and 11.2 document only the `.env` route (git-ignored, `.gitignore:29`), or
`read -rs SEED_PASSWORD && export SEED_PASSWORD` followed by `pnpm seed`. The inline form is never shown.

## Non-blocking (record in ADR-0008 residuals or fix cheaply)

- **N1.** `GET /api/auth/get-session` and the sign-in response return the session `token` in JSON. The
  core `session.token` field has no `returned: false` (`core db/get-tables.mjs:105`). Any script on the
  origin can read it, so `HttpOnly` does not keep the token from XSS. The design calls get-session from
  client JS on every protected page. Name this in the ADR's residuals instead of implying `HttpOnly`
  protects the token.
- **N2.** `@better-auth/core db/adapter/factory.mjs:391-396`: a DB failure in the adapter's fallback
  join (`findSession` -> user lookup) calls `console.error(error)` directly, bypassing L2. Its params
  are the user id, not a token or hash. Add it to the ADR's residual sentence on logs ("a direct
  `console.error` of the user lookup error, params: user id").
- **N3.** CI: also `echo "::add-mask::$secret"` for the generated `BETTER_AUTH_SECRET`. It is ephemeral,
  but `compose.log`/`docker compose config` outputs are uploaded on failure.
- **N4.** `advanced.disabledPaths` for the Better Auth endpoints #29 does not use (`/update-user`,
  `/change-password`, `/change-email`, `/delete-user`, `/list-sessions`, `/revoke-*`, `/link-social`,
  `/unlink-account`, `/request-password-reset`, `/reset-password`, `/verify-email`,
  `/send-verification-email`, `/sign-in/social`, `/refresh-token`, `/get-access-token`, `/account-info`)
  would shrink the public surface to sign-in, sign-out and get-session. Those endpoints authenticate
  themselves today, so this is optional.
- **N5.** Local Playwright traces record the typed `SEED_PASSWORD` (Stepan's real one when he runs e2e
  locally). `test-results/` and `playwright-report/` are git-ignored. One README line is enough.

## Verdict

Eight blocking findings: three tests that cannot go red or cannot pass as specified (F1, F2, F3), one
bypass of the stated secret invariant (F4), one recovery path that keeps compromised sessions (F5), one
enforcement gap in the deny-by-default model (F6), one missing exploit case (F7) and one secret-handling
instruction (F8). The architecture is sound (HTTP sign-in with limiter and origin checks, host
allowlist, server-side `next`, DAL plus proxy, redaction rules); the fixes are local.

FAIL
