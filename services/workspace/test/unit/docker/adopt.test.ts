import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { DockerEngine } from "../../../src/docker/engine.js";
import { ADOPT_INSPECT_DELAYS_MS, createOrAdoptContainer } from "../../../src/docker/objects.js";
import {
  type ContainerInspect,
  NEVER_STARTED_AT,
  type NetworkSummary,
} from "../../../src/docker/schemas.js";
import type { ContainerCreateBody, ContainerSpecInput } from "../../../src/docker/spec.js";
import {
  ContainerNameUnresolvedError,
  DockerApiError,
  WorkspaceIdentityMismatchError,
} from "../../../src/errors.js";
import {
  instanceNetworkName,
  type Labels,
  networkLabels,
  type WorkspaceKey,
  workspaceId,
  workspaceLabels,
  workspaceNames,
} from "../../../src/identity.js";

// U-adopt (design amendment 1): the create of a taken name answers 409 while the container behind it may not be
// inspectable yet. The engine is the dependency here, stubbed; `createOrAdoptContainer` is the unit under test.

const INSTANCE = "local";
const KEY: WorkspaceKey = {
  userId: "user-1",
  courseId: "sample-course",
  lessonId: "with-workspace",
};
const INPUT: ContainerSpecInput = {
  image: "academy-workspace:dev",
  instance: INSTANCE,
  key: KEY,
  names: workspaceNames(INSTANCE, workspaceId(INSTANCE, KEY)),
  limits: { nanoCpus: 1_000_000_000, memoryBytes: 256 * 1024 ** 2, pidsLimit: 64 },
};
const WINNER_ID = "winner-container-id";
const CONFLICT = 409;

/** A daemon whose create always meets a taken name and whose inspect finds nothing `hiddenFor` times. */
class ReservedNameEngine extends DockerEngine {
  readonly createTimes: number[] = [];
  readonly inspectTimes: number[] = [];
  readonly #hiddenFor: number;
  readonly #labels: Labels;

  constructor(hiddenFor: number, labels: Labels = workspaceLabels(INSTANCE, KEY, "container")) {
    super({ socketPath: "/nonexistent/u-adopt.sock" });
    this.#hiddenFor = hiddenFor;
    this.#labels = labels;
  }

  override async listNetworks(): Promise<NetworkSummary[]> {
    return [{ Id: "net-id", Name: instanceNetworkName(INSTANCE), Labels: networkLabels(INSTANCE) }];
  }

  override async createContainer(_name: string, _body: ContainerCreateBody): Promise<string> {
    this.createTimes.push(performance.now());
    throw new DockerApiError("create container", CONFLICT);
  }

  override async inspectContainer(_ref: string): Promise<ContainerInspect | null> {
    this.inspectTimes.push(performance.now());
    if (this.inspectTimes.length <= this.#hiddenFor) return null;
    return {
      Id: WINNER_ID,
      Name: `/${INPUT.names.container}`,
      State: {
        Status: "created",
        Running: false,
        StartedAt: NEVER_STARTED_AT,
        ExitCode: 0,
        OOMKilled: false,
      },
      Config: { Image: INPUT.image, Labels: { ...this.#labels } },
    };
  }
}

describe("createOrAdoptContainer after a 409 (U-adopt)", () => {
  it("1: waits out a name that resolves on the fourth inspect and adopts that container", async () => {
    const engine = new ReservedNameEngine(3);

    const id = await createOrAdoptContainer(engine, INPUT);

    expect(id).toBe(WINNER_ID);
    expect(engine.inspectTimes).toHaveLength(4);
    expect(engine.createTimes).toHaveLength(1);
  });

  it("2: gives up after five inspects and at least 300 ms, with the typed error and no second create", async () => {
    const engine = new ReservedNameEngine(Number.POSITIVE_INFINITY);
    const started = performance.now();

    const failure = await createOrAdoptContainer(engine, INPUT).catch((error: unknown) => error);
    const elapsedMs = performance.now() - started;

    expect(failure).toBeInstanceOf(ContainerNameUnresolvedError);
    expect(failure).not.toBeInstanceOf(DockerApiError);
    expect(failure).toMatchObject({ containerName: INPUT.names.container, waitedMs: 375 });
    expect(engine.inspectTimes).toHaveLength(ADOPT_INSPECT_DELAYS_MS.length + 1);
    expect(engine.createTimes).toHaveLength(1);
    const conflictAt = engine.createTimes[0] ?? Number.NaN;
    const lastInspectAt = engine.inspectTimes.at(-1) ?? Number.NaN;
    expect(lastInspectAt - conflictAt).toBeGreaterThanOrEqual(300);
    expect(elapsedMs).toBeLessThan(1000);
  });

  it("3: refuses a found container that carries another user's labels", async () => {
    const otherUser: WorkspaceKey = { ...KEY, userId: "someone-else" };
    const engine = new ReservedNameEngine(1, workspaceLabels(INSTANCE, otherUser, "container"));

    const failure = await createOrAdoptContainer(engine, INPUT).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(WorkspaceIdentityMismatchError);
    expect(engine.inspectTimes).toHaveLength(2);
  });
});
