# #30 judge_design round 1: security

Judge: security. Date: 2026-10-30. Input: `plans/30-catalog-lesson-page-research.md`,
`plans/30-catalog-lesson-page-design.md` (revision 1), `docs/adr/0009-course-content-in-the-web-app.md`
(Proposed), ADR-0001, ADR-0002, ADR-0008, `apps/web` at `7706f71`, `course/`, `apps/web/Dockerfile`, `.dockerignore`.
Stepan's binding decisions of 2026-10-30 (S1-S3, Skeletons to #35, D1-D3 with #83) are taken as given.

**Verdict: FAIL, 5 findings (4 blocking, 1 required wording).** The leak architecture itself is sound. It has
a structure-driven allowlist, `course/` is deleted before `next build`, views are built field by field and
the rendering defaults are right. The failures are in the edges: the root `.env` is read and two real
secrets are loaded during the coder's build, `yaml` prints source lines to the server log, layer 2 does not
scan two pages that render course data, and one mutation cannot produce the image it is meant to test.

## What I checked, and how

| Area | Checked | Result |
|---|---|---|
| Export allowlist | design 4.Q1, 5.1, 7, ADR-0009 item 2 against `packages/lesson-schema/src/schema.ts`: `Course.modules` and `Module.lessons` are `dirName` (`^\d{2}-[a-z0-9-]+$`), so a schema-parsed listing cannot hold `..` or `/`; `course/ai-for-developers` has 1 course, 6 module dirs, `checks/`, `starter/`, `quiz.yaml` per lesson; no symlinks in `course/` (`find course -type l` empty); `pnpm-workspace.yaml` does not include `course/` (no starter `package.json` is a workspace member) | sound |
| Symlink and traversal refusal | `CourseFs.readText` rule "real path must equal `realpath(root)/rel`": walked `rel` with `a/../b`, an absolute `rel`, and a symlinked course, module or lesson dir and file. Each yields a real path different from the logical one and is refused. `realpath(root)` makes a symlinked `COURSE_ROOT` (macOS `/tmp`) work | sound |
| Route params | `courseId` is compared for equality with the parsed `course.yaml` id; `lessonId` is looked up by id among visible lessons only; `getLessonText` takes `node.dir` from the tree and `kind` from the closed `theory`/`task` set; `moduleId` is a fragment, not a param; `?tab=` is validated to a closed set before it enters `requireSession`. No param ever reaches a path | sound |
| `rm -rf course` before `next build` | Dockerfile today vs design step 12: dependency build, then export, then `rm -rf /repo/course`, then the web build. Only the build stage sees `course/`, and the runner copies only standalone, static, public, drizzle and `/out/course`. `.dockerignore` `scripts` is anchored at the root, so `apps/web/scripts/export-course.ts` reaches the build context. `tsx` is a web devDependency, and the build stage installs devDependencies | sound |
| Four-layer test, mutation by mutation | M-leak-view: the inspect canary on `checks[].run` turns red. M-leak-read: the opened-paths assertion turns red. M-list-all and M-link: U-files turns red. M-img-copy: C1 and C2 turn red. M-trace: N1 and N2 turn red (the `../../course` include is copied to `standalone/course`). M-leak-rsc: see **S4**. Fragment charset vs escaping: React escapes `& < > " '`, Next's inline-flight escaping touches `& < > U+2028/9`, Cyrillic stays raw, so fragments survive HTML and RSC encoding. Coverage of pages: see **S3** | S3, S4 |
| Markdown | react-markdown 10.1.0 defaults (research 2.4, Context7): raw HTML becomes text, `defaultUrlTransform` drops `javascript:`/`vbscript:`/`data:`, no `rehype-raw`, no `skipHtml`. Rendering is server-only, so neither react-markdown nor micromark enters the client bundle. Heading ids are ordinal `sec-<n>` (no content-derived ids, no DOM clobbering). Sources pass an `http:`/`https:` filter (zod `.url()` admits `javascript:`), and links open in the same tab. U-md asserts the `script` and `javascript:` cases with M-raw and M-skiphtml. I did not run react-markdown myself; the U-md mutations prove the behaviour | sound |
| Typed errors | 5.4 reasons: the YAML reason comes from `linePos` only, the schema reason is `path` + `code` (never `issue.message`), no `cause`. U-read canary on a schema value and on a syntax error. Reproduced with yaml 2.9.1: the thrown `YAMLParseError.message` quotes the source line, so the `linePos` rule is necessary. **But** warnings take another path: see **S2** | S2 |
| DAL and entry guard | `lib/entry-guard.ts` regex scans `page`/`route`/`"use server"`. The three new pages and the catch-all each call `requireSession`, and `generateMetadata` starts with it. #30 adds no server action and no route handler: Retry is `router.refresh()`. `not-found.tsx` and the layout are not scanned. The layout renders only `children` without a session (`app/(app)/layout.tsx:12`), and every path into `not-found.tsx` passes a page's `requireSession` first | sound |
| Catch-all vs `/api/auth` | `app/api/auth/[...all]/route.ts` has two static segments ahead of its catch-all, so it outranks `(app)/[...missing]`. `/sign-in` is static. `/favicon.ico` is a metadata route and outside the proxy matcher. `/_next/*` is not app-routed. The e2e setup project signs in through `/api/auth/sign-in/email`, so shadowing would turn the suite red. The return path of `//evil.example` goes through `signInPath` and then `safeNextPath` (`lib/next-path.ts:16-23`, `app/sign-in/page.tsx:20`), which refuses `//` | sound |
| `COURSE_ROOT` | absolute or refused, empty means the fallback `<cwd>/../../course` (standalone cwd `/app/apps/web` gives `/app/course`), `ENV` in the image, C3 checks the image value, `dev.passThroughEnv` += `COURSE_ROOT`. No request input reaches it | sound |
| `t30` isolation | `t30-env.sh` and the wrapper (13.6) against every node entry point that loads the root `.env`: `next.config.ts:14-16`, `scripts/seed.ts:14-16`, `playwright.config.ts:7-9`, all `process.loadEnvFile`. Also turbo 2.11.10 strict env mode against `turbo.json`: `build` has no `passThroughEnv`, and `test:e2e` passes only `E2E_BASE_URL` and `SEED_*`. Checked bare `docker compose` in the image scripts and the teardown's `cksum .env`. Reproduced in the scratchpad with a canary `.env` (not the root one): bare `docker compose config` interpolates from `.env`, and `COMPOSE_ENV_FILES=/dev/null docker compose config` does not | **S1** |
| `lesson.yaml` in the image | the real `00-introduction/01-models-and-effort/lesson.yaml` carries `checks[].run: 'python3 -I "$ACADEMY_CHECKS_DIR/verify_routing.py"'`, check titles, `file: quiz.yaml`, `workspace` | **S5** |

