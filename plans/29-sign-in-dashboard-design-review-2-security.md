# #29 design review, round 2: security

Judge: security. Phase `judge_design`, round 2. Reviewed `plans/29-sign-in-dashboard-design.md` Revision 2
(all 979 lines), `docs/adr/0008-authentication.md`, the ADR-0007 diff, `.gitignore`, and my round-1 review.
Better Auth claims checked against the unpacked `better-auth@1.7.14` tarball in the session scratchpad
(`.../scratchpad/ba/better-auth-1.7.14/package/dist`).

## Round-1 findings

| # | Status | What I checked |
|---|---|---|
| F1 I-dal M14 | fixed | `api/routes/session.mjs:180`: `shouldBeUpdated = expiresAt - expiresIn*1e3 + updateAge*1e3 <= now`; with 7 d / 1 d, `expires_at = now + 5 d` is inside the window. `:170` returns before refresh when `disableRefresh`. `integrations/next-js.mjs:48` returns for `_flag === "router"` and `:50-54` returns from the `catch` when `headers()` throws outside a request, so neither path sets "skip": (d) goes red under M14, (e) is a working positive control. V14, V15 hold. |
| F2 U-log | fixed | Canary `canary-l1` now on line 1 of (a), so M-first goes red; (b) `boom\ncanary-l4` catches M-lines; (c) and `{ token }` catch M9; `serialised` = `util.inspect(arg, { depth: 10 })` over every argument of every sink and spied `console.*` call (13, I-redact uses it too). |
| F3 I-host | fixed | `utils/url.mjs:214` throws `Host "..." is not in the allowed hosts list` with no fallback; `auth/base.mjs:33` calls `resolveRequestContext` before the router. The regex in I-host matches that string. Under M7 `"*"` matches `evil.example:3080` (no `/`), the origin becomes trusted, credentials are valid: the call resolves with 200 and a row, so both assertions go red. |
| F4 `BETTER_AUTH_SECRETS` | fixed | `context/create-context.mjs:70-76`: `secretsArray` from env replaces the secret, warnings only (`secret-utils.mjs:39-41`); `parseSecretsEnv("")` returns null (`:14`), so accepting `""` and refusing anything else (including `"   "`) is consistent with what BA would use. Refusal is first in `readAuthSecret`, in startup, `getAuth()` and the seed; U-secret M-secrets and I3c (canary absent) cover it. ADR item 9 says it. |
| F5 re-key sessions | fixed | `db/internal-adapter.mjs:518` `deleteUserSessions(userId)` deletes by `userId` (no secondary storage here); `deleteSessions` takes tokens (`:538`), so the design picked the right call. Both the `updated` and `repaired` branches revoke; crash between write and revoke converges on rerun. I-seed (3) asserts `c1` returns `null` and its row is gone; M-revoke goes red there. |
| F6 guard scope | partly fixed, see S2-2 | Pages, `route.ts`, `"use server"` modules, inline directives, comment stripping, stale/empty-reason entries: all specified with mutations. The allowlist is still per file, and the count is per recognised export. |
| F7 control chars | fixed | `/\t/`, `/\n/`, `/\r/` cases with M-ctrl; M2 / M2b claims now correct (second-character rule still rejects `/\evil.example` under M2). E-in-5 `%2F%09%2Fevil.example` decodes to `/\t/evil.example`; under M-ctrl `location.assign` would strip the tab and leave the origin, so "lands on `/`" goes red. |
| F8 password on command line | fixed | Section 11 step 3: `.env` in an editor (`.gitignore:27` `.env`) or zsh `read -rs "SEED_PASSWORD?..."`; `.env.example` says "never on a command line"; no inline form remains. CI uses a generated, masked password. |

Non-blocking N1-N5 from round 1: N1, N2, N4 (as residual), N5 are in ADR-0008 Consequences; N3 `::add-mask::`
is in 6.4 for the secret and the password.

## New points checked in Revision 2 (no finding)

- **"Выйти" link intercepted to a server action.** No GET signs out: the `href` target
  `/sign-in?signed-out=1` only renders a note, and for a signed-in visitor redirects to `/` (decision 10), so
  prefetch, middle click or "open in new tab" change no state. The action is POST-only and covered by Next's
  action Origin/Host check; `SameSite=Lax` keeps the cookie off cross-site POSTs. Under DNS rebinding the
  Host/Origin pair would match, but the browser sends no `127.0.0.1` cookie to `evil.example`, and the DAL's
  direct `auth.api.getSession` resolves its base URL from the same `Host` and refuses it
  (`api/to-auth-endpoints.mjs:15-25` -> `url.mjs:214`). Sound.
- **`t29` wrapper.** It refuses `-p`/`-f` and a foreign project; generated secret and seed password are
  appended to the role scratchpad without printing; the `config --format json` output (which contains the
  interpolated secret) is piped into `node` that prints only `name`. No secret reaches a log. Sound.
- **`server-only`.** Only two wiring files carry it; tests and the seed cannot import them (V18, [G] grep).
  The marker does not weaken anything: the DAL logic it guards is server-only by construction anyway.
