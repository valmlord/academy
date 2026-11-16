// @vitest-environment node
import type { AttemptStatus, CheckResultStatus, LessonProgressStatus } from "@academy/db";
import type { Check } from "@academy/lesson-schema/schema";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type AttemptSpec,
  type ClosureSpec,
  checkOfKind,
  lessonFacts,
  type ResultSpec,
} from "@/test/progress-facts";
import {
  composeRun,
  evaluateLesson,
  type LessonEvaluation,
  type LessonFacts,
  type LessonOutcome,
  nextStoredStatus,
} from "./rules";
import type { CheckKind } from "./shipped-kinds";

// Properties P1-P12 of the #101 design (4.4) over arbitrary lessons and stored facts: checks of every
// kind with optional limits, result sequences with format errors, errors, timeouts, passes, kind
// changes and missing rows, closures of any kind, a running last attempt, and a shipped
// token-spending check that has passed.

const KINDS: readonly CheckKind[] = ["quiz", "command", "rubric", "hidden-task", "bug-hunt"];
const RESULT_STATUSES: readonly CheckResultStatus[] = ["passed", "failed", "timeout", "error"];
const FINAL_ATTEMPT_STATUSES: readonly Exclude<AttemptStatus, "running">[] = [
  "passed",
  "failed",
  "error",
];
// Ids past the lesson's checks stand for renamed or removed checks.
const CHECK_ID_SLOTS = 6;

interface CheckGen {
  kind: CheckKind;
  limit: number | undefined;
}

/** A result row, or (isPresent false) an included check without a row. */
interface EntryGen {
  slot: number;
  /** null: the check's current kind; otherwise this kind, which may differ from it. */
  kind: CheckKind | null;
  status: CheckResultStatus;
  isFormatError: boolean;
  isBudgetExhausted: boolean;
  isPresent: boolean;
}

interface AttemptGen {
  status: Exclude<AttemptStatus, "running">;
  entries: EntryGen[];
}

interface ClosureGen {
  slot: number;
  kind: CheckKind | null;
}

interface Scenario {
  checks: CheckGen[];
  shippedKinds: CheckKind[];
  attempts: AttemptGen[];
  isLastRunning: boolean;
  closures: ClosureGen[];
}

const kindArb = fc.constantFrom(...KINDS);
const currentOrAnyKind = fc.oneof(
  { weight: 3, arbitrary: fc.constant(null) },
  { weight: 1, arbitrary: kindArb },
);

function entryArb(statuses: readonly CheckResultStatus[], missingWeight: number) {
  return fc.record({
    slot: fc.integer({ min: 0, max: CHECK_ID_SLOTS - 1 }),
    kind: currentOrAnyKind,
    status: fc.constantFrom(...statuses),
    isFormatError: fc.boolean(),
    isBudgetExhausted: fc.boolean(),
    isPresent: fc.oneof(
      { weight: 6, arbitrary: fc.constant(true) },
      { weight: missingWeight, arbitrary: fc.constant(false) },
    ),
  });
}

function attemptArb(statuses: readonly CheckResultStatus[] = RESULT_STATUSES, missingWeight = 1) {
  return fc.record({
    status: fc.constantFrom(...FINAL_ATTEMPT_STATUSES),
    entries: fc.uniqueArray(entryArb(statuses, missingWeight), {
      minLength: 1,
      maxLength: 4,
      selector: (entry) => entry.slot,
    }),
  });
}

const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  checks: fc.array(
    fc.record({
      kind: fc.oneof(
        { weight: 3, arbitrary: fc.constant("command" as const) },
        { weight: 2, arbitrary: kindArb },
      ),
      limit: fc.option(fc.integer({ min: 1, max: 4 }), { nil: undefined }),
    }),
    { maxLength: 4 },
  ),
  shippedKinds: fc.oneof(
    { weight: 2, arbitrary: fc.constant<CheckKind[]>(["command"]) },
    { weight: 1, arbitrary: fc.subarray([...KINDS]) },
  ),
  attempts: fc.array(attemptArb(), { maxLength: 12 }),
  isLastRunning: fc.boolean(),
  closures: fc.array(
    fc.record({ slot: fc.integer({ min: 0, max: CHECK_ID_SLOTS - 1 }), kind: currentOrAnyKind }),
    { maxLength: 3 },
  ),
});

function slotId(slot: number): string {
  return `c${slot}`;
}

function lessonChecks(scenario: Scenario): Check[] {
  return scenario.checks.map((check, slot) =>
    checkOfKind(
      check.kind,
      slotId(slot),
      check.limit === undefined ? undefined : { limit: check.limit },
    ),
  );
}

