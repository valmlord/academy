import type { Duplex } from "node:stream";
import type { CheckSlot, Labels, WorkspaceKey } from "./identity.js";

// The port between the manager and whatever runs workspaces (design 4.8, ADR-0002's adapter promise). The
// manager's rules are tested against an in-memory fake; `DockerRuntime` is the one real adapter.

/** What the manager knows when it asks for a workspace; the runtime derives names, labels and limits. */
export interface WorkspaceSpec {
  key: WorkspaceKey;
  image: string;
  /** Both relative to the course root, as the course reader returned them. */
  starter: { lessonDir: string; relPath: string };
}

/** What an ensure did: made the container, started an existing one, or found it running (design 4.1). */
export type EnsureOutcome = "created" | "started" | "running";

export type WorkspaceState = "running" | "stopped";

/** Why a container that has run is stopped: `memory-limit` only for an OOM kill with exit code 137 (4.1). */
export interface WorkspaceExit {
  code: number;
  reason: "memory-limit" | "exited";
}

/** 128 + SIGKILL (9): how a process the OOM killer ended exits. */
const SIGKILL_EXIT_CODE = 137;

/**
 * Both conditions, because Docker may set `OOMKilled` after the OOM killer took a non-init process while the
 * container ran on; a later graceful stop (143) of that container is no memory stop (design 4.1).
 */
export function exitReasonOf(oomKilled: boolean, exitCode: number): WorkspaceExit["reason"] {
  return oomKilled && exitCode === SIGKILL_EXIT_CODE ? "memory-limit" : "exited";
}

/** One workspace from its container and volume. A volume without a container is `stopped` with no image. */
export interface WorkspaceInfo {
  /** The derived workspace id (design 4.2), not a Docker Id. */
  id: string;
  key: WorkspaceKey;
  state: WorkspaceState;
  /** `null` when only the volume exists. */
  containerId: string | null;
  image: string | null;
  /** Set on a stopped container that has run; `null` while running or never started. */
  exit: WorkspaceExit | null;
}

export interface EnsureResult {
  outcome: EnsureOutcome;
  workspace: WorkspaceInfo;
}

/** A managed container of this instance as a list shows it; its labels may not parse (reconcile decides). */
export interface ManagedContainer {
  containerId: string;
  name: string;
  labels: Labels;
  /** Docker's state word: `running`, `created`, `exited`, `dead`, ... */
  state: string;
}

/** A managed volume of this instance; reconcile only reports one without a container, never removes it. */
export interface ManagedVolume {
  name: string;
  labels: Labels;
}

/**
 * The result of a GC primitive (design 5.1): it acted (`done`), the container no longer exists (`gone`), or
 * the fresh inspect showed a state the action does not apply to, so nothing changed (`state-changed`).
 */
export type GcResult = "done" | "gone" | "state-changed";

/** What a terminal shell needs besides the key (design 3.5): `TERMINAL_SHELL` from the config. */
export interface ShellSpec {
  shell: string;
}

/**
 * One running terminal shell (design 3.5): the attached TTY stream in both directions. Destroying the stream
 * releases only the service's side: Docker keeps a TTY exec running after its attach connection closes, so the
 * shell lives on until `terminate` or the container stops.
 */
export interface ShellHandle {
  stream: Duplex;
  /** Rejects with the runtime's classified errors (an ended exec: 404 or 409); callers decide what to ignore. */
  resize(cols: number, rows: number): Promise<void>;
  /** The shell's exit code, `null` while it still runs or when Docker reports none. */
  exitCode(): Promise<number | null>;
  /**
   * Starts a detached exec that sends HUP, then KILL after 2 s, to every process of the shell's session, and resolves
   * once Docker started it; the grace runs in the container. Rejects with the runtime's classified errors.
   */
  terminate(): Promise<void>;
}

/** One command check to start: the caller has read the lesson's checks and holds the key lock. */
export interface CheckStartSpec {
  key: WorkspaceKey;
  /** The lesson's `checks/` as a tar, unpacked by the setup into the slot's checks dir. */
  checksTar: Buffer;
  /** The check's `run` text, handed to `/bin/sh -c` after the setup. */
  run: string;
  slot: CheckSlot;
}

/**
 * Where a check that did not start stopped. `checks-missing` is the caller's, decided before the runtime is
 * called; the runtime rejects with the other three.
 */
export type CheckStage = "checks-missing" | "container-not-running" | "exec-create" | "exec-start";

/** How the attach stream ended: at a frame boundary, broken framing, or a socket that went away. */
export type StreamEnd = "eof" | "framing" | "socket-error";

/** `started` means the setup printed the marker; anything else means the run never began. */
export type SetupOutcome =
  | { kind: "started" }
  | {
      kind: "not-started";
      reason:
        | "marker-mismatch"
        | "ended-before-marker"
        | "framing"
        | "socket-error"
        | "stdin-failed";
    };

/** The exec's exit code, `running` while it runs, `gone` when Docker no longer knows the exec. */
export type ExitStatus = number | "running" | "gone";

/** One started check exec, read through its attach stream and Docker's exec record. */
export interface CheckProcess {
  /** Settles once the marker, a mismatch, the end or a broken stream decides it; never rejects. */
  setup: Promise<SetupOutcome>;
  /** Settles once, with the first of eof, framing and socket-error; never rejects. */
  ended: Promise<StreamEnd>;
  /** Stdout after the marker, capped; Docker's text before it is never kept. */
  stdout(): { text: string; truncated: boolean };
  /** Rejects with the runtime's classified Docker errors, also when Docker reports an ended exec with no code. */
  exitStatus(): Promise<ExitStatus>;
}

export interface WorkspaceRuntime {
  /** Converges to a running workspace (design 6.1); the caller holds the key lock. */
  ensureRunning(spec: WorkspaceSpec): Promise<EnsureResult>;
  /** Stops the container if any; a volume alone is already `stopped` (design 6.2). */
  stop(key: WorkspaceKey): Promise<WorkspaceInfo>;
  /** Removes container and volume; succeeds also when neither exists. */
  remove(key: WorkspaceKey): Promise<void>;
  /** `null` when neither container nor volume exists. */
  inspect(key: WorkspaceKey): Promise<WorkspaceInfo | null>;
  listManaged(): Promise<ManagedContainer[]>;
  listManagedVolumes(): Promise<ManagedVolume[]>;
  /** GC primitives, by Id, under the GC predicate of design 5.1 (not the key predicate). */
  stopContainer(containerId: string): Promise<GcResult>;
  removeContainer(containerId: string): Promise<GcResult>;
  /** Opens a shell in the workspace's running container, after a fresh inspect with the label check. */
  openShell(key: WorkspaceKey, spec: ShellSpec): Promise<ShellHandle>;
  /**
   * Starts one command check in the workspace's running container, as the slot's uid. The caller holds the key
   * lock and has already read the checks. Rejects only with `CheckNotStartedError`, whose stage is
   * `container-not-running`, `exec-create` or `exec-start`.
   */
  startCheck(spec: CheckStartSpec): Promise<CheckProcess>;
}
