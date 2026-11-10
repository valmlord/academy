// @vitest-environment node
import type { Check } from "@academy/lesson-schema/schema";
import { describe, expect, it } from "vitest";
import {
  type AttemptSpec,
  attemptId,
  commandCheck,
  type FactsOptions,
  hiddenTaskCheck,
  lessonFacts,
  lessonWith,
  quizCheck,
  repeated,
  rubricCheck,
} from "@/test/progress-facts";
import {
  aggregateAttemptStatus,
  type CheckEvaluation,
  classifyResult,
  composeRun,
  countedCheckCount,
  evaluateLesson,
  type GraderEnd,
  type LessonEvaluation,
  nextStoredStatus,
  PLATFORM_STOP_REASONS,
  PRE_START_STAGES,
  storedOutcome,
} from "./rules";

// Rules of ADR-0007 as amended by #101 (design 4.4). Each test builds the stored facts of one learner's
// lesson and reads one field of the evaluation.

const ROUTING = "routing";

function evaluate(
  checks: Check[],
  attempts: AttemptSpec[],
  options?: FactsOptions,
): LessonEvaluation {
  return evaluateLesson(lessonFacts(checks, attempts, options));
}

function checkOf(evaluation: LessonEvaluation, checkId: string): CheckEvaluation {
  const check = evaluation.checks.find((candidate) => candidate.checkId === checkId);
  if (check === undefined) {
    throw new Error(`no evaluation for check ${checkId}`);
  }
  return check;
}

function routing(evaluation: LessonEvaluation): CheckEvaluation {
  return checkOf(evaluation, ROUTING);
}

const failed = { checkId: ROUTING, status: "failed" } as const;
const passed = { checkId: ROUTING, status: "passed" } as const;

describe("counted results", () => {
  it("counts a timeout toward the limit (D2)", () => {
    const evaluation = evaluate(
      [commandCheck(ROUTING, { limit: 10 })],
      [{ results: [{ checkId: ROUTING, status: "timeout" }] }],
    );

    expect(routing(evaluation).failedCount).toBe(1);
    expect(routing(evaluation).latestResult?.isCounted).toBe(true);
  });

  it("counts an exhausted hidden-task budget toward the limit (D2)", () => {
    const evaluation = evaluate(
      [hiddenTaskCheck("hidden", 5, { limit: 3 })],
      [
        {
          results: [
            { checkId: "hidden", kind: "hidden-task", status: "failed", isBudgetExhausted: true },
          ],
        },
      ],
      { shippedKinds: new Set(["command", "hidden-task"]) },
    );

    expect(checkOf(evaluation, "hidden").failedCount).toBe(1);
    expect(checkOf(evaluation, "hidden").latestResult).toMatchObject({
      status: "failed",
      isBudgetExhausted: true,
      isCounted: true,
    });
  });

  it("never counts a format error", () => {
    const evaluation = evaluate(
      [commandCheck(ROUTING, { limit: 10 })],
      [{ results: [{ ...failed, isFormatError: true }] }],
    );

    expect(routing(evaluation).failedCount).toBe(0);
    expect(routing(evaluation).latestResult?.isCounted).toBe(false);
  });

  it("never counts a platform error", () => {
    const evaluation = evaluate(
      [commandCheck(ROUTING, { limit: 10 })],
      [{ results: [{ checkId: ROUTING, status: "error", rawError: "pre-start: exec-start" }] }],
    );

    expect(routing(evaluation).failedCount).toBe(0);
    expect(routing(evaluation).latestResult?.isCounted).toBe(false);
  });

  it("stops counting after the check's first pass", () => {
    const evaluation = evaluate(
      [commandCheck(ROUTING, { limit: 10 })],
      [{ results: [failed] }, { results: [passed] }, ...repeated(3, failed)],
    );

    expect(routing(evaluation).failedCount).toBe(1);
    expect(routing(evaluation).hasPassed).toBe(true);
    expect(routing(evaluation).latestResult?.isCounted).toBe(false);
  });
});

