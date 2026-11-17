import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CHECK_MARKER,
  CheckStreamDemuxer,
  type DemuxEnd,
  type DemuxSetup,
} from "../../../src/docker/demux.js";

const STDOUT = 1;
const STDERR = 2;
const DOCKER_TEXT =
  'OCI runtime exec failed: exec failed: unable to start container process: chdir to cwd ("/nope") set in config.json failed';

function frame(type: number, payload: Buffer | string): Buffer {
  const bytes = typeof payload === "string" ? Buffer.from(payload) : payload;
  const header = Buffer.alloc(8);
  header.writeUInt8(type, 0);
  header.writeUInt32BE(bytes.length, 4);
  return Buffer.concat([header, bytes]);
}

interface Parsed {
  setup: DemuxSetup | null;
  setupCalls: number;
  framingCalls: number;
  end: DemuxEnd;
  stdout: { text: string; truncated: boolean };
}

/** Feeds the chunks in order, then ends the stream, and records what the parser reported. */
function parse(chunks: readonly Buffer[]): Parsed {
  let setupCalls = 0;
  let framingCalls = 0;
  const demuxer = new CheckStreamDemuxer({
    onSetup: () => {
      setupCalls += 1;
    },
    onFraming: () => {
      framingCalls += 1;
    },
  });
  for (const chunk of chunks) demuxer.push(chunk);
  const end = demuxer.end();
  return { setup: demuxer.setup, setupCalls, framingCalls, end, stdout: demuxer.stdout() };
}

/** The same bytes cut at the given offsets. */
function cut(stream: Buffer, offsets: readonly number[]): Buffer[] {
  const points = [...new Set(offsets)].sort((a, b) => a - b);
  const chunks: Buffer[] = [];
  let start = 0;
  for (const point of points) {
    chunks.push(stream.subarray(start, point));
    start = point;
  }
  chunks.push(stream.subarray(start));
  return chunks;
}

