// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { StandaloneConfigError } from "./config-file.ts";
import { NextServerShapeError } from "./next-shape.ts";
import { CONFIG_MISSING, NEXT_NOT_FUNCTION } from "./strings.ts";

// main.ts starts the server when it is loaded; here the start it calls on load does nothing, and each test
// calls main() with its own start.
vi.mock("./app.ts", () => ({ start: async () => {} }));

const { main } = await import("./main.ts");

// U-main (#32 design 3.1 step 1, 3.8 F1).

async function run(start: () => Promise<void>) {
  const logError = vi.fn((_line: string) => {});
  const exit = vi.fn((_code: number) => {});
  await main({ start, logError, exit });
  return { lines: logError.mock.calls.map(([line]) => line), exit };
}

describe("main (U-main)", () => {
  it("prints F1 with the F2 message and exits 1 when the build config is missing", async () => {
    const { lines, exit } = await run(async () => {
      throw new StandaloneConfigError(CONFIG_MISSING);
    });

    expect(lines).toEqual([
      "web: startup failed: StandaloneConfigError: .next/required-server-files.json missing",
    ]);
    expect(exit.mock.calls).toEqual([[1]]);
  });

  it("prints the F3 message of a NextServerShapeError", async () => {
    const { lines } = await run(async () => {
      throw new NextServerShapeError(NEXT_NOT_FUNCTION);
    });

    expect(lines).toEqual([
      "web: startup failed: NextServerShapeError: next export is not a function",
    ]);
  });

  it("prints the name and 'unexpected' for any other error, never its message", async () => {
    const { lines, exit } = await run(async () => {
      throw new RangeError("canary /app/apps/web/.env?secret=t32");
    });

    expect(lines).toEqual(["web: startup failed: RangeError: unexpected"]);
    expect(exit.mock.calls).toEqual([[1]]);
  });

  it("names a rejection that is not an Error NonError, never stringifying it", async () => {
    const { lines } = await run(() => Promise.reject("t32-canary"));

    expect(lines).toEqual(["web: startup failed: NonError: unexpected"]);
  });

  it("prints nothing and does not exit when the server starts", async () => {
    const { lines, exit } = await run(async () => {});

    expect(lines).toEqual([]);
    expect(exit).not.toHaveBeenCalled();
  });
});