describe("closure", () => {
  it("closes a check on the counted failure that reaches its limit (10th of 10)", () => {
    const check = commandCheck(ROUTING, { limit: 10 });

    const afterNine = evaluate([check], repeated(9, failed));
    const afterTen = evaluate([check], repeated(10, failed));

    expect(routing(afterNine).isClosed).toBe(false);
    expect(routing(afterTen)).toMatchObject({ isClosed: true, needsClosure: true });
  });

  it("leaves the check open when a format error follows the 9th failure", () => {
    const evaluation = evaluate(
      [commandCheck(ROUTING, { limit: 10 })],
      [...repeated(9, failed), { results: [{ ...failed, isFormatError: true }] }],
    );

    expect(routing(evaluation)).toMatchObject({ failedCount: 9, isClosed: false });
  });

  it("never closes a passed check, even when later failures would reach its limit", () => {
    const attempts = [{ results: [failed] }, { results: [passed] }, ...repeated(3, failed)];

    const atLimitTwo = evaluate([commandCheck(ROUTING, { limit: 2 })], attempts);
    // A limit lowered after the pass to the failures counted before it.
    const atLimitOne = evaluate([commandCheck(ROUTING, { limit: 1 })], attempts);

    expect(routing(atLimitTwo)).toMatchObject({ hasPassed: true, isClosed: false });
    expect(routing(atLimitOne)).toMatchObject({ hasPassed: true, isClosed: false });
  });

  it("keeps a persisted closure closed after the limit is raised", () => {
    const evaluation = evaluate([commandCheck(ROUTING, { limit: 20 })], repeated(10, failed), {
      closures: [{ checkId: ROUTING, checkKind: "command" }],
    });

    expect(routing(evaluation)).toMatchObject({ isClosed: true, needsClosure: false });
  });

  it("marks a check for closure when its limit is lowered to its failure count", () => {
    const evaluation = evaluate([commandCheck(ROUTING, { limit: 3 })], repeated(3, failed));

    expect(routing(evaluation)).toMatchObject({ isClosed: true, needsClosure: true });
  });

  it("restarts the counter of a renamed check", () => {
    const evaluation = evaluate([commandCheck("routing-v2", { limit: 5 })], repeated(5, failed));

    expect(checkOf(evaluation, "routing-v2")).toMatchObject({
      failedCount: 0,
      isClosed: false,
      latestResult: null,
    });
    expect(evaluation.results.every((result) => !result.isCounted)).toBe(true);
  });

  it("ignores results recorded under another kind for the same check id", () => {
    const evaluation = evaluate(
      [commandCheck(ROUTING, { limit: 3 })],
      repeated(3, { checkId: ROUTING, kind: "quiz", status: "failed" }),
    );

    expect(routing(evaluation)).toMatchObject({
      failedCount: 0,
      isClosed: false,
      latestResult: null,
    });
  });
});

describe("kind changes", () => {
  const commandAndQuiz: FactsOptions = {
    shippedKinds: new Set(["command", "quiz"]),
    closures: [{ checkId: ROUTING, checkKind: "command" }],
  };
  const tenCommandFailures = repeated(10, failed);
  const quizFailure = { checkId: ROUTING, kind: "quiz", status: "failed" } as const;

  it("ignores a closure recorded under another kind for the same check id", () => {
    const evaluation = evaluate(
      [quizCheck(ROUTING, { limit: 3 })],
      tenCommandFailures,
      commandAndQuiz,
    );

    expect(routing(evaluation)).toMatchObject({
      isClosed: false,
      failedCount: 0,
      isInNextRun: true,
    });
  });

  it("marks the check for closure under its new kind when the new kind's failures reach its limit", () => {
    const evaluation = evaluate(
      [quizCheck(ROUTING, { limit: 3 })],
      [...tenCommandFailures, ...repeated(3, quizFailure)],
      commandAndQuiz,
    );

    expect(routing(evaluation)).toMatchObject({
      kind: "quiz",
      failedCount: 3,
      isClosed: true,
      needsClosure: true,
    });
  });

  it("closes a check changed back to its earlier kind by its earlier closure", () => {
    const evaluation = evaluate(
      [commandCheck(ROUTING, { limit: 20 })],
      [...tenCommandFailures, ...repeated(2, quizFailure)],
      commandAndQuiz,
    );

    expect(routing(evaluation)).toMatchObject({
      kind: "command",
      failedCount: 10,
      isClosed: true,
      needsClosure: false,
    });
  });
});

