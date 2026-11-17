import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DockerEngine } from "../../../src/docker/engine.js";
import { createOrAdoptContainer, ensureVolume } from "../../../src/docker/objects.js";
import {
  type ContainerInspect,
  NEVER_STARTED_AT,
  type NetworkSummary,
  type VolumeInspect,
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
// inspectable yet, or never, when the first creator fails and Docker frees the name. The engine is the
// dependency here, stubbed; `createOrAdoptContainer` is the unit under test. Every case runs on fake timers, and
// the stubs stamp with the global `performance.now()`, the clock those timers move (`node:perf_hooks` is not).

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
const SECOND_ID = "second-container-id";
const CONFLICT = 409;
const NOT_FOUND = 404;
const SERVER_ERROR = 500;
const VOLUME_CREATED_AT = "2026-11-18T00:00:00Z";
// ADR-0010 item 8 as amended by #181. Pinned here rather than imported, so the test states the documented number
// and runs unchanged against code that does not export it.
const ADOPT_DEADLINE_MS_ADR = 5_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function containerOf(id: string, labels: Labels): ContainerInspect {
  return {
    Id: id,
    Name: `/${INPUT.names.container}`,
    State: {
      Status: "created",
      Running: false,
      StartedAt: NEVER_STARTED_AT,
      ExitCode: 0,
      OOMKilled: false,
    },
    Config: { Image: INPUT.image, Labels: { ...labels } },
    HostConfig: { Memory: INPUT.limits.memoryBytes, MemorySwap: INPUT.limits.memoryBytes },
  };
}

function instanceNetwork(): NetworkSummary[] {
  return [{ Id: "net-id", Name: instanceNetworkName(INSTANCE), Labels: networkLabels(INSTANCE) }];
}

/**
 * The labels Docker gives a volume it creates during a container create: those of the mount's
 * `VolumeOptions.Labels` only (moby `registerMountPoints`). Our body carries none, so this is `{}` today.
 */
function mountedVolumeLabels(body: ContainerCreateBody): Labels {
  const options: Record<string, unknown> = { ...body.HostConfig.Mounts[0]?.VolumeOptions };
  const labels = options.Labels;
  if (typeof labels !== "object" || labels === null) return {};
  return Object.fromEntries(
    Object.entries(labels).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value): Settled<T> => ({ ok: true, value }),
    (error: unknown): Settled<T> => ({ ok: false, error }),
  );
}

/** A daemon whose create always meets a taken name and whose inspect finds nothing `hiddenFor` times. */
class ReservedNameEngine extends DockerEngine {
  readonly createTimes: number[] = [];
  readonly inspectTimes: number[] = [];
  readonly volumeInspectTimes: number[] = [];
  readonly #hiddenFor: number;
  readonly #labels: Labels;
  readonly #inspectLatencyMs: number;

  constructor(
    hiddenFor: number,
    labels: Labels = workspaceLabels(INSTANCE, KEY, "container"),
    inspectLatencyMs = 0,
  ) {
    super({ socketPath: "/nonexistent/u-adopt.sock" });
    this.#hiddenFor = hiddenFor;
    this.#labels = labels;
    this.#inspectLatencyMs = inspectLatencyMs;
  }

  override async listNetworks(): Promise<NetworkSummary[]> {
    return instanceNetwork();
  }

  override async inspectVolume(name: string): Promise<VolumeInspect | null> {
    this.volumeInspectTimes.push(performance.now());
    return {
      Name: name,
      Labels: workspaceLabels(INSTANCE, KEY, "volume"),
      CreatedAt: VOLUME_CREATED_AT,
    };
  }

  override async createContainer(_name: string, _body: ContainerCreateBody): Promise<string> {
    this.createTimes.push(performance.now());
    throw new DockerApiError("create container", CONFLICT);
  }

