// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readIntegerSetting, START_SLOW_SECONDS } from "./env";

// #32 Delta 2.1: the slow-start threshold web shows is the service's default unless compose passes a value.
describe("readIntegerSetting for ENVIRONMENT_START_SLOW_SECONDS", () => {
  it("gives the service's default of 10 when the variable is unset", () => {
    expect(readIntegerSetting({}, START_SLOW_SECONDS)).toBe(10);
  });

  it("gives 10 for an empty value, which counts as unset", () => {
    expect(readIntegerSetting({ ENVIRONMENT_START_SLOW_SECONDS: "" }, START_SLOW_SECONDS)).toBe(10);
  });

  it("gives the configured value inside the range", () => {
    expect(readIntegerSetting({ ENVIRONMENT_START_SLOW_SECONDS: "7" }, START_SLOW_SECONDS)).toBe(7);
  });
});
