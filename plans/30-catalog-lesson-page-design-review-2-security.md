# #30 judge_design round 2: security

Judge: security. Date: 2026-10-30. Input: `plans/30-catalog-lesson-page-design.md` (revision 2),
`docs/adr/0009-course-content-in-the-web-app.md` (Proposed, revised), my round-1 review
(`...-review-1-security.md`), `apps/web` at `7706f71`, `turbo.json`, `.dockerignore`, `.github/workflows/ci.yml`,
`node_modules/.pnpm/yaml@2.9.1`, `node_modules/.pnpm/shadcn@4.23.0`. The root `.env` was not read: no command of
this review opened, listed or hashed it.

**Verdict: FAIL, 2 findings (both blocking, both small).** S1-S5 are fixed as designed. The two failures are
new, introduced by revision 2: one mutation (M-env-turbo) can only go red by making `next build` load Stepan's
real root `.env`, and the YAML fix rests on a claim ("`parseDocument` never logs") that is false for `toJS()`, so
the one option that keeps a source key out of the log is unpinned by any test.

## S1-S5: what I checked

| Round-1 finding | Checked | Result |
|---|---|---|
| S1 root `.env` read | `git grep -nE "loadEnvFile\|dotenv\|env-file\|envDir\|loadEnv\("` over the repo (outside lockfile, plans, docs, `.claude`): exactly the three sites `next.config.ts:16`, `playwright.config.ts:9`, `scripts/seed.ts:16`, all covered by 4.Q11 and U-env-sites; the other hits are inside `course/**/starter` and `checks` (Python `--env-file`, not run by any role). Vitest config sets no `root`/`envDir`, `apps/web` holds no `.env*` (`ls -a`). Root scripts `build`/`typecheck`/`test`/`test:e2e`/`seed`/`dev` all go through turbo, so `globalPassThroughEnv` is the right place; direct invocations inherit the exported flag. `typecheck` = `next typegen && tsc` loads the config: covered (V9, 4.Q11). shadcn 4.23.0 `dist`: no `dotenvx` import at all; it only checks for (and would write) `apps/web/.env.local` when a registry item has `envVars` (badge, item, tabs, breadcrumb, progress have none); `components.json` `registries: {}`. `.dockerignore` keeps `**/.env` and `**/.env.*`, so the build stage's `loadRootEnv` returns `"absent"`. `t30-env.sh` exports `COMPOSE_ENV_FILES=/dev/null` and the wrapper refuses without it; before/after uses `stat -f '%i %z %m'`; `cut .env` removed (V8 reads `.env.example`). Helper semantics: `"1"` skips without touching the file, unset/`""` loads, anything else throws; the log line has no path | fixed, see **S6** for one mutation |
| S2 YAML warnings in the log | Ran yaml 2.9.1 myself (`<scratchpad>/sec2/y2.cjs`, canary strings only): with `parseDocument(src, { lineCounter, prettyErrors: false, logLevel: "error" })` an unresolved tag gives 1 warning at line 2, a second document 1 error at line 2, a broken flow sequence 1 error at line 3, no issue message contains the canary, nothing logged on `emitWarning`/`console.*`. With `"silent"` the second document gives 0 errors: the architect's reason for `"error"` holds. zod schema paths: `schema.ts` has no `z.record`, objects strip unknown keys, so `issue.path` holds only schema field names and indexes, never a content-derived key | fixed, see **S7** for `toJS()` |
| S3 leak scan misses `/` and not-found | 7.2 visits: one not-found URL (status 404, body scanned) from commit 8; `/` with a positive control from commit 9; M-leak-dash passes `leak={tree.modules[0].lessons[0].lesson}` through `FocusOnMount`, a client component rendered next to the Card heading (6.3). Before commit 9 `/` renders only the top bar's `courseId`, which the scanned catalog and lesson pages also render | fixed |
| S4 M-leak-rsc cannot build | `leak?: unknown` declared on `LessonTabs`, so `next build`'s type check passes; the parsed `Lesson` is plain JSON (no `z.date`, transform or map in `schema.ts`), so it serialises. Fragment `ACADEMY_CHECKS_DIR/verify_routing.py`: the maximal `[\p{L}\p{N} ,.:/_-]` run of `python3 -I "$ACADEMY_CHECKS_DIR/verify_routing.py"` is exactly that (cut at `$` and `"`), and neither JSON nor Next's inline-flight escaping (`& < > U+2028/9`) changes a character of it, in the HTML push or the raw `text/x-component` body. RSC capture count asserted (>= 1). Tester records "build passed" | fixed |
| S5 ADR silent on `lesson.yaml` | ADR-0009 Consequences "Accepted residual: grader metadata in the image": what is in `/app/course`, why stripping breaks parsing, kept off the browser by item 3 and the item-10 guards | fixed |
| N1-N6 | fs name allowlist (5.1, U-fs, M-fs-names); U-files literal list and C4 name scan; layout reads after `session !== null`; `FragmentFocus` try/catch + `getElementById`; `disallowedElements: ["img"]` + M-img; `.env.example` for key names | all adopted |
| `turbo.json` edit by the architect | `git diff turbo.json` is empty and `git status` lists no `turbo.json` change (content equals `7706f71`; only the mtime moved) | restored |

## New in revision 2: what I checked

- **`lib/root-env.ts` as attack surface.** The flag can only make a process skip the file, never load another
  path; the path is fixed by each call site, not by the environment. A hostile value throws (fail closed). In the
  image the root `.env` never exists (`.dockerignore`), and the standalone server does not execute
  `next.config.ts` at runtime. CI sets no flag and writes `.env` from `.env.example` plus a generated secret,
  as today. Sound.
