import type { Duplex } from "node:stream";
import { DockerApiError, DockerResponseShapeError } from "../errors.js";
import type {
  CheckProcess,
  CleanupKind,
  CleanupResult,
  ExitStatus,
  SetupOutcome,
  StreamEnd,
  TerminateOptions,
} from "../runtime.js";
import { CheckStreamDemuxer, type DemuxSetup } from "./demux.js";
import type { DockerEngine } from "./engine.js";
import { checkCleanupExecCreateBody } from "./spec.js";

// A started check exec as the runtime port sees it: the setup outcome and the end come from the attach stream,
// the exit status from Docker's exec record. `terminate` ends it and cleans up its slot with the cleanup exec.

const NOT_FOUND = 404;
const CONFLICT = 409;

/** Period of the cleanup's exec inspect; the next one is scheduled only after the previous one answered. */
export const CLEANUP_POLL_MS = 250;
/**
 * How long a waiting `terminate` polls after the cleanup's start answered. The script ends within about 4 s
 * (five rounds, four one-second pauses); the rest is margin for a slow daemon. The create and the start themselves
 * are bounded by the engine's inactivity timeout.
 */
export const CHECK_CLEANUP_TIMEOUT_MS = 30_000;

/** The exit codes the cleanup script itself names, and 137 for a SIGKILLed script. */
export const CLEANUP_EXIT_KINDS: ReadonlyMap<number, CleanupKind> = new Map<number, CleanupKind>([
  [0, "clean"],
  [4, "processes-left"],
  [5, "files-left"],
  [6, "no-proc"],
  [7, "processes-and-files-left"],
  [137, "killed"],
]);
/** Docker's codes for an exec it could not start (128 at a full pids limit) or could not invoke or find. */
export const CLEANUP_NOT_STARTED_EXITS: ReadonlySet<number> = new Set([126, 127, 128]);

const CLEANUP_STARTED: CleanupResult = {
  kind: "cleanup-started",
  exitCode: null,
  httpStatus: null,
};
const TIMED_OUT: CleanupResult = { kind: "timed-out", exitCode: null, httpStatus: null };
const DOCKER_ERROR: CleanupResult = { kind: "docker-error", exitCode: null, httpStatus: null };

type CleanupCall = "create" | "start" | "inspect";

/**
 * Per call, the statuses that mean the container is stopped or gone, and the kind of every other status. A stopped
 * container keeps its exec records, so only a removed one makes the inspect 404.
 */
const CLEANUP_CALL_STATUSES: Readonly<
  Record<CleanupCall, { stopped: ReadonlySet<number>; otherKind: CleanupKind }>
> = {
  create: { stopped: new Set([NOT_FOUND, CONFLICT]), otherKind: "docker-error" },
  start: { stopped: new Set([NOT_FOUND, CONFLICT]), otherKind: "not-started" },
  inspect: { stopped: new Set([NOT_FOUND]), otherKind: "docker-error" },
};

/** Status 0 is "no status" at every call, so no result carries `httpStatus: 0`. */
function hasStatus(error: unknown): error is DockerApiError {
  return error instanceof DockerApiError && error.statusCode > 0;
}

function cleanupFailure(call: CleanupCall, error: unknown): CleanupResult {
  if (!hasStatus(error)) return DOCKER_ERROR;
  const { stopped, otherKind } = CLEANUP_CALL_STATUSES[call];
  const kind = stopped.has(error.statusCode) ? "container-stopped" : otherKind;
  return { kind, exitCode: null, httpStatus: error.statusCode };
}

/** An ended exec with no code is Docker's error, as `exitStatus` treats it. */
function resultOfExit(exitCode: number | null): CleanupResult {
  if (exitCode === null) return DOCKER_ERROR;
  const unnamedExitKind = CLEANUP_NOT_STARTED_EXITS.has(exitCode)
    ? "not-started"
    : "unexpected-exit";
  return { kind: CLEANUP_EXIT_KINDS.get(exitCode) ?? unnamedExitKind, exitCode, httpStatus: null };
}

/**
 * Polls the cleanup exec until it ended or the cap fired; never rejects. Both timers are unref'd, so a pending wait
 * never keeps the service process alive; an inspect already in flight still does until Docker answers, and its
 * answer is ignored once the cap resolved.
 */
function waitForCleanupExit(engine: DockerEngine, execId: string): Promise<CleanupResult> {
  return new Promise<CleanupResult>((resolve) => {
    let isFinished = false;
    let pollTimer: NodeJS.Timeout | undefined;
    const capTimer = setTimeout(onCap, CHECK_CLEANUP_TIMEOUT_MS).unref();
    schedulePoll();

    function finish(result: CleanupResult): void {
      if (isFinished) return;
      isFinished = true;
      clearTimeout(capTimer);
      clearTimeout(pollTimer);
      resolve(result);
    }
    function onCap(): void {
      finish(TIMED_OUT);
    }
    function schedulePoll(): void {
      pollTimer = setTimeout(pollOnce, CLEANUP_POLL_MS).unref();
    }
    // The finished check comes after the await only: an inspect that answers after the cap must not poll again.
    async function pollOnce(): Promise<void> {
      let exec: Awaited<ReturnType<DockerEngine["inspectExec"]>>;
      try {
        exec = await engine.inspectExec(execId);
      } catch (error: unknown) {
        finish(cleanupFailure("inspect", error));
        return;
      }
      if (isFinished) return;
      if (exec.Running) {
        schedulePoll();
        return;
      }
      finish(resultOfExit(exec.ExitCode));
    }
  });
}

export interface CheckProcessOptions {
  engine: DockerEngine;
  execId: string;
  /** The hijacked attach socket of the exec, just started. */
  socket: Duplex;
  checksTar: Buffer;
  /** The Id `startCheck` inspected and label-checked; a name could point at a re-created container. */
  containerId: string;
  /** The slot uid, the cleanup's `$1`. */
  uid: number;
}

function setupOutcomeOf(setup: DemuxSetup): SetupOutcome {
  return setup === "started" ? { kind: "started" } : { kind: "not-started", reason: setup };
}

/** Feeds the socket into the demuxer and writes the checks tar to the exec's stdin, closing it after. */
export function openCheckProcess(options: CheckProcessOptions): CheckProcess {
  const { engine, execId, socket, checksTar, containerId, uid } = options;
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

  // Every await is inside a try, so it never rejects; it resolves only after its own create and start answered.
  const runTerminate = async (options: TerminateOptions): Promise<CleanupResult> => {
    socket.destroy();
    let cleanupExecId: string;
    try {
      cleanupExecId = await engine.createExec(containerId, checkCleanupExecCreateBody(uid));
    } catch (error: unknown) {
      return cleanupFailure("create", error);
    }
    try {
      await engine.startDetachedExec(cleanupExecId);
    } catch (error: unknown) {
      return cleanupFailure("start", error);
    }
    if (!options.wait) return CLEANUP_STARTED;
    return waitForCleanupExit(engine, cleanupExecId);
  };
  let terminating: Promise<CleanupResult> | undefined;

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
    isContainerRunning: async (): Promise<boolean> => {
      const container = await engine.inspectContainer(containerId);
      return container !== null && container.State.Running;
    },
    terminate: (options: TerminateOptions): Promise<CleanupResult> => {
      if (terminating !== undefined) return terminating;
      terminating = runTerminate(options);
      return terminating;
    },
  };
}
