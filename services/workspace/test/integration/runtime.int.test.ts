import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadStarter, type StarterItem } from "../../src/course/starter.js";
import { DockerEngine } from "../../src/docker/engine.js";
import { createOrAdoptContainer, ensureVolume } from "../../src/docker/objects.js";
import { DockerRuntime } from "../../src/docker/runtime.js";
import type { ContainerSpecInput } from "../../src/docker/spec.js";
import { buildStarterTar } from "../../src/docker/tar.js";
import { ImageMissingError } from "../../src/errors.js";
import {
  instanceNetworkName,
  LABEL,
  LEARNER_GID,
  LEARNER_UID,
  networkLabels,
  STARTER_MARKER,
  WORK_DIR,
  WORKSPACE_MOUNT,
  type WorkspaceKey,
  workspaceId,
  workspaceNames,
} from "../../src/identity.js";
import type { WorkspaceSpec } from "../../src/runtime.js";
import {
  DockerCliError,
  docker,
  inspectObject,
  listObjects,
  type ObjectKind,
  TEST_IMAGE,
} from "./docker-cli.js";
import { fulfilledValue, STOP_SECONDS, statusOf, TEST_LIMITS } from "./fixtures.js";
import { removeTestObject, useTestInstance } from "./harness.js";

// Runtime level (design 12.2): `DockerRuntime.ensureRunning` converges from every state a crash can leave.
// Files are read inside the container as the learner (uid 1000), the way #32's terminal will read them.

const { runId, instance } = useTestInstance("runtime.int.test.ts");

const COURSE_ROOT = fileURLToPath(new URL("../fixtures/course", import.meta.url));
const LESSON_DIR = "sample-course/01-basics/01-with-workspace";
const STARTER = "starter";
/** Every file of the fixture starter, relative to it. */
const STARTER_FILES = ["README.md", ".config-note", "src/main.sh", "src/lib/util.txt"];
const CHANGED_FILE = "README.md";
const CHANGED_CONTENT = "changed by the learner\n";

const key: WorkspaceKey = {
  userId: "runtime-user",
  courseId: "sample-course",
  lessonId: "with-workspace",
};
const names = workspaceNames(instance, workspaceId(instance, key));
const spec: WorkspaceSpec = {
  key,
  image: TEST_IMAGE,
  starter: { lessonDir: LESSON_DIR, relPath: STARTER },
};
const specInput: ContainerSpecInput = {
  image: TEST_IMAGE,
  instance,
  key,
  names,
  limits: TEST_LIMITS,
};

function newRuntime(engine: DockerEngine): DockerRuntime {
  return new DockerRuntime({ engine, instance, courseRoot: COURSE_ROOT, limits: TEST_LIMITS });
}

function learnerExec(containerId: string, command: readonly string[]): Promise<string> {
  return docker(["exec", "-u", `${LEARNER_UID}:${LEARNER_GID}`, containerId, ...command]);
}

async function markerExists(containerId: string): Promise<boolean> {
  try {
    await learnerExec(containerId, ["test", "-e", STARTER_MARKER]);
    return true;
  } catch (error: unknown) {
    if (error instanceof DockerCliError) return false;
    throw error;
  }
}

/** A file under `work/` as the learner reads it, `null` when it cannot be read. */
async function workFileOrNull(containerId: string, file: string): Promise<string | null> {
  try {
    return await learnerExec(containerId, ["cat", `${WORK_DIR}/${file}`]);
  } catch (error: unknown) {
    if (error instanceof DockerCliError) return null;
    throw error;
  }
}

async function expectStarterFilesPresent(containerId: string): Promise<void> {
  for (const file of STARTER_FILES) {
    const expected = await readFile(join(COURSE_ROOT, LESSON_DIR, STARTER, file), "utf8");
    expect(await workFileOrNull(containerId, file), file).toBe(expected);
  }
  expect(await markerExists(containerId)).toBe(true);
}

async function changeWorkFile(containerId: string): Promise<void> {
  const path = `${WORK_DIR}/${CHANGED_FILE}`;
  await learnerExec(containerId, [
    "sh",
    "-c",
    `printf '%s' "$1" > "$2"`,
    "sh",
    CHANGED_CONTENT,
    path,
  ]);
}

function readWorkFile(containerId: string): Promise<string> {
  return learnerExec(containerId, ["cat", `${WORK_DIR}/${CHANGED_FILE}`]);
}

/** Objects of this file's instance, as the harness CLI lists them. */
async function countOf(kind: ObjectKind): Promise<number> {
  return (await listObjects(kind, [`label=${LABEL.instance}=${instance}`])).length;
}

async function expectOneOfEach(): Promise<void> {
  expect([await countOf("container"), await countOf("volume"), await countOf("network")]).toEqual([
    1, 1, 1,
  ]);
}

async function expectRunning(engine: DockerEngine, containerId: string): Promise<void> {
  expect((await engine.inspectContainer(containerId))?.State.Running).toBe(true);
}

