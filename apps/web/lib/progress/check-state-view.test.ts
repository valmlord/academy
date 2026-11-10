// @vitest-environment node
import { inspect } from "node:util";
import type { Lesson } from "@academy/lesson-schema/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type CourseFixture,
  createCourseFixture,
  VISIBLE_CHECK_TITLE,
} from "@/test/course-fixture";
import { nodeCourseFs } from "../course/node-fs";
import { readCourse } from "../course/read";
import { toAttemptView, toCheckStateView } from "./check-state";
import { evaluateLesson, type LessonFacts } from "./rules";
import { SHIPPED_CHECK_KINDS } from "./shipped-kinds";

// Layer 1 of the leak defence for the check-state views (ADR-0009 item 3 as amended by #101): over every
// lesson of the canary fixture, no grader field and no CANARY- string reaches a view, and the check title
// (learner text) does.

const FORBIDDEN_KEYS = new Set([
  "run",
  "file",
  "rubric",
  "task",
  "verify",
  "answers",
  "workspace",
  "score",
]);

let fixture: CourseFixture;

beforeEach(() => {
  fixture = createCourseFixture();
});

afterEach(() => {
  fixture.remove();
});

async function fixtureLessons(): Promise<Lesson[]> {
  const tree = await readCourse(nodeCourseFs, fixture.root);
  return tree.modules.flatMap((module) => module.lessons.map((node) => node.lesson));
}

function emptyFacts(lesson: Lesson): LessonFacts {
  return {
    checks: lesson.checks,
    shippedKinds: SHIPPED_CHECK_KINDS,
    hasProgressRow: false,
    attempts: [],
    results: [],
    closures: [],
  };
}

/** A running attempt over every check, the first with a committed result carrying a message. */
function runningFacts(lesson: Lesson): LessonFacts {
  const startedAt = new Date(Date.UTC(2026, 10, 1, 9));
  const [first] = lesson.checks;
  return {
    ...emptyFacts(lesson),
    hasProgressRow: true,
    attempts: [
      {
        attemptId: "attempt-1",
        status: "running",
        startedAt,
        finishedAt: null,
        includedChecks: lesson.checks.map((check) => ({
          checkId: check.id,
          checkKind: check.kind,
        })),
      },
    ],
    results:
      first === undefined
        ? []
        : [
            {
              attemptId: "attempt-1",
              attemptStartedAt: startedAt,
              checkId: first.id,
              checkKind: first.kind,
              status: "failed",
              isFormatError: false,
              isBudgetExhausted: false,
              message: "expected 3 lines, got 2",
              rawError: null,
              costUsd: "0.010000",
              finishedAt: new Date(startedAt.getTime() + 1_000),
            },
          ],
  };
}

function viewsOf(lesson: Lesson): unknown[] {
  const empty = evaluateLesson(emptyFacts(lesson));
  const facts = runningFacts(lesson);
  const running = evaluateLesson(facts);
  const [attempt] = facts.attempts;
  const live = new Map(lesson.checks.slice(1).map((check) => [check.id, new Date()]));
  const attemptView = attempt === undefined ? null : toAttemptView(attempt, running, live);
  return [
    toCheckStateView(lesson, empty, null, null),
    toCheckStateView(lesson, running, "in-progress", attemptView),
  ];
}

function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value === null || typeof value !== "object" || value instanceof Date) return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]);
}

describe("check-state views", () => {
  it("carry no CANARY- string of any fixture lesson and show the check title", async () => {
    const views = (await fixtureLessons()).flatMap(viewsOf);

    const printed = views
      .map((view) => inspect(view, { depth: Number.POSITIVE_INFINITY }))
      .join("\n");

    expect(printed).not.toContain("CANARY-");
    expect(printed).toContain(VISIBLE_CHECK_TITLE);
  });

  it("carry no key named after a grader field", async () => {
    const views = (await fixtureLessons()).flatMap(viewsOf);

    const keys = new Set(views.flatMap(keysOf));

    expect([...keys].filter((key) => FORBIDDEN_KEYS.has(key))).toEqual([]);
    expect(keys.has("title")).toBe(true);
  });
});
