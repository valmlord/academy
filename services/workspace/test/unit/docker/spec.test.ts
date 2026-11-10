import { describe, expect, it } from "vitest";
import { buildContainerSpec, type ContainerSpecInput } from "../../../src/docker/spec.js";
import { type WorkspaceKey, workspaceId, workspaceNames } from "../../../src/identity.js";

const INSTANCE = "local";
const KEY: WorkspaceKey = {
  userId: "user-1",
  courseId: "sample-course",
  lessonId: "with-workspace",
};
const ID = workspaceId(INSTANCE, KEY);
const NAMES = workspaceNames(INSTANCE, ID);
const INPUT: ContainerSpecInput = {
  image: "academy-workspace:dev",
  instance: INSTANCE,
  key: KEY,
  names: NAMES,
  limits: { nanoCpus: 2_000_000_000, memoryBytes: 2 * 1024 ** 3, pidsLimit: 512 },
};

describe("buildContainerSpec", () => {
  it("has exactly the allowlisted top-level keys", () => {
    const spec = buildContainerSpec(INPUT);

    expect(Object.keys(spec).sort()).toEqual(
      ["Cmd", "Env", "HostConfig", "Image", "Labels", "StopTimeout", "User", "WorkingDir"].sort(),
    );
  });

  it("has exactly the allowlisted HostConfig keys", () => {
    const spec = buildContainerSpec(INPUT);

    expect(Object.keys(spec.HostConfig).sort()).toEqual(
      [
        "CapDrop",
        "Init",
        "Memory",
        "MemorySwap",
        "Mounts",
        "NanoCpus",
        "NetworkMode",
        "OomScoreAdj",
        "PidsLimit",
        "ReadonlyRootfs",
        "RestartPolicy",
        "SecurityOpt",
        "Tmpfs",
      ].sort(),
    );
  });

  it("gives every allowlisted key its exact value", () => {
    const spec = buildContainerSpec(INPUT);

    expect(spec).toStrictEqual({
      Image: "academy-workspace:dev",
      User: "1000:1000",
      Env: ["HOME=/workspace/home"],
      WorkingDir: "/workspace/home/work",
      Cmd: ["sleep", "infinity"],
      Labels: {
        "academy.workspace.managed": "true",
        "academy.workspace.schema": "1",
        "academy.workspace.instance": "local",
        "academy.workspace.role": "container",
        "academy.workspace.id": ID,
        "academy.workspace.user": "user-1",
        "academy.workspace.course": "sample-course",
        "academy.workspace.lesson": "with-workspace",
      },
      StopTimeout: 10,
      HostConfig: {
        NanoCpus: 2_000_000_000,
        Memory: 2_147_483_648,
        MemorySwap: 2_147_483_648,
        PidsLimit: 512,
        OomScoreAdj: 500,
        Tmpfs: { "/tmp": "rw,nosuid,nodev,exec,size=256m,mode=1777" },
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges:true"],
        ReadonlyRootfs: true,
        Init: true,
        RestartPolicy: { Name: "no" },
        NetworkMode: "wks-local-net",
        Mounts: [
          {
            Type: "volume",
            Source: `wks-local-${ID}-files`,
            Target: "/workspace",
            VolumeOptions: { NoCopy: true },
          },
        ],
      },
    });
  });

  it("takes the three limits from the input and keeps swap equal to memory", () => {
    const spec = buildContainerSpec({
      ...INPUT,
      limits: { nanoCpus: 500_000_000, memoryBytes: 128 * 1024 ** 2, pidsLimit: 64 },
    });

    expect(spec.HostConfig).toMatchObject({
      NanoCpus: 500_000_000,
      Memory: 134_217_728,
      MemorySwap: 134_217_728,
      PidsLimit: 64,
    });
  });
});
