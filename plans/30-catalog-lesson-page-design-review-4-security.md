# #30 judge_design round 4: security

Judge: security. Date: 2026-10-31. Scope (Stepan's short fourth round): the Revision 4 delta only; block only on
security regressions it introduces. Input: the "Revision 4" table of `plans/30-catalog-lesson-page-design.md`,
4.Q12 (lines 330-345), 13.1 U-env-sites / U-fs / U-read / U-text (lines 867-873), 13.4 T-err part 2 (lines
918-928), ADR-0009 item 7 (lines 60-68), my round-3 review, `docker-compose.yml`, `turbo.json`,
`node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/parser.js`. The root `.env` was not read, listed by
content or hashed.

**Verdict: PASS.** No regression found. N10 is closed by the stated-reason route I offered in round 3.

## What I checked

| Delta item | Check | Result |
|---|---|---|
| N10 `LOG_TOKENS` (4.Q12, ADR-0009 item 7) | `parser.js:178-179` really is `if (node_process.env.LOG_TOKENS) console.log('|', cst.prettyToken(source))`, ungated by `logLevel`. ADR item 7 no longer claims the parser logs nothing because of `logLevel`; it names the ungated path and its condition. Verified the stated reason: compose `web.environment` is an explicit list (`DATABASE_URL`, `BETTER_AUTH_SECRET`), no `env_file`; `turbo.json` has no `envMode: loose` (default strict) and no task's `passThroughEnv` or `globalPassThroughEnv` admits `LOG_TOKENS`; `grep` finds `LOG_TOKENS` in none of `docker-compose.yml`, `turbo.json`, `package.json`, `apps/web/package.json`, `.github/` | Closed. Wording is now accurate, the other two `logLevel` pins (M-yaml-level, M-yaml-silent) are unchanged |
| U-env-sites roots | Previously `apps/`, `packages/`, `services/` all walked. Now `apps/`, `packages/` required (missing one fails), `services/` optional. `services/` exists locally but `git ls-files services` = 0, so CI has nothing there to scan; locally it is still walked when present. Coverage of tracked code is unchanged, and a typo in a required root now fails instead of passing vacuously, so the guard got stricter. Still source extensions only, so the walk opens no `.env*`; per-root positive controls (`apps/web/next.config.ts`, `packages/db/src/vocabulary.ts`); rejection of `git ls-files` is correct from a security angle (an untracked file with a direct loader call would slip through locally) | No regression; slight strengthening |
| mode-`000` `afterEach` restore | Applies to the recorded fixture path in the temp dir only (U-fs, U-read, U-text); restore to `0o644` on test fixture content, which is not secret. U-fs still fails (not skips) when run as root. No repo file or real `.env` is chmodded | No regression |
| `pgrep` narrowed to `'turbo run dev\|next dev'` | Read-only PID listing used for a before/after `comm -13` diff; the only kill is `lsof -tiTCP:3232 -sTCP:LISTEN \| xargs kill`, port-scoped and unchanged, and Stepan's pre-existing PIDs are recorded and never touched. Narrowing cannot widen what is killed | No regression |

## Non-blocking

- N11 (note, not a regression). The N10 stated reason covers the compose web and turbo-spawned processes. Under
  `pnpm dev` the web process also receives what `loadRootEnv` loads from Stepan's own root `.env` (when the opt-out
  is unset) and Next's own `apps/web/.env*` loading, which turbo strict mode does not filter. So `LOG_TOKENS` would
  reach `pnpm dev` only if Stepan himself put it in his own `.env`: an owner opt-in on his own machine, with the
  log going to his own terminal, not a leak. If the ADR is touched again, "never set for the web" could read
  "never set by the project for the web". No action required for this round.

PASS
