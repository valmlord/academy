import { describe, expect, it } from "vitest";
import { DockerEngine } from "../../src/docker/engine.js";
import {
  checkImage,
  createOrAdoptContainer,
  ensureNetwork,
  ensureVolume,
} from "../../src/docker/objects.js";
import type { ContainerSpecInput } from "../../src/docker/spec.js";
import { ImageMissingError, WorkspaceIdentityMismatchError } from "../../src/errors.js";
import {
  instanceNetworkName,
  networkLabels,
  type WorkspaceKey,
  workspaceId,
  workspaceLabels,
  workspaceNames,
} from "../../src/identity.js";
import {
  createIdleContainer,
  createNetwork,
  createVolume,
  inspectObject,
  listObjects,
  TEST_IMAGE,
} from "./docker-cli.js";
import { fulfilledValue, TEST_LIMITS } from "./fixtures.js";
import { runLabels, useTestInstance } from "./harness.js";

// The per-object entry points of design 6.1, called directly: each must converge on its own object and refuse
// an object that only has our name.

const { runId, instance } = useTestInstance("objects.int.test.ts");

const key: WorkspaceKey = {
  userId: "objects-user",
  courseId: "sample-course",
  lessonId: "with-workspace",
};
const otherUser: WorkspaceKey = { ...key, userId: "someone-else" };
const networkName = instanceNetworkName(instance);

/** Ids of the networks named exactly `name` (the CLI's name filter matches substrings). */
async function networksNamed(name: string): Promise<string[]> {
  const ids: string[] = [];
  for (const id of await listObjects("network", [`name=${name}`])) {
    if ((await inspectObject("network", id))?.name === name) ids.push(id);
  }
  return ids;
}

describe("ensureNetwork (I-objects-network)", () => {
  it("1: creates the instance network once with our labels, and returns its name on every call", async () => {
    const engine = new DockerEngine();

    const names = [await ensureNetwork(engine, instance), await ensureNetwork(engine, instance)];
    const ids = await networksNamed(networkName);

    expect(names).toEqual([networkName, networkName]);
    expect(ids).toHaveLength(1);
    expect((await inspectObject("network", ids[0] ?? ""))?.labels).toEqual(networkLabels(instance));
  });

  it("2: returns a network of ours that already exists, without creating another", async () => {
    const engine = new DockerEngine();
    const existingId = await createNetwork(networkName, {
      ...networkLabels(instance),
      ...runLabels(runId),
    });

    const name = await ensureNetwork(engine, instance);

    expect(name).toBe(networkName);
    expect(await networksNamed(networkName)).toEqual([existingId]);
  });

  it("3: refuses a foreign network with our name, which survives unchanged and alone", async () => {
    const engine = new DockerEngine();
    const foreignId = await createNetwork(networkName, runLabels(runId));

    const failure = await ensureNetwork(engine, instance).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(WorkspaceIdentityMismatchError);
    expect(await networksNamed(networkName)).toEqual([foreignId]);
    expect((await inspectObject("network", foreignId))?.labels).toEqual(runLabels(runId));
  });
});

describe("ensureVolume and checkImage", () => {
  it("refuses a volume with our name and another user's labels (I-mismatch), which survives", async () => {
    const engine = new DockerEngine();
    const { volume } = workspaceNames(instance, workspaceId(instance, key));
    const foreignLabels = {
      ...workspaceLabels(instance, otherUser, "volume"),
      ...runLabels(runId),
    };
    await createVolume(volume, foreignLabels);

    const failure = await ensureVolume(engine, instance, key).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(WorkspaceIdentityMismatchError);
    expect((await inspectObject("volume", volume))?.labels).toEqual(foreignLabels);
  });

  it("creates the volume once and returns it on a second call", async () => {
    const engine = new DockerEngine();
    const { volume } = workspaceNames(instance, workspaceId(instance, key));

    const names = [
      await ensureVolume(engine, instance, key),
      await ensureVolume(engine, instance, key),
    ];

    expect(names).toEqual([volume, volume]);
    expect((await inspectObject("volume", volume))?.labels).toEqual(
      workspaceLabels(instance, key, "volume"),
    );
  });

  it("reports an absent image as ImageMissingError naming the image (I-image-missing)", async () => {
    const engine = new DockerEngine();
    const image = `wks-absent-image:${runId}`;

    const failure = await checkImage(engine, image).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ImageMissingError);
    expect(failure).toMatchObject({ image });
  });
});

function specInput(): ContainerSpecInput {
  const names = workspaceNames(instance, workspaceId(instance, key));
  return { image: TEST_IMAGE, instance, key, names, limits: TEST_LIMITS };
}

/** Ids of the containers named exactly `name`. */
async function containersNamed(name: string): Promise<string[]> {
  const ids: string[] = [];
  for (const id of await listObjects("container", [`name=${name}`])) {
    if ((await inspectObject("container", id))?.name === name) ids.push(id);
  }
  return ids;
}

describe("createOrAdoptContainer", () => {
  it("4: refuses to create a container while a foreign network has our network's name (I-objects-network)", async () => {
    const engine = new DockerEngine();
    // Case 3's foreign network was removed by the per-test cleanup, so this case makes its own.
    await createNetwork(networkName, runLabels(runId));
    const input = specInput();

    const failure = await createOrAdoptContainer(engine, input).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(WorkspaceIdentityMismatchError);
    expect(await containersNamed(input.names.container)).toEqual([]);
  });

  it("refuses a container with our name and another user's labels (I-mismatch), which survives unchanged", async () => {
    const engine = new DockerEngine();
    const input = specInput();
    const foreignLabels = {
      ...workspaceLabels(instance, otherUser, "container"),
      ...runLabels(runId),
    };
    const foreignId = await createIdleContainer(input.names.container, foreignLabels);

    const failure = await createOrAdoptContainer(engine, input).catch((error: unknown) => error);
    const after = await inspectObject("container", foreignId);

    expect(failure).toBeInstanceOf(WorkspaceIdentityMismatchError);
    expect(after?.labels).toEqual(foreignLabels);
    expect(after?.state).toBe("created");
  });

  it("gives two concurrent callers without a shared lock the same container (I-conc-docker)", async () => {
    const engine = new DockerEngine();
    const input = specInput();
    await ensureVolume(engine, instance, key);

    const results = await Promise.allSettled([
      createOrAdoptContainer(engine, input),
      createOrAdoptContainer(engine, input),
    ]);

    const ids = results.map(fulfilledValue);
    expect(ids[0]).toBe(ids[1]);
    expect(await containersNamed(input.names.container)).toEqual([ids[0]]);
  });
});