describe("shipped kinds and run composition", () => {
  it("lists an unshipped kind as not counted and never in the next run", () => {
    const evaluation = evaluate([quizCheck("quiz", { limit: 3 })], []);

    expect(checkOf(evaluation, "quiz")).toMatchObject({ isCounted: false, isInNextRun: false });
  });

  it("passes a lesson whose only unpassed check is of an unshipped kind", () => {
    const evaluation = evaluate(
      [commandCheck(ROUTING), quizCheck("quiz", { limit: 3 })],
      [{ results: [passed] }],
    );

    expect(evaluation.derivedOutcome).toBe("passed");
    expect(evaluation.countedCount).toBe(1);
  });

  it("re-runs a passed command check but not a passed token-spending check", () => {
    const evaluation = evaluate(
      [commandCheck(ROUTING), rubricCheck("review")],
      [{ results: [passed, { checkId: "review", kind: "rubric", status: "passed" }] }],
      { shippedKinds: new Set(["command", "rubric"]) },
    );

    expect(routing(evaluation)).toMatchObject({ hasPassed: true, isInNextRun: true });
    expect(checkOf(evaluation, "review")).toMatchObject({
      hasPassed: true,
      spendsTokens: true,
      isInNextRun: false,
    });
  });

  it("composes a run of exactly the checks in the next run, with their kinds", () => {
    const evaluation = evaluate(
      [
        commandCheck("open"),
        commandCheck("closed", { limit: 1 }),
        quizCheck("quiz", { limit: 3 }),
        commandCheck("done"),
      ],
      [
        {
          results: [
            { checkId: "closed", status: "failed" },
            { checkId: "done", status: "passed" },
          ],
        },
      ],
    );

    expect(composeRun(evaluation)).toEqual({
      kind: "run",
      includedChecks: [
        { checkId: "open", checkKind: "command" },
        { checkId: "done", checkKind: "command" },
      ],
    });
  });

  it("refuses a run when no check is in the next run", () => {
    const evaluation = evaluate([commandCheck(ROUTING, { limit: 1 })], [{ results: [failed] }]);

    expect(composeRun(evaluation)).toEqual({ kind: "refused", reason: "no-check-in-next-run" });
  });
});

describe("lesson outcome", () => {
  it("passes a lesson with every counted check passed", () => {
    const evaluation = evaluate(
      [commandCheck(ROUTING), commandCheck("estimate")],
      [{ results: [passed, { checkId: "estimate", status: "passed" }] }],
    );

    expect(evaluation).toMatchObject({ derivedOutcome: "passed", passedCount: 2 });
  });

  it("does not pass a lesson with a closed check and no open one", () => {
    const evaluation = evaluate(
      [commandCheck(ROUTING), commandCheck("estimate", { limit: 1 })],
      [{ results: [passed, { checkId: "estimate", status: "failed" }] }],
    );

    expect(evaluation).toMatchObject({ derivedOutcome: "not-passed", closedCount: 1 });
  });

  it("keeps a lesson with no counted check in progress, never passed", () => {
    const quizOnly = evaluate([quizCheck("quiz", { limit: 3 })], []);
    const noChecks = evaluate([], []);

    expect(quizOnly.derivedOutcome).toBe("in-progress");
    expect(noChecks.derivedOutcome).toBe("in-progress");
  });

  it("reports a lesson without a progress row as not started", () => {
    const evaluation = evaluate([commandCheck(ROUTING)], [], { hasProgressRow: false });

    expect(evaluation.derivedOutcome).toBe("not-started");
  });

  it("counts a check with one attempt left in lastAttemptCount", () => {
    const evaluation = evaluate([commandCheck(ROUTING, { limit: 3 })], repeated(2, failed));

    expect(evaluation.lastAttemptCount).toBe(1);
  });

  it("leaves out of lastAttemptCount a check with no limit, a passed one and a closed one", () => {
    const fail = (checkId: string) => ({ checkId, status: "failed" }) as const;
    const evaluation = evaluate(
      [
        commandCheck("unlimited"),
        commandCheck("passed", { limit: 3 }),
        commandCheck("closed", { limit: 3 }),
      ],
      [
        { results: [fail("unlimited"), fail("passed"), fail("closed")] },
        { results: [fail("unlimited"), fail("passed"), fail("closed")] },
        { results: [{ checkId: "passed", status: "passed" }] },
      ],
      // A closure persisted under a lower limit that was raised again: closed with one failure to go.
      { closures: [{ checkId: "closed", checkKind: "command" }] },
    );

    expect(checkOf(evaluation, "closed")).toMatchObject({ failedCount: 2, isClosed: true });
    expect(evaluation.lastAttemptCount).toBe(0);
  });
});

