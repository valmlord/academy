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
} from "@/lib/copy";
import type { TerminalFailure, TerminalStatus } from "@/lib/terminal/state";

// What the environment region shows for a machine status: #32 design 3.6 copy table, with Delta 2.2's
// starting row. Kept apart from the component so each row is checked without rendering a terminal.

/** `act` calls the machine's status action; `course` is the link to the course page (rejected). */
export type StatusAction = { kind: "act"; label: string } | { kind: "course"; label: string };

export interface StatusView {
  text: string;
  /** The slow-start note, appended inside the status line. */
  note: string | null;
  action: StatusAction | null;
  /** Starting: the spinner and the `role="timer"` counting from `startedAt`. */
  startedAt: number | null;
  /** The dashed lost-connection frame with the cursor hidden. */
  isConnectionLost: boolean;
  /** The key hint shows while the environment runs (acceptance notes, F9.4). */
  isHintShown: boolean;
}

const QUIET: Omit<StatusView, "text"> = {
  note: null,
  action: null,
  startedAt: null,
  isConnectionLost: false,
  isHintShown: false,
};

export function statusView(status: TerminalStatus): StatusView {
  switch (status.kind) {
    case "starting":
      return {
        ...QUIET,
        text: status.copy === "creating" ? environmentCreatingStatus : environmentStartingStatus,
        note: status.isSlow ? environmentSlowNote : null,
        startedAt: status.startedAt,
      };
    case "connecting":
    case "running":
      return { ...QUIET, text: environmentRunningStatus, isHintShown: true };
    case "reconnecting":
      return {
        ...QUIET,
        text: connectionLostStatus,
        isConnectionLost: true,
        isHintShown: true,
      };
    case "taken-over":
      return {
        ...QUIET,
        text: takenOverStatus,
        action: { kind: "act", label: openHereLabel },
        isHintShown: true,
      };
    case "shell-exited":
      return {
        ...QUIET,
        text: shellExitedStatus,
        action: { kind: "act", label: openNewSessionLabel },
        isHintShown: true,
      };
    case "stopped":
      return {
        ...QUIET,
        text: status.isMemoryLimit ? environmentMemoryLimitStatus : environmentStoppedStatus,
        action: { kind: "act", label: startAgainLabel },
      };
    case "failed":
      return failedView(status.failure);
    case "session-expired": {
      // Design 3.6: the region keeps the text it showed, without its action; the terminal stays disconnected.
      const shown = statusView(status.shown);
      return { ...shown, action: null, startedAt: null };
    }
  }
}

function failedView(failure: TerminalFailure): StatusView {
  switch (failure.kind) {
    case "start-failed":
      return { ...QUIET, text: startFailedStatus, action: { kind: "act", label: retryLabel } };
    case "docker-down":
      return { ...QUIET, text: dockerDownStatus, action: { kind: "act", label: retryLabel } };
    case "image-missing":
      return {
        ...QUIET,
        text: imageMissingStatus(failure.image),
        action: { kind: "act", label: retryLabel },
      };
    case "rejected":
      return {
        ...QUIET,
        text: environmentRejectedStatus,
        action: { kind: "course", label: openCourseLabel },
      };
    case "reconnect-failed":
      return {
        ...QUIET,
        text: reconnectFailedStatus,
        action: { kind: "act", label: reconnectLabel },
        // The prototype keeps the dashed frame once reconnecting gave up (`#state-reconnect-failed`).
        isConnectionLost: true,
        isHintShown: true,
      };
  }
}
