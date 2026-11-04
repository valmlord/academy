import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ID,
  shellInput,
  type TerminalSetup,
  terminalSetup,
  waitForAttached,
} from "../../support/terminal.js";

// U-term-log, session part (design 10.1, ADR-0011 item 11): the service logs the workspace id, the close
// code and the connection id, never terminal bytes, input or an error's message. The connection-id check of
// `X-Academy-Conn` itself belongs to the route (step 4).

const INPUT_CANARY = "t32-input-canary";
const OUTPUT_CANARY = "t32-output-canary";
const CAUSE_CANARY = "t32-cause-canary";
const CONN = "0123456789abcdef";

let setup: TerminalSetup | undefined;

afterEach(async () => {
  await setup?.close();
  setup = undefined;
});

describe("terminal logging (U-term-log, session part)", () => {
  it("logs neither input, output nor the cause of a 1011, and names the connection in F5a", async () => {
    setup = await terminalSetup();
    const current = setup;
    const client = await current.connect({ conn: CONN });
    await waitForAttached(client);
    const input = shellInput(current.shell());

    client.send({ t: "input", d: `echo ${INPUT_CANARY}\r` });
    current.shell().peer.write(`${OUTPUT_CANARY}\r\n`);
    await vi.waitFor(() => expect(input()).toContain(INPUT_CANARY));
    await vi.waitFor(() => expect(client.output()).toContain(OUTPUT_CANARY));
    vi.spyOn(current.runtime, "inspect").mockRejectedValueOnce(new Error(CAUSE_CANARY));
    current.shell().peer.end();
    const closed = await client.closed;
    const logText = current.logged.join("\n");

    expect(closed).toEqual({ code: 1011, reason: "terminal error" });
    expect(current.logged).toContain(`terminal ${ID} ${CONN}: ended 1011`);
    for (const canary of [INPUT_CANARY, OUTPUT_CANARY, CAUSE_CANARY]) {
      expect(logText).not.toContain(canary);
      expect(closed.reason).not.toContain(canary);
    }
  });
});
