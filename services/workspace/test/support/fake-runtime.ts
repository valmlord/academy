import { type Duplex, duplexPair } from "node:stream";
import { WorkspaceNotFoundError } from "../../src/errors.js";
import { type WorkspaceKey, workspaceId } from "../../src/identity.js";
import type {
  EnsureResult,
  GcResult,
  ManagedContainer,
  ManagedVolume,
  ShellHandle,
  ShellSpec,
  WorkspaceInfo,
  WorkspaceRuntime,
  WorkspaceSpec,
} from "../../src/runtime.js";

// An in-memory `WorkspaceRuntime` (design 4.8, T3): the dependency of the manager and of reconcile in unit tests.
// It keeps one record per workspace id and one list of managed containers, and records every call, so a test
// asserts on what the unit under test asked for, not on how a real adapter would do it.

/** A graceful stop through docker-init ends the keeper with SIGTERM: 128 + 15. */
const STOPPED_EXIT_CODE = 143;

/**
 * One shell `openShell` handed out. The test plays the shell through `peer`: what it writes there is the
 * shell's output, what it reads there is the input the unit under test sent.
 */
export interface FakeShell {
  key: WorkspaceKey;
  spec: ShellSpec;
  /** The end the unit under test holds, as `ShellHandle.stream`. */
  stream: Duplex;
  peer: Duplex;
  /** One `<cols>x<rows>` entry per resize call, rejected ones included. */
  resizes: string[];
  /** The next resize calls reject with these, in order; an empty queue resolves. */
  resizeFailures: unknown[];
  /** What `exitCode()` answers, or the error it rejects with. */
  exitCode: number | null | Error;
}

/** What a GC primitive answers for one container Id, or what it throws. */
export type GcBehaviour = GcResult | Error;

export class FakeRuntime implements WorkspaceRuntime {
  /** One line per call, `<method> <workspace id or container Id>`, in call order. */
  readonly calls: string[] = [];
  readonly specs: WorkspaceSpec[] = [];
  readonly #instance: string;
  readonly #workspaces = new Map<string, WorkspaceInfo>();
  #managed: ManagedContainer[] = [];
  #volumes: ManagedVolume[] = [];
  readonly #gcBehaviour = new Map<string, GcBehaviour>();
  /** Every shell opened so far, in order. */
  readonly shells: FakeShell[] = [];
  /** The next `openShell` calls reject with these, in order (exec create or start failing). */
  readonly openShellFailures: Error[] = [];

  constructor(instance: string) {
    this.#instance = instance;
  }

  /** Puts a workspace in a state directly, as if an earlier process had left it there. */
  seed(info: WorkspaceInfo): void {
    this.#workspaces.set(info.id, info);
  }

  setManaged(containers: readonly ManagedContainer[]): void {
    this.#managed = [...containers];
  }

  setManagedVolumes(volumes: readonly ManagedVolume[]): void {
    this.#volumes = [...volumes];
  }

  /** Overrides the default behaviour of both GC primitives for one container Id. */
  setGcBehaviour(containerId: string, behaviour: GcBehaviour): void {
    this.#gcBehaviour.set(containerId, behaviour);
  }

  async ensureRunning(spec: WorkspaceSpec): Promise<EnsureResult> {
    const id = this.#id(spec.key);
    this.calls.push(`ensureRunning ${id}`);
    this.specs.push(spec);
    const existing = this.#workspaces.get(id);
    const outcome =
      existing === undefined ? "created" : existing.state === "running" ? "running" : "started";
    const workspace: WorkspaceInfo = {
      id,
      key: spec.key,
      state: "running",
      containerId: existing?.containerId ?? `container-${id}`,
      image: existing?.image ?? spec.image,
      exit: null,
    };
    this.#workspaces.set(id, workspace);
    return { outcome, workspace };
  }

  async stop(key: WorkspaceKey): Promise<WorkspaceInfo> {
    const id = this.#id(key);
    this.calls.push(`stop ${id}`);
    const existing = this.#workspaces.get(id);
    if (existing === undefined) throw new WorkspaceNotFoundError(id);
    if (existing.state === "stopped") return existing;
    const stopped: WorkspaceInfo = {
      ...existing,
      state: "stopped",
      exit: { code: STOPPED_EXIT_CODE, reason: "exited" },
    };
    this.#workspaces.set(id, stopped);
    return stopped;
  }

  async remove(key: WorkspaceKey): Promise<void> {
    const id = this.#id(key);
    this.calls.push(`remove ${id}`);
    this.#workspaces.delete(id);
  }

  async inspect(key: WorkspaceKey): Promise<WorkspaceInfo | null> {
    const id = this.#id(key);
    this.calls.push(`inspect ${id}`);
    return this.#workspaces.get(id) ?? null;
  }

  async listManaged(): Promise<ManagedContainer[]> {
    this.calls.push("listManaged");
    return this.#managed.map((container) => ({ ...container }));
  }

  async listManagedVolumes(): Promise<ManagedVolume[]> {
    this.calls.push("listManagedVolumes");
    return this.#volumes.map((volume) => ({ ...volume }));
  }

  async stopContainer(containerId: string): Promise<GcResult> {
    this.calls.push(`stopContainer ${containerId}`);
    return this.#gc(containerId, "running", "exited");
  }

  async removeContainer(containerId: string): Promise<GcResult> {
    this.calls.push(`removeContainer ${containerId}`);
    return this.#gc(containerId, "not-running", null);
  }

  /**
   * By default a primitive acts only in the state it applies to (`running` for stop, anything else for
   * remove), like the real GC predicate's state condition; `next` is the state after it (`null`: removed).
   */
  #gc(containerId: string, appliesTo: "running" | "not-running", next: string | null): GcResult {
    const behaviour = this.#gcBehaviour.get(containerId);
    if (behaviour instanceof Error) throw behaviour;
    if (behaviour !== undefined) return behaviour;
    const container = this.#managed.find((entry) => entry.containerId === containerId);
    if (container === undefined) return "gone";
    if ((container.state === "running") !== (appliesTo === "running")) return "state-changed";
    this.#managed =
      next === null
        ? this.#managed.filter((entry) => entry !== container)
        : this.#managed.map((entry) => (entry === container ? { ...entry, state: next } : entry));
    return "done";
  }

  async openShell(key: WorkspaceKey, spec: ShellSpec): Promise<ShellHandle> {
    this.calls.push(`openShell ${this.#id(key)}`);
    const failure = this.openShellFailures.shift();
    if (failure !== undefined) throw failure;
    const [stream, peer] = duplexPair();
    const shell: FakeShell = {
      key,
      spec,
      stream,
      peer,
      resizes: [],
      resizeFailures: [],
      exitCode: null,
    };
    this.shells.push(shell);
    return {
      stream,
      resize: async (cols, rows) => {
        shell.resizes.push(`${cols}x${rows}`);
        const resizeFailure = shell.resizeFailures.shift();
        if (resizeFailure !== undefined) throw resizeFailure;
      },
      exitCode: async () => {
        if (shell.exitCode instanceof Error) throw shell.exitCode;
        return shell.exitCode;
      },
    };
  }

  #id(key: WorkspaceKey): string {
    return workspaceId(this.#instance, key);
  }
}