describe("latest result", () => {
  it("reports the latest result's message even when it is a format error after an older failure with a message", () => {
    const evaluation = evaluate(
      [commandCheck(ROUTING)],
      [
        { results: [{ ...failed, message: "routing table is wrong" }] },
        { results: [{ ...failed, isFormatError: true, message: "expected a YAML list" }] },
      ],
    );

    expect(routing(evaluation).latestResult).toMatchObject({
      isFormatError: true,
      message: "expected a YAML list",
    });
  });

  it("reports no message, never an older one, when the latest result has none", () => {
    const evaluation = evaluate(
      [commandCheck(ROUTING)],
      [
        { results: [{ ...failed, message: "routing table is wrong" }] },
        { results: [{ checkId: ROUTING, status: "error", rawError: "pre-start: exec-start" }] },
      ],
    );

    expect(routing(evaluation).latestResult).toMatchObject({ status: "error", message: null });
  });
});

describe("commit before show (D10) and missing results (D11)", () => {
  it("counts a committed result of a running attempt: the 10th failure in a running attempt closes the check", () => {
    const evaluation = evaluate(
      [commandCheck(ROUTING, { limit: 10 })],
      [...repeated(9, failed), { status: "running", results: [failed] }],
    );

    expect(evaluation.runningAttemptId).toBe(attemptId(9));
    expect(routing(evaluation)).toMatchObject({
      failedCount: 10,
      isClosed: true,
      needsClosure: true,
    });
  });

  it("keeps a counted result counted after its attempt is marked error", () => {
    const evaluation = evaluate(
      [commandCheck(ROUTING, { limit: 10 }), commandCheck("estimate")],
      [
        {
          status: "error",
          results: [
            failed,
            { checkId: "estimate", status: "error", rawError: "platform-stop: web-restart" },
          ],
        },
      ],
    );

    expect(routing(evaluation).failedCount).toBe(1);
    expect(routing(evaluation).latestResult?.isCounted).toBe(true);
  });

  it("counts a missing result of an included check in a finished attempt as one failed result of its included kind", () => {
    const facts = lessonFacts(
      [commandCheck(ROUTING, { limit: 10 })],
      [{ results: [], missing: [{ checkId: ROUTING, checkKind: "command" }] }],
    );

    const evaluation = evaluateLesson(facts);

    expect(routing(evaluation).failedCount).toBe(1);
    expect(routing(evaluation).latestResult).toMatchObject({
      attemptId: attemptId(0),
      status: "failed",
      isCounted: true,
      message: null,
      rawError: null,
      finishedAt: facts.attempts[0]?.finishedAt,
    });
  });

  it("does not count a missing result whose included kind differs from the check's current kind", () => {
    const evaluation = evaluate(
      [commandCheck(ROUTING, { limit: 10 })],
      [{ results: [], missing: [{ checkId: ROUTING, checkKind: "quiz" }] }],
    );

    expect(routing(evaluation)).toMatchObject({ failedCount: 0, latestResult: null });
  });

  it("adds no missing result for a running attempt", () => {
    const evaluation = evaluate(
      [commandCheck(ROUTING, { limit: 10 })],
      [{ status: "running", results: [], missing: [{ checkId: ROUTING, checkKind: "command" }] }],
    );

    expect(routing(evaluation)).toMatchObject({ failedCount: 0, latestResult: null });
  });

  it("counts error rows in errorCheckCount and leaves a missing result out", () => {
    const evaluation = evaluate(
      [commandCheck(ROUTING), commandCheck("estimate")],
      [
        {
          status: "error",
          results: [{ checkId: ROUTING, status: "error", rawError: "platform-stop: web-restart" }],
          missing: [{ checkId: "estimate", checkKind: "command" }],
        },
      ],
    );

    expect(evaluation.latestFinishedAttempt).toMatchObject({
      attemptId: attemptId(0),
      includedCheckIds: [ROUTING, "estimate"],
      errorCheckCount: 1,
    });
  });
});