- **Seed revocation**: see F5.
- **`needsSeedHint`** as the one public action: reveals only "any user exists", an accepted AC5 disclosure.

## Findings that block

**S2-1. Server-side revocation on sign-out is not guarded by any test, and the failure-mode row is wrong**
(design 4.15, 8 "Sign-out", 10 row "Sign-out DB failure leaves user signed in", 13.3 E-out-1; ADR-0008 item 5).

- `api/routes/sign-out.mjs:42-54`: `signOut` reads the signed cookie from the headers it is given, deletes the
  row inside its own `try/catch` (a DB failure is only `logger.error(...)`), then always calls
  `deleteSessionCookie`. So the action's "on throw: delete cookies" path is not where a DB failure lands; BA
  already resolves with success and the row survives until expiry.
- Consequence for the tests: E-out-1 asserts the URL, "Вы вышли", that `/` goes to sign-in and that the
  cookie is absent. All of that is produced by the cookie deletion alone. Mutation `signOut({ headers: new
  Headers({ host }) })` (no cookie passed to BA) or any regression that stops BA from seeing the token keeps
  E-out-1, U-signout (fake) and I-origin (handler path, not the action) green while the session row, and so a
  copied token, stays valid for 7 days. The security property of sign-out is revocation, and no row can go
  red for it.
- Fix:
  1. E-out-1 reads the `better-auth.session_token` cookie value before clicking "Выйти"; after the redirect,
     `request.get("/api/auth/get-session", { headers: { cookie: "better-auth.session_token=<old>" } })`
     returns JSON `null`. Named mutation **M-revoke-out**: the action passes headers without the cookie to
     `auth.api.signOut` -> red at that assertion. (An integration test of `createSignOut` with the real
     `auth.api.signOut` and a DB check is an acceptable alternative.)
  2. Section 10 and ADR-0008 item 5: state that BA swallows a DB failure on sign-out
     (`sign-out.mjs:49-53`), the cookie is still deleted, and the row lives until expiry; add it to the
     ADR's residuals. The action's own `catch` covers the throws that remain (for example base URL
     resolution, `to-auth-endpoints.mjs:20-24`).

**S2-2. The DAL guard exempts whole files and counts only recognised exports** (4.8 Enforcement, 13.1
U-guard, ADR-0008 item 8 and Consequences).

- The allowlist is keyed by file. `app/(app)/actions.ts` is the generic actions module of the `(app)` route
  group, the natural home for #30 / #35 actions (start a lesson, continue). A protected action added there
  later passes U-guard without any DAL call, which makes ADR-0008's "fails when an entry point neither calls
  the DAL nor sits on an explicit allowlist" false: the entry point itself is not on the list, its file is.
  Same for `app/sign-in/actions.ts`.
- The fail-closed fallback "no export recognised" triggers only when **zero** exports are recognised. A
  `"use server"` module with one recognised, guarded `export async function a` plus `export { b }` (or a
  `route.ts` with `export async function GET` plus `export const POST = wrap(...)`) needs one DAL call and
  passes while `b` / `POST` is open.
- Scan roots are `app/`, `lib/`, `components/`; a `"use server"` module anywhere else in `apps/web` (for
  example `apps/web/actions/`) is never scanned.
- Fix: allowlist entries name the export (`app/(app)/actions.ts#signOutAction`,
  `app/sign-in/actions.ts#needsSeedHint`; the page and the BA route keep file entries), and an allowlisted
  file that exports any other name is checked like any other file; every `export` statement of a
  `"use server"` module or `route.ts` must match a recognised function form, otherwise the file is listed
  ("unrecognised export"), whatever else it exports; the real-tree scan walks all of `apps/web` except
  `node_modules`, `.next`, `e2e`, `test`. Mutations: a fixture `"use server"` module on the allowlist with a
  second unguarded export -> red; a guarded function plus `export { b }` -> red.

This one partly comes from my own round-1 prescription (a per-file list); Revision 2's per-export counting
makes the per-export allowlist cheap, which is the new reason to tighten it.

## Non-blocking

- **N2-1.** I-dal and I-redact call the reader with plain headers. For a dynamic base URL a direct
  `auth.api.*` call resolves the host from `headers.get("host")` (`url.mjs:138-152`); without it the call
  fails with a 500 `APIError` (`to-auth-endpoints.mjs:20-24`). The test headers must carry `host:
  127.0.0.1:3080`. It fails loudly, not silently, so it is a note for the coder.
- **N2-2.** ADR-0008 item 8 says `needsSeedHint` runs `SELECT 1 FROM users LIMIT 1`; the design names no
  query. Keep one wording.

## Verdict

Seven of eight round-1 findings are fixed as prescribed (F6 only partly) and the cited Better Auth lines hold. Two blocking
points remain: sign-out's server-side revocation has no test that can go red and the design misstates where
a DB failure lands (S2-1), and the deny-by-default guard still exempts whole files and partly recognised
modules (S2-2). Both fixes are local to 4.8, 10, 13.1, 13.3 and ADR-0008.

FAIL
