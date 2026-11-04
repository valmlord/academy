import { describe, expect, it } from "vitest";
import {
  MAX_ACK_BYTES,
  MAX_INPUT_UNITS,
  parseClientMessage,
} from "../../../src/terminal/protocol.js";

// U-protocol (design 10.1): the three client messages of ADR-0011 item 6, and everything else refused.

describe("parseClientMessage (U-protocol)", () => {
  it("parses input, resize and ack", () => {
    expect(parseClientMessage('{"t":"input","d":"ls\\r"}')).toEqual({ t: "input", d: "ls\r" });
    expect(parseClientMessage('{"t":"resize","cols":120,"rows":40}')).toEqual({
      t: "resize",
      cols: 120,
      rows: 40,
    });
    expect(parseClientMessage('{"t":"ack","n":4096}')).toEqual({ t: "ack", n: 4096 });
  });

  it("accepts the bounds of every range", () => {
    expect(
      parseClientMessage(JSON.stringify({ t: "input", d: "x".repeat(MAX_INPUT_UNITS) })),
    ).not.toBeNull();
    expect(parseClientMessage('{"t":"resize","cols":2,"rows":1}')).not.toBeNull();
    expect(parseClientMessage('{"t":"resize","cols":500,"rows":200}')).not.toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "ack", n: 1 }))).not.toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "ack", n: MAX_ACK_BYTES }))).not.toBeNull();
  });

  it.each([
    ["an unknown type", '{"t":"paste","d":"x"}'],
    ["an extra key", '{"t":"input","d":"x","extra":1}'],
    ["empty input", '{"t":"input","d":""}'],
    ["input over 8192 units", JSON.stringify({ t: "input", d: "x".repeat(MAX_INPUT_UNITS + 1) })],
    ["cols below 2", '{"t":"resize","cols":1,"rows":24}'],
    ["cols above 500", '{"t":"resize","cols":501,"rows":24}'],
    ["rows below 1", '{"t":"resize","cols":80,"rows":0}'],
    ["rows above 200", '{"t":"resize","cols":80,"rows":201}'],
    ["non-integer cols", '{"t":"resize","cols":80.5,"rows":24}'],
    ["ack 0", '{"t":"ack","n":0}'],
    ["ack over 16777216", JSON.stringify({ t: "ack", n: MAX_ACK_BYTES + 1 })],
    ["non-JSON", "not json"],
    ["a JSON array", '["input","x"]'],
    ["JSON null", "null"],
  ])("refuses %s", (_name, text) => {
    expect(parseClientMessage(text)).toBeNull();
  });
});
