// @vitest-environment node
import { describe, expect, it } from "vitest";
import { StoredFactError } from "./facts";

const ROW = "attempt A1, element 2";
const COLUMN = "attempts.included_check_kinds";

function messageFor(value: unknown): string {
  return new StoredFactError(ROW, COLUMN, value).message;
}

describe("StoredFactError", () => {
  it("quotes a stored string", () => {
    const error = new StoredFactError(ROW, COLUMN, "essay");

    expect(error.message).toBe(
      'attempts.included_check_kinds of attempt A1, element 2 holds "essay", which is not a known check kind',
    );
    expect(error.name).toBe("StoredFactError");
  });

  it("escapes a quote and a newline in a stored string, keeping the message on one line", () => {
    const message = messageFor('a"b\nc');

    expect(message).toBe(
      'attempts.included_check_kinds of attempt A1, element 2 holds "a\\"b\\nc", which is not a known check kind',
    );
    expect(message).not.toContain("\n");
  });

  it("shows a stored NULL as null", () => {
    expect(messageFor(null)).toBe(
      "attempts.included_check_kinds of attempt A1, element 2 holds null, which is not a known check kind",
    );
  });

  it("shows a nested array as JSON", () => {
    const nested = ["command"];

    const error = new StoredFactError(ROW, COLUMN, nested);

    expect(error.message).toBe(
      'attempts.included_check_kinds of attempt A1, element 2 holds ["command"], which is not a known check kind',
    );
    expect(error.value).toBe(nested);
  });

  it('says no value for a missing kind, distinct from a stored "<missing>"', () => {
    const missing = messageFor(undefined);
    const storedLiteral = messageFor("<missing>");

    expect(missing).toBe(
      "attempts.included_check_kinds of attempt A1, element 2 holds no value, which is not a known check kind",
    );
    expect(storedLiteral).toBe(
      'attempts.included_check_kinds of attempt A1, element 2 holds "<missing>", which is not a known check kind',
    );
    expect(missing).not.toEqual(storedLiteral);
  });

  it("names a non-JSON value by its type", () => {
    expect(messageFor(10n)).toBe(
      "attempts.included_check_kinds of attempt A1, element 2 holds a value of type bigint, which is not a known check kind",
    );
  });

  it("names an array JSON cannot show instead of throwing", () => {
    expect(messageFor([1n])).toBe(
      "attempts.included_check_kinds of attempt A1, element 2 holds an array JSON cannot show, which is not a known check kind",
    );
  });
});
