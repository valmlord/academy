import { describe, expect, it } from "vitest";
import { DockerEngine } from "../../src/docker/engine.js";
import { NEVER_STARTED_AT } from "../../src/docker/schemas.js";
import { DockerUnavailableError } from "../../src/errors.js";
import {
  listFilter,
  networkLabels,
  type WorkspaceKey,
  workspaceId,
  workspaceLabels,
  workspaceNames,
} from "../../src/identity.js";
import { createIdleContainer, createNetwork, createVolume, TEST_IMAGE } from "./docker-cli.js";
import { runLabels, useTestInstance } from "./harness.js";

const { runId, instance, decoyInstance } = useTestInstance("engine-read.int.test.ts");

/** The version every request is pinned to (design 1); the daemon must serve at least this one. */
const MIN_API = [1, 44];

function apiAtLeast(version: string, min: readonly number[]): boolean {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  return major > (min[0] ?? 0) || (major === min[0] && minor >= (min[1] ?? 0));
}

describe("engine connection", () => {
  it("pings the daemon and reads an API version of at least 1.44", async () => {
    const engine = new DockerEngine();

    await engine.ping();
    const version = await engine.version();

    expect(apiAtLeast(version.ApiVersion, MIN_API)).toBe(true);
  });
});

describe("engine without a daemon", () => {
  it("reports a missing socket as Docker unavailable (ENOENT)", async () => {
    const engine = new DockerEngine({ socketPath: "/nonexistent/docker.sock" });

    const failure = await engine.ping().then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(DockerUnavailableError);
    expect(failure).toMatchObject({ operation: "ping", errnoCode: "ENOENT" });
  });
});

describe("engine inspect", () => {
  it("answers null for a container, a volume and an image that do not exist", async () => {
    const engine = new DockerEngine();

    const results = await Promise.all([
      engine.inspectContainer(`wks-${instance}-absent`),
      engine.inspectVolume(`wks-${instance}-absent-files`),
      engine.inspectImage(`wks-absent-image:${runId}`),
    ]);

    expect(results).toEqual([null, null, null]);
  });

  it("reads this run's never-started container, its volume and the test image", async () => {
    const engine = new DockerEngine();
    const labels = runLabels(runId);
    const containerId = await createIdleContainer(`${instance}-inspected`, labels);
    await createVolume(`${instance}-inspected-files`, labels);

    const container = await engine.inspectContainer(`${instance}-inspected`);
    const volume = await engine.inspectVolume(`${instance}-inspected-files`);
    const image = await engine.inspectImage(TEST_IMAGE);

    expect(container).toMatchObject({
      Id: containerId,
      Name: `/${instance}-inspected`,
      State: { Running: false, StartedAt: NEVER_STARTED_AT },
      Config: { Image: TEST_IMAGE, Labels: labels },
    });
    expect(volume).toMatchObject({ Name: `${instance}-inspected-files`, Labels: labels });
    expect(image?.Id).toMatch(/^sha256:/);
  });
});

describe("engine lists", () => {
  const key: WorkspaceKey = {
    userId: "filter-user",
    courseId: "sample-course",
    lessonId: "with-workspace",
  };

  it("lists only managed objects of this instance, never a decoy instance or a run-label-only object", async () => {
    const engine = new DockerEngine();
    const run = runLabels(runId);
    const own = workspaceNames(instance, workspaceId(instance, key));
    const decoy = workspaceNames(decoyInstance, workspaceId(decoyInstance, key));
    const ownContainer = await createIdleContainer(own.container, {
      ...workspaceLabels(instance, key, "container"),
      ...run,
    });
    await createIdleContainer(decoy.container, {
      ...workspaceLabels(decoyInstance, key, "container"),
      ...run,
    });
    await createIdleContainer(`wks-${instance}-x`, run);
    await createVolume(own.volume, { ...workspaceLabels(instance, key, "volume"), ...run });
    await createVolume(decoy.volume, { ...workspaceLabels(decoyInstance, key, "volume"), ...run });
    const ownNetwork = await createNetwork(own.network, { ...networkLabels(instance), ...run });
    await createNetwork(decoy.network, { ...networkLabels(decoyInstance), ...run });

    const containers = await engine.listContainers(listFilter(instance));
    const volumes = await engine.listVolumes(listFilter(instance));
    const networks = await engine.listNetworks(listFilter(instance));

    expect(containers.map((container) => container.Id)).toEqual([ownContainer]);
    expect(volumes.map((volume) => volume.Name)).toEqual([own.volume]);
    expect(networks.map((network) => network.Id)).toEqual([ownNetwork]);
  });
});
