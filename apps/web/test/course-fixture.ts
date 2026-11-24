import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type CourseLookup, type CourseSource, readCourseById } from "@/lib/course/courses";
import { type CourseReadError, describeCourseFailure } from "@/lib/course/errors";
import { type CourseFs, nodeCourseFs } from "@/lib/course/node-fs";
import type { CourseTree } from "@/lib/course/read";

// A course root in a temp dir with two courses, each directory named by its id, and every kind of file the
// learner must never see. Grader material carries "CANARY-" strings, so a leak test only has to search for that
// prefix; theory.md of a visible lesson carries VISIBLE_MARKER as the positive control. `broken-course` sorts
// before `fixture-course` and claims its id, so it fails (ADR-0009 item 6) and a reader that stops at the first
// failure never reaches the readable course.

export const VISIBLE_MARKER = "VISIBLE-MARKER";
/** A check title is learner text (ADR-0009 as amended by #101): the positive control of the check-state views. */
export const VISIBLE_CHECK_TITLE = "VISIBLE-CHECK-TITLE";
export const FIXTURE_COURSE_ID = "fixture-course";
export const BROKEN_COURSE_ID = "broken-course";

export interface CourseFixture {
  /** The course root (the directory `COURSE_ROOT` would name). */
  root: string;
  write(rel: string, text: string): void;
  symlink(rel: string, target: string): void;
  path(rel: string): string;
  remove(): void;
}

const SOURCES = `sources:
  - title: Source one
    url: https://example.com/one
    checkedAt: "2026-10-01"
`;

const FILES: Record<string, string> = {
  "fixture-course/course.yaml": `id: ${FIXTURE_COURSE_ID}
title: Fixture course
description: A course for tests.
modules:
  - 00-basics
  - 01-later
`,
  "fixture-course/00-basics/module.yaml": `id: basics
title: Basics
summary: The first module.
outcomes:
  - Knows the basics.
status: ready
lessons:
  - 01-first
  - 02-second
  - 03-draft
`,
  "fixture-course/00-basics/01-first/lesson.yaml": `id: first-lesson
title: First lesson
type: theory
outcomes:
  - Reads the theory.
estimatedMinutes: 10
status: ready
${SOURCES}`,
  "fixture-course/00-basics/01-first/theory.md": `# First lesson\n\n${VISIBLE_MARKER} first theory.\n\n## Part one\n\nText.\n`,
  "fixture-course/00-basics/01-first/task.md": "# Task\n\nDo the first task.\n",
  "fixture-course/00-basics/02-second/lesson.yaml": `id: second-lesson
title: Second lesson
type: artifact
outcomes:
  - Builds the artifact.
estimatedMinutes: 20
status: ready
prerequisites:
  - first-lesson
  - draft-lesson
${SOURCES}workspace:
  image: CANARY-CHECKS-1-image
checks:
  - id: run-check
    kind: command
    title: ${VISIBLE_CHECK_TITLE}
    run: python3 CANARY-CHECKS-3-run.py
    timeoutSec: 60
  - id: quiz-check
    kind: quiz
    title: Quiz check
    file: checks/CANARY-CHECKS-4-file.yaml
    passScore: 0.5
    attempts:
      limit: 3
`,
  "fixture-course/00-basics/02-second/theory.md": "# Second lesson\n\nSecond theory.\n",
  "fixture-course/00-basics/02-second/task.md": "# Task\n\nSecond task.\n",
  "fixture-course/00-basics/02-second/checks/CANARY-CHECKS-4-file.yaml":
    "answer: CANARY-CHECKS-5\n",
  "fixture-course/00-basics/02-second/checks/verify.py": "print('CANARY-CHECKS-6')\n",
  "fixture-course/00-basics/02-second/quiz.yaml": "correct: CANARY-CHECKS-7\n",
  "fixture-course/00-basics/02-second/starter/task.md": "CANARY-CHECKS-8 starter task\n",
  "fixture-course/00-basics/02-second/notes.md": "CANARY-CHECKS-9 unlisted notes\n",
  "fixture-course/00-basics/03-draft/lesson.yaml": `id: draft-lesson
title: Draft lesson
type: theory
outcomes:
  - Not yet.
estimatedMinutes: 5
status: draft
`,
  "fixture-course/00-basics/03-draft/theory.md": "# Draft\n\nCANARY-CHECKS-10 draft text.\n",
  "fixture-course/00-basics/09-unlisted/lesson.yaml": "id: unlisted\ntitle: CANARY-CHECKS-11\n",
  "fixture-course/00-basics/09-unlisted/theory.md": "CANARY-CHECKS-12 unlisted theory\n",
  "fixture-course/01-later/module.yaml": `id: later
title: Later
summary: A module that is not ready.
status: planned
lessons:
  - 01-hidden
`,
  "fixture-course/01-later/01-hidden/lesson.yaml": `id: hidden-lesson
title: Hidden lesson
type: theory
outcomes:
  - Hidden.
estimatedMinutes: 5
status: ready
${SOURCES}`,
  "fixture-course/01-later/01-hidden/theory.md": "# Hidden\n\nCANARY-CHECKS-13 hidden theory.\n",
  "fixture-course/01-later/01-hidden/task.md": "# Task\n\nCANARY-CHECKS-14 hidden task.\n",
};

