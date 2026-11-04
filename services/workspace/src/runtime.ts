import type { Labels, WorkspaceKey } from "./identity.js";

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
}
