import { describe, expect, it } from "vitest";
import { CourseLessons } from "../../src/course/lessons.js";
import {
  LABEL,
  type WorkspaceKey,
  workspaceId,
  workspaceLabels,
  workspaceNames,
} from "../../src/identity.js";
import { classifyContainer } from "../../src/reconcile.js";
import type { ManagedContainer } from "../../src/runtime.js";

// U-reconcile, classification (design 6.5 step 3): the pure table, one row per case.

const INSTANCE = "local";
const KEY: WorkspaceKey = { userId: "user-1", courseId: "course-a", lessonId: "with-workspace" };
const GONE_KEY: WorkspaceKey = { ...KEY, lessonId: "removed-lesson" };
const THEORY_KEY: WorkspaceKey = { ...KEY, lessonId: "theory-only" };

const COURSE = new CourseLessons([
  {
    courseId: "course-a",
    lessonId: "with-workspace",
    lessonDir: "course-a/01-basics/01-with-workspace",
    workspace: { image: "academy-workspace:dev", starter: "starter" },
    commandChecks: [],
  },
  {
    courseId: "course-a",
    lessonId: "theory-only",
    lessonDir: "course-a/01-basics/02-theory-only",
    workspace: null,
    commandChecks: [],
  },
]);

function container(key: WorkspaceKey, state: string): ManagedContainer {
  const id = workspaceId(INSTANCE, key);
  return {
    containerId: `docker-${id}`,
    name: workspaceNames(INSTANCE, id).container,
    labels: workspaceLabels(INSTANCE, key, "container"),
    state,
  };
}

/** Managed and of this instance, without the key labels: parses `invalid`. */
function invalidContainer(state: string): ManagedContainer {
  return {
    containerId: "docker-invalid",
    name: "wks-local-0000000000000000000a",
    labels: { [LABEL.managed]: "true", [LABEL.instance]: INSTANCE, [LABEL.schema]: "1" },
    state,
  };
}

function otherSchemaContainer(state: string): ManagedContainer {
  const base = container(KEY, state);
  return { ...base, labels: { ...base.labels, [LABEL.schema]: "2" } };
}

describe("classifyContainer", () => {
  it("stops a running container with invalid labels", () => {
    expect(classifyContainer(invalidContainer("running"), INSTANCE, COURSE)).toEqual({
      kind: "stop",
    });
  });

  it("removes a stopped container with invalid labels", () => {
    expect(classifyContainer(invalidContainer("exited"), INSTANCE, COURSE)).toEqual({
      kind: "remove",
      why: "invalid-labels",
    });
  });

  it("treats valid labels under another workspace's name as invalid", () => {
    const moved = { ...container(KEY, "running"), name: "wks-local-ffffffffffffffffffff" };

    expect(classifyContainer(moved, INSTANCE, COURSE)).toEqual({ kind: "stop" });
  });

  it("keeps an other-schema container that is running", () => {
    expect(classifyContainer(otherSchemaContainer("running"), INSTANCE, COURSE)).toEqual({
      kind: "other-schema",
      schema: "2",
    });
  });

  it("keeps an other-schema container that is not running", () => {
    expect(classifyContainer(otherSchemaContainer("exited"), INSTANCE, COURSE)).toEqual({
      kind: "other-schema",
      schema: "2",
    });
  });

  it("keeps a running container whose lesson left the course and adopts it for idle stop", () => {
    expect(classifyContainer(container(GONE_KEY, "running"), INSTANCE, COURSE)).toEqual({
      kind: "adopt",
      id: workspaceId(INSTANCE, GONE_KEY),
      key: GONE_KEY,
    });
  });

  it("removes a stopped container whose lesson left the course", () => {
    expect(classifyContainer(container(GONE_KEY, "exited"), INSTANCE, COURSE)).toEqual({
      kind: "remove",
      why: "lesson-gone",
    });
  });

  it("removes a stopped container whose lesson no longer has a workspace", () => {
    expect(classifyContainer(container(THEORY_KEY, "created"), INSTANCE, COURSE)).toEqual({
      kind: "remove",
      why: "lesson-gone",
    });
  });

  it("removes a dead container", () => {
    expect(classifyContainer(container(KEY, "dead"), INSTANCE, COURSE)).toEqual({
      kind: "remove",
      why: "dead",
    });
  });

  it("adopts a running valid workspace and keeps a stopped one", () => {
    const id = workspaceId(INSTANCE, KEY);

    expect(classifyContainer(container(KEY, "running"), INSTANCE, COURSE)).toEqual({
      kind: "adopt",
      id,
      key: KEY,
    });
    expect(classifyContainer(container(KEY, "exited"), INSTANCE, COURSE)).toEqual({ kind: "keep" });
  });

  it("removes nothing when the course is unreadable, but still adopts and stops", () => {
    const results = [
      classifyContainer(invalidContainer("exited"), INSTANCE, null),
      classifyContainer(container(GONE_KEY, "exited"), INSTANCE, null),
      classifyContainer(container(KEY, "dead"), INSTANCE, null),
      classifyContainer(container(KEY, "running"), INSTANCE, null),
      classifyContainer(invalidContainer("running"), INSTANCE, null),
    ];

    expect(results.map((result) => result.kind)).toEqual(["keep", "keep", "keep", "adopt", "stop"]);
  });
});