describe("stored status", () => {
  it("keeps completed whatever the derived outcome", () => {
    expect(nextStoredStatus("completed", "in-progress")).toBe("completed");
    expect(nextStoredStatus("completed", "not-passed")).toBe("completed");
  });

  it("moves not-passed back to in-progress when an open check appears", () => {
    const closed = commandCheck(ROUTING, { limit: 1 });
    const attempts = [{ results: [failed] }];

    const before = evaluate([closed], attempts);
    const after = evaluate([closed, commandCheck("added")], attempts);

    expect(before.derivedOutcome).toBe("not-passed");
    expect(after.derivedOutcome).toBe("in-progress");
    expect(nextStoredStatus("not-passed", "in-progress")).toBe("in-progress");
  });

  it("reads a missing row as not started and completed as passed", () => {
    expect(storedOutcome(null)).toBe("not-started");
    expect(storedOutcome("completed")).toBe("passed");
    expect(storedOutcome("not-passed")).toBe("not-passed");
    expect(storedOutcome("in-progress")).toBe("in-progress");
  });
});

describe("countedCheckCount", () => {
  it("is 0 for a lesson without checks and for one with only a quiz", () => {
    expect(countedCheckCount(lessonWith([]))).toBe(0);
    expect(countedCheckCount(lessonWith([quizCheck("quiz", { limit: 3 })]))).toBe(0);
  });

  it("counts the checks of shipped kinds", () => {
    const lesson = lessonWith([
      commandCheck("a"),
      quizCheck("quiz", { limit: 3 }),
      commandCheck("b"),
    ]);

    expect(countedCheckCount(lesson)).toBe(2);
    expect(countedCheckCount(lesson, new Set(["command", "quiz"]))).toBe(3);
  });
});

describe("aggregateAttemptStatus", () => {
  it("is passed when every row passed", () => {
    expect(aggregateAttemptStatus(["passed", "passed"])).toBe("passed");
  });

  it("is failed with a failed or a timeout row and no error row, a format-error row included", () => {
    expect(aggregateAttemptStatus(["passed", "failed"])).toBe("failed");
    expect(aggregateAttemptStatus(["timeout", "passed"])).toBe("failed");
    // A format-error row is stored with status failed.
    expect(aggregateAttemptStatus(["failed"])).toBe("failed");
  });

  it("is error when one error row is among failed rows", () => {
    expect(aggregateAttemptStatus(["failed", "error", "failed"])).toBe("error");
  });

  it("is failed, never error, when every row failed, as a sweep finds rows that all committed before web died", () => {
    expect(aggregateAttemptStatus(["failed", "failed"])).toBe("failed");
  });
});

