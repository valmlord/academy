import {
  ContainerNameUnresolvedError,
  DockerApiError,
  ImageMissingError,
  WorkspaceIdentityMismatchError,
} from "../errors.js";
import {
  instanceNetworkName,
  type Labels,
  listFilter,
  networkLabels,
  networkLabelsMatch,
  parseWorkspaceLabels,
  type WorkspaceKey,
  type WorkspaceRole,
  workspaceId,
  workspaceLabels,
  workspaceNames,
} from "../identity.js";
import type { DockerEngine } from "./engine.js";
import type { NetworkSummary } from "./schemas.js";
import { buildContainerSpec, type ContainerSpecInput } from "./spec.js";

// One entry point per Docker object of a workspace (design 6.1). Each is idempotent and label-checked, so a
// crash between two of them leaves a state the next call converges from, and an object that merely has our
// name is never adopted.

const CONFLICT = 409;

/** Whether labels prove the workspace of `key` in this instance, in the given role (5.1 key predicate). */
export function labelsMatchKey(
  labels: Labels,
  instance: string,
  key: WorkspaceKey,
  role: WorkspaceRole,
): boolean {
  const parsed = parseWorkspaceLabels(labels, instance);
  return (
    parsed.kind === "valid" &&
    parsed.role === role &&
    parsed.key.userId === key.userId &&
    parsed.key.courseId === key.courseId &&
    parsed.key.lessonId === key.lessonId
  );
}

/** The managed network of this instance with exactly that name; Docker's name filter matches substrings. */
async function findInstanceNetwork(
  engine: DockerEngine,
  instance: string,
  name: string,
): Promise<NetworkSummary | null> {
  const networks = await engine.listNetworks(listFilter(instance, "network"));
  return networks.find((network) => network.Name === name) ?? null;
}

function checkedNetworkName(network: NetworkSummary, instance: string, name: string): string {
  if (!networkLabelsMatch(network.Labels, instance)) throw new WorkspaceIdentityMismatchError(name);
  return name;
}

/**
 * The instance network, created when absent. A 409 whose re-list still finds no network of ours means a
 * network of that name exists without our labels: attaching a workspace to it would put the workspace on a
 * foreign network, so that is a mismatch and nothing is changed.
 */
export async function ensureNetwork(engine: DockerEngine, instance: string): Promise<string> {
  const name = instanceNetworkName(instance);
  const found = await findInstanceNetwork(engine, instance, name);
  if (found !== null) return checkedNetworkName(found, instance, name);
  try {
    await engine.createNetwork(name, networkLabels(instance));
    return name;
  } catch (error: unknown) {
    if (!(error instanceof DockerApiError && error.statusCode === CONFLICT)) throw error;
  }
  // Another caller may have created it between our list and our create.
  const created = await findInstanceNetwork(engine, instance, name);
  if (created === null) throw new WorkspaceIdentityMismatchError(name);
  return checkedNetworkName(created, instance, name);
}

/** The workspace volume, created when absent; an existing one must carry this key's labels. */
export async function ensureVolume(
  engine: DockerEngine,
  instance: string,
  key: WorkspaceKey,
): Promise<string> {
  const { volume } = workspaceNames(instance, workspaceId(instance, key));
  const existing = await engine.inspectVolume(volume);
  if (existing === null) {
    return engine.createVolume(volume, workspaceLabels(instance, key, "volume"));
  }
  if (!labelsMatchKey(existing.Labels, instance, key, "volume")) {
    throw new WorkspaceIdentityMismatchError(volume);
  }
  return volume;
}

/**
 * Checked before a container create, because the create answers 404 for a missing image and a missing
 * network alike, and only the image is the caller's to fix.
 */
export async function checkImage(engine: DockerEngine, image: string): Promise<void> {
  if ((await engine.inspectImage(image)) === null) throw new ImageMissingError(image);
}

/**
 * Waits between the re-inspects after a create 409, in ms: at most 5 inspects and 375 ms of waiting. The
 * observed window on Docker Desktop 29.9.2 closed within 10 ms; the first delay gives 2.5 times that and the
 * doubling covers a daemon an order of magnitude slower, while 375 ms stays far below #32's slow-start
 * notice (design amendment 1). Fixed, not jittered: the waiting caller only reads, so it contends with no one.
 */
export const ADOPT_INSPECT_DELAYS_MS: readonly number[] = [25, 50, 100, 200];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates the workspace container, or adopts the one another caller created under the same name: Docker's
 * name is the lock between processes (design 6.3); a 409 is followed by bounded re-inspects. The network is
 * ensured immediately before every create, because it is the only thing that brings back a network pruned by
 * hand (I-network-pruned). Returns the Id.
 */
export async function createOrAdoptContainer(
  engine: DockerEngine,
  input: ContainerSpecInput,
): Promise<string> {
  await ensureNetwork(engine, input.instance);
  try {
    return await engine.createContainer(input.names.container, buildContainerSpec(input));
  } catch (error: unknown) {
    if (!(error instanceof DockerApiError && error.statusCode === CONFLICT)) throw error;
  }
  return adoptContainer(engine, input);
}

/**
 * Docker reserves a name before the container is inspectable (observed on Desktop 29.9.2: 409, then 404, then
 * visible within 10 ms), so a 404 after a 409 is first waited out on the fixed schedule. A name that never
 * resolves is `ContainerNameUnresolvedError`, and the caller's retry of the idempotent ensure converges; a
 * re-create here would make the number of engine calls open-ended.
 */
async function adoptContainer(engine: DockerEngine, input: ContainerSpecInput): Promise<string> {
  const name = input.names.container;
  let existing = await engine.inspectContainer(name);
  let waitedMs = 0;
  for (const delayMs of ADOPT_INSPECT_DELAYS_MS) {
    if (existing !== null) break;
    await delay(delayMs);
    waitedMs += delayMs;
    existing = await engine.inspectContainer(name);
  }
  if (existing === null) throw new ContainerNameUnresolvedError(name, waitedMs);
  if (!labelsMatchKey(existing.Config.Labels, input.instance, input.key, "container")) {
    throw new WorkspaceIdentityMismatchError(name);
  }
  return existing.Id;
}
