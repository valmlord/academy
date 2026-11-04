import { describe, expect, it } from "vitest";
import {
  createIdleContainer,
  createNetwork,
  createVolume,
  docker,
  inspectObject,
} from "./docker-cli.js";
import { removeTestObject, runLabels, TestObjectRefusedError, useTestInstance } from "./harness.js";

const { runId, instance } = useTestInstance("harness.int.test.ts");

describe("test harness", () => {
  it("refuses to remove a volume without this run's label, and the volume survives", async () => {
    const name = `wks-unlabeled-${runId}`;
    await createVolume(name, {});
    try {
      await expect(removeTestObject("volume", name)).rejects.toBeInstanceOf(TestObjectRefusedError);

      expect(await inspectObject("volume", name)).not.toBeNull();
    } finally {
      // The helper refuses it and the teardown cannot see it, so the test removes its own volume by exact name.
      await docker(["volume", "rm", name]);
    }
  });

  it("removes this run's container and network by the Id their create returned, and the volume by name", async () => {
    const labels = runLabels(runId);
    const containerId = await createIdleContainer(`${instance}-helper`, labels);
    const networkId = await createNetwork(`${instance}-helper-net`, labels);
    const volume = `${instance}-helper-files`;
    await createVolume(volume, labels);

    const removed = [
      await removeTestObject("container", `${instance}-helper`),
      await removeTestObject("network", `${instance}-helper-net`),
      await removeTestObject("volume", volume),
    ];

    expect(removed).toEqual([containerId, networkId, volume]);
    expect(await inspectObject("container", containerId)).toBeNull();
    expect(await inspectObject("network", networkId)).toBeNull();
    expect(await inspectObject("volume", volume)).toBeNull();
  });
});
