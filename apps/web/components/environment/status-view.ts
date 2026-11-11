import {
  connectionLostStatus,
  dockerDownStatus,
  environmentCreatingStatus,
  environmentMemoryLimitStatus,
  environmentRejectedStatus,
  environmentRunningStatus,
  environmentSlowNote,
  environmentStartingStatus,
  environmentStoppedStatus,
  imageMissingStatus,
  openCourseLabel,
  openHereLabel,
  openNewSessionLabel,
  reconnectFailedStatus,
  reconnectLabel,
  retryLabel,
  shellExitedStatus,
  startAgainLabel,
  startFailedStatus,
  takenOverStatus,
  workspaceResetNote,
} from "@/lib/copy";
import type { EnvironmentNote, TerminalFailure, TerminalStatus } from "@/lib/terminal/state";
import type { StatusIconKind } from "../status-icon";

// What the environment region shows for a machine status: #32 design 3.6 copy table, with Delta 2.2's
// starting row. Kept apart from the component so each row is checked without rendering a terminal.

/** `act` calls the machine's status action; `course` is the link to the course page (rejected). */
export type StatusAction = { kind: "act"; label: string } | { kind: "course"; label: string };

/** What the one-pane switch's environment tab adds to its name, since that pane may be out of sight. */
export type EnvironmentAttention = "stopped" | "error";

export interface StatusView {
  text: string;
  /** The slow-start or reset note, appended inside the status line. */
  note: string | null;
  /** The icon before the status (prototype.html F8.1); `null` while starting, where the spinner shows. */
  icon: StatusIconKind | null;
  attention: EnvironmentAttention | null;
  /**
   * The service's error code the details disclosure shows (D3). Derived from the kind: `answerForError`
   * (client.ts) maps exactly one code to each of these kinds, and ADR-0010 item 2 closes the code set.
   */
  detailsCode: string | null;
  action: StatusAction | null;
  /** Starting: the spinner and the `role="timer"` counting from `startedAt`. */
  startedAt: number | null;
  /** The dashed lost-connection frame with the cursor hidden. */
  isConnectionLost: boolean;
  /**
   * Connecting: keys are dropped until `attached` (design 3.6.1 row 32), so the cursor is hidden and the tab
   * panel busy rather than inviting typing into a terminal that does not take input yet.
   */
  isAwaitingAttach: boolean;
  /** The key hint shows while the environment runs (acceptance notes, F9.4). */
  isHintShown: boolean;
}

const QUIET: Omit<StatusView, "text" | "icon"> = {
  note: null,
  attention: null,
  detailsCode: null,
  action: null,
  startedAt: null,
  isConnectionLost: false,
  isAwaitingAttach: false,
  isHintShown: false,
};

export function statusView(status: TerminalStatus): StatusView {
  switch (status.kind) {
    case "starting":
      return {
        ...QUIET,
        icon: null,
        text: status.copy === "creating" ? environmentCreatingStatus : environmentStartingStatus,
        note: status.isSlow ? environmentSlowNote : null,
        startedAt: status.startedAt,
      };
    case "connecting":
      return {
        ...QUIET,
        icon: "success",
        text: environmentRunningStatus,
        note: noteText(status.note),
        isAwaitingAttach: true,
        isHintShown: true,
      };
    case "running":
      return {
        ...QUIET,
        icon: "success",
        text: environmentRunningStatus,
        note: noteText(status.note),
        isHintShown: true,
      };
    case "reconnecting":
      return {
        ...QUIET,
        icon: "warning",
        text: connectionLostStatus,
        isConnectionLost: true,
        isHintShown: true,
      };
    case "taken-over":
      return {
        ...QUIET,
        icon: "muted",
        text: takenOverStatus,
        action: { kind: "act", label: openHereLabel },
        isHintShown: true,
      };
    case "shell-exited":
      return {
        ...QUIET,
        icon: "muted",
        text: shellExitedStatus,
        action: { kind: "act", label: openNewSessionLabel },
        isHintShown: true,
      };
    case "stopped":
      // prototype.html F8.1: the limits stop is an error (destructive), a plain stop is muted.
      return {
        ...QUIET,
        icon: status.isMemoryLimit ? "destructive" : "muted",
        attention: "stopped",
        detailsCode: status.isMemoryLimit ? "memory-limit" : null,
        text: status.isMemoryLimit ? environmentMemoryLimitStatus : environmentStoppedStatus,
        action: { kind: "act", label: startAgainLabel },
      };
    case "failed":
      return failedView(status.failure);
    case "session-expired": {
      // Design 3.6: the region keeps the text it showed, without its action; the terminal stays disconnected.
      const shown = statusView(status.shown);
      return { ...shown, action: null, startedAt: null, isAwaitingAttach: false };
    }
  }
}

// Every failure but a lost reconnect: the environment did not start or was refused.
const FAILED: Omit<StatusView, "text"> = { ...QUIET, icon: "destructive", attention: "error" };

function noteText(note: EnvironmentNote | undefined): string | null {
  return note === "workspace-reset" ? workspaceResetNote : null;
}

function failedView(failure: TerminalFailure): StatusView {
  switch (failure.kind) {
    case "start-failed":
      return {
        ...FAILED,
        text: startFailedStatus,
        action: { kind: "act", label: retryLabel },
      };
    case "docker-down":
      return {
        ...FAILED,
        detailsCode: "docker-unavailable",
        text: dockerDownStatus,
        action: { kind: "act", label: retryLabel },
      };
    case "image-missing":
      return {
        ...FAILED,
        detailsCode: "image-missing",
        text: imageMissingStatus(failure.image),
        action: { kind: "act", label: retryLabel },
      };
    case "rejected":
      return {
        ...FAILED,
        detailsCode: "workspace-identity-mismatch",
        text: environmentRejectedStatus,
        action: { kind: "course", label: openCourseLabel },
      };
    case "reconnect-failed":
      // The environment still runs here (isEnvironmentRunning), so the switch tab says nothing extra.
      return {
        ...QUIET,
        icon: "destructive",
        text: reconnectFailedStatus,
        action: { kind: "act", label: reconnectLabel },
        // The prototype keeps the dashed frame once reconnecting gave up (`#state-reconnect-failed`).
        isConnectionLost: true,
        isHintShown: true,
      };
  }
}
