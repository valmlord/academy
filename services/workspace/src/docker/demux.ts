// The parser of a non-TTY exec's attach stream for a check (design 8). Not docker-modem's demuxStream, which
// switches to raw passthrough on a bad header (stderr would then reach the message) and buffers whole frames:
// this one is fed chunk by chunk, holds at most one header, a marker prefix and the capped stdout, and stops at
// the first framing error.

/** The line the check's setup prints right before it starts the run: "started" means these bytes, not HTTP 200. */
export const CHECK_MARKER = Buffer.from("academy-check-started\n");

/**
 * Stdout kept after the marker. Far above any learner message (graders cap their problem lists), while it
 * bounds one line of the check stream and the caller's memory; the rest is counted and dropped, and reading
 * goes on, so the grader never blocks on a full pipe.
 */
export const CHECK_STDOUT_CAPTURE_BYTES = 64 * 1024;

const STDOUT_FRAME = 1;
const STDERR_FRAME = 2;
/** Docker's frame header: the stream type, three bytes of padding, the payload length as uint32 big-endian. */
const HEADER_BYTES = 8;
const LENGTH_OFFSET = 4;

/** Whether the stdout bytes received before the marker are still a prefix of it. */
export function matchesMarker(received: Buffer): boolean {
  return received.equals(CHECK_MARKER.subarray(0, received.length));
}

/** How the stream ended: at a frame boundary, or broken (a bad header type, or an end inside a frame). */
export type DemuxEnd = "eof" | "framing";

/**
 * Whether the setup reached the run. Anything but `started` means the run never began; the bytes that were
 * not the marker (Docker's own text when the process could not start) are dropped, never stored.
 */
export type DemuxSetup = "started" | "marker-mismatch" | "ended-before-marker" | "framing";

export interface DemuxListener {
  /** Called once, when the setup outcome is known. */
  onSetup?(setup: DemuxSetup): void;
  /** Called once, at the first framing error; every later byte is ignored. */
  onFraming?(): void;
}

export class CheckStreamDemuxer {
  readonly #listener: DemuxListener;
  readonly #header = Buffer.alloc(HEADER_BYTES);
  #headerLength = 0;
  #frameType = STDOUT_FRAME;
  #payloadLeft = 0;
  #markerPrefix = Buffer.alloc(0);
  #setup: DemuxSetup | null = null;
  #end: DemuxEnd | null = null;
  readonly #kept: Buffer[] = [];
  #keptBytes = 0;
  #droppedBytes = 0;

  constructor(listener: DemuxListener = {}) {
    this.#listener = listener;
  }

  /** `null` until the marker, a mismatch, a framing error or the end decides it. */
  get setup(): DemuxSetup | null {
    return this.#setup;
  }

  push(chunk: Buffer): void {
    let offset = 0;
    while (this.#end === null && offset < chunk.length) {
      if (this.#payloadLeft === 0) {
        offset += this.#readHeader(chunk, offset);
        continue;
      }
      const take = Math.min(this.#payloadLeft, chunk.length - offset);
      const payload = chunk.subarray(offset, offset + take);
      offset += take;
      this.#payloadLeft -= take;
      if (this.#frameType === STDOUT_FRAME) this.#onStdout(payload);
    }
  }

  /** The stream ended; a stream that ends inside a header or a payload is a framing error. */
  end(): DemuxEnd {
    if (this.#end !== null) return this.#end;
    if (this.#headerLength > 0 || this.#payloadLeft > 0) {
      this.#failFraming();
      return "framing";
    }
    this.#end = "eof";
    if (this.#setup === null) this.#decideSetup("ended-before-marker");
    return this.#end;
  }

  stdout(): { text: string; truncated: boolean } {
    return {
      text: Buffer.concat(this.#kept).toString("utf8"),
      truncated: this.#droppedBytes > 0,
    };
  }

  /** Copies header bytes from `chunk`; returns how many it took. */
  #readHeader(chunk: Buffer, offset: number): number {
    const take = Math.min(HEADER_BYTES - this.#headerLength, chunk.length - offset);
    chunk.copy(this.#header, this.#headerLength, offset, offset + take);
    this.#headerLength += take;
    if (this.#headerLength < HEADER_BYTES) return take;
    this.#headerLength = 0;
    const type = this.#header.readUInt8(0);
    if (type !== STDOUT_FRAME && type !== STDERR_FRAME) {
      this.#failFraming();
      return take;
    }
    this.#frameType = type;
    this.#payloadLeft = this.#header.readUInt32BE(LENGTH_OFFSET);
    return take;
  }

  #onStdout(payload: Buffer): void {
    let rest = payload;
    if (this.#setup === null) {
      const needed = CHECK_MARKER.length - this.#markerPrefix.length;
      const head = rest.subarray(0, needed);
      this.#markerPrefix = Buffer.concat([this.#markerPrefix, head]);
      if (!matchesMarker(this.#markerPrefix)) {
        this.#markerPrefix = Buffer.alloc(0);
        this.#decideSetup("marker-mismatch");
        return;
      }
      if (this.#markerPrefix.length < CHECK_MARKER.length) return;
      this.#decideSetup("started");
      rest = rest.subarray(head.length);
    }
    if (this.#setup === "started") this.#capture(rest);
  }

  #capture(bytes: Buffer): void {
    const room = CHECK_STDOUT_CAPTURE_BYTES - this.#keptBytes;
    const kept = bytes.subarray(0, Math.max(room, 0));
    // A copy, so a large chunk the slice came from is not held alive by it.
    if (kept.length > 0) this.#kept.push(Buffer.from(kept));
    this.#keptBytes += kept.length;
    this.#droppedBytes += bytes.length - kept.length;
  }

  #decideSetup(setup: DemuxSetup): void {
    this.#setup = setup;
    this.#listener.onSetup?.(setup);
  }

  #failFraming(): void {
    this.#end = "framing";
    if (this.#setup === null) this.#decideSetup("framing");
    this.#listener.onFraming?.();
  }
}