## Findings

### S1 (blocking). The root `.env` is read, and `[B]` loads Stepan's real secret and database URL

Design 13.6 says compose never reads the root `.env` and that "the env file exports every variable compose,
the seed, `pnpm dev` and Playwright could take from it, so exported values win". Both claims fail:

1. `[B]` is `env -u BETTER_AUTH_SECRET -u DATABASE_URL pnpm build` (13.5). `pnpm build` is `turbo run build`.
   Turbo 2 runs in strict env mode, and the `build` task has no `passThroughEnv` (`turbo.json:4`), so `next
   build` would not see the t30 exports anyway. `apps/web/next.config.ts:14-16` then calls
   `process.loadEnvFile(<repo>/.env)`. Because the keys are unset, Stepan's real `BETTER_AUTH_SECRET` and
   `DATABASE_URL` (his running `academy-db-1`) are loaded into every coder and tester build. This also
   silently voids the point of `env -u` (proving the build needs no secret) on this machine.
2. `pnpm test:e2e`: `playwright.config.ts:7-9` loads the file. `test:e2e` passes only `E2E_BASE_URL` and
   `SEED_*`, so Stepan's `BETTER_AUTH_SECRET` and `DATABASE_URL` enter the Playwright process. No spec reads
   them today, but nothing stops one from doing so.