- **Turbo passthrough.** `globalPassThroughEnv` passes the variable without hashing its value; the flag carries
  no secret. Sound, except how its absence is tested (S6).
- **YAML.** See S2 row and S7.
- **Per-export leak scan scope.** E-leak covers catalog, every visible lesson (both tabs), one client navigation
  with an RSC body, not-found, `/`; capture is HTML/JS/JSON/text/`text/x-component`, every read awaited, failures
  named. Sound.
- **Vendored components.** Five radix-nova files from the default registry only (`registries: {}`), pinned
  `shadcn@4.23.0`, no `envVars`, no `dangerouslySetInnerHTML` in the 8.4 tables; deleting the focus utilities is
  an accessibility, not a security, concern. Sound.

## Findings

### S6 (blocking). M-env-turbo can only go red by loading Stepan's real root `.env`

13.7: "M-env-turbo (remove the entry from `globalPassThroughEnv`) leaves the flag out of the `next build`
process, so `grep -c` of the skip line in [B] prints 0". Running that build in the main checkout means
`next.config.ts` calls `loadRootEnv` without the flag, finds the root `.env` and loads it: `[B]` unsets
`BETTER_AUTH_SECRET` and `DATABASE_URL` (`env -u`), so Stepan's real secret and database URL enter the coder's
build, which is exactly what S1 forbade. And if turbo instead serves the build from cache (the task hash may not
change, 4.Q11 says passthrough variables do not change hashes), it replays the logged skip line and the mutation
stays green. Either outcome is wrong. The same ordering problem applies, milder, to step 1: the design proves that
the flag reaches each process only "at run time by the skip line" (V12), i.e. after a process that did not get it
has already read the file.

Required:
- M-env-turbo is checked without running any process that loads the config in the main checkout: either
  statically (`pnpm exec turbo run build --filter=@academy/web --dry=json` lists `ACADEMY_SKIP_ROOT_ENV` in the
  passthrough env the build task receives; mutation: removing the entry makes that check red), or in a checkout
  whose root `.env` is a canary file (a scratch worktree under `.claude/worktrees/` or a local clone), with
  `--force` so the cache cannot replay the skip line.
- Step 1 runs the same dry-run check (and states its expected output) before the first real `pnpm build`,
  `pnpm typecheck`, `pnpm seed` or `pnpm test:e2e`, so propagation is shown before a process could read the file.
- 13.6 rule "no role runs ... before step 1 is complete" gains "and never with the `globalPassThroughEnv` entry
  removed".

Who: Architect.

### S7 (blocking). `doc.toJS()` logs a YAML key unless `logLevel` is `"error"`; no test pins it

V15 states "`parseDocument` never logs (all channels spied, 5 inputs)", and 4.Q12 justifies `logLevel: "error"`
only by the multi-document error. Both miss `toJS()`: `dist/nodes/addPairToJSMap.js:57` calls
`log.warn(ctx.doc.options.logLevel, "Keys with collection values will be stringified ...: <key as JSON>")`, and
`dist/log.js:9-15` emits it through `process.emitWarning` at `"warn"` (the default) or `"debug"`. Reproduced
(`<scratchpad>/sec2/y.cjs`): `id: x\n? [CANARY-KEY]\n: v\n` and `? {a: CANARY-MAPKEY}` give 0 errors and
0 warnings, so they pass the fail-closed rule, and `toJS()` logs the canary at the default level and at
`"warn"`; at `"error"` nothing is logged. The design's options are therefore right, but for a reason it does not
state, and no U-read case exercises it: a later edit that drops `logLevel` ("parseDocument never logs") or sets
`"warn"` writes `lesson.yaml` content to the web log on every request, with U-read green. M-yaml-silent pins
`"error"` against `"silent"` only.

Required:
- U-read adds a case: a `lesson.yaml` (or `module.yaml`) with a collection key `? [CANARY-YAML-K]` under the
  channel spies, asserting no captured argument contains the canary (whatever the read result is).
- Mutation M-yaml-level: `logLevel` removed from the `parseDocument` options (default `"warn"`) -> red at that spy
  assertion. Seen red once.
- V15 and 4.Q12 are corrected: `parseDocument` itself does not log, `toJS()` does unless `logLevel` is `"error"`
  or `"silent"`; ADR-0009 item 7 ("nothing is logged by the parser") states the option it depends on.

Who: Architect.

## Non-blocking

- N7. U-env-sites walks only `apps/web`. A later `loadEnvFile(` or dotenv in `packages/` or `services/` would
  read the same root `.env` unguarded. Walk `apps/`, `packages/`, `services/` (skipping `node_modules`, build
  output and `course/`).
- N8. `.env.example`'s `ACADEMY_SKIP_ROOT_ENV` entry is a comment, not a `KEY=` line: CI copies the file to `.env`,
  and a live line would put the flag into `process.env` of every later child process for no reason.
- N9. `InvalidRootEnvOptOutError` echoes the whole value. It is a flag, but a pasted secret in the wrong variable
  would land in a build log; printing the value only when it is at most 8 characters (else its length) costs
  one line.

## Lesson recorded

Appended to `.claude/feedback/architect_mistakes.md`: "2026-10-30: A mutation that triggers the forbidden read;
a library's 'never logs' tested on one call of two (#30, judge_design round 2, security)".

FAIL