function kindAt(scenario: Scenario, slot: number, kind: CheckKind | null): CheckKind {
  return kind ?? scenario.checks[slot]?.kind ?? "command";
}

/** The facts of a scenario, with the row constraints of check_results respected. */
function toAttempts(scenario: Scenario): AttemptSpec[] {
  return scenario.attempts.map((attempt, index) => {
    const isRunning = scenario.isLastRunning && index === scenario.attempts.length - 1;
    const results: ResultSpec[] = [];
    const missing: { checkId: string; checkKind: CheckKind }[] = [];
    for (const entry of attempt.entries) {
      const checkKind = kindAt(scenario, entry.slot, entry.kind);
      if (!entry.isPresent) {
        missing.push({ checkId: slotId(entry.slot), checkKind });
        continue;
      }
      const isFormatError = entry.status === "failed" && entry.isFormatError;
      results.push({
        checkId: slotId(entry.slot),
        kind: checkKind,
        status: entry.status,
        isFormatError,
        isBudgetExhausted:
          entry.status === "failed" &&
          checkKind === "hidden-task" &&
          !isFormatError &&
          entry.isBudgetExhausted,
        rawError: entry.status === "error" ? "pre-start: exec-start" : null,
      });
    }
    return { status: isRunning ? "running" : attempt.status, results, missing };
  });
}

function closuresOf(scenario: Scenario): ClosureSpec[] {
  const seen = new Set<string>();
  const closures: ClosureSpec[] = [];
  for (const closure of scenario.closures) {
    const checkKind = kindAt(scenario, closure.slot, closure.kind);
    const key = `${closure.slot}/${checkKind}`;
    if (!seen.has(key)) {
      seen.add(key);
      closures.push({ checkId: slotId(closure.slot), checkKind });
    }
  }
  return closures;
}

function factsOf(scenario: Scenario): LessonFacts {
  return lessonFacts(lessonChecks(scenario), toAttempts(scenario), {
    shippedKinds: new Set(scenario.shippedKinds),
    closures: closuresOf(scenario),
  });
}

function evaluateScenario(scenario: Scenario): LessonEvaluation {
  return evaluateLesson(factsOf(scenario));
}

/** The scenario with attempts appended after its own; a running last attempt stays the last one run. */
function appended(scenario: Scenario, extra: AttemptGen[]): Scenario {
  return { ...scenario, attempts: [...scenario.attempts, ...extra], isLastRunning: false };
}

function withoutRunning(scenario: Scenario): Scenario {
  return { ...scenario, isLastRunning: false };
}

// Restates the token-spending kinds of shipped-kinds.ts on purpose: an oracle read from
// CHECK_KIND_TRAITS would change together with a changed trait and never disagree with it. A changed
// trait of a kind in KINDS turns P6 red. P6 draws kinds only from KINDS, so a new kind is checked
// only once it is added there, and to this set if it spends tokens.
const TOKEN_SPENDING_KINDS: ReadonlySet<CheckKind> = new Set<CheckKind>(["rubric", "hidden-task"]);

// scenarioArb alone yields a counted, passed, open token-spending check in 1.235% of scenarios (20000
// samples at seed 42, #148 research), about a 71% chance per 100-run property, so P6 also draws from
// this generator: it appends such a check and a final attempt that passes it to any scenario.
const tokenPassedScenarioArb: fc.Arbitrary<Scenario> = fc
  .tuple(scenarioArb, fc.constantFrom(...TOKEN_SPENDING_KINDS))
  .map(([scenario, kind]) => {
    const pass: AttemptGen = {
      status: "passed",
      entries: [
        {
          slot: scenario.checks.length,
          kind: null,
          status: "passed",
          isFormatError: false,
          isBudgetExhausted: false,
          isPresent: true,
        },
      ],
    };
    return appended(
      {
        ...scenario,
        checks: [...scenario.checks, { kind, limit: undefined }],
        shippedKinds: [...new Set([...scenario.shippedKinds, kind])],
      },
      [pass],
    );
  });

const NON_PASSING: readonly CheckResultStatus[] = ["failed", "timeout", "error"];

