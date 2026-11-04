import { describe, expect, it } from "vitest";
import { exitReasonOf } from "../../src/runtime.js";

// U-exit-reason (design 12.1): the memory-limit rule of 4.1 as a case table, independent of whether the engine
// at hand ever sets `OOMKilled` for a non-init victim (I-oom can only go red on one that does).

describe("exitReasonOf", () => {
  it.each([
    { oomKilled: true, exitCode: 137, reason: "memory-limit" },
    { oomKilled: false, exitCode: 137, reason: "exited" },
    { oomKilled: true, exitCode: 143, reason: "exited" },
    { oomKilled: false, exitCode: 143, reason: "exited" },
    { oomKilled: true, exitCode: 0, reason: "exited" },
  ])(
    "maps OOMKilled=$oomKilled with exit code $exitCode to $reason",
    ({ oomKilled, exitCode, reason }) => {
      const result = exitReasonOf(oomKilled, exitCode);

      expect(result).toBe(reason);
    },
  );
});
