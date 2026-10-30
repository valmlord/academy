# #29 design review, round 3: architecture

Reviewer: judge-architecture. Phase: judge_design, round 3 (approved by Stepan). Scope: the Revision 3 changes
only. Inputs read: `plans/29-sign-in-dashboard-design.md` (Revision 3 table; sections 0 V19, 4.8, 8, 10, 13.2
I-dal/I-redact, 13.3, 13.4, 13.5, 14, 15, 16), `docs/adr/0008-authentication.md` items 5, 8 and the residuals,
my round-2 review, `...-review-2-security.md`, `.claude/feedback/architect_mistakes.md`, `judge_mistakes.md`;
repo: `biome.json`, `apps/web/lib/copy.ts`; Better Auth `dist/api/routes/sign-out.mjs` in the unpacked
`better-auth@1.7.14` tarball (session scratchpad `ba/`). Commands run from the repository root are quoted below.

## Conditions C1-C6

| # | Status | What I checked |
|---|---|---|
| C1 | done | 4.8 "What is scanned": the walk skips `*.test.ts` / `*.test.tsx` and the dirs `node_modules`, `.next`, `e2e`, `test`; `lib/entry-guard.ts` matches the directive by a pattern without the quoted literal. U-guard's real-tree case asserts that `lib/entry-guard.ts` and the test files are not among the scanned entry points, so a coder slip (see N3-1) goes red, not silent. The temp-dir walker case includes `lib/y.test.ts` with a directive. |
| C2 | done | Rehearsed: `rg -l connectHint apps/web --glob 'apps/web/lib/startup*.ts'` finds `apps/web/lib/startup.ts` (exit 0); [G] as written in 14 prints nothing today (exit 1), and a positive control `rg -l 'set -' apps/web --glob 'apps/web/scripts/**'` finds `check-image-migrations.sh`, so the anchored globs do select. [G] is proven red once in step 12 with a scratch probe test. Step 29's command run on the current tree lists exactly `apps/web/lib/courses.ts`, as the step expects until 47. Step 47 updates `lib/copy.ts`'s header (line 1 today still names `lib/courses.ts`). |
| C3 | done | 13a (~50) / 13b (~35); 37a (~60) / 37b (~50) / 37c (~55). Count: 1-12 (12) + 13a, 13b (2) + 14-36 (23) + 37a-c (3) + 38-50 (13) = 53; the tier line says 53. "50 steps" survives only in the Revision 2 history row, which is history. 13a leaves [I] red ("no test files") until 13b inside commit 5, allowed by the C6 wording. Each 37x step's mutations are runnable at that step (M-guard-unrec in 37a, M-guard-export in 37b, M-guard-root and M13 in 37c). |
| C4 | done | Section 8: `<SignInForm next={next} signedOut={signedOut} needsSeedHint={needsSeedHint} />`, with the reason (the form never imports the `server-only` module). |
| C5 | done | Step 35 adds `!**/playwright/.auth` to `biome.json` (same folder-exclusion form as the existing `!**/playwright-report`) and checks `pnpm lint` with `learner.json` present; 3.3 lists it. |
| C6 | done | Section 14: "Every commit leaves all of them green ... a step inside a commit may leave a check red that a later step of the same commit turns green". |

## Security fixes S2-1 / S2-2 against the architecture

**S2-1.** V19 matches the source: `sign-out.mjs` reads the signed cookie, wraps `findSession` and
`deleteSession` each in a `try/catch` that only logs, then calls `deleteSessionCookie(ctx)` unconditionally;
with no cookie both DB calls are skipped. So M-revoke-out (`new Headers({ host })`) keeps URL, note and cookie
assertions green and only the `old` -> JSON `null` assertion goes red, as 13.3 claims. E-out-1 runs in a fresh
context with its own UI sign-in, so revoking its session does not touch the shared storage-state session the
other specs use (no order dependence). The positive control (saved token accepted before sign-out) makes the
negative assertion meaningful. Section 8, row 10 ("Sign-out DB delete fails" as a documented residual, "Sign-out
call itself throws" on U-signout), and ADR-0008 item 5 plus its residual all say the same thing. Step 49 is the
only step that changes; it stays in commit 9 after the action (42) and the dashboard (47).

**S2-2.** Per-segment attribution fits the scanner: segments are bounded by `export` statements, which the
scanner already finds for the recognised/unrecognised rule, so it needs no parser. The stated limit (a
non-exported helper between two exports belongs to the earlier one) is honest and fails toward review, not
toward an open endpoint for the export that owns the call. The "every export recognised" rule makes the
check fail closed for wrappers (`export const POST = wrap(...)`); the Better Auth route keeps a file entry,
which 4.8 limits to `page.tsx` / `route.ts`, and a file entry for a `"use server"` module is an error.
Step order: at 37c the real tree holds `app/page.tsx` (guarded since 36), the BA `route.ts` (file entry) and
`app/sign-in/actions.ts` (`#needsSeedHint`), so "at least one page, one route, one `"use server"` module" and
the empty-list assertion hold; `app/(app)/actions.ts#signOutAction` is withheld until step 42 creates the
file, so no stale entry fails in between. Step 47 replaces `app/page.tsx` by `app/(app)/page.tsx` with
`requireSession("/")`, keeping the page count at one. No order regression against my round-2 walk: the new
work is confined to steps 37a-c, 42 and 49, and none adds a runtime requirement.

## Operations notes (13.5, 16)

- The bare `docker compose config` exception is read-only and limited to steps 1 and 8; step 1 unsets
  `DB_PORT`, `WEB_IMAGE_TAG`, `COMPOSE_PROJECT_NAME`, and needs no secret yet (compose requires it from step 8).
- Wrapper: `2>/dev/null` sits on `node` only, after the pipe; without `pipefail` the pipeline status is
  node's, and a failed `config` gives node empty input -> `JSON.parse` throws -> exit 1 -> `t29 REFUSED:
  compose config failed`. Compose's own message stays on stderr. Correct in bash and zsh.
- 16.6 / 16.7: no `up --build` of project `academy` from this checkout until merge (the main checkout is on
  this branch, so a rebuild would apply the unmerged `0001_auth` to `academy_db-data`), and `0001_auth`
  frozen after step 3. Both follow from the 42P07 re-landing note in 11 and are consistent with 13.5.

## Non-blocking notes for the coder (not conditions)

- **N3-1.** C1 also covers string literals in `lib/entry-guard.ts`'s messages: an error text such as
  `inline "use server"` would make the scanner's own file an entry point. The real-tree assertion catches it;
  write the messages without the quoted directive.
- **N3-2.** The "every export recognised" rule also applies to allowlisted exports, so `needsSeedHint` and
  `signOutAction` must be written as `export async function ...` (or `export const x = async (`). Any other
  form lists the file even though the export is allowlisted.
- **N3-3.** 16.3 still says "before judge round 2"; it is done, so it can be dropped in the planner phase.

PASS
