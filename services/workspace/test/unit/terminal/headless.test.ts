import { SerializeAddon } from "@xterm/addon-serialize";
import xtermHeadless from "@xterm/headless";
import { describe, expect, it } from "vitest";
import { createHeadlessScreen } from "../../../src/terminal/session.js";

// U-headless-real (design 10.1) and the RIS premise of A5-N5, on the real @xterm/headless 6.0.0, imported in
// the form the service uses (CommonJS default import, then destructure).

const { Terminal } = xtermHeadless;

function written(write: (data: string, callback: () => void) => void, data: string): Promise<void> {
  return new Promise((resolve) => write(data, resolve));
}

describe("headless screen (U-headless-real)", () => {
  it("serializes what was written", async () => {
    const screen = createHeadlessScreen({ cols: 80, rows: 24, scrollback: 1000 });

    await written(screen.write, "abc\r\n");
    const serialized = screen.serialize();
    screen.dispose();

    expect(serialized).toContain("abc");
  });

  it("cannot serialize without allowProposedApi, which is why the screen sets it", () => {
    const terminal = new Terminal({ cols: 80, rows: 24 });
    const serializer = new SerializeAddon();
    terminal.loadAddon(serializer);

    expect(() => serializer.serialize()).toThrow();
    terminal.dispose();
  });

  it("RIS written in band resets a sequence cut in the middle (A5-N5)", async () => {
    const terminal = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
    const write = (data: string, callback: () => void): void => terminal.write(data, callback);

    await written(write, "\x1b]0;abc");
    await written(write, "\x1bc");
    await written(write, "xyz");
    const firstLine = terminal.buffer.active.getLine(0)?.translateToString(true);
    terminal.dispose();

    expect(firstLine).toBe("xyz");
  });
});
