# #30 judge_code round 2: security

Reviewer: judge-security. Scope: the round-1 delta only (range-diff
`r2c/range-diff-final.txt`, HEAD c86ff9e on base 6871f93). Round-1 points are not re-opened.

## What I checked

### `.: missing` log line
- `lib/course/errors.ts`: new `COURSE_ROOT_FILE = "."`, a constant. `node-fs.ts` substitutes it only when
  `rel === ""`; `read.ts` uses it for the existing "expected exactly one course" case.
- `lib/course/server.ts:18,35` still log `${error.file}: ${error.reason}` only. `file` is the constant or a
  tree-derived relative path; `reason` still comes from the closed set (`fsFailureReason` keeps only
  `^E[A-Z0-9]+$` codes). The absolute `COURSE_ROOT` value is not printed, as round 1 asked. The only
  message that names `COURSE_ROOT` is the existing `root.ts` "must be an absolute path", which names the
  variable, not its value.
- Ran `ACADEMY_SKIP_ROOT_ENV=1 pnpm exec vitest run lib/course lib/next-path`: 9 files, 75 tests passed,
  including the new "reports a missing root as the root itself" and "names a missing course root as the
  root" cases.

### `next` encoding and the `lib/routes.ts` comment
- Only the comment changed in `routes.ts`; `catalogPath`/`lessonPath` are unchanged string templates.
- Lesson page `returnPath`: `lessonPath(courseId, lessonId)` from params plus `?tab=` only from the closed
  `lessonTabOf`. Catalog page: `catalogPath(courseId)`. Both always start with the literal `/courses/`, so
  a param cannot make the path protocol-relative, whether Next hands it over encoded (the coder's finding)
  or decoded.
- Catch-all `[...missing]`: `/` + `encodeURIComponent` of each segment. Segments are non-empty and `/` is
  encoded, so the result cannot start with `//` or `/\`. Double encoding only mangles the return target
  (lands on another not-found page); harmless, as stated.
- Every return path goes through `signInPath` (`encodeURIComponent` into `?next=`), and the sign-in side
  keeps `safeNextPath` (`lib/next-path.ts:16-23`: must start with `/`, rejects `//`, `/\`, backslashes,
  control characters, over-length). No open redirect, no header or query injection.
- The comment is accurate for the lesson/catalog pages and does not claim anything the code does not do.

### Alert link change
- `components/ui/alert.tsx`: only the `[&_a]:*` utilities are removed from `AlertTitle`/`AlertDescription`
  class strings. No new props, no `dangerouslySetInnerHTML`.
- `prerequisite-alert.tsx`: `Link href={lessonPath(courseId, prerequisite.id)}` with
  `className={inlineLinkClassName}` (a static string in `components/ui/link-styles.ts`). `prerequisite.id`
  is a schema-validated slug from the view, `courseId` is already matched to `tree.id`; the title is text
  content. Same tab, no `target`. Nothing new reaches the client beyond the round-1 view fields.

## Findings

None. The delta adds no secret, no new log content, no new input path and no new attack surface.

PASS - no security issues found
