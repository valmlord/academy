# #30 judge_design round 3: security

Judge: security. Date: 2026-10-30. Scope (Stepan's limits for round 3): block only on regressions from the
round-2 fixes and on items of my own round-2 list left undone. Input: `plans/30-catalog-lesson-page-design.md`
(revision 3: the "Revision 3" table, 4.Q11, 4.Q12, V12, V15, V19, 13.1 U-env / U-env-sites / U-read, 13.5,
13.6, 13.7, 14 step 1), `docs/adr/0009-course-content-in-the-web-app.md` item 7, my round-2 review, the
rehearsals in `<scratchpad>/r3/` (`tw/`, `y5.cjs`), `turbo.json`, `docker-compose.yml`, `apps/web/vitest.config.ts`,
`node_modules/.pnpm/yaml@2.9.1/.../dist`. The root `.env` was not read, listed by content, or hashed: the only
command that touched it by name was `git check-ignore -v .env` (path rule only).

**Verdict: PASS.** S6 and S7 are fixed as required, N7-N9 are adopted, and I found no security regression from
the revision-3 changes. One new non-blocking note (N10), not a regression.

## S6: M-env-turbo no longer loads the real `.env`

| Required in round 2 | Revision 3 | Checked |
|---|---|---|
| M-env-turbo never runs a config-loading process in the main checkout | 13.7 row "Never in this checkout"; 13.6 rule: no opt-out-disabling mutation while a real entry point can run here, `turbo.json` here is never mutated | Read 13.6 and 13.7. The rule names all three disabling mutations (passthrough entry, flag check, call site) and the entry points (`next`, `playwright`, `tsx scripts/seed.ts`, any `pnpm`/`turbo` task) |
| Static check or a checkout without the real `.env`, with `--force` | Both, in a scratch workspace with no `.env` (V19) | Inspected `<scratchpad>/r3/tw`: no `.env` (`ls -a`), own `git init`, `turbo.json` = repository's plus `globalPassThroughEnv`, stub scripts print `flag=<value or UNSET>`, `dry.json` passthrough = `["ACADEMY_SKIP_ROOT_ENV=6b86...4b4b"]`. Re-ran it myself in a copy (`<scratchpad>/sec3/tw`, caches removed), with the repository's turbo 2.11.10 and `--force`: with the entry build/typecheck/seed/test:e2e print `flag=1` and the dry run prints the sha256-of-`1` entry; entry removed, build and seed print `flag=UNSET` and the dry run prints `null`. Matches V12/V19 |
| Step 1 shows propagation before the first real run | [D] (13.5): dry run, executes no task, exact expected output, first in every [U]/[B]/[S]; step 1 order (a)-(e) puts [D] before any build, typecheck, seed or e2e | Step 1 (a)-(b) run only `vitest run lib/root-env.test.ts`, which does not load `next.config.ts` (`vitest.config.ts` has no `root`/`envDir`, imports no config); the dry run is a turbo read of the task graph; `.env` is git-ignored (`.gitignore:29`), so turbo's default inputs do not hash it |
| 13.6 rule extended | Done, broader than asked | as above |
| (also) cache replay of the skip line | [B] uses `--force` | 13.5 [B] |

## S7: `toJS()` logging pinned

- Re-ran `<scratchpad>/r3/y5.cjs` (canary only): default and `"warn"` log 1 item after `toJS()` containing
  `CANARY-KEY`, `"error"` and `"silent"` log 0; `parseDocument` alone logs 0 at every level. V15 is now correct.
- Grepped every logging site in yaml 2.9.1 `dist`: `log.warn` is called only at `public-api.js:71` (`parse()`,
  not used) and `nodes/addPairToJSMap.js:57` (`toJS()`); `log.debug` has no caller outside `util.js`'s re-export;
  `log.js` gates both on `logLevel`. So `"error"` covers every level-gated path (see N10 for the one ungated).
- U-read gains the `? [CANARY-KEY]` case under all channel spies, asserting no capture contains the canary
  whatever the read result; M-yaml-level (`logLevel` removed) -> red at that assertion, reasoned in 13.7 from the
  rehearsal (`parseYamlFile` reaches `toJS()` because the input has no error or warning). M-yaml-silent still
  pins the other side. Listed in step 8's mutation set.
- 4.Q12 and ADR-0009 item 7 now state that the guarantee depends on `logLevel: "error"` and both reasons.

## N7-N9

- N7: U-env-sites walks `apps/`, `packages/`, `services/` with the skip list, refuses `dotenv` imports, positive
  control `packages/db/src/vocabulary.ts`, M-env-walk. Reads only source extensions, so no `.env*` is opened by
  the walk. Adopted.
- N8: `.env.example` entries are comments only; [D] carries `grep -cE '^(ACADEMY_SKIP_ROOT_ENV|COURSE_ROOT)='`
  = 0. Adopted.
- N9: value echoed only at <= 8 characters, else `<n characters>`; U-env 40-character case; M-env-echo. Adopted.

## Regressions looked for, none found

- [D] in the main checkout prints only the `passthrough` array (one hash of the value `1`); the full dry-run JSON
  is piped, not saved, and its other env hashes are of t30 values, not Stepan's.
- The new mutations M-env-echo and M-env-walk run under the same vitest-only rule and `cmp` restore as
  M-env-flag/M-env-site; neither can make an entry point load the file.
- The C2 change (`--user root`, revision 3 O8) runs inside the role's own `academy-web:local`-derived image
  with `--network none` in the rehearsal and hashes files only; it prints hashes, not contents. Not a widening.
- The errno mapping (`unreadable (<code>)`) puts only the code in messages, never `error.message`.

## Non-blocking

- N10 (new, not a regression; I missed it in round 2). yaml's `parse/parser.js:178-179` prints every lexical
  token with `console.log` when `process.env.LOG_TOKENS` is set, regardless of `logLevel`: that would write the
  whole `lesson.yaml`, `checks[].run` included, to the web log. Today it cannot reach the web process: the
  compose `web.environment` is an explicit list and turbo strict mode drops undeclared variables. ADR-0009 item 7
  ("Nothing is logged by the parser only because `logLevel` is `"error"`") is slightly too strong; one sentence
  naming `LOG_TOKENS` as a debug switch never set for the web, or a U-read case with `LOG_TOKENS=1` documenting
  it, would close it.

PASS
