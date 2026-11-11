import type { WebSocket } from "@fastify/websocket";
import { type WorkspaceKey, workspaceId } from "../identity.js";
import type { KeyedMutex } from "../lock.js";
import { errorName } from "../log-fields.js";
import type { ServiceLog } from "../manager.js";
import type { ShellHandle, WorkspaceRuntime } from "../runtime.js";
import { CLOSE, CLOSE_REASON } from "./protocol.js";
import {
  createHeadlessScreen,
  type HeadlessScreen,
  type ScreenOptions,
  Session,
  START_SIZE,
  startShellKill,
  TerminalConnection,
  terminalLine,
} from "./session.js";

// At most one terminal session per workspace (design 3.2, D4). Creating one takes the workspace's lock, so it
// is ordered with ensure, stop and remove (ADR-0010 item 8 amendment); attaching to a live one does not.

/** Design 3.2 "Heartbeat": a client that has not answered the previous ping by the next tick is terminated. */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/** What the registry needs from the workspace manager. */
export interface TerminalWorkspaces {
  lockKey(key: WorkspaceKey): string;
  touchFromTerminal(key: WorkspaceKey): void;
}

export interface TerminalRegistryOptions {
  runtime: Pick<WorkspaceRuntime, "inspect" | "openShell">;
  workspaces: TerminalWorkspaces;
  mutex: KeyedMutex;
  instance: string;
  /** `TERMINAL_SHELL`. */
  shell: string;
  /** `TERMINAL_SCROLLBACK_LINES`. */
  scrollbackLines: number;
  log: ServiceLog;
  /** Tests replace the headless screen to control when its write callbacks run. */
  createScreen?: (options: ScreenOptions) => HeadlessScreen;
  heartbeatMs?: number;
}

export class TerminalRegistry {
  readonly #options: TerminalRegistryOptions;
  readonly #sessions = new Map<string, Session>();

  constructor(options: TerminalRegistryOptions) {
    this.#options = options;
  }

  /** Live sessions; read-only, so a test can see an ended session leave the map. */
  get size(): number {
    return this.#sessions.size;
  }

  /**
   * Attaches `socket` to the workspace's session, creating it when there is none (rows 1-5). The socket's
   * listeners are attached before the first `await`. Never rejects: a failure after the checks of row 2 closes
   * the socket with 1011 and ends a session this socket created (3.2.2 C4).
   */
  connect(key: WorkspaceKey, socket: WebSocket, conn: string): Promise<void> {
    const id = workspaceId(this.#options.instance, key);
    const connection = new TerminalConnection(socket, conn, id, this.#options.log);
    return this.#connect(key, id, connection).catch(() => this.#abort(connection));
  }

  /** Row 22: called by the manager before a stop, remove or idle stop reaches the runtime. */
  onStopping(id: string): void {
    this.#sessions.get(id)?.markStopping();
  }

  /** Row 23: the runtime call of that stop threw. */
  onStopRejected(id: string): void {
    this.#sessions.get(id)?.clearStopping();
  }

  /**
   * Row 24: service shutdown, before the HTTP server closes. Every session ends with 1001, which starts the kill
   * of its shell (#110); the requests in flight keep the process alive until Docker answered.
   */
  closeAll(): void {
    for (const session of [...this.#sessions.values()]) session.end(CLOSE.shuttingDown);
  }

  async #connect(key: WorkspaceKey, id: string, connection: TerminalConnection): Promise<void> {
    const live = this.#sessions.get(id);
    if (live !== undefined) {
      live.join(connection);
      return;
    }
    const { mutex, workspaces } = this.#options;
    await mutex.run(workspaces.lockKey(key), () => this.#create(key, id, connection));
  }

  /** Row 1 after the lock, and row 2. */
  async #create(key: WorkspaceKey, id: string, connection: TerminalConnection): Promise<void> {
    const raced = this.#sessions.get(id);
    if (raced !== undefined) {
      raced.join(connection);
      return;
    }
    const { runtime, log } = this.#options;
    let shell: ShellHandle;
    try {
      const info = await runtime.inspect(key);
      if (info === null || info.state !== "running") {
        connection.removeListeners();
        connection.close(CLOSE.environmentStopped, CLOSE_REASON.environmentStopped);
        return;
      }
      shell = await runtime.openShell(key, { shell: this.#options.shell });
    } catch (error: unknown) {
      // 3.2.2 C3: nothing was mapped, so nothing else is left to release.
      log.warn(terminalLine.execFailed(id, connection.conn, errorName(error)));
      connection.removeListeners();
      connection.close(CLOSE.internal, CLOSE_REASON.internal);
      return;
    }
    const session = this.#newSession(key, id, connection, shell);
    this.#sessions.set(id, session);
    session.join(connection);
  }

  #newSession(
    key: WorkspaceKey,
    id: string,
    connection: TerminalConnection,
    shell: ShellHandle,
  ): Session {
    const { runtime, workspaces, log } = this.#options;
    const createScreen = this.#options.createScreen ?? createHeadlessScreen;
    try {
      return new Session({
        workspaceId: id,
        shell,
        screen: createScreen({ ...START_SIZE, scrollback: this.#options.scrollbackLines }),
        createdBy: connection,
        isContainerRunning: async () => (await runtime.inspect(key))?.state === "running",
        touch: () => workspaces.touchFromTerminal(key),
        log,
        onEnd: (ended) => {
          if (this.#sessions.get(id) === ended) this.#sessions.delete(id);
        },
        heartbeatMs: this.#options.heartbeatMs ?? HEARTBEAT_INTERVAL_MS,
      });
    } catch (error: unknown) {
      // The exec started but no session owns it: release the service's side and kill the shell before C4 closes
      // the socket.
      shell.stream.on("error", () => undefined);
      shell.stream.destroy();
      startShellKill(shell, (name) => log.warn(terminalLine.killFailed(id, connection.conn, name)));
      throw error;
    }
  }

  /** 3.2.2 C4. */
  #abort(connection: TerminalConnection): void {
    connection.close(CLOSE.internal, CLOSE_REASON.internal);
    for (const session of [...this.#sessions.values()]) {
      if (session.isCreatedBy(connection)) session.end(CLOSE.internal);
    }
  }
}