describe("rules properties", () => {
  it("P1 never derives passed while a counted check is closed", () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const evaluation = evaluateScenario(scenario);

        const hasClosedCounted = evaluation.checks.some(
          (check) => check.isCounted && check.isClosed,
        );
        expect(hasClosedCounted && evaluation.derivedOutcome === "passed").toBe(false);
      }),
    );
  });

  it("P2 leaves a check's failed count unchanged by non-passing results after its first pass", () => {
    fc.assert(
      fc.property(
        scenarioArb,
        fc.array(attemptArb(NON_PASSING), { maxLength: 4 }),
        (scenario, extra) => {
          const before = evaluateScenario(withoutRunning(scenario));
          const after = evaluateScenario(appended(scenario, extra));

          before.checks.forEach((check, index) => {
            if (check.hasPassed) {
              expect(after.checks[index]?.failedCount).toBe(check.failedCount);
            }
          });
        },
      ),
    );
  });

  it("P3 keeps a closure of the current kind final when non-passing results follow or the limit is raised", () => {
    fc.assert(
      fc.property(
        scenarioArb,
        fc.array(attemptArb(NON_PASSING), { maxLength: 4 }),
        fc.integer({ min: 0, max: 5 }),
        (scenario, extra, raise) => {
          const closedEverywhere: Scenario = {
            ...withoutRunning(scenario),
            closures: scenario.checks.map((_, slot) => ({ slot, kind: null })),
          };
          const before = evaluateScenario(closedEverywhere);
          // A closed check is never run (rule 5), so no pass can follow its closure.
          const raised: Scenario = {
            ...appended(closedEverywhere, extra),
            checks: closedEverywhere.checks.map((check) => ({
              ...check,
              limit: raise === 0 || check.limit === undefined ? undefined : check.limit + raise,
            })),
          };
          const after = evaluateScenario(raised);

          before.checks.forEach((check, index) => {
            if (!check.hasPassed) {
              expect(check.isClosed).toBe(true);
              expect(after.checks[index]?.isClosed).toBe(true);
            }
          });
        },
      ),
    );
  });

  it("P3 never closes a check through a closure of another kind alone", () => {
    fc.assert(
      fc.property(scenarioArb, kindArb, (scenario, otherKind) => {
        const unlimited: Scenario = {
          ...scenario,
          checks: scenario.checks.map((check) => ({ ...check, limit: undefined })),
          closures: scenario.checks
            .map((check, slot) => ({ slot, kind: otherKind, current: check.kind }))
            .filter((closure) => closure.kind !== closure.current)
            .map(({ slot, kind }) => ({ slot, kind })),
        };

        const evaluation = evaluateScenario(unlimited);

        for (const check of evaluation.checks) {
          expect(check.isClosed).toBe(false);
        }
      }),
    );
  });

  it("P4 never changes a failed count by appending format errors or error results", () => {
    const formatOrError = fc.record({
      status: fc.constantFrom(...FINAL_ATTEMPT_STATUSES),
      entries: fc.uniqueArray(
        fc.record({
          slot: fc.integer({ min: 0, max: CHECK_ID_SLOTS - 1 }),
          kind: currentOrAnyKind,
          status: fc.constantFrom<CheckResultStatus>("failed", "error"),
          isFormatError: fc.constant(true),
          isBudgetExhausted: fc.constant(false),
          isPresent: fc.constant(true),
        }),
        { minLength: 1, maxLength: 4, selector: (entry) => entry.slot },
      ),
    });
    fc.assert(
      fc.property(scenarioArb, fc.array(formatOrError, { maxLength: 4 }), (scenario, extra) => {
        const before = evaluateScenario(withoutRunning(scenario));
        const after = evaluateScenario(appended(scenario, extra));

        expect(after.checks.map((check) => check.failedCount)).toEqual(
          before.checks.map((check) => check.failedCount),
        );
      }),
    );
  });

  it("P5 never decreases a failed count as results are appended", () => {
    fc.assert(
      fc.property(scenarioArb, fc.array(attemptArb(), { maxLength: 4 }), (scenario, extra) => {
        const before = evaluateScenario(withoutRunning(scenario));
        const after = evaluateScenario(appended(scenario, extra));

        before.checks.forEach((check, index) => {
          expect(after.checks[index]?.failedCount).toBeGreaterThanOrEqual(check.failedCount);
        });
      }),
    );
  });

  it("P6 puts only counted open checks in the next run, re-runs a passed check unless it spends tokens, and refuses an empty run", () => {
    fc.assert(
      fc.property(fc.oneof(scenarioArb, tokenPassedScenarioArb), (scenario) => {
        const evaluation = evaluateScenario(scenario);

        for (const check of evaluation.checks) {
          const isTokenSpending = TOKEN_SPENDING_KINDS.has(check.kind);
          expect(check.spendsTokens).toBe(isTokenSpending);
          if (check.isInNextRun) {
            expect(check.isCounted).toBe(true);
            expect(check.isClosed).toBe(false);
            expect(scenario.shippedKinds).toContain(check.kind);
            expect(isTokenSpending && check.hasPassed).toBe(false);
          }
          if (check.isCounted && !check.isClosed && check.hasPassed && !isTokenSpending) {
            expect(check.isInNextRun).toBe(true);
          }
        }
        const isRefused = composeRun(evaluation).kind === "refused";
        expect(isRefused).toBe(!evaluation.checks.some((check) => check.isInNextRun));
      }),
    );
  });

  it("P7 derives not-passed only with a closed check and no open one, and passed only with every counted check passed", () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const evaluation = evaluateScenario(scenario);
        const hasOpen = evaluation.checks.some(
          (check) => check.isCounted && !check.hasPassed && !check.isClosed,
        );

        if (evaluation.derivedOutcome === "not-passed") {
          expect(evaluation.closedCount).toBeGreaterThanOrEqual(1);
          expect(hasOpen).toBe(false);
        }
        if (evaluation.derivedOutcome === "passed") {
          expect(evaluation.passedCount).toBe(evaluation.countedCount);
          expect(evaluation.countedCount).toBeGreaterThanOrEqual(1);
        }
      }),
    );
  });

  it("P8 never turns hasPassed false as results are appended", () => {
    fc.assert(
      fc.property(scenarioArb, fc.array(attemptArb(), { maxLength: 4 }), (scenario, extra) => {
        const before = evaluateScenario(withoutRunning(scenario));
        const after = evaluateScenario(appended(scenario, extra));

        before.checks.forEach((check, index) => {
          if (check.hasPassed) {
            expect(after.checks[index]?.hasPassed).toBe(true);
          }
        });
      }),
    );
  });

  it("P9 keeps completed, and stores completed only from completed or a derived pass", () => {
    const stored = fc.constantFrom<LessonProgressStatus>("in-progress", "completed", "not-passed");
    const derived = fc.constantFrom<Exclude<LessonOutcome, "not-started">>(
      "in-progress",
      "passed",
      "not-passed",
    );
    fc.assert(
      fc.property(stored, derived, (current, outcome) => {
        const next = nextStoredStatus(current, outcome);

        expect(nextStoredStatus("completed", outcome)).toBe("completed");
        expect(next === "completed").toBe(current === "completed" || outcome === "passed");
      }),
    );
  });

  it("P10 never reports a passed check as closed", () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        for (const check of evaluateScenario(scenario).checks) {
          expect(check.hasPassed && check.isClosed).toBe(false);
        }
      }),
    );
  });

  it("P11 bounds lastAttemptCount by the open counted checks", () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const evaluation = evaluateScenario(scenario);

        expect(evaluation.lastAttemptCount).toBeLessThanOrEqual(
          evaluation.countedCount - evaluation.passedCount - evaluation.closedCount,
        );
      }),
    );
  });

  it("P12 keeps every result's isCounted when later results are appended", () => {
    fc.assert(
      fc.property(scenarioArb, fc.array(attemptArb(), { maxLength: 4 }), (scenario, extra) => {
        const before = evaluateScenario(withoutRunning(scenario));
        const after = evaluateScenario(appended(scenario, extra));

        const keys = resultKeys(before);
        expect(countedByKey(after, keys)).toEqual(countedByKey(before, keys));
      }),
    );
  });

  it("P12 keeps every stored result's isCounted when its attempt leaves running", () => {
    fc.assert(
      fc.property(
        scenarioArb.filter((scenario) => scenario.attempts.length > 0),
        (scenario) => {
          const running = evaluateScenario({ ...scenario, isLastRunning: true });
          const finished = evaluateScenario({ ...scenario, isLastRunning: false });

          // Keyed by the stored rows, so a row one evaluation leaves out shows up as absent.
          const keys = new Set(
            factsOf(scenario).results.map((result) => `${result.attemptId}/${result.checkId}`),
          );
          expect(countedByKey(finished, keys)).toEqual(countedByKey(running, keys));
        },
      ),
    );
  });
});

function resultKeys(evaluation: LessonEvaluation): Set<string> {
  return new Set(evaluation.results.map((result) => `${result.attemptId}/${result.checkId}`));
}

/** isCounted of each keyed result of `evaluation`, or "absent" when it lists no such result. */
function countedByKey(
  evaluation: LessonEvaluation,
  keys: ReadonlySet<string>,
): Map<string, boolean | "absent"> {
  const counted = new Map(
    evaluation.results.map((result): [string, boolean] => [
      `${result.attemptId}/${result.checkId}`,
      result.isCounted,
    ]),
  );
  return new Map([...keys].map((key) => [key, counted.get(key) ?? "absent"]));
}