describe("CheckStreamDemuxer", () => {
  it("any partition of a valid framed stream into chunks gives the same stdout, setup outcome and end kind", () => {
    const stdoutContent = fc.oneof(
      fc
        .uint8Array({ maxLength: 2000 })
        .map((body) => Buffer.concat([CHECK_MARKER, Buffer.from(body)])),
      fc.uint8Array({ maxLength: 200 }).map((bytes) => Buffer.from(bytes)),
      fc
        .integer({ min: 0, max: CHECK_MARKER.length - 1 })
        .map((length) => CHECK_MARKER.subarray(0, length)),
    );
    const input = stdoutContent.chain((content) =>
      fc.record({
        content: fc.constant(content),
        stdoutCuts: fc.array(fc.integer({ min: 0, max: content.length }), { maxLength: 6 }),
        stderr: fc.array(
          fc.record({
            before: fc.nat(),
            payload: fc.uint8Array({ maxLength: 300 }),
          }),
          { maxLength: 4 },
        ),
        chunkCuts: fc.array(fc.nat(), { maxLength: 30 }),
      }),
    );

    fc.assert(
      fc.property(input, ({ content, stdoutCuts, stderr, chunkCuts }) => {
        const frames = cut(content, stdoutCuts).map((piece) => frame(STDOUT, piece));
        for (const { before, payload } of stderr) {
          frames.splice(before % (frames.length + 1), 0, frame(STDERR, Buffer.from(payload)));
        }
        const stream = Buffer.concat(frames);
        const expected: Parsed = {
          setup: content.subarray(0, CHECK_MARKER.length).equals(CHECK_MARKER)
            ? "started"
            : CHECK_MARKER.subarray(0, content.length).equals(content)
              ? "ended-before-marker"
              : "marker-mismatch",
          setupCalls: 1,
          framingCalls: 0,
          end: "eof",
          stdout: {
            text: content.subarray(0, CHECK_MARKER.length).equals(CHECK_MARKER)
              ? content.subarray(CHECK_MARKER.length).toString("utf8")
              : "",
            truncated: false,
          },
        };

        const whole = parse([stream]);
        const partitioned = parse(
          cut(
            stream,
            chunkCuts.map((offset) => offset % (stream.length + 1)),
          ),
        );

        expect(whole).toEqual(expected);
        expect(partitioned).toEqual(expected);
      }),
      { numRuns: 300 },
    );
  });

  it("stdout frames kept, stderr dropped", () => {
    const parsed = parse([
      frame(STDOUT, CHECK_MARKER),
      frame(STDERR, "warning on stderr\n"),
      frame(STDOUT, "first "),
      frame(STDERR, "more stderr"),
      frame(STDOUT, "second"),
    ]);

    expect(parsed.setup).toBe("started");
    expect(parsed.stdout).toEqual({ text: "first second", truncated: false });
    expect(parsed.end).toBe("eof");
  });

  it("reports a header of type 3 as a framing error, once", () => {
    const typeThree = frame(3, "x");

    const parsed = parse([frame(STDOUT, CHECK_MARKER), typeThree]);

    expect(parsed.end).toBe("framing");
    expect(parsed.framingCalls).toBe(1);
    expect(parsed.setup).toBe("started");
  });

  it("reports a stream that ends inside a header as a framing error", () => {
    const parsed = parse([frame(STDOUT, CHECK_MARKER), frame(STDOUT, "x").subarray(0, 5)]);

    expect(parsed.end).toBe("framing");
    expect(parsed.framingCalls).toBe(1);
  });

  it("reports a stream that ends inside a payload as a framing error", () => {
    const parsed = parse([frame(STDOUT, CHECK_MARKER), frame(STDOUT, "abcdef").subarray(0, 10)]);

    expect(parsed.end).toBe("framing");
    expect(parsed.framingCalls).toBe(1);
  });

  it("reports a clean end at a frame boundary as eof", () => {
    const parsed = parse([frame(STDOUT, CHECK_MARKER), frame(STDOUT, "done\n")]);

    expect(parsed.end).toBe("eof");
    expect(parsed.framingCalls).toBe(0);
  });

  it("after a framing error the parser ignores every later byte", () => {
    const parsed = parse([
      frame(STDOUT, CHECK_MARKER),
      frame(STDOUT, "before"),
      Buffer.concat([frame(3, ""), frame(STDOUT, "after")]),
      frame(STDOUT, "later chunk"),
    ]);

    expect(parsed.stdout).toEqual({ text: "before", truncated: false });
    expect(parsed.framingCalls).toBe(1);
    expect(parsed.end).toBe("framing");
  });

  it("reports a framing error before the marker as a setup that did not start", () => {
    const parsed = parse([frame(STDOUT, CHECK_MARKER.subarray(0, 5)), frame(3, "")]);

    expect(parsed.setup).toBe("framing");
    expect(parsed.setupCalls).toBe(1);
  });

  it("recognises a marker split across frames and chunks", () => {
    const stream = Buffer.concat([
      frame(STDOUT, CHECK_MARKER.subarray(0, 3)),
      frame(STDERR, "noise"),
      frame(STDOUT, CHECK_MARKER.subarray(3, 15)),
      frame(STDOUT, Buffer.concat([CHECK_MARKER.subarray(15), Buffer.from("result")])),
    ]);

    const parsed = parse(cut(stream, [1, 9, 12, 30]));

    expect(parsed.setup).toBe("started");
    expect(parsed.stdout.text).toBe("result");
  });

  it("text before the marker is neither started nor stdout", () => {
    const parsed = parse([frame(STDOUT, DOCKER_TEXT)]);

    expect(parsed.setup).toBe("marker-mismatch");
    expect(parsed.stdout).toEqual({ text: "", truncated: false });
  });

  it("reports ended-before-marker for a stream that ends with part of the marker", () => {
    const parsed = parse([frame(STDOUT, CHECK_MARKER.subarray(0, 10))]);

    expect(parsed.setup).toBe("ended-before-marker");
    expect(parsed.end).toBe("eof");
  });

  it("keeps exactly 65,536 bytes and reports truncated for 70,000 bytes after the marker", () => {
    const parsed = parse([
      frame(STDOUT, CHECK_MARKER),
      frame(STDOUT, "a".repeat(40_000)),
      frame(STDOUT, "b".repeat(30_000)),
    ]);

    expect(Buffer.byteLength(parsed.stdout.text)).toBe(65536);
    expect(parsed.stdout.truncated).toBe(true);
    expect(parsed.stdout.text).toBe("a".repeat(40_000) + "b".repeat(25_536));
    expect(parsed.end).toBe("eof");
  });

  it("decodes invalid UTF-8 to U+FFFD", () => {
    const parsed = parse([
      frame(STDOUT, CHECK_MARKER),
      frame(STDOUT, Buffer.from([0x6f, 0x6b, 0xff, 0x21])),
    ]);

    expect(parsed.stdout.text).toBe("ok�!");
  });
});
