import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DockerEngine } from "../../src/docker/engine.js";
import { DockerRuntime } from "../../src/docker/runtime.js";
import { WorkspaceIdentityMismatchError } from "../../src/errors.js";
import { LABEL, LABEL_SCHEMA, type WorkspaceKey, workspaceLabels } from "../../src/identity.js";
import type { GcResult } from "../../src/runtime.js";
import { createIdleContainer, docker, inspectObject, TEST_IMAGE } from "./docker-cli.js";
import { FIXTURE_COURSE_ROOT, fixtureSpec, STOP_SECONDS, TEST_LIMITS } from "./fixtures.js";
import { removeTestObject, runLabels, useTestInstance } from "./harness.js";

// I-gc-primitives (design 12.2): the GC primitives act on what 5.1's GC predicate admits (managed, this
// instance, the right state), whether or not the key labels parse, and refuse everything else by its Id.

const { runId, instance, decoyInstance } = useTestInstance("gc-primitives.int.test.ts");

const key: WorkspaceKey = {
  userId: "gc-user",
  courseId: "sample-course",
  lessonId: "with-workspace",
};
/** The hex part of a workspace name; random, so each block gets its own name. */
const ID_BYTES = 10;

function newRuntime(engine: DockerEngine): DockerRuntime {
  return new DockerRuntime({
    engine,
    instance,
    courseRoot: FIXTURE_COURSE_ROOT,
    limits: TEST_LIMITS,
  });
}

function blockName(): string {
  return `wks-${instance}-${randomBytes(ID_BYTES).toString("hex")}`;
}

/** Managed and of this instance, but without user, course and lesson: labels that parse `invalid`. */
function invalidLabels(): Record<string, string> {
  return {
    ...runLabels(runId),
    [LABEL.managed]: "true",
    [LABEL.instance]: instance,
    [LABEL.schema]: LABEL_SCHEMA,
    [LABEL.role]: "container",
  };
}

const BLOCK_LABELS = {
  decoy: () => ({ ...workspaceLabels(decoyInstance, key, "container"), ...runLabels(runId) }),
  runLabelOnly: () => runLabels(runId),
  instanceOnly: () => ({ ...runLabels(runId), [LABEL.instance]: instance }),
};

/** A running block: the test image's `sleep infinity` under `--init`, on no network (12.2). */
async function runningBlock(labels: Readonly<Record<string, string>>): Promise<string> {
  const labelArgs = Object.entries(labels).flatMap(([label, value]) => [
    "--label",
    `${label}=${value}`,
  ]);
  const args = ["run", "-d", "--init", "--network", "none", "--name", blockName(), ...labelArgs];
  return (await docker([...args, TEST_IMAGE, "sleep", "infinity"])).trim();
}

async function stoppedBlock(labels: Readonly<Record<string, string>>): Promise<string> {
  const id = await runningBlock(labels);
  await docker(["stop", "-t", String(STOP_SECONDS), id]);
  return id;
}

async function stateOf(id: string): Promise<string | null> {
  return (await inspectObject("container", id))?.state ?? null;
}

async function outcome(call: Promise<GcResult>): Promise<GcResult | "mismatch"> {
  try {
    return await call;
  } catch (error: unknown) {
    if (error instanceof WorkspaceIdentityMismatchError) return "mismatch";
    throw error;
  }
}

describe("GC primitives", () => {
  it("1: listManaged returns this instance's managed containers, valid or not, and nothing else", async () => {
    const engine = new DockerEngine();
    const runtime = newRuntime(engine);
    const valid = (await runtime.ensureRunning(fixtureSpec(key))).workspace.containerId;
    const running = await runningBlock(invalidLabels());
    const neverStarted = await createIdleContainer(blockName(), invalidLabels());
    await runningBlock(BLOCK_LABELS.decoy());
    await runningBlock(BLOCK_LABELS.runLabelOnly());
    await runningBlock(BLOCK_LABELS.instanceOnly());

    const listed = await runtime.listManaged();

    expect(listed.map((container) => container.containerId).sort()).toEqual(
      [valid, running, neverStarted].sort(),
    );
  });

  it("2: refuses the decoy, the run-label-only and the instance-only container by Id, which keep running", async () => {
    const runtime = newRuntime(new DockerEngine());
    const blocks = {
      decoy: await runningBlock(BLOCK_LABELS.decoy()),
      runLabelOnly: await runningBlock(BLOCK_LABELS.runLabelOnly()),
      instanceOnly: await runningBlock(BLOCK_LABELS.instanceOnly()),
    };

    const results: Record<string, string> = {};
    for (const [name, id] of Object.entries(blocks)) {
      results[`${name} stop`] = await outcome(runtime.stopContainer(id));
      results[`${name} remove`] = await outcome(runtime.removeContainer(id));
    }
    const states = [
      await stateOf(blocks.decoy),
      await stateOf(blocks.runLabelOnly),
      await stateOf(blocks.instanceOnly),
    ];

    expect(results).toEqual({
      "decoy stop": "mismatch",
      "decoy remove": "mismatch",
      "runLabelOnly stop": "mismatch",
      "runLabelOnly remove": "mismatch",
      "instanceOnly stop": "mismatch",
      "instanceOnly remove": "mismatch",
    });
    expect(states).toEqual(["running", "running", "running"]);
  });

  it("3: stops a running container with invalid labels", async () => {
    const runtime = newRuntime(new DockerEngine());
    const id = await runningBlock(invalidLabels());

    const result = await outcome(runtime.stopContainer(id));

    expect(result).toBe("done");
    expect(await stateOf(id)).not.toBe("running");
  });

  it("4: removes a never-started container with invalid labels", async () => {
    const runtime = newRuntime(new DockerEngine());
    const id = await createIdleContainer(blockName(), invalidLabels());

    const result = await outcome(runtime.removeContainer(id));

    expect(result).toBe("done");
    expect(await inspectObject("container", id)).toBeNull();
  });

  it("5: does not remove a running valid workspace", async () => {
    const runtime = newRuntime(new DockerEngine());
    const id = (await runtime.ensureRunning(fixtureSpec(key))).workspace.containerId ?? "";

    const result = await outcome(runtime.removeContainer(id));

    expect(result).toBe("state-changed");
    expect(await stateOf(id)).toBe("running");
  });

  it("6: does not stop a container with invalid labels that is already stopped", async () => {
    const runtime = newRuntime(new DockerEngine());
    const id = await stoppedBlock(invalidLabels());

    const result = await outcome(runtime.stopContainer(id));

    expect(result).toBe("state-changed");
    expect(await stateOf(id)).toBe("exited");
  });

  it("7: answers gone for the Id of a container that no longer exists", async () => {
    const runtime = newRuntime(new DockerEngine());
    const id = await createIdleContainer(blockName(), invalidLabels());
    await removeTestObject("container", id);

    const results = [
      await outcome(runtime.stopContainer(id)),
      await outcome(runtime.removeContainer(id)),
    ];

    expect(results).toEqual(["gone", "gone"]);
  });
});
