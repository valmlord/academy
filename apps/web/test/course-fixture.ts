import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// A course in a temp dir with every kind of file the learner must never see. Grader material carries
// "CANARY-" strings, so a leak test only has to search for that prefix; theory.md of a visible lesson
// carries VISIBLE_MARKER as the positive control.

export const VISIBLE_MARKER = "VISIBLE-MARKER";
/** A check title is learner text (ADR-0009 as amended by #101): the positive control of the check-state views. */
export const VISIBLE_CHECK_TITLE = "VISIBLE-CHECK-TITLE";
export const FIXTURE_COURSE_ID = "fixture-course";

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
  "course/course.yaml": `id: ${FIXTURE_COURSE_ID}
title: Fixture course
description: A course for tests.
modules:
  - 00-basics
  - 01-later
`,
  "course/00-basics/module.yaml": `id: basics
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
  "course/00-basics/01-first/lesson.yaml": `id: first-lesson
title: First lesson
type: theory
outcomes:
  - Reads the theory.
estimatedMinutes: 10
status: ready
${SOURCES}`,
  "course/00-basics/01-first/theory.md": `# First lesson\n\n${VISIBLE_MARKER} first theory.\n\n## Part one\n\nText.\n`,
  "course/00-basics/01-first/task.md": "# Task\n\nDo the first task.\n",
  "course/00-basics/02-second/lesson.yaml": `id: second-lesson
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
  "course/00-basics/02-second/theory.md": "# Second lesson\n\nSecond theory.\n",
  "course/00-basics/02-second/task.md": "# Task\n\nSecond task.\n",
  "course/00-basics/02-second/checks/CANARY-CHECKS-4-file.yaml": "answer: CANARY-CHECKS-5\n",
  "course/00-basics/02-second/checks/verify.py": "print('CANARY-CHECKS-6')\n",
  "course/00-basics/02-second/quiz.yaml": "correct: CANARY-CHECKS-7\n",
  "course/00-basics/02-second/starter/task.md": "CANARY-CHECKS-8 starter task\n",
  "course/00-basics/02-second/notes.md": "CANARY-CHECKS-9 unlisted notes\n",
  "course/00-basics/03-draft/lesson.yaml": `id: draft-lesson
title: Draft lesson
type: theory
outcomes:
  - Not yet.
estimatedMinutes: 5
status: draft
`,
  "course/00-basics/03-draft/theory.md": "# Draft\n\nCANARY-CHECKS-10 draft text.\n",
  "course/00-basics/09-unlisted/lesson.yaml": "id: unlisted\ntitle: CANARY-CHECKS-11\n",
  "course/00-basics/09-unlisted/theory.md": "CANARY-CHECKS-12 unlisted theory\n",
  "course/01-later/module.yaml": `id: later
title: Later
summary: A module that is not ready.
status: planned
lessons:
  - 01-hidden
`,
  "course/01-later/01-hidden/lesson.yaml": `id: hidden-lesson
title: Hidden lesson
type: theory
outcomes:
  - Hidden.
estimatedMinutes: 5
status: ready
${SOURCES}`,
  "course/01-later/01-hidden/theory.md": "# Hidden\n\nCANARY-CHECKS-13 hidden theory.\n",
  "course/01-later/01-hidden/task.md": "# Task\n\nCANARY-CHECKS-14 hidden task.\n",
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
  for (const [rel, text] of Object.entries(FILES)) fixture.write(rel, text);
  return fixture;
}
