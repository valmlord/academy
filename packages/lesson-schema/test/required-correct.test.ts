import { describe, expect, it } from "vitest";
import { InvalidQuizThresholdInputError, requiredCorrect } from "../src/schema.js";

function thrownBy(call: () => unknown): unknown {
  try {
    call();
  } catch (error: unknown) {
    return error;
  }
  return undefined;
}

describe("requiredCorrect", () => {
  it("returns the smallest count whose share reaches passScore, for every passScore with up to three decimals and up to 100 questions", () => {
    const violations: [number, number, number][] = [];

    for (let thousandths = 0; thousandths <= 1000; thousandths++) {
      // The double a YAML literal with three decimals parses to.
      const passScore = Number((thousandths / 1000).toFixed(3));
      for (let questionCount = 1; questionCount <= 100; questionCount++) {
        const correct = requiredCorrect(passScore, questionCount);
        const isSmallestReachingCount =
          Number.isInteger(correct) &&
          correct >= 0 &&
          correct <= questionCount &&
          correct / questionCount >= passScore &&
          (correct === 0 || (correct - 1) / questionCount < passScore);
        if (!isSmallestReachingCount) violations.push([passScore, questionCount, correct]);
      }
    }

    expect(violations).toEqual([]);
  });

  it("needs 7 of 25 at passScore 0.28, where ceil(0.28 * 25) asks for 8", () => {
    expect(Math.ceil(0.28 * 25)).toBe(8);

    const correct = requiredCorrect(0.28, 25);

    expect(correct).toBe(7);
  });

  it("needs 7 of 10 at passScore 0.7, the example the quiz flow names", () => {
    // ceil(0.7 * 10) is 7 too, so this case does not tell the rule from ceil.
    const correct = requiredCorrect(0.7, 10);

    expect(correct).toBe(7);
  });

  it("needs no correct answer at passScore 0 and every answer at passScore 1", () => {
    const questionCounts = Array.from({ length: 20 }, (_, index) => index + 1);

    const atZero = questionCounts.map((questionCount) => requiredCorrect(0, questionCount));
    const atOne = questionCounts.map((questionCount) => requiredCorrect(1, questionCount));

    expect(atZero).toEqual(questionCounts.map(() => 0));
    expect(atOne).toEqual(questionCounts);
  });

  it.each([0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    "refuses a question count that is not a positive safe integer: %s",
    (questionCount) => {
      const error = thrownBy(() => requiredCorrect(0.8, questionCount));

      expect(error).toBeInstanceOf(InvalidQuizThresholdInputError);
      expect(error).toMatchObject({
        field: "questionCount",
        message: `questionCount must be a positive safe integer, got ${String(questionCount)}`,
      });
    },
  );

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses a passScore outside 0 to 1: %s",
    (passScore) => {
      const error = thrownBy(() => requiredCorrect(passScore, 6));

      expect(error).toBeInstanceOf(InvalidQuizThresholdInputError);
      expect(error).toMatchObject({
        field: "passScore",
        message: `passScore must be a finite number from 0 to 1, got ${String(passScore)}`,
      });
    },
  );
});