/** The starter's items as the S11 builder takes them. */
function starterItems(): Promise<StarterItem[]> {
  return loadStarter(COURSE_ROOT, LESSON_DIR, STARTER);
}

const TAR_BLOCK = 512;
const END_OF_ARCHIVE = 2 * TAR_BLOCK;
/** The ustar header's name field, NUL-padded. */
const TAR_NAME_BYTES = 100;

/**
 * The S11 builder's tar without its last entry, the marker: an empty file is one header block, followed only
 * by the end-of-archive blocks. The cut is checked by the header's name, so a change in the builder fails here.
 */
function withoutMarker(tar: Buffer): Buffer {
  const headerAt = tar.length - END_OF_ARCHIVE - TAR_BLOCK;
  const nameField = tar.subarray(headerAt, headerAt + TAR_NAME_BYTES);
  const nameEnd = nameField.indexOf(0);
  const name = nameField.subarray(0, nameEnd === -1 ? TAR_NAME_BYTES : nameEnd).toString("utf8");
  expect(`${WORKSPACE_MOUNT}/${name}`).toBe(STARTER_MARKER);
  return Buffer.concat([tar.subarray(0, headerAt), Buffer.alloc(END_OF_ARCHIVE)]);
}

describe("DockerRuntime.ensureRunning", () => {
  it("I-idem: creates once, then finds it running, then starts it again without a second copy", async () => {
    const engine = new DockerEngine();
    const runtime = newRuntime(engine);

    const first = await runtime.ensureRunning(spec);
    const firstId = first.workspace.containerId ?? "";
    await expectRunning(engine, firstId);
    await expectStarterFilesPresent(firstId);
    const startedAt = (await engine.inspectContainer(firstId))?.State.StartedAt;
    const second = await runtime.ensureRunning(spec);
    const secondStartedAt = (await engine.inspectContainer(firstId))?.State.StartedAt;
    await expectOneOfEach();
    await changeWorkFile(firstId);
    await engine.stopContainer(firstId, STOP_SECONDS);
    const third = await runtime.ensureRunning(spec);

    expect(first.outcome).toBe("created");
    expect([second.outcome, second.workspace.containerId]).toEqual(["running", firstId]);
    expect(secondStartedAt).toBe(startedAt);
    expect([third.outcome, third.workspace.containerId]).toEqual(["started", firstId]);
    await expectRunning(engine, firstId);
    expect(await readWorkFile(firstId)).toBe(CHANGED_CONTENT);
  });

  it("I-conc: two concurrent calls on one runtime without a lock converge on one container", async () => {
    const engine = new DockerEngine();
    const runtime = newRuntime(engine);

    const settled = await Promise.allSettled([
      runtime.ensureRunning(spec),
      runtime.ensureRunning(spec),
    ]);

    const results = settled.map(fulfilledValue);
    const ids = results.map((result) => result.workspace.containerId);
    const outcomes = results.map((result) => result.outcome);
    expect(ids[0]).toBe(ids[1]);
    expect(outcomes).toContain("created");
    for (const outcome of outcomes) expect(["created", "started", "running"]).toContain(outcome);
    expect([await countOf("container"), await countOf("volume")]).toEqual([1, 1]);
  });

  it("I-half (a): converges from a volume only, reusing that volume", async () => {
    const engine = new DockerEngine();
    await ensureVolume(engine, instance, key);
    const volumeBefore = await inspectObject("volume", names.volume);

    const result = await newRuntime(engine).ensureRunning(spec);
    const id = result.workspace.containerId ?? "";

    expect(result.outcome).toBe("created");
    await expectStarterFilesPresent(id);
    expect((await inspectObject("volume", names.volume))?.createdAtMs).toBe(
      volumeBefore?.createdAtMs,
    );
    await expectOneOfEach();
  });

  it("I-half (b): adopts a never-started container with an empty volume and copies the starter", async () => {
    const engine = new DockerEngine();
    await ensureVolume(engine, instance, key);
    const preCreated = await createOrAdoptContainer(engine, specInput);

    const result = await newRuntime(engine).ensureRunning(spec);

    // The files first: the 12.5 row "I-half (b)" (a never-started container started as if complete) is
    // guarded by this assertion, not by the outcome.
    await expectStarterFilesPresent(preCreated);
    expect([result.outcome, result.workspace.containerId]).toEqual(["created", preCreated]);
    await expectOneOfEach();
  });

  it("I-half (c): completes an interrupted copy, overwriting the stale file", async () => {
    const engine = new DockerEngine();
    await ensureVolume(engine, instance, key);
    const preCreated = await createOrAdoptContainer(engine, specInput);
    const items = await starterItems();
    const firstHalf = items.slice(0, Math.ceil(items.length / 2));
    const staleAt = firstHalf.findIndex((item) => item.kind === "file");
    expect(staleAt).toBeGreaterThanOrEqual(0);
    const partial = firstHalf.map((item, index) =>
      index === staleAt ? { ...item, content: Buffer.from("stale\n") } : item,
    );
    await engine.putArchive(
      preCreated,
      WORKSPACE_MOUNT,
      withoutMarker(await buildStarterTar(partial, new Date())),
    );

    const result = await newRuntime(engine).ensureRunning(spec);

    expect([result.outcome, result.workspace.containerId]).toEqual(["created", preCreated]);
    await expectStarterFilesPresent(preCreated);
    await expectOneOfEach();
  });

  it("I-half (d): starts a never-started container whose copy completed, without copying again", async () => {
    const engine = new DockerEngine();
    await ensureVolume(engine, instance, key);
    const preCreated = await createOrAdoptContainer(engine, specInput);
    await engine.putArchive(
      preCreated,
      WORKSPACE_MOUNT,
      await buildStarterTar(await starterItems(), new Date()),
    );
    const replaced: StarterItem = {
      rel: CHANGED_FILE,
      kind: "file",
      mode: 0o644,
      content: Buffer.from(CHANGED_CONTENT),
    };
    await engine.putArchive(
      preCreated,
      WORKSPACE_MOUNT,
      await buildStarterTar([replaced], new Date()),
    );

    const result = await newRuntime(engine).ensureRunning(spec);

    // The file first: the 12.5 row "I-half (d)" (always copying) is guarded by it, not by the outcome.
    expect(await readWorkFile(preCreated)).toBe(CHANGED_CONTENT);
    expect([result.outcome, result.workspace.containerId]).toEqual(["started", preCreated]);
    await expectOneOfEach();
  });

  it("I-half image: reports the image a never-started container was created from, not the spec's", async () => {
    const engine = new DockerEngine();
    const imageId = (await engine.inspectImage(TEST_IMAGE))?.Id ?? "";
    expect(imageId).toMatch(/^sha256:/);
    await ensureVolume(engine, instance, key);
    // Docker keeps `Config.Image` as given, so the Id form tells the container's image from the spec's tag.
    const preCreated = await createOrAdoptContainer(engine, { ...specInput, image: imageId });

    const result = await newRuntime(engine).ensureRunning(spec);

    expect([result.workspace.containerId, result.workspace.image]).toEqual([preCreated, imageId]);
  });

  it("I-half (e): starts a container that has run before without consulting the marker", async () => {
    const engine = new DockerEngine();
    const runtime = newRuntime(engine);
    const first = await runtime.ensureRunning(spec);
    const id = first.workspace.containerId ?? "";
    await changeWorkFile(id);
    await docker(["exec", "-u", "0", id, "rm", "-f", STARTER_MARKER]);
    await engine.stopContainer(id, STOP_SECONDS);

    const result = await runtime.ensureRunning(spec);

    expect([result.outcome, result.workspace.containerId]).toEqual(["started", id]);
    expect(await readWorkFile(id)).toBe(CHANGED_CONTENT);
    expect(await markerExists(id)).toBe(false);
    await expectOneOfEach();
  });

  it("I-network-pruned: re-creates the container and the network when the network was removed by hand", async () => {
    const engine = new DockerEngine();
    const runtime = newRuntime(engine);
    const first = await runtime.ensureRunning(spec);
    const firstId = first.workspace.containerId ?? "";
    await changeWorkFile(firstId);
    await engine.stopContainer(firstId, STOP_SECONDS);
    await removeTestObject("network", instanceNetworkName(instance));
    // The retry of design 6.1 is keyed on this status, so it is observed, printed, and must be 404.
    const startStatus = await statusOf(engine.startContainer(firstId));
    console.log(`I-network-pruned start status=${String(startStatus)}`);
    expect(startStatus).toBe(404);

    const result = await runtime.ensureRunning(spec);
    const id = result.workspace.containerId ?? "";

    expect(first.outcome).toBe("created");
    expect(result.outcome).toBe("started");
    expect(id).not.toBe(firstId);
    await expectRunning(engine, id);
    expect((await inspectObject("network", instanceNetworkName(instance)))?.labels).toEqual(
      networkLabels(instance),
    );
    expect(await readWorkFile(id)).toBe(CHANGED_CONTENT);
    expect(await countOf("container")).toBe(1);
  });

  it("I-image-missing: fails without the image, keeps what it made, and reuses it once the image exists", async () => {
    const engine = new DockerEngine();
    const runtime = newRuntime(engine);
    const absentImage = `wks-absent-image:${runId}`;

    const failure = await runtime
      .ensureRunning({ ...spec, image: absentImage })
      .catch((error: unknown) => error);
    const volumeAfterFailure = await inspectObject("volume", names.volume);
    const containersAfterFailure = await countOf("container");
    const result = await runtime.ensureRunning(spec);

    expect(failure).toBeInstanceOf(ImageMissingError);
    expect(failure).toMatchObject({ image: absentImage });
    expect(volumeAfterFailure).not.toBeNull();
    expect(containersAfterFailure).toBe(0);
    expect(result.outcome).toBe("created");
    expect((await inspectObject("volume", names.volume))?.createdAtMs).toBe(
      volumeAfterFailure?.createdAtMs,
    );
    await expectOneOfEach();
  });
});