3. `pnpm seed` and `pnpm dev` read the file. Their exported values win, but the file is read.
4. `check-image-course.sh` (new) and `check-image-migrations.sh` call bare `docker compose`. Compose reads
   the root `.env` for interpolation and for `COMPOSE_*` variables. The t30 exports win for the keys it sets
   today, but any `COMPOSE_FILE`/`COMPOSE_PROFILES` Stepan adds would apply.
5. The teardown's `cksum .env` reads the file's content.

The brief and 13.6 both say the root `.env` must never be read. Required:
- `t30-env.sh` exports `COMPOSE_ENV_FILES=/dev/null`. Verified: with it, bare `docker compose` ignores
  `.env` (scratch rehearsal above). The image scripts then need no change.
- The three `loadEnvFile` call sites get one opt-out, for example a marker-free helper
  `loadRootEnv(env, path)` that skips when `ACADEMY_ROOT_ENV=off`. It needs a unit test with a temp canary
  file and a mutation (ignore the flag) that turns red. The flag goes into `turbo.json`
  `globalPassThroughEnv` (or every relevant task's list), and `t30-env.sh` exports it. Alternatively, Stepan
  explicitly accepts "read, exported values win" in writing. Even then, `[B]` must stop loading real values:
  set `BETTER_AUTH_SECRET=` and `DATABASE_URL=` to empty strings that turbo passes through, instead of
  `env -u`, and show that the build still passes.
- The before/after record uses `stat -f '%i %z %m' .env` (inode, size, mtime), not `cksum`.
- V9 is re-rehearsed with the new exports, and 13.6 lists every process that could read the root `.env`
  and why it no longer does.

Who: Architect (V8 checked only compose and missed the three node loaders and turbo strict mode).

### S2 (blocking). `yaml` warnings print lesson.yaml source lines to the server log

Design 5.4 constrains thrown errors only. yaml 2.9.1's `parse()` (`dist/public-api.js`) logs every document
warning with `process.emitWarning` at the default `logLevel: "warn"`. With `prettyErrors` (the default), the
warning text quotes the source line. Reproduced:
`Y.parse('id: x\nrun: !weird SECRET-RUN-LINE\n')` prints
`YAMLWarning: Unresolved tag: !weird at line 2, column 6:` followed by the line `run: !weird SECRET-RUN-LINE`
on stderr. That is the web container's log. The case is concrete: a lesson.yaml with a tag on a `checks[].run`
line still passes `content:validate`, because the validator uses the same `parse`, which only warns. Every
request would then log the grader command. U-read's canary cannot see this, because it inspects the thrown
message only.

Required: the loader and the export parse with `parseDocument(src, { prettyErrors: false, logLevel: "silent" })`.
They read `doc.errors[0].linePos` for the reason and treat any `doc.warnings` entry as `CourseReadError`
`invalid YAML at line <n>` (fail closed). Do not just set `parse(..., { logLevel: "silent" })`: in `parse` it
also discards errors. U-read adds a case with an unresolved tag carrying `CANARY-YAML` on that line. It
spies on `process.emitWarning`, every `console.*` method and `process.stderr.write`, and asserts that no
captured argument contains the canary. Mutation: default `parse` options turn the spy assertion red.

Who: Architect.

### S3 (blocking). Layer 2 does not scan the dashboard or the not-found page

E-leak (7.2) visits the catalog, every lesson and one client navigation. The dashboard `/` renders
`DashboardView` plus page-specific components, and `not-found.tsx` renders the course identity. Neither page
is fetched. U-leak checks only what the view functions return. A dashboard component that passes a
`LessonNode` or the tree to a client island (for example the Card) would therefore pass all four layers.
The brief's requirement is "never in an HTTP response", and layer 2 is the only layer that sees responses.

Required: E-leak also loads `/` with a positive control (the next lesson's title from `e2e/course.ts` is
found in that body) and one not-found URL (an unknown lesson id, status 404, body scanned). Add one mutation
row: the Card receives the `LessonNode` as a prop, and E-leak turns red on `/`.

Who: Architect.

### S4 (blocking). M-leak-rsc as written fails the image build, not E-leak

"A lesson page that passes `node.lesson` to `LessonTabs`" adds a prop that `LessonTabs`' typed props do not
declare. `next build` type-checks (`apps/web/.turbo/turbo-build.log:10-11` "Running TypeScript";
`next/dist/docs/.../02-typescript.md:40,63`), so the `academy-web:t30` build fails. The "red" would then be a
build failure, which says nothing about E-leak. This is the architect lesson "trace the mutated code path
through the exact test setup".

Required: write the mutation so it compiles. Inside the mutation, widen the props by adding
`leak?: unknown` to `LessonTabs`' props, not rendered, and pass `leak={node.lesson}`; the prop is still
serialized into the RSC payload. Also name the asserted fragment: a `run` fragment such as
`ACADEMY_CHECKS_DIR/verify_routing.py`, or a check title, after the allowed-corpus filter. The tester then
confirms that the build passed and that E-leak, not the build, turned red. Also require a recorded check
that at least one `RSC: 1` / `text/x-component` response body was captured. Then a silent failure of
`response.text()` on streamed RSC cannot leave the client-navigation part of the scan empty.

Who: Architect.

### S5 (required wording). ADR-0009 ships lesson.yaml grader metadata into the image without saying so

ADR-0009 item 2 allowlists `lesson.yaml` whole, so `/app/course` holds `checks[].run` commands, check
titles, grader file names and `workspace`. C2 does not cover these, because it hashes only
`checks/`/`starter/`/`quiz.yaml`. This is defensible: they are not answer keys, and the loader must parse the
whole `Lesson`, whose `superRefine` needs `checks` for ready practice lessons. But the ADR's Decision and
Consequences never state it, and the review brief lists "`lesson.yaml` `checks[]` values ... or the image".
Required: ADR-0009 Consequences records it as an accepted residual (what is in the image, why stripping
breaks schema parsing, that the browser never receives it, guarded by U-leak and E-leak). Alternatively, the
design shows a stripped export that still parses.

Who: Architect.

## Non-blocking (adopt or answer)

- N1. Defense in depth for later callers (#36 will be tempted): `CourseFs.readText` refuses any basename
  not in `LEARNER_FILES` and any path segment `checks` or `starter`, so the fs itself, not only the listing,
  is an allowlist.
- N2. U-files' expected set is a literal list written in the test for the fixture, never derived from
  `listLearnerFiles` (a self-referential guard; judge lesson). The same goes for C1: it compares against the
  same listing function, so only C2 independently catches a listing bug. Consider adding to C2 a name scan of
  `/app/course` for `checks`, `starter`, `quiz.yaml`, which also covers grader files under 64 bytes.
- N3. The `(app)/layout.tsx` course read (4.Q9) happens only after `session !== null`. Then a forged cookie
  never triggers file reads, and not-found never reads the course without a session.
- N4. `FragmentFocus` resolves the hash with `document.getElementById(decodeURIComponent(...) + "-heading")`
  inside try/catch, never with `querySelector`, so a crafted hash cannot throw.
- N5. Images in lesson markdown would make the learner's browser fetch third-party URLs. No lesson has one
  today. Either map `img` to nothing (`disallowedElements: ["img"]`) until a design covers images, or record it.
- N6. Do not repeat V8's `cut -d= -f1 .env`. Key names can come from `.env.example`.

## Lesson recorded

Appended to `.claude/feedback/architect_mistakes.md`: "2026-10-30: Isolation recipe checked compose only;
node entry points and turbo strict mode load the root .env (#30)".

FAIL