  override async inspectContainer(_ref: string): Promise<ContainerInspect | null> {
    if (this.#inspectLatencyMs > 0) await delay(this.#inspectLatencyMs);
    this.inspectTimes.push(performance.now());
    if (this.inspectTimes.length <= this.#hiddenFor) return null;
    return containerOf(WINNER_ID, this.#labels);
  }
}

type NameState = { kind: "free" } | { kind: "reserved" } | { kind: "registered"; id: string };
type WinnerVerdict = "register" | "fail";

/**
 * One container name and one volume in moby's order: a create on a free name reserves it, and the first such
 * create waits for the test's verdict (register `WINNER_ID`, or fail with 500 and free the name); a create on a
 * reserved or registered name answers 409; a later create on a free name registers `SECOND_ID` at once, or with
 * `laterCreateFails` answers 404 and frees the name. Inspect finds only a registered container.
 */
class OneNameDaemon extends DockerEngine {
  volumeLabels: Labels | null = workspaceLabels(INSTANCE, KEY, "volume");
  #name: NameState = { kind: "free" };
  #decideWinner: ((verdict: WinnerVerdict) => void) | null = null;
  #hasHeldWinner = false;
  readonly #laterCreateFails: boolean;

  constructor(laterCreateFails = false) {
    super({ socketPath: "/nonexistent/u-adopt.sock" });
    this.#laterCreateFails = laterCreateFails;
  }

  get registeredId(): string | null {
    return this.#name.kind === "registered" ? this.#name.id : null;
  }

  finishWinner(verdict: WinnerVerdict): void {
    this.#decideWinner?.(verdict);
  }

  /** Another process's `DELETE` of the key: the container goes, then the volume. */
  removeWorkspace(): void {
    this.#name = { kind: "free" };
    this.volumeLabels = null;
  }

  override async listNetworks(): Promise<NetworkSummary[]> {
    return instanceNetwork();
  }

  override async inspectVolume(name: string): Promise<VolumeInspect | null> {
    if (this.volumeLabels === null) return null;
    return { Name: name, Labels: { ...this.volumeLabels }, CreatedAt: VOLUME_CREATED_AT };
  }

  override async createVolume(name: string, labels: Labels): Promise<string> {
    this.volumeLabels ??= { ...labels };
    return name;
  }

  override async createContainer(_name: string, body: ContainerCreateBody): Promise<string> {
    if (this.#name.kind !== "free") throw new DockerApiError("create container", CONFLICT);
    this.#name = { kind: "reserved" };
    if (!this.#hasHeldWinner) {
      this.#hasHeldWinner = true;
      return this.#holdWinner();
    }
    if (this.#laterCreateFails) {
      this.#name = { kind: "free" };
      throw new DockerApiError("create container", NOT_FOUND);
    }
    this.volumeLabels ??= mountedVolumeLabels(body);
    this.#name = { kind: "registered", id: SECOND_ID };
    return SECOND_ID;
  }

  override async inspectContainer(_ref: string): Promise<ContainerInspect | null> {
    if (this.#name.kind !== "registered") return null;
    return containerOf(this.#name.id, workspaceLabels(INSTANCE, KEY, "container"));
  }

  async #holdWinner(): Promise<string> {
    const verdict = await new Promise<WinnerVerdict>((resolve) => {
      this.#decideWinner = resolve;
    });
    if (verdict === "fail") {
      this.#name = { kind: "free" };
      throw new DockerApiError("create container", SERVER_ERROR);
    }
    this.#name = { kind: "registered", id: WINNER_ID };
    return WINNER_ID;
  }
}

describe("createOrAdoptContainer after a 409 (U-adopt)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("A: gives both concurrent callers the winner's container when the winner registers after 2 s", async () => {
    const daemon = new OneNameDaemon();

    const both = Promise.allSettled([
      createOrAdoptContainer(daemon, INPUT),
      createOrAdoptContainer(daemon, INPUT),
    ]);
    await vi.advanceTimersByTimeAsync(2_000);
    daemon.finishWinner("register");
    await vi.advanceTimersByTimeAsync(ADOPT_DEADLINE_MS_ADR);

    expect(await both).toEqual([
      { status: "fulfilled", value: WINNER_ID },
      { status: "fulfilled", value: WINNER_ID },
    ]);
    expect(daemon.registeredId).toBe(WINNER_ID);
  });

  it("B: lets the loser create and own the container when the winner's create fails and frees the name", async () => {
    const daemon = new OneNameDaemon();

    const both = Promise.allSettled([
      createOrAdoptContainer(daemon, INPUT),
      createOrAdoptContainer(daemon, INPUT),
    ]);
    // Inside the old 375 ms of re-inspects, so only a re-create can get past the freed name.
    await vi.advanceTimersByTimeAsync(100);
    daemon.finishWinner("fail");
    await vi.advanceTimersByTimeAsync(ADOPT_DEADLINE_MS_ADR);
    const [winner, loser] = await both;

    expect(winner.status).toBe("rejected");
    expect(winner.status === "rejected" && winner.reason).toMatchObject({
      statusCode: SERVER_ERROR,
    });
    expect(loser).toEqual({ status: "fulfilled", value: SECOND_ID });
    expect(daemon.registeredId).toBe(SECOND_ID);
  });

  it("B2: passes the re-create's own error through when the freed name cannot be created either", async () => {
    const daemon = new OneNameDaemon(true);

    const both = Promise.allSettled([
      createOrAdoptContainer(daemon, INPUT),
      createOrAdoptContainer(daemon, INPUT),
    ]);
    await vi.advanceTimersByTimeAsync(100);
    daemon.finishWinner("fail");
    await vi.advanceTimersByTimeAsync(ADOPT_DEADLINE_MS_ADR);
    const [, loser] = await both;

    expect(loser.status === "rejected" && loser.reason).toBeInstanceOf(DockerApiError);
    expect(loser.status === "rejected" && loser.reason).toMatchObject({ statusCode: NOT_FOUND });
  });

  it("D: re-ensures the volume before a re-create, so a workspace another process removed during the wait comes back labelled", async () => {
    const daemon = new OneNameDaemon();

    const winner = createOrAdoptContainer(daemon, INPUT);
    const ours = settle(createOrAdoptContainer(daemon, INPUT));
    await vi.advanceTimersByTimeAsync(10);
    daemon.finishWinner("register");
    await expect(winner).resolves.toBe(WINNER_ID);
    // Our first re-create runs at 25 ms, after this remove, so it meets a free name and an absent volume.
    daemon.removeWorkspace();
    await vi.advanceTimersByTimeAsync(ADOPT_DEADLINE_MS_ADR);

    expect(await ours).toEqual({ ok: true, value: SECOND_ID });
    expect(daemon.volumeLabels).toEqual(workspaceLabels(INSTANCE, KEY, "volume"));
    await expect(ensureVolume(daemon, INSTANCE, KEY)).resolves.toBe(INPUT.names.volume);
  });

  it("C: gives up at the deadline with the typed error, never before it", async () => {
    const engine = new ReservedNameEngine(Number.POSITIVE_INFINITY);
    const startedAt = performance.now();
    let settledAt: number | null = null;

    const outcome = settle(createOrAdoptContainer(engine, INPUT));
    void outcome.then(() => {
      settledAt = performance.now();
    });
    await vi.advanceTimersByTimeAsync(ADOPT_DEADLINE_MS_ADR - 1);
    const settledBeforeDeadline = settledAt;
    await vi.advanceTimersByTimeAsync(1);
    const result = await outcome;

    expect(settledBeforeDeadline).toBeNull();
    expect(settledAt).toBe(startedAt + ADOPT_DEADLINE_MS_ADR);
    const failure = result.ok ? null : result.error;
    expect(failure).toBeInstanceOf(ContainerNameUnresolvedError);
    expect(failure).not.toBeInstanceOf(DockerApiError);
    expect(failure).toMatchObject({
      containerName: INPUT.names.container,
      waitedMs: ADOPT_DEADLINE_MS_ADR,
    });
    expect(engine.inspectTimes).toHaveLength(11);
    expect(engine.createTimes).toHaveLength(11);
    expect(engine.volumeInspectTimes).toHaveLength(10);
  });

  it("C2: reports the time actually waited, slow inspects included", async () => {
    const engine = new ReservedNameEngine(Number.POSITIVE_INFINITY, undefined, 700);

    const outcome = settle(createOrAdoptContainer(engine, INPUT));
    await vi.advanceTimersByTimeAsync(3 * ADOPT_DEADLINE_MS_ADR);
    const result = await outcome;

    const failure = result.ok ? null : result.error;
    expect(failure).toBeInstanceOf(ContainerNameUnresolvedError);
    expect(failure).toMatchObject({ waitedMs: 5_700 });
    expect(engine.inspectTimes).toHaveLength(7);
  });

  it("1: waits out a name that resolves on the fourth inspect, with one re-create before each re-inspect", async () => {
    const engine = new ReservedNameEngine(3);

    const outcome = settle(createOrAdoptContainer(engine, INPUT));
    await vi.advanceTimersByTimeAsync(ADOPT_DEADLINE_MS_ADR);

    expect(await outcome).toEqual({ ok: true, value: WINNER_ID });
    expect(engine.inspectTimes).toHaveLength(4);
    expect(engine.createTimes).toHaveLength(4);
  });

  it("3: refuses a found container that carries another user's labels, with no call after it", async () => {
    const otherUser: WorkspaceKey = { ...KEY, userId: "someone-else" };
    const engine = new ReservedNameEngine(1, workspaceLabels(INSTANCE, otherUser, "container"));

    const outcome = settle(createOrAdoptContainer(engine, INPUT));
    await vi.advanceTimersByTimeAsync(ADOPT_DEADLINE_MS_ADR);
    const result = await outcome;

    expect(result.ok ? null : result.error).toBeInstanceOf(WorkspaceIdentityMismatchError);
    expect(engine.inspectTimes).toHaveLength(2);
    expect(engine.createTimes).toHaveLength(2);
  });
});
