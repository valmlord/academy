import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { InvalidVocabularyValueError } from "../../src/errors.js";
import { CHECK_KINDS, inList } from "../../src/vocabulary.js";

const REJECTED_VALUES = ["a'b", "a b", "A", "1a", "", "a-b'); DROP TABLE users; --"];

describe("U3 vocabulary IN-list guard", () => {
  for (const value of REJECTED_VALUES) {
    it(`rejects ${JSON.stringify(value)} and names it`, () => {
      const build = () => inList("t_status_check", [value]);

      expect(build).toThrow(InvalidVocabularyValueError);
      expect(build).toThrow(JSON.stringify(value));
    });
  }

  it("accepts kebab-case values and renders them as a quoted list", () => {
    const fragment = inList("t_status_check", ["hidden-task", "in-progress", "a"]);

    const rendered = new PgDialect().sqlToQuery(fragment).sql;

    expect(rendered).toBe("('hidden-task', 'in-progress', 'a')");
  });
});

describe("check kinds", () => {
  it("derives every check kind from the lesson contract", () => {
    expect(CHECK_KINDS).toEqual(["quiz", "command", "rubric", "hidden-task", "bug-hunt"]);
  });
});
