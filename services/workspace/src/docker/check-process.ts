import type { Duplex } from "node:stream";
import { DockerApiError, DockerResponseShapeError } from "../errors.js";
import type { CheckProcess, ExitStatus, SetupOutcome, StreamEnd } from "../runtime.js";
import { CheckStreamDemuxer, type DemuxSetup } from "./demux.js";
import type { DockerEngine } from "./engine.js";

// A started check exec as the runtime port sees it: the setup outcome and the end come from the attach stream,
// the exit status from Docker's exec record.

const NOT_FOUND = 404;

export interface CheckProcessOptions {
  engine: DockerEngine;
  execId: string;
  /** The hijacked attach socket of the exec, just started. */
  socket: Duplex;
  checksTar: Buffer;
}

function setupOutcomeOf(setup: DemuxSetup): SetupOutcome {
  return setup === "started" ? { kind: "started" } : { kind: "not-started", reason: setup };
}

/** Feeds the socket into the demuxer and writes the checks tar to the exec's stdin, closing it after. */
export function openCheckProcess(options: CheckProcessOptions): CheckProcess {
  const { engine, execId, socket, checksTar } = options;
  let resolveSetup: (outcome: SetupOutcome) => void = () => undefined;
  let resolveEnded: (end: StreamEnd) => void = () => undefined;
  const setup = new Promise<SetupOutcome>((resolve) => {
    resolveSetup = resolve;
  });
  const ended = new Promise<StreamEnd>((resolve) => {
    resolveEnded = resolve;
  });
  let isSetupSettled = false;
  let isEndedSettled = false;

  // Several socket events can report one end (a framing error destroys the socket, which then closes); the first
  // one decides, so each promise reports what actually happened first.
  const settleSetup = (outcome: SetupOutcome): void => {
    if (isSetupSettled) return;
    isSetupSettled = true;
    resolveSetup(outcome);
  };
  const settleEnded = (end: StreamEnd): void => {
    if (isEndedSettled) return;
    isEndedSettled = true;
    resolveEnded(end);
  };
  // The only place that settles `framing`: the demuxer ignores every later byte, so nothing more is read either.
  const onFramingError = (): void => {
    socket.destroy();
    settleEnded("framing");
  };
  const demuxer = new CheckStreamDemuxer({
    onSetup: (decided) => settleSetup(setupOutcomeOf(decided)),
    onFraming: onFramingError,
  });
  // An error, or a close with neither an end nor an error before it, settles whatever is still open, so `ended`
  // settles once the socket is gone. Broken before the checks tar was written whole, it is `stdin-failed`: a setup
  // that fails before `tar` ends the exec while the service may still be writing to its stdin.
  const onBrokenStream = (): void => {
    const reason = socket.writableFinished ? "socket-error" : "stdin-failed";
    settleSetup({ kind: "not-started", reason });
    settleEnded("socket-error");
  };

  socket.on("data", (chunk: Buffer) => demuxer.push(chunk));
  // An end inside a frame is reported through onFraming, so only a clean end settles `eof` here.
  socket.on("end", () => {
    if (demuxer.end() === "eof") settleEnded("eof");
  });
  socket.on("error", onBrokenStream);
  socket.on("close", onBrokenStream);
  socket.end(checksTar);

  return {
    setup,
    ended,
    stdout: () => demuxer.stdout(),
    exitStatus: async (): Promise<ExitStatus> => {
      try {
        const exec = await engine.inspectExec(execId);
        if (exec.Running) return "running";
        if (exec.ExitCode === null) throw new DockerResponseShapeError("inspect exec", "ExitCode");
        return exec.ExitCode;
      } catch (error: unknown) {
        if (error instanceof DockerApiError && error.statusCode === NOT_FOUND) return "gone";
        throw error;
      }
    },
  };
}
