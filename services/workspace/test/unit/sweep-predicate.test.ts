import { describe, expect, it } from "vitest";
import {
  isSweepable,
  type SweepCandidate,
  type SweepContext,
  TEST_LABEL,
} from "../support/sweep-predicate.js";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const THIS_RUN = "0a1b2c3d";
const DEAD_RUN = "deadbeef";
const LIVE_RUN = "1234abcd";
const WORKSPACE_ID = "0123456789abcdef0123";

const context: SweepContext = {
  runId: THIS_RUN,
  ownerNames: new Set(["academy-db-1", "academy-web-1", "academy_db-data", "academy-web:local"]),
  deadRuns: new Set([DEAD_RUN]),
  nowMs: NOW,
};

function candidate(
  kind: SweepCandidate["kind"],
  name: string,
  labels: Record<string, string>,
  ageMs: number,
): SweepCandidate {
  return { kind, name, labels, createdAtMs: NOW - ageMs };
}

const localWorkspace = {
  [TEST_LABEL.managed]: "true",
  [TEST_LABEL.instance]: "local",
  "academy.workspace.schema": "1",
};

describe("isSweepable", () => {
  describe("never sweeps the owner's objects or a live run", () => {
    const negatives: Array<[string, SweepCandidate]> = [
      [
        "academy-db-1, a compose container 30 days old",
        candidate(
          "container",
          "academy-db-1",
          { "com.docker.compose.project": "academy" },
          30 * DAY,
        ),
      ],
      [
        "the academy_db-data volume",
        candidate(
          "volume",
          "academy_db-data",
          { "com.docker.compose.project": "academy" },
          30 * DAY,
        ),
      ],
      ["the academy-web:local image", candidate("image", "academy-web:local", {}, 30 * DAY)],
      [
        "a wks-local container of the owner's service",
        candidate(
          "container",
          `wks-local-${WORKSPACE_ID}`,
          { ...localWorkspace, "academy.workspace.role": "container" },
          30 * DAY,
        ),
      ],
      [
        "a wks-local files volume",
        candidate(
          "volume",
          `wks-local-${WORKSPACE_ID}-files`,
          { ...localWorkspace, "academy.workspace.role": "volume" },
          30 * DAY,
        ),
      ],
      [
        "the wks-local-net network",
        candidate(
          "network",
          "wks-local-net",
          { ...localWorkspace, "academy.workspace.role": "network" },
          30 * DAY,
        ),
      ],
      [
        "an object of the isolated recipe's instance t31",
        candidate(
          "container",
          `wks-t31-${WORKSPACE_ID}`,
          { [TEST_LABEL.managed]: "true", [TEST_LABEL.instance]: "t31" },
          30 * DAY,
        ),
      ],
      [
        "an old object whose test-run label is empty",
        candidate("volume", "scratch-volume", { [TEST_LABEL.run]: "" }, 2 * DAY),
      ],
      [
        "an old object of the current run",
        candidate("network", "current-run-net", { [TEST_LABEL.run]: THIS_RUN }, 2 * DAY),
      ],
      [
        "a young object of a live run",
        candidate("container", "live-run-helper", { [TEST_LABEL.run]: LIVE_RUN }, 5 * MINUTE),
      ],
    ];

    it.each(negatives)("refuses %s", (_name, object) => {
      expect(isSweepable(object, context)).toBe(false);
    });
  });

  describe("sweeps what an earlier run left behind", () => {
    it("sweeps a young object of a dead run", () => {
      const object = candidate(
        "volume",
        "dead-run-scratch",
        { [TEST_LABEL.run]: DEAD_RUN },
        MINUTE,
      );

      expect(isSweepable(object, context)).toBe(true);
    });

    it("sweeps an old managed object of a test instance by the run in its instance", () => {
      const object = candidate(
        "container",
        `wks-t1a2b3c4d-a-${WORKSPACE_ID}`,
        { [TEST_LABEL.managed]: "true", [TEST_LABEL.instance]: "t1a2b3c4d-a" },
        61 * MINUTE,
      );

      expect(isSweepable(object, context)).toBe(true);
    });
  });
});
