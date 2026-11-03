import { hostname } from "node:os";
import { afterEach, beforeEach, inject } from "vitest";
import { z } from "zod";
import { isSweepable, type SweepContext, TEST_LABEL } from "../support/sweep-predicate.js";
import {
  createVolume,
  docker,
  type InspectedObject,
  inspectObject,
  listObjects,
  networkExists,
  type ObjectKind,
  parseJsonLines,
} from "./docker-cli.js";

// The integration suite shares the daemon with the owner's stack and with other runs (design 12.2, 16.5).
// Every object a test creates carries this run's label; removals go through one helper that refuses
// anything else; the owner's objects are read by name only and must still exist at the end.

declare module "vitest" {
  export interface ProvidedContext {
    testRunId: string;
  }
}

/**
 * One instance letter per integration file, so the tests of a file share `t<run>-<letter>` and never see
 * another file's objects. `z` is the decoy instance every file may use; the global setup refuses a file on
 * disk that is missing here and a letter used twice.
 */
export const INSTANCE_LETTERS: Readonly<Record<string, string>> = {
  "harness.int.test.ts": "a",
  "engine-read.int.test.ts": "b",
  "probes.int.test.ts": "c",
  "engine.int.test.ts": "d",
};
export const DECOY_LETTER = "z";
const FILE_LETTER_PATTERN = /^[a-y]$/;
const ALL_LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
const TEST_INSTANCE_PATTERN = /^t[0-9a-f]{8}-[a-z]$/;
/** Containers first, so a network has no endpoint left when it is removed. */
const REMOVAL_ORDER: readonly ObjectKind[] = ["container", "volume", "network"];

export class TestHarnessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestHarnessError";
  }
}

export class TestObjectRefusedError extends Error {
  readonly kind: ObjectKind;
  readonly objectName: string;

  constructor(kind: ObjectKind, objectName: string) {
    super(
      `refusing to remove ${kind} ${objectName}: it carries neither this run's label nor a test instance`,
    );
    this.name = "TestObjectRefusedError";
    this.kind = kind;
    this.objectName = objectName;
  }
}

export function testInstance(runId: string, letter: string): string {
  const instance = `t${runId}-${letter}`;
  if (instance === "local" || !TEST_INSTANCE_PATTERN.test(instance)) {
    throw new TestHarnessError(
      `computed test instance ${instance} breaks ${TEST_INSTANCE_PATTERN.source}`,
    );
  }
  return instance;
}

export function sentinelName(runId: string): string {
  return `wks-sentinel-${runId}`;
}

/** The label every object a test creates must carry. */
export function runLabels(runId: string): Record<string, string> {
  return { [TEST_LABEL.run]: runId };
}

export function checkInstanceTable(runId: string, integrationFiles: readonly string[]): void {
  const letters = Object.values(INSTANCE_LETTERS);
  for (const letter of letters) {
    if (!FILE_LETTER_PATTERN.test(letter))
      throw new TestHarnessError(`instance letter ${letter} is not a-y`);
    testInstance(runId, letter);
  }
  if (new Set(letters).size !== letters.length) {
    throw new TestHarnessError("INSTANCE_LETTERS uses a letter twice");
  }
  testInstance(runId, DECOY_LETTER);
  const missing = integrationFiles.filter((file) => INSTANCE_LETTERS[file] === undefined);
  if (missing.length > 0) {
    throw new TestHarnessError(`no INSTANCE_LETTERS row for ${missing.join(", ")}`);
  }
}

function isRunObject(object: InspectedObject, runId: string): boolean {
  if (object.labels[TEST_LABEL.run] === runId) return true;
  const instance = object.labels[TEST_LABEL.instance] ?? "";
  return object.labels[TEST_LABEL.managed] === "true" && instance.startsWith(`t${runId}-`);
}

/** Containers and networks go by the inspected Id, volumes (which have none) by the inspected name. */
async function removeInspected(object: InspectedObject): Promise<void> {
  if (object.kind === "container") await docker(["rm", "-f", object.id]);
  else if (object.kind === "network") await docker(["network", "rm", object.id]);
  else await docker(["volume", "rm", object.name]);
}

/** Removes one object of run `runId`; refuses any other. Returns what it removed by, `null` when gone. */
export async function removeRunObject(
  runId: string,
  kind: ObjectKind,
  ref: string,
): Promise<string | null> {
  const object = await inspectObject(kind, ref);
  if (object === null) return null;
  if (!isRunObject(object, runId)) throw new TestObjectRefusedError(kind, object.name);
  await removeInspected(object);
  return object.id;
}

