import { describe, expect, it } from "vitest";
import type { WorkspaceLimits } from "../../src/config.js";
import { DockerEngine } from "../../src/docker/engine.js";
import { ensureVolume } from "../../src/docker/objects.js";
import { DockerRuntime } from "../../src/docker/runtime.js";
import { LEARNER_GID, LEARNER_UID, type WorkspaceKey, workspaceId } from "../../src/identity.js";
import { docker, dockerResult } from "./docker-cli.js";
import { FIXTURE_COURSE_ROOT, fixtureSpec, STOP_SECONDS, TEST_LIMITS } from "./fixtures.js";
import { useTestInstance } from "./harness.js";

// The state view (design 6.2 `inspect`) and what the limits of 4.5 do inside a real container (5.5).

const { instance } = useTestInstance("runtime-state.int.test.ts");

const key: WorkspaceKey = {
  userId: "state-user",
  courseId: "sample-course",
  lessonId: "with-workspace",
};
const spec = fixtureSpec(key);
const MIB = 1024 * 1024;
/** I-oom's limit: small enough that a 256 MiB buffer cannot fit, large enough for node to start. */
const OOM_MEMORY_BYTES = 128 * MIB;
const SIGKILL_EXIT_CODE = 137;
/** cgroup v2 `cpu.max` is "<quota> <period>"; Docker's period is 100 ms. */
const CPU_PERIOD_US = 100_000;
const NANOS_PER_CPU = 1_000_000_000;

function newRuntime(engine: DockerEngine, limits: WorkspaceLimits = TEST_LIMITS): DockerRuntime {
  return new DockerRuntime({ engine, instance, courseRoot: FIXTURE_COURSE_ROOT, limits });
}

async function runningWorkspace(runtime: DockerRuntime): Promise<string> {
  const result = await runtime.ensureRunning(spec);
  const id = result.workspace.containerId;
  if (id === null) throw new Error("ensureRunning returned no container");
  return id;
}

async function cgroupValue(containerId: string, file: string): Promise<string> {
  return (await docker(["exec", containerId, "cat", `/sys/fs/cgroup/${file}`])).trim();
}

// A Buffer lives outside the V8 heap, and touching every byte makes the kernel back each page, so the
// cgroup limit (not V8's own heap limit, which would abort with 134) ends the process.
const ALLOCATE_256_MIB = `
const buffer = Buffer.allocUnsafe(256 * 1024 * 1024);
for (let i = 0; i < buffer.length; i++) buffer[i] = i & 0xff;
console.log("allocated");
`;

describe("DockerRuntime.inspect", () => {
  it("I-delete-partial (GET part): reports a volume without a container as stopped with no image", async () => {
    const engine = new DockerEngine();
    const runtime = newRuntime(engine);
    const before = await runtime.inspect(key);
    await ensureVolume(engine, instance, key);

    const view = await runtime.inspect(key);

    expect(before).toBeNull();
    expect(view).toEqual({
      id: workspaceId(instance, key),
      key,
      state: "stopped",
      containerId: null,
      image: null,
      exit: null,
    });
  });

  it("I-oom: the OOM killer ends the process, the container runs on, and the stop maps by 4.1", async () => {
    const engine = new DockerEngine();
    const runtime = newRuntime(engine, { ...TEST_LIMITS, memoryBytes: OOM_MEMORY_BYTES });
    const id = await runningWorkspace(runtime);

    const allocation = await dockerResult([
      "exec",
      "-u",
      `${LEARNER_UID}:${LEARNER_GID}`,
      id,
      "node",
      "-e",
      ALLOCATE_256_MIB,
    ]);
    const afterKill = await runtime.inspect(key);
    const followUp = await dockerResult(["exec", id, "true"]);
    await engine.stopContainer(id, STOP_SECONDS);
    const stopped = await engine.inspectContainer(id);
    const oomKilled = stopped?.State.OOMKilled ?? false;
    const exitCode = stopped?.State.ExitCode ?? -1;
    console.log(`I-oom OOMKilled=${String(oomKilled)} ExitCode=${String(exitCode)}`);
    const view = await runtime.inspect(key);

    expect(allocation.exitCode).toBe(SIGKILL_EXIT_CODE);
    expect(afterKill?.state).toBe("running");
    expect(followUp.exitCode).toBe(0);
    expect(view?.state).toBe("stopped");
    expect(view?.exit).toEqual({
      code: exitCode,
      reason: oomKilled && exitCode === SIGKILL_EXIT_CODE ? "memory-limit" : "exited",
    });
  });

  it("I-limits: the cgroup shows the configured memory, pids and cpu, and swap equals memory", async () => {
    const engine = new DockerEngine();
    const id = await runningWorkspace(newRuntime(engine));

    const memory = await cgroupValue(id, "memory.max");
    const pids = await cgroupValue(id, "pids.max");
    const cpu = await cgroupValue(id, "cpu.max");
    const swapFile = await dockerResult([
      "exec",
      id,
      "test",
      "-e",
      "/sys/fs/cgroup/memory.swap.max",
    ]);
    const hostConfig = (await engine.inspectContainer(id))?.HostConfig;

    expect(memory).toBe(String(TEST_LIMITS.memoryBytes));
    expect(pids).toBe(String(TEST_LIMITS.pidsLimit));
    expect(cpu).toBe(
      `${String((TEST_LIMITS.nanoCpus / NANOS_PER_CPU) * CPU_PERIOD_US)} ${String(CPU_PERIOD_US)}`,
    );
    expect(hostConfig?.MemorySwap).toBe(hostConfig?.Memory);
    if (swapFile.exitCode === 0) expect(await cgroupValue(id, "memory.swap.max")).toBe("0");
  });
});