describe("classifyResult", () => {
  /** The classified result stored as the only result of a limited command check. */
  function throughLesson(end: GraderEnd): { isCounted: boolean | undefined; failedCount: number } {
    const classified = classifyResult(end);
    const evaluation = evaluate(
      [commandCheck(ROUTING, { limit: 10 })],
      [{ results: [{ checkId: ROUTING, ...classified }] }],
    );
    return {
      isCounted: routing(evaluation).latestResult?.isCounted,
      failedCount: routing(evaluation).failedCount,
    };
  }

  const countedFailure = { isCounted: true, failedCount: 1 };
  const uncounted = { isCounted: false, failedCount: 0 };
  const failedResult = { status: "failed", isFormatError: false, rawError: null };

  it("maps exit 0 to passed", () => {
    expect(classifyResult({ end: "exit", exitCode: 0 })).toEqual({
      status: "passed",
      isFormatError: false,
      rawError: null,
    });
    expect(throughLesson({ end: "exit", exitCode: 0 })).toEqual({
      isCounted: true,
      failedCount: 0,
    });
  });

  it("maps exit 3 to an uncounted format error", () => {
    expect(classifyResult({ end: "exit", exitCode: 3 })).toEqual({
      status: "failed",
      isFormatError: true,
      rawError: null,
    });
    expect(throughLesson({ end: "exit", exitCode: 3 })).toEqual(uncounted);
  });

  it("maps exit 1 to a counted failure", () => {
    expect(classifyResult({ end: "exit", exitCode: 1 })).toEqual(failedResult);
    expect(throughLesson({ end: "exit", exitCode: 1 })).toEqual(countedFailure);
  });

  it("counts a child process that SIGKILLs the grader as a failure, as exit 137 and as a signal", () => {
    expect(classifyResult({ end: "exit", exitCode: 137 })).toEqual(failedResult);
    expect(classifyResult({ end: "signal", signal: "SIGKILL" })).toEqual(failedResult);
    expect(throughLesson({ end: "exit", exitCode: 137 })).toEqual(countedFailure);
    expect(throughLesson({ end: "signal", signal: "SIGKILL" })).toEqual(countedFailure);
  });

  it("counts an OOM kill of the grader as a failure", () => {
    expect(throughLesson({ end: "exit", exitCode: 137 })).toEqual(countedFailure);
  });

  it("counts an OOM kill of the container's init as a failure", () => {
    expect(classifyResult({ end: "container-ended" })).toEqual(failedResult);
    expect(throughLesson({ end: "container-ended" })).toEqual(countedFailure);
  });

  it("counts kill -TERM 1 inside the container as a failure", () => {
    // docker-init forwards the signal and the container exits: the runner sees the container end.
    expect(throughLesson({ end: "container-ended" })).toEqual(countedFailure);
  });

  it("counts a container stopped or vanished with no platform stop recorded as a failure", () => {
    expect(throughLesson({ end: "container-ended" })).toEqual(countedFailure);
  });

  it("counts the check that ran a fork bomb and not the next check whose start is refused", () => {
    expect(classifyResult({ end: "timeout-kill" })).toEqual({
      status: "timeout",
      isFormatError: false,
      rawError: null,
    });
    expect(throughLesson({ end: "timeout-kill" })).toEqual(countedFailure);
    expect(throughLesson({ end: "exit", exitCode: 137 })).toEqual(countedFailure);
    expect(classifyResult({ end: "not-started", stage: "exec-start" })).toEqual({
      status: "error",
      isFormatError: false,
      rawError: "pre-start: exec-start",
    });
    expect(throughLesson({ end: "not-started", stage: "exec-start" })).toEqual(uncounted);
  });

  it("counts a service stream that ended after the start without an end as a failure", () => {
    expect(classifyResult({ end: "no-result" })).toEqual(failedResult);
    expect(throughLesson({ end: "no-result" })).toEqual(countedFailure);
  });

  it("maps every pre-start stage to an uncounted error naming the stage", () => {
    for (const stage of PRE_START_STAGES) {
      expect(classifyResult({ end: "not-started", stage })).toEqual({
        status: "error",
        isFormatError: false,
        rawError: `pre-start: ${stage}`,
      });
      expect(throughLesson({ end: "not-started", stage })).toEqual(uncounted);
    }
  });

  it("maps every platform-issued stop to an uncounted error naming the reason", () => {
    for (const reason of PLATFORM_STOP_REASONS) {
      expect(classifyResult({ end: "platform-stop", reason })).toEqual({
        status: "error",
        isFormatError: false,
        rawError: `platform-stop: ${reason}`,
      });
      expect(throughLesson({ end: "platform-stop", reason })).toEqual(uncounted);
    }
  });

  it("gives no rawError to any result that is not an error", () => {
    const ends: GraderEnd[] = [
      { end: "exit", exitCode: 0 },
      { end: "exit", exitCode: 3 },
      { end: "exit", exitCode: 2 },
      { end: "signal", signal: "SIGSEGV" },
      { end: "timeout-kill" },
      { end: "container-ended" },
      { end: "no-result" },
    ];

    for (const end of ends) {
      expect(classifyResult(end).rawError).toBeNull();
    }
  });
});
