# #30 judge_design round 4: architecture

Judge: judge-architecture, 2026-10-31. Limits (Stepan, short round): review only the Revision 4 delta; block only on
my round-3 item left undone or regressions it introduces. Reviewed: the "Revision 4" table of
`plans/30-catalog-lesson-page-design.md`, 13.1 rows U-env-sites (line 867), U-fs (869), U-read (871), U-text (873),
4.Q12, `docs/adr/0009-course-content-in-the-web-app.md` item 7, my round-3 review.

Checked against the repository:
- `git status --short`: only `.claude/feedback/architect_mistakes.md` (modified), `docs/adr/0009-*` and `plans/`
  files (new). No product file touched.
- `ls -la services`: empty directory; `git ls-files services | wc -l`: 0. The design's premise for making `services/`
  the one optional root is true.
- `rg -n services` over the design: no remaining place says `services/` is walked unconditionally (the Revision 3
  row S N7 is history; 13.1 U-env-sites carries the revision-4 wording).
- `node_modules/.pnpm/yaml@2.9.1/.../dist/parse/parser.js:178`: `if (node_process.env.LOG_TOKENS)`, as 4.Q12 and
  ADR-0009 item 7 now state.

## Verdict: PASS

### Round-3 item 1 (U-env-sites walks a root CI lacks): fixed
13.1 U-env-sites now walks two required roots, `apps/` and `packages/` (a missing one fails the test, so a typo
cannot pass vacuously), and `services/` only if it exists, with "no other root is optional" stated. One positive
control per required root (`apps/web/next.config.ts`, `packages/db/src/vocabulary.ts`). In CI the walk no longer
throws `ENOENT`, so commit 1 is green there on correct code. M-env-walk (walk only `apps/web`) still reddens the
`packages/` positive control. The rejection of a `git ls-files`-driven walk is sound: an untracked new file with a
direct loader call would escape the scan locally, before `git add`.

### Advisory A6 (mode-`000` file left behind): done
U-fs, U-read (`module.yaml`) and U-text (`theory.md`) each record the path and restore `0o644` in an `afterEach`.
The note that temp-dir removal needs write permission on the directory, not the file, is correct. The non-root
guard in U-fs (fail, not skip) is unchanged.

### Regressions from the other Revision 4 rows: none
- Sec N10 (4.Q12, ADR-0009 item 7): wording only; `logLevel: "error"` and both mutations (M-yaml-level,
  M-yaml-silent) unchanged; the ADR still says "a unit test pins each of the two", which refers to the two
  `logLevel` reasons, consistent with 4.Q12. No new test, no new module.
- Ops N4 (13.4 `pgrep` pattern): a test-procedure string, no design change.
- Steps stay 47, commits stay 10; no step, supply order or file list changed, so the round-3 green-commit walk holds.

PASS
