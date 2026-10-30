# #29 design review, round 3: security

Judge: security. Phase `judge_design`, round 3. Scope: only the Revision 3 changes of
`plans/29-sign-in-dashboard-design.md` (Revision 3 table, 0 V19, 4.2, 4.8, 8 "Sign-in page" and "Sign-out",
10, 13.1 U-guard and U-signout, 13.2 I-dal and I-redact, 13.3 E-out-1, 13.5, 14 steps 1, 8, 35, 37a-37c,
41, 42, 47, 49) and `docs/adr/0008-authentication.md` items 5, 8 and the residuals. Better Auth claims
checked against the unpacked `better-auth@1.7.14` tarball (`.../scratchpad/ba/better-auth-1.7.14/package/dist`).
Also read: my round-2 review, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `docker-compose.yml`.

## S2-1 sign-out revocation: fixed

| Point | What I checked |
|---|---|
| V19 reading | `api/routes/sign-out.mjs:42` `getSignedCookie(sessionToken.name, secret)` from the endpoint's headers; `:44-48` `findSession` in `try/catch` -> `logger.error`; `:49-53` `deleteSession` in `try/catch` -> `logger.error("Failed to delete session from database", e)`; `:54` `deleteSessionCookie(ctx)` unconditionally; then success. Without a cookie both `if (sessionCookieToken)` blocks are skipped and the cookie is still expired. V19 is exact. |
| Positive control | E-out-1 saves `old` from `context.cookies()` (the encoded value the browser sends back) and proves it with a cookie-less request context before sign-out. That catches a wrong cookie name or encoding (`getSignedCookie` would return null and the later null assertion would be vacuous); the row says a failed control is "broken, not green". |
| Null assertion | After sign-out, `get-session` with `old`: `findSession` finds no row -> `deleteSessionCookie`, `ctx.json(null)` (`api/routes/session.mjs:152-163`), 200 JSON `null`. The row is fresh (`now + 7 d`), so the positive control does not refresh it and does not change the token (V14). |
| M-revoke-out goes red only there | Under `signOut({ headers: new Headers({ host }) })`: a direct call has no `ctx.request`, so `validateOrigin` returns at once (`api/middlewares/origin-check.mjs:97-98`) and nothing throws; `:54` still sets the expiring cookies, and the `nextCookies()` after-hook copies them into `cookies()` inside the action (`integrations/next-js.mjs:85-100`, not the router path). So URL, "Вы вышли", cookie absent and `/` -> sign-in all stay green; the row survives and `old` returns a session -> red at the null assertion only. Claim holds. M19-like stays red at `/` (cookie kept). |
| Failure-mode rows, flow | Section 10 now has two rows: revocation regression (guarded by M-revoke-out) and the swallowed DB failure (residual, `sign-out.mjs:49-53`, `:54`); the action's `catch` is narrowed to throws that still reach it (`to-auth-endpoints.mjs:20-24`), U-signout says so. Section 8 "Sign-out" matches. |
| ADR-0008 | Item 5 states the swallowed delete, the cookie still cleared, the row valid until expiry, and the e2e server-side proof; the residual names the 7 d bound, the log line as the only trace and `pnpm seed` as the revocation path (true: `deleteUserSessions`, round-2 F5). |

## S2-2 DAL guard: fixed

