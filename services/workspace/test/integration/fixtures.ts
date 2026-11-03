import { fileURLToPath } from "node:url";
import type { WorkspaceLimits } from "../../src/config.js";
import type { DockerEngine } from "../../src/docker/engine.js";
import { buildContainerSpec, type ContainerCreateBody } from "../../src/docker/spec.js";
import { DockerApiError } from "../../src/errors.js";
import {
  networkLabels,
  type WorkspaceKey,
  type WorkspaceNames,
  workspaceId,
  workspaceLabels,
  workspaceNames,
} from "../../src/identity.js";
import type { WorkspaceSpec } from "../../src/runtime.js";
import { TEST_IMAGE } from "./docker-cli.js";

/** Small enough for any test daemon; the configured limits are I-limits' concern (S24). */
export const TEST_LIMITS: WorkspaceLimits = {
  nanoCpus: 1_000_000_000,
  memoryBytes: 256 * 1024 * 1024,
  pidsLimit: 64,
};

/** Docker-init forwards SIGTERM to the keeper `sleep`, so one second is plenty for a test stop. */
export const STOP_SECONDS = 1;

/** The status of a rejected engine call, or `null` when it succeeded; any other error is rethrown. */
export async function statusOf(call: Promise<unknown>): Promise<number | null> {
  try {
    await call;
    return null;
  } catch (error: unknown) {
    if (error instanceof DockerApiError) return error.statusCode;
    throw error;
  }
}

/** Volume and network a workspace container needs, made through the engine under test. */
export async function createWorkspaceObjects(
  engine: DockerEngine,
  instance: string,
  key: WorkspaceKey,
): Promise<WorkspaceNames> {
  const names = workspaceNames(instance, workspaceId(instance, key));
  await engine.createVolume(names.volume, workspaceLabels(instance, key, "volume"));
  await engine.createNetwork(names.network, networkLabels(instance));
  return names;
}

/** The service's own create body for the test image (or `image`) with the test limits. */
export function testContainerSpec(
  instance: string,
  key: WorkspaceKey,
  names: WorkspaceNames,
  image: string = TEST_IMAGE,
): ContainerCreateBody {
  return buildContainerSpec({ image, instance, key, names, limits: TEST_LIMITS });
}

/** The value of a fulfilled call; a rejection fails the test naming the error's constructor. */
export function fulfilledValue<T>(result: PromiseSettledResult<T>): T {
  if (result.status === "fulfilled") return result.value;
  const reason: unknown = result.reason;
  const kind = reason instanceof Error ? reason.constructor.name : typeof reason;
  throw new Error(`expected every concurrent call fulfilled, one rejected with ${kind}`);
}

/** The fixture course (S7) and its one lesson with a workspace, for runtime-level tests. */
export const FIXTURE_COURSE_ROOT = fileURLToPath(new URL("../fixtures/course", import.meta.url));
export const FIXTURE_LESSON_DIR = "sample-course/01-basics/01-with-workspace";

export function fixtureSpec(key: WorkspaceKey): WorkspaceSpec {
  return { key, image: TEST_IMAGE, starter: { lessonDir: FIXTURE_LESSON_DIR, relPath: "starter" } };
}
