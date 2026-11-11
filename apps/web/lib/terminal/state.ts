// What the environment region shows for each state of the terminal machine (design 3.6 copy table, 3.6.1,
// Delta 2 section 2.2). The machine produces it; the region maps it to copy and actions.

/** The window event the machine's session-expired rows dispatch; `Notifications` shows the F2 alert on it. */
export const SESSION_EXPIRED_EVENT = "academy:session-expired";

/** Why the machine is in FA; each has its own copy and action (design 3.6). */
export type TerminalFailure =
  | { kind: "start-failed" }
  | { kind: "docker-down" }
  | { kind: "image-missing"; image: string }
  | { kind: "rejected" }
  | { kind: "reconnect-failed" };

/** A note shown after the status text: the workspace was just created again from the lesson's starter. */
export type EnvironmentNote = "workspace-reset";

export type TerminalStatus =
  /** ST: `startedAt` is `performance.now()` at entry, for the `role="timer"`; `isSlow` after `startSlowSeconds`. */
  | { kind: "starting"; copy: "creating" | "starting"; startedAt: number; isSlow: boolean }
  /** CO and AP: the environment answered running; the copy says it runs. `note` only while one shows. */
  | { kind: "connecting"; note?: EnvironmentNote }
  /** RU, and RN while `current` is open. `note` only while one shows. */
  | { kind: "running"; note?: EnvironmentNote }
  /** RC, and RN while `current` is closed (row 29): the lost-connection frame, input dropped. */
  | { kind: "reconnecting" }
  | { kind: "taken-over" }
  | { kind: "shell-exited" }
  /** ES; `isMemoryLimit` once a peek answered `limits` (rows 3, 7, 15). */
  | { kind: "stopped"; isMemoryLimit: boolean }
  | { kind: "failed"; failure: TerminalFailure }
  /** SE: the region keeps the text of `shown` (the status before), without its action. */
  | { kind: "session-expired"; shown: TerminalStatus };

/**
 * Whether the environment runs as far as restart, reset and the idle warning are concerned: from the moment it
 * answered running until something stopped or failed it. A lost connection, a takeover and an exited shell
 * leave the container running; a session-expired status counts as the status it keeps showing.
 */
export function isEnvironmentRunning(status: TerminalStatus): boolean {
  switch (status.kind) {
    case "connecting":
    case "running":
    case "reconnecting":
    case "taken-over":
    case "shell-exited":
      return true;
    case "failed":
      return status.failure.kind === "reconnect-failed";
    case "session-expired":
      return isEnvironmentRunning(status.shown);
    case "starting":
    case "stopped":
      return false;
  }
}