| Point | What I checked |
|---|---|
| Per-export allowlist | 4.8 and ADR item 8: entries are `<file>#<export>`; a file entry only for `page.tsx` / `route.ts`; a file entry for a `"use server"` module, a stale file or export, or an empty reason fails. #29's list: sign-in page (file), `app/sign-in/actions.ts#needsSeedHint`, BA route file, `app/(app)/actions.ts#signOutAction`. The generic `(app)/actions.ts` no longer exempts later actions. |
| Unrecognised-export rule | Every `export` of a `route.ts` / `"use server"` module must be a recognised function form, except `export type` / `export interface` and, in `route.ts` only, the seven route segment config names. `export { b }`, `export *`, `export const POST = wrap(...)`, destructuring, `export default x` list the file whatever else it exports. `= wrap(` does not match the `= (async )?(` form. A mis-recognised form can only add a DAL-call requirement, never skip one, so every export is either checked or listed: no vacuous pass. The segment-config exception creates no entry point (Next serves only method-named exports). |
| Per-segment attribution | Each recognised export owns its source up to the next `export`; every non-allowlisted export needs a DAL call in its own segment. The one false-negative layout (a non-exported helper with a DAL call placed after an unguarded export) is stated in 4.8 and as an ADR residual, left to review. Acceptable for a guardrail against honest mistakes (ADR-0005 threat model); the opposite layout fails closed. Export statements are found per line; Biome formatting (CI `lint`) keeps one statement per line, so `x; export { b }` cannot hide. |
| Walk scope | All of `apps/web` minus `node_modules`, `.next`, `e2e`, `test`, `*.test.ts(x)`; walker temp-dir case finds `actions/x.ts`. Two gaps remain, see conditions S3-1 and S3-2 (not blocking). |
| New cases and mutations | M-guard-export (file part only) -> `x.ts#a` case, `b` not listed: red. M-guard-unrec -> both the `a` + `export { b }` case and the `wrap` case: red. M-guard-root -> the `actions/x.ts` walker case: red. Positive controls for the two exceptions (`export const dynamic`, `export type T`) present, so an over-eager rule is also caught. |
| BA route file entry | `export const { GET, POST } = toNextJsHandler(...)` is unrecognised, so it must be a file entry; file entries are allowed for `route.ts`. Exempting the whole file is acceptable: it is the catch-all whose endpoints authenticate themselves. |
| Step order | 37c's real-tree list omits `signOutAction` until step 42 creates the file (a stale entry would fail); `needsSeedHint` exists from step 34. Consistent. |

## Non-blocking from round 2

- **N2-1** fixed: I-dal and I-redact pass `host: 127.0.0.1:3080` with the cookie (13.2), with the reason.
- **N2-2** fixed: design 4.8, 8 and ADR item 8 use the same wording ("one existence query,
  `SELECT 1 FROM users LIMIT 1` through `getDb()`").

## C1-C6 and operations edits: no new gap

- C1: skipping `*.test.ts(x)` removes no entry point (Next routes neither, and app code does not import them);
  `lib/entry-guard.ts` without the quoted literal is asserted not to be an entry point in the real-tree case.
- C2: anchored [G] globs keep the `server-only` import check, and it is proven red once (step 29 probe file).
- C4: `needsSeedHint` reaches the client form only as a prop, so the form never imports the module that
  reaches `server-only`.
- C5: `playwright/.auth` (a session cookie) is in `.gitignore`, `.dockerignore` and now the Biome ignore list (step 35).
- C3, C6: step splits and wording only.
- Operations: the bare `docker compose config` exception is used in step 1 (compose has no `${...}`
  interpolation today, so it prints no secret) and in step 8 with `--quiet` (prints nothing on success, the
  variable name on failure). The `t29` wrapper drops node's stderr and prints a fixed line; still no value
  reaches a log.

## Conditions for the plan (not blocking; the planner writes them into steps 37c and 37a)

- **S3-1. Walker extensions.** `apps/web/tsconfig.json` has `allowJs: true` and Next's default page
  extensions include `js` and `jsx`, so a `page.jsx`, `route.js` or a `"use server"` `.js` / `.mjs` file is
  a live entry point the `.ts`/`.tsx` walk never reads. Read `.js`, `.jsx`, `.mjs`, `.cjs` too (entry kinds
  `page.(tsx|ts|jsx|js)`, `route.(ts|js)`), with a temp-dir case `app/x/page.jsx` without a DAL call ->
  listed.
- **S3-2. Anchor the `e2e` and `test` exclusions** at `apps/web/` (`node_modules`, `.next` may match at any
  depth). A basename match would silently skip a route segment named `test` or `e2e`
  (`app/test/page.tsx` serves `/test`). Temp-dir case: `app/test/page.tsx` without a DAL call -> listed.

Both are one-line walker rules with one case each; they close fail-open paths of the same kind as round 2's
scan roots, but no current or planned file uses them, and the proxy still denies anonymous visitors.

## Verdict

S2-1 and S2-2 are fixed as prescribed, the cited Better Auth lines hold, M-revoke-out and the three new
guard mutations go red exactly where the design says, N2-1 and N2-2 are done, and C1-C6 add no gap.
Conditions S3-1 and S3-2 go into the plan.

PASS