function brokenCourseYaml(id: string): string {
  return `id: ${id}
title: Broken course
description: A course whose id is not its directory name.
modules:
  - 00-only
`;
}

const BROKEN_FILES: Record<string, string> = {
  "broken-course/course.yaml": brokenCourseYaml(FIXTURE_COURSE_ID),
  "broken-course/00-only/module.yaml": `id: only
title: Only module
summary: The one module of the broken course.
outcomes:
  - Knows the broken course.
status: ready
lessons:
  - 01-lesson
`,
  "broken-course/00-only/01-lesson/lesson.yaml": `id: broken-lesson
title: Broken lesson
type: artifact
outcomes:
  - Builds the broken artifact.
estimatedMinutes: 10
status: ready
${SOURCES}workspace:
  image: CANARY-BROKEN-1-image
checks:
  - id: broken-check
    kind: command
    title: Broken check
    run: python3 CANARY-BROKEN-2-run.py
    timeoutSec: 60
`,
  "broken-course/00-only/01-lesson/theory.md": `# Broken lesson\n\n${VISIBLE_MARKER} broken theory.\n`,
  "broken-course/00-only/01-lesson/task.md": "# Task\n\nThe broken task.\n",
  "broken-course/00-only/01-lesson/checks/verify.py": "print('CANARY-BROKEN-3')\n",
  "broken-course/00-only/01-lesson/starter/task.md": "CANARY-BROKEN-4 starter task\n",
};

export function createCourseFixture(): CourseFixture {
  const root = mkdtempSync(path.join(tmpdir(), "course-fixture-"));
  const fixture: CourseFixture = {
    root,
    path: (rel) => path.join(root, rel),
    write(rel, text) {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      writeFileSync(path.join(root, rel), text);
    },
    symlink(rel, target) {
      rmSync(path.join(root, rel), { recursive: true, force: true });
      symlinkSync(target, path.join(root, rel));
    },
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
  for (const [rel, text] of Object.entries({ ...FILES, ...BROKEN_FILES })) fixture.write(rel, text);
  return fixture;
}

/** Gives `broken-course` its own id, so both courses of the fixture read. */
export function makeBrokenCourseReadable(fixture: CourseFixture): void {
  fixture.write("broken-course/course.yaml", brokenCourseYaml(BROKEN_COURSE_ID));
}

/** The fixture root read through the node file layer. */
export function fixtureSource(root: string, fs: CourseFs = nodeCourseFs): CourseSource {
  return { fs, root: () => root };
}

/** A fixture course read to another outcome than the test arranged. */
export class UnexpectedFixtureReadError extends Error {
  constructor(courseId: string, expected: string, lookup: CourseLookup) {
    const detail = "error" in lookup ? `: ${describeCourseFailure(lookup.error)}` : "";
    super(`fixture course ${courseId}: expected ${expected}, read ${lookup.kind}${detail}`);
    this.name = "UnexpectedFixtureReadError";
  }
}

/** The tree of a fixture course the test needs readable; any other outcome fails the test. */
export async function readFixtureTree(
  root: string,
  courseId: string = FIXTURE_COURSE_ID,
): Promise<CourseTree> {
  const lookup = await readCourseById(fixtureSource(root), courseId);
  if (lookup.kind === "course") return lookup.tree;
  throw new UnexpectedFixtureReadError(courseId, "course", lookup);
}

/** The failure of a fixture course the test broke; any other outcome fails the test. */
export async function readFixtureFailure(
  root: string,
  courseId: string = FIXTURE_COURSE_ID,
): Promise<CourseReadError> {
  const lookup = await readCourseById(fixtureSource(root), courseId);
  if (lookup.kind === "course-failure") return lookup.error;
  throw new UnexpectedFixtureReadError(courseId, "course-failure", lookup);
}

/** A file layer that records every call into `calls`, as `<method> "<rel>"`, before delegating to node's. */
export function recordingCourseFs(calls: string[] = []): { fs: CourseFs; calls: string[] } {
  const fs: CourseFs = {
    // Recorded before delegating, so a refused request is caught too.
    readText(root, rel) {
      calls.push(`readText ${JSON.stringify(rel)}`);
      return nodeCourseFs.readText(root, rel);
    },
    listDirs(root, rel) {
      calls.push(`listDirs ${JSON.stringify(rel)}`);
      return nodeCourseFs.listDirs(root, rel);
    },
  };
  return { fs, calls };
}