/** The only way a test removes an object. */
export function removeTestObject(kind: ObjectKind, ref: string): Promise<string | null> {
  return removeRunObject(inject("testRunId"), kind, ref);
}

async function listRunObjects(
  runId: string,
  kind: ObjectKind,
  instances: readonly string[],
): Promise<string[]> {
  const refs = new Set(await listObjects(kind, [`label=${TEST_LABEL.run}=${runId}`]));
  for (const instance of instances) {
    const filters = [
      `label=${TEST_LABEL.managed}=true`,
      `label=${TEST_LABEL.instance}=${instance}`,
    ];
    for (const ref of await listObjects(kind, filters)) refs.add(ref);
  }
  refs.delete(sentinelName(runId));
  return [...refs];
}

/** Every object of the run labelled or managed under `instances`, except the sentinel. */
export async function removeRunObjects(runId: string, instances: readonly string[]): Promise<void> {
  for (const kind of REMOVAL_ORDER) {
    for (const ref of await listRunObjects(runId, kind, instances)) {
      await removeRunObject(runId, kind, ref);
    }
  }
}

async function assertCleanStart(runId: string, instance: string): Promise<void> {
  const leftovers: string[] = [];
  for (const kind of REMOVAL_ORDER) {
    for (const ref of await listObjects(kind, [`label=${TEST_LABEL.instance}=${instance}`])) {
      leftovers.push(`${kind} ${ref} of instance ${instance}`);
    }
    for (const ref of await listObjects(kind, [`label=${TEST_LABEL.run}=${runId}`])) {
      if (kind !== "volume" || ref !== sentinelName(runId))
        leftovers.push(`${kind} ${ref} of this run`);
    }
  }
  const network = `wks-${instance}-net`;
  if (await networkExists(network)) leftovers.push(`network ${network}`);
  if (leftovers.length > 0) {
    throw new TestHarnessError(
      `start state not clean: ${leftovers.join(", ")}; an earlier test's cleanup failed, read the first red test of this file`,
    );
  }
}

type Closer = () => Promise<void> | void;
let closers: Closer[] = [];

/** Registers what the current test started (a manager, a runtime, a child process); closed before removal. */
export function onCleanup(closer: Closer): void {
  closers.push(closer);
}

export interface TestInstance {
  runId: string;
  instance: string;
  decoyInstance: string;
}

/** Called once at the top of every integration file; registers the per-test start check and cleanup. */
export function useTestInstance(fileBasename: string): TestInstance {
  const letter = INSTANCE_LETTERS[fileBasename];
  if (letter === undefined) {
    throw new TestHarnessError(
      `${fileBasename} has no row in INSTANCE_LETTERS (test/integration/harness.ts)`,
    );
  }
  const runId = inject("testRunId");
  const instance = testInstance(runId, letter);
  const decoyInstance = testInstance(runId, DECOY_LETTER);
  beforeEach(() => assertCleanStart(runId, instance));
  afterEach(async () => {
    const pending = closers;
    closers = [];
    let failure: { error: unknown } | undefined;
    for (const closer of pending) {
      try {
        await closer();
      } catch (error: unknown) {
        failure ??= { error };
      }
    }
    // The removals run even when a closer threw, so one failure does not leave objects to the next test.
    await removeRunObjects(runId, [instance, decoyInstance]);
    if (failure !== undefined) throw failure.error;
  });
  return { runId, instance, decoyInstance };
}

export interface OwnerSnapshot {
  volumes: string[];
  images: string[];
  containers: string[];
}

const nameLine = z.object({ name: z.string() });
const imageLine = z.object({ repository: z.string(), tag: z.string() });
const OWNER_DB_VOLUME = "academy_db-data";
const OWNER_WEB_IMAGE = "academy-web:local";
const OWNER_WORKSPACE_PREFIX = "wks-local-";

async function names(args: readonly string[]): Promise<string[]> {
  return parseJsonLines(await docker(args), nameLine).map((line) => line.name);
}

/**
 * The owner's objects by name only, through listings with explicit templates (16.5 H2). Workspace
 * containers of instance `local` are left out: the owner's live service may remove a stopped one by GC
 * during the run. A failing command fails the setup, so an error never reads as an empty snapshot.
 */
