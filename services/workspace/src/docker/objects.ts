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
 * The adopt phase after a create 409. Docker reserves the name at the start of a create and makes the container
 * inspectable only at its end (moby v28.0.4 `daemon/names.go:70`, `daemon/create.go:222`), and documents no bound
 * for that window. An earlier bound of four short waits (under 0.4 s), sized on an idle Docker Desktop daemon, was
 * outlived on the CI runner (Docker 28.0.4, three integration suites on one daemon, run 43930897519, where the
 * failing test took 1128 ms). 5 s is about four times that test's whole duration and half the default slow-start
 * note (`ENVIRONMENT_START_SLOW_SECONDS`). The delays double from 25 ms and stop at 1 s, so a container that
 * appears late is adopted at most about 1 s after it is inspectable. Their sum is above the deadline, so the
 * deadline ends the wait and the list only caps the calls at 41 per phase: a first inspect, then per delay a
 * volume ensure (up to two calls), a create and an inspect (ADR-0010 item 8 as amended by #181). Fixed, not
 * jittered: a 409 on a name Docker serialises is a correct answer, not a lost race to retry against.
 */
const ADOPT_DEADLINE_MS = 5_000;
const ADOPT_RETRY_DELAYS_MS: readonly number[] = [
  25, 50, 100, 200, 400, 800, 1_000, 1_000, 1_000, 1_000,
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates the workspace container, or adopts the one another caller created under the same name: Docker's
 * name is the lock between processes (design 6.3); a 409 is followed by re-creates and re-inspects until a
 * deadline. The network is ensured immediately before the first create, because it is the only thing that
 * brings back a network pruned by hand (I-network-pruned). Returns the Id.
 */
export async function createOrAdoptContainer(
  engine: DockerEngine,
  input: ContainerSpecInput,
): Promise<string> {
  await ensureNetwork(engine, input.instance);
  const created = await createUnlessTaken(engine, input);
  return created ?? adoptContainer(engine, input);
}

/** The new container's Id, or `null` when Docker answers that the name is taken; any other error propagates. */
async function createUnlessTaken(
  engine: DockerEngine,
  input: ContainerSpecInput,
): Promise<string | null> {
  try {
    return await engine.createContainer(input.names.container, buildContainerSpec(input));
  } catch (error: unknown) {
    if (error instanceof DockerApiError && error.statusCode === CONFLICT) return null;
    throw error;
  }
}

/**
 * Waits out the window between Docker reserving the name for another caller's create and that container
 * becoming inspectable. A 409 on a re-create means a create still holds the name; a re-create that succeeds
 * means the first creator failed (or another process removed the workspace) and Docker released the name, so
 * this caller owns the container now. At the deadline the name is `ContainerNameUnresolvedError`, and the
 * caller's retry of the idempotent ensure converges. The volume is ensured before each re-create because the
 * create body mounts the volume by name, and Docker creates an absent one during the create without our labels,
 * which would fail every later `ensureVolume` of the key. The network is not re-ensured: Docker creates no
 * network during a container create, so a network pruned during the wait shows as a 404 of the create, which
 * propagates, or of the later start, whose retry ensures the network again.
 */
async function adoptContainer(engine: DockerEngine, input: ContainerSpecInput): Promise<string> {
  const name = input.names.container;
  // The global `performance` is monotonic, so a wall-clock jump cannot cut or stretch the wait.
  const conflictAt = performance.now();
  const elapsedMs = (): number => performance.now() - conflictAt;
  const delays = ADOPT_RETRY_DELAYS_MS[Symbol.iterator]();
  for (;;) {
    const existing = await engine.inspectContainer(name);
    if (existing !== null) {
      if (!labelsMatchKey(existing.Config.Labels, input.instance, input.key, "container")) {
        throw new WorkspaceIdentityMismatchError(name);
      }
      return existing.Id;
    }
    const next = delays.next();
    const remainingMs = ADOPT_DEADLINE_MS - elapsedMs();
    if (next.done === true || remainingMs <= 0) {
      throw new ContainerNameUnresolvedError(name, Math.round(elapsedMs()));
    }
    await delay(Math.min(next.value, remainingMs));
    await ensureVolume(engine, input.instance, input.key);
    const created = await createUnlessTaken(engine, input);
    if (created !== null) return created;
  }
}
