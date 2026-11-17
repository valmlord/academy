// @vitest-environment node
import { describe, expect, it } from "vitest";
import { volumeRecreatedNote, workspaceResetNote } from "@/lib/copy";
import type { TerminalStatus } from "@/lib/terminal/state";
import { statusView } from "./status-view";

// #106 design 2.5: the icon, the switch tab's attention, the details code and the reset note per status
// (prototype.html F8.1 for the icons; D3 for the codes).

const STOPPED: TerminalStatus = { kind: "stopped", isMemoryLimit: false };
const DOCKER_DOWN: TerminalStatus = { kind: "failed", failure: { kind: "docker-down" } };

describe("statusView icon, attention and details", () => {
  it.each<{
    name: string;
    status: TerminalStatus;
    icon: string | null;
    attention: string | null;
    code: string | null;
  }>([
    {
      name: "docker-down",
      status: DOCKER_DOWN,
      icon: "destructive",
      attention: "error",
      code: "docker-unavailable",
    },
    {
      name: "image-missing",
      status: {
        kind: "failed",
        failure: { kind: "image-missing", image: "academy-workspace:dev" },
      },
      icon: "destructive",
      attention: "error",
      code: "image-missing",
    },
    {
      name: "rejected",
      status: { kind: "failed", failure: { kind: "rejected" } },
      icon: "destructive",
      attention: "error",
      code: "workspace-identity-mismatch",
    },
    {
      name: "start-failed",
      status: { kind: "failed", failure: { kind: "start-failed" } },
      icon: "destructive",
      attention: "error",
      code: null,
    },
    {
      name: "reconnect-failed",
      status: { kind: "failed", failure: { kind: "reconnect-failed" } },
      icon: "destructive",
      attention: null,
      code: null,
    },
    {
      name: "limits",
      status: { kind: "stopped", isMemoryLimit: true },
      icon: "destructive",
      attention: "stopped",
      code: "memory-limit",
    },
    { name: "stopped", status: STOPPED, icon: "muted", attention: "stopped", code: null },
    {
      name: "taken-over",
      status: { kind: "taken-over" },
      icon: "muted",
      attention: null,
      code: null,
    },
    {
      name: "shell-exited",
      status: { kind: "shell-exited" },
      icon: "muted",
      attention: null,
      code: null,
    },
    {
      name: "reconnecting",
      status: { kind: "reconnecting" },
      icon: "warning",
      attention: null,
      code: null,
    },
    {
      name: "connecting",
      status: { kind: "connecting" },
      icon: "success",
      attention: null,
      code: null,
    },
    { name: "running", status: { kind: "running" }, icon: "success", attention: null, code: null },
    {
      name: "starting",
      status: { kind: "starting", copy: "starting", startedAt: 0, isSlow: false },
      icon: null,
      attention: null,
      code: null,
    },
    {
      name: "session-expired over docker-down",
      status: { kind: "session-expired", shown: DOCKER_DOWN },
      icon: "destructive",
      attention: "error",
      code: "docker-unavailable",
    },
    {
      name: "session-expired over stopped",
      status: { kind: "session-expired", shown: STOPPED },
      icon: "muted",
      attention: "stopped",
      code: null,
    },
  ])(
    "$name: icon $icon, attention $attention, details $code",
    ({ status, icon, attention, code }) => {
      const view = statusView(status);

      expect(view.icon).toBe(icon);
      expect(view.attention).toBe(attention);
      expect(view.detailsCode).toBe(code);
    },
  );
});

describe("statusView reset note", () => {
  it.each<TerminalStatus>([
    { kind: "running", note: "workspace-reset" },
    { kind: "connecting", note: "workspace-reset" },
  ])("shows the reset note while $kind carries it", (status) => {
    expect(statusView(status).note).toBe(workspaceResetNote);
  });

  it.each<TerminalStatus>([{ kind: "running" }, { kind: "connecting" }])(
    "shows no note while $kind carries none",
    (status) => {
      expect(statusView(status).note).toBeNull();
    },
  );
});

describe("statusView recreated folder note", () => {
  it.each<TerminalStatus>([
    { kind: "running", note: "volume-recreated" },
    { kind: "connecting", note: "volume-recreated" },
  ])("shows the recreated note while $kind carries it", (status) => {
    expect(statusView(status).note).toBe(volumeRecreatedNote);
  });

  it("keeps the recreated note of the status a session-expired status shows", () => {
    const status: TerminalStatus = {
      kind: "session-expired",
      shown: { kind: "running", note: "volume-recreated" },
    };

    expect(statusView(status).note).toBe(volumeRecreatedNote);
  });
});