export async function readOwnerSnapshot(): Promise<OwnerSnapshot> {
  const nameFormat = '{"name":{{json .Name}}}';
  const dbVolume = await names([
    "volume",
    "ls",
    "--filter",
    `name=${OWNER_DB_VOLUME}`,
    "--format",
    nameFormat,
  ]);
  const imageFormat = '{"repository":{{json .Repository}},"tag":{{json .Tag}}}';
  const images = parseJsonLines(
    await docker(["image", "ls", "--format", imageFormat, "academy-web"]),
    imageLine,
  ).map((line) => `${line.repository}:${line.tag}`);
  const containers = await names([
    "ps",
    "-a",
    "--filter",
    "label=com.docker.compose.project=academy",
    "--format",
    '{"name":{{json .Names}}}',
  ]);
  const local = `label=${TEST_LABEL.instance}=local`;
  const workspaceVolumes = await names(["volume", "ls", "--filter", local, "--format", nameFormat]);
  return {
    volumes: [
      ...dbVolume.filter((name) => name === OWNER_DB_VOLUME),
      ...workspaceVolumes.filter((name) => name.startsWith(OWNER_WORKSPACE_PREFIX)),
    ],
    images: images.filter((name) => name === OWNER_WEB_IMAGE),
    containers,
  };
}

function ownerNames(snapshot: OwnerSnapshot): Set<string> {
  return new Set([...snapshot.volumes, ...snapshot.images, ...snapshot.containers]);
}

export async function createSentinel(runId: string): Promise<void> {
  await createVolume(sentinelName(runId), {
    ...runLabels(runId),
    [TEST_LABEL.pid]: String(process.pid),
    [TEST_LABEL.host]: hostname(),
  });
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    // EPERM means the process exists under another user: alive.
    return !(error instanceof Error && "code" in error && error.code === "ESRCH");
  }
}

/** Runs whose sentinel names this host and a dead PID. Computed once, before the first removal. */
async function deadRuns(): Promise<Set<string>> {
  const dead = new Set<string>();
  for (const name of await listObjects("volume", [`label=${TEST_LABEL.run}`])) {
    const labels = (await inspectObject("volume", name))?.labels ?? {};
    const run = labels[TEST_LABEL.run];
    const pid = labels[TEST_LABEL.pid] ?? "";
    if (run === undefined || !/^\d+$/.test(pid) || labels[TEST_LABEL.host] !== hostname()) continue;
    if (!isPidAlive(Number(pid))) dead.add(run);
  }
  return dead;
}

/** Removes objects of earlier runs that are over (setup only, after the snapshot). Images are never touched. */
export async function sweepLeftovers(runId: string, snapshot: OwnerSnapshot): Promise<void> {
  const context: SweepContext = {
    runId,
    ownerNames: ownerNames(snapshot),
    deadRuns: await deadRuns(),
    nowMs: Date.now(),
  };
  for (const kind of REMOVAL_ORDER) {
    const refs = new Set([
      ...(await listObjects(kind, [`label=${TEST_LABEL.run}`])),
      ...(await listObjects(kind, [`label=${TEST_LABEL.managed}=true`])),
    ]);
    for (const ref of refs) {
      const object = await inspectObject(kind, ref);
      if (object === null || !isSweepable(object, context)) continue;
      await removeInspected(object);
      console.log(`swept ${kind} ${object.name} of an earlier test run`);
    }
  }
}

/**
 * The safety net after every file's own cleanup: removes what is left of the run, checks the owner's
 * objects and the sentinel by name, then removes the sentinel. Problems are collected, so the sentinel is
 * still removed when an owner check fails.
 */
export async function teardownRun(runId: string, snapshot: OwnerSnapshot): Promise<void> {
  const problems: string[] = [];
  await removeRunObjects(
    runId,
    ALL_LETTERS.map((letter) => testInstance(runId, letter)),
  );
  const present = ownerNames(await readOwnerSnapshot());
  const missing = [...ownerNames(snapshot)].filter((name) => !present.has(name));
  if (missing.length > 0)
    problems.push(`owner objects missing after the run: ${missing.join(", ")}`);
  const sentinel = sentinelName(runId);
  if ((await listObjects("volume", [`name=${sentinel}`])).includes(sentinel)) {
    await removeRunObject(runId, "volume", sentinel);
  } else {
    problems.push(
      `sentinel volume ${sentinel} is missing: a test removed an object it did not create`,
    );
  }
  if (problems.length > 0) throw new TestHarnessError(`teardown: ${problems.join("; ")}`);
}
