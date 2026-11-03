import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  LABEL,
  networkLabels,
  networkLabelsMatch,
  parseWorkspaceLabels,
  type WorkspaceKey,
  workspaceId,
  workspaceLabels,
} from "../../src/identity.js";

const KEY: WorkspaceKey = {
  userId: "user_1",
  courseId: "ai-for-developers",
  lessonId: "agent-loop",
};
const INSTANCE = "local";

const userIds = fc.stringMatching(/^[A-Za-z0-9_-]{1,64}$/);
const slugs = fc.stringMatching(/^[a-z0-9]{1,8}(?:-[a-z0-9]{1,8}){0,3}$/);
const instances = fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,15}$/);
const roles = fc.constantFrom("container" as const, "volume" as const);

function labelsWith(changes: Record<string, string | undefined>): Record<string, string> {
  const labels: Record<string, string> = workspaceLabels(INSTANCE, KEY, "container");
  for (const [name, value] of Object.entries(changes)) {
    if (value === undefined) delete labels[name];
    else labels[name] = value;
  }
  return labels;
}

describe("workspace labels", () => {
  it("are exactly the eight identity labels", () => {
    expect(workspaceLabels(INSTANCE, KEY, "volume")).toEqual({
      "academy.workspace.managed": "true",
      "academy.workspace.schema": "1",
      "academy.workspace.instance": "local",
      "academy.workspace.role": "volume",
      "academy.workspace.id": workspaceId(INSTANCE, KEY),
      "academy.workspace.user": "user_1",
      "academy.workspace.course": "ai-for-developers",
      "academy.workspace.lesson": "agent-loop",
    });
  });

  it("round-trip to the same key, id and role for any valid key", () => {
    fc.assert(
      fc.property(
        instances,
        userIds,
        slugs,
        slugs,
        roles,
        (instance, userId, courseId, lessonId, role) => {
          const key = { userId, courseId, lessonId };

          const parsed = parseWorkspaceLabels(workspaceLabels(instance, key, role), instance);

          expect(parsed).toEqual({ kind: "valid", key, id: workspaceId(instance, key), role });
        },
      ),
    );
  });

  it("parse as other-schema when a managed object of this instance has schema 2", () => {
    expect(parseWorkspaceLabels(labelsWith({ [LABEL.schema]: "2" }), INSTANCE)).toEqual({
      kind: "other-schema",
      schema: "2",
    });
  });

  it.each([
    ["the user label is missing", { [LABEL.user]: undefined }],
    ["the lesson label is not a slug", { [LABEL.lesson]: "Agent Loop" }],
    ["the schema label is missing", { [LABEL.schema]: undefined }],
    ["the schema label is malformed", { [LABEL.schema]: "v2" }],
    ["the schema label is empty", { [LABEL.schema]: "" }],
    ["the id label differs from the recomputed id", { [LABEL.id]: "0".repeat(20) }],
    ["the role is network", { [LABEL.role]: "network" }],
    ["the managed label is not true", { [LABEL.managed]: "false" }],
    ["the instance is another one", { [LABEL.instance]: "t31" }],
  ])("parse as invalid when %s", (_case, changes) => {
    expect(parseWorkspaceLabels(labelsWith(changes), INSTANCE)).toEqual({ kind: "invalid" });
  });

  it("never parse a network's labels as a workspace", () => {
    expect(parseWorkspaceLabels(networkLabels(INSTANCE), INSTANCE)).toEqual({ kind: "invalid" });
  });
});

describe("networkLabelsMatch", () => {
  it("is true for managed, this instance and role network, whatever the schema", () => {
    const labels = networkLabels(INSTANCE);

    expect(networkLabelsMatch(labels, INSTANCE)).toBe(true);
    expect(networkLabelsMatch({ ...labels, [LABEL.schema]: "2" }, INSTANCE)).toBe(true);
  });

  it.each([
    ["managed is not true", { [LABEL.managed]: "false" }],
    ["another instance", { [LABEL.instance]: "other" }],
    ["another role", { [LABEL.role]: "volume" }],
  ])("is false when %s", (_case, change) => {
    expect(networkLabelsMatch({ ...networkLabels(INSTANCE), ...change }, INSTANCE)).toBe(false);
  });

  it.each([LABEL.managed, LABEL.instance, LABEL.role])("is false when %s is missing", (missing) => {
    const labels: Record<string, string> = { ...networkLabels(INSTANCE) };
    delete labels[missing];

    expect(networkLabelsMatch(labels, INSTANCE)).toBe(false);
  });
});
