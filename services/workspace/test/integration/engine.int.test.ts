import { describe, expect, it } from "vitest";
import { DockerEngine } from "../../src/docker/engine.js";
import type { ContainerCreateBody } from "../../src/docker/spec.js";
import {
  type WorkspaceKey,
  type WorkspaceNames,
  workspaceId,
  workspaceLabels,
  workspaceNames,
} from "../../src/identity.js";
import { createWorkspaceObjects, STOP_SECONDS, statusOf, testContainerSpec } from "./fixtures.js";
import { useTestInstance } from "./harness.js";

const { runId, instance } = useTestInstance("engine.int.test.ts");

const key: WorkspaceKey = {
  userId: "engine-user",
  courseId: "sample-course",
  lessonId: "with-workspace",
};

function spec(names: WorkspaceNames, image?: string): ContainerCreateBody {
  return testContainerSpec(instance, key, names, image);
}

describe("engine volumes", () => {
  it("creates a volume idempotently and removes it by name", async () => {
    const engine = new DockerEngine();
    const names = workspaceNames(instance, workspaceId(instance, key));
    const labels = workspaceLabels(instance, key, "volume");

    const first = await engine.createVolume(names.volume, labels);
    const second = await engine.createVolume(names.volume, labels);
    await engine.removeVolume(names.volume);

    expect([first, second]).toEqual([names.volume, names.volume]);
    expect(await engine.inspectVolume(names.volume)).toBeNull();
    expect(await statusOf(engine.removeVolume(names.volume))).toBe(404);
  });
});

describe("engine container operations", () => {
  it("creates, starts, stops and removes a container by Id; a repeated start or stop succeeds (304)", async () => {
    const engine = new DockerEngine();
    const names = await createWorkspaceObjects(engine, instance, key);

    const id = await engine.createContainer(names.container, spec(names));
    const conflict = await statusOf(engine.createContainer(names.container, spec(names)));
    await engine.startContainer(id);
    await engine.startContainer(id);
    const running = await engine.inspectContainer(id);
    await engine.stopContainer(id, STOP_SECONDS);
    await engine.stopContainer(id, STOP_SECONDS);
    const stopped = await engine.inspectContainer(id);
    await engine.removeContainer(id, { force: false });

    expect(conflict).toBe(409);
    expect(running?.State.Running).toBe(true);
    expect(stopped?.State.Running).toBe(false);
    expect(await engine.inspectContainer(id)).toBeNull();
    expect(await engine.inspectVolume(names.volume)).not.toBeNull();
    expect(await statusOf(engine.removeContainer(id, { force: false }))).toBe(404);
    expect(await statusOf(engine.startContainer(id))).toBe(404);
  });

  it("refuses a remove without force on a running container (409) and removes it with force", async () => {
    const engine = new DockerEngine();
    const names = await createWorkspaceObjects(engine, instance, key);
    const id = await engine.createContainer(names.container, spec(names));
    await engine.startContainer(id);

    const status = await statusOf(engine.removeContainer(id, { force: false }));
    const stillRunning = await engine.inspectContainer(id);
    await engine.removeContainer(id, { force: true });

    expect(status).toBe(409);
    expect(stillRunning?.State.Running).toBe(true);
    expect(await engine.inspectContainer(id)).toBeNull();
  });
});

describe("engine create with an absent image", () => {
  it("answers 404 to a container create whose image is absent, and creates no container", async () => {
    const engine = new DockerEngine();
    const names = await createWorkspaceObjects(engine, instance, key);

    const status = await statusOf(
      engine.createContainer(names.container, spec(names, `wks-absent-image:${runId}`)),
    );

    expect(status).toBe(404);
    expect(await engine.inspectContainer(names.container)).toBeNull();
  });
});
