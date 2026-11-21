import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { TEST_LABEL } from "../support/sweep-predicate.js";

// The harness talks to Docker through the CLI, never through the engine under test, so a bug in the product
// cannot widen what the harness lists or removes. Every call that prints object data uses one of the explicit
// templates below. Their fields come only from the read allowlist of design 16.5 H2 (Id, Name, State.Status,
// Created, Labels): never a bare inspect, never `{{json .}}` or `.Config`, because the harness addresses objects
// this run did not create, and a full inspect prints the environment of the owner's containers.

const run = promisify(execFile);

/** The one image test containers run (design 4.3); pulled by the global setup only when absent. */
export const TEST_IMAGE = "node:22.23.4-alpine";

export type ObjectKind = "container" | "volume" | "network";

export class DockerCliError extends Error {
  readonly args: readonly string[];
  readonly stderr: string;

  constructor(args: readonly string[], stderr: string) {
    super(`docker ${args.join(" ")} failed: ${stderr.trim()}`);
    this.name = "DockerCliError";
    this.args = args;
    this.stderr = stderr;
  }
}

/** Large enough for a listing of every object on a busy daemon. */
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

export async function docker(args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await run("docker", [...args], { maxBuffer: MAX_OUTPUT_BYTES });
    return stdout;
  } catch (error: unknown) {
    const stderr = z.object({ stderr: z.string() }).safeParse(error);
    throw new DockerCliError(args, stderr.success ? stderr.data.stderr : String(error));
  }
}

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const exitedSchema = z.object({ code: z.number().int(), stdout: z.string(), stderr: z.string() });

/** For a command whose non-zero exit is the result under test (an OOM kill, a failed fork), not a failure. */
export async function dockerResult(args: readonly string[]): Promise<CliResult> {
  try {
    const { stdout, stderr } = await run("docker", [...args], { maxBuffer: MAX_OUTPUT_BYTES });
    return { exitCode: 0, stdout, stderr };
  } catch (error: unknown) {
    const exited = exitedSchema.safeParse(error);
    if (exited.success) {
      const { code, stdout, stderr } = exited.data;
      return { exitCode: code, stdout, stderr };
    }
    throw new DockerCliError(args, String(error));
  }
}

/** The command line of every process in the container, one per entry (busybox `ps`, trimmed). */
export async function processArgs(containerId: string): Promise<string[]> {
  const listing = await docker(["exec", containerId, "ps", "-o", "args"]);
  return listing.split("\n").map((entry) => entry.trim());
}

/**
 * Lists the live processes of a uid from `/proc/<pid>/status`, run as the learner uid, which a slot-uid process can
 * neither signal nor stop. A status file that cannot be read belongs to a process that ended and is skipped; zombies
 * are skipped, as they run nothing. Prints one JSON line per process.
 */
const UID_PROCESSES_SCAN = String.raw`const fs = require("fs");
for (const entry of fs.readdirSync("/proc")) {
  if (!/^\d+$/.test(entry)) continue;
  let status;
  try { status = fs.readFileSync("/proc/" + entry + "/status", "utf8"); } catch { continue; }
  const uid = /^Uid:\s+(\d+)/m.exec(status);
  const state = /^State:\s+(\S)/m.exec(status);
  if (uid === null || uid[1] !== process.argv[1] || state === null || state[1] === "Z") continue;
  let args = "";
  try { args = fs.readFileSync("/proc/" + entry + "/cmdline", "utf8").split("\0").filter(Boolean).join(" "); } catch {}
  console.log(JSON.stringify({ pid: Number(entry), state: state[1], args }));
}`;

const uidProcessSchema = z.object({ pid: z.number().int(), state: z.string(), args: z.string() });

export type UidProcess = z.infer<typeof uidProcessSchema>;

/** The oracle of "no process of the slot uid left": counted from outside, never by `kill`'s return code. */
export async function uidProcesses(containerId: string, uid: number): Promise<UidProcess[]> {
  const output = await docker([
    "exec",
    "-u",
    "1000:1000",
    containerId,
    "node",
    "-e",
    UID_PROCESSES_SCAN,
    String(uid),
  ]);
  return parseJsonLines(output, uidProcessSchema);
}

/** Stops a container by Id only after its instance label shows the calling test made it. */
export async function stopOwnContainer(containerId: string, instance: string): Promise<void> {
  const inspected = await inspectObject("container", containerId);
  if (inspected?.labels[TEST_LABEL.instance] !== instance) {
    throw new DockerCliError(["stop", containerId], `not a container of instance ${instance}`);
  }
  await docker(["stop", "-t", "1", containerId]);
}

/** The stop and start the service makes for a container it no longer trusts, done by hand. */
export async function restartContainer(containerId: string, instance: string): Promise<void> {
  await stopOwnContainer(containerId, instance);
  await docker(["start", containerId]);
}

/**
 * Whether slot 0's scratch holds `name`. `docker cp` makes the daemon read the volume, so nothing runs in the
 * container and no process in it can act on the read; it prints file content, never object metadata.
 */
export async function slotFileExists(containerId: string, name: string): Promise<boolean> {
  const copied = await dockerResult([
    "cp",
    `${containerId}:/workspace/.academy-grader/2000/${name}`,
    "-",
  ]);
  return copied.exitCode === 0;
}

function lines(output: string): string[] {
  return output.split("\n").filter((line) => line.trim() !== "");
}

export function parseJsonLines<T>(output: string, schema: z.ZodType<T>): T[] {
  return lines(output).map((line) => schema.parse(JSON.parse(line)));
}

const INSPECT_TEMPLATE: Readonly<Record<ObjectKind, string>> = {
  container:
    '{"id":{{json .Id}},"name":{{json .Name}},"labels":{{json .Config.Labels}},"created":{{json .Created}},"state":{{json .State.Status}}}',
  volume:
    '{"id":{{json .Name}},"name":{{json .Name}},"labels":{{json .Labels}},"created":{{json .CreatedAt}}}',
  network:
    '{"id":{{json .Id}},"name":{{json .Name}},"labels":{{json .Labels}},"created":{{json .Created}}}',
};

const inspectedSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  labels: z.record(z.string(), z.string()).nullable(),
  created: z.string(),
  state: z.string().optional(),
});

/** One object as the harness sees it. `id` is the Id for containers and networks and the name for volumes. */
export interface InspectedObject {
  kind: ObjectKind;
  id: string;
  name: string;
  labels: Readonly<Record<string, string>>;
  createdAtMs: number;
  state: string | null;
}

// The CLI words a missing object differently per kind ("No such volume", "network <id> not found").
const NOT_FOUND = /No such (object|container|volume|network)|network \S+ not found/i;

/** The object by Id or name, or `null` when it does not exist (it may vanish between a list and this call). */
export async function inspectObject(
  kind: ObjectKind,
  ref: string,
): Promise<InspectedObject | null> {
  const args =
    kind === "container"
      ? ["inspect", "--type", "container", "--format", INSPECT_TEMPLATE.container, ref]
      : [kind, "inspect", "--format", INSPECT_TEMPLATE[kind], ref];
  let output: string;
  try {
    output = await docker(args);
  } catch (error: unknown) {
    if (error instanceof DockerCliError && NOT_FOUND.test(error.stderr)) return null;
    throw error;
  }
  const [parsed] = parseJsonLines(output, inspectedSchema);
  if (parsed === undefined) throw new DockerCliError(args, "inspect printed nothing");
  return {
    kind,
    id: parsed.id,
    name: parsed.name.replace(/^\//, ""),
    labels: parsed.labels ?? {},
    createdAtMs: Date.parse(parsed.created),
    state: parsed.state ?? null,
  };
}

const LIST_COMMAND: Readonly<Record<ObjectKind, { command: readonly string[]; field: string }>> = {
  container: { command: ["ps", "-a", "--no-trunc"], field: "{{.ID}}" },
  volume: { command: ["volume", "ls"], field: "{{.Name}}" },
  network: { command: ["network", "ls", "--no-trunc"], field: "{{.ID}}" },
};

/** Ids (names for volumes) of the objects matching every filter, e.g. `label=k=v`; filters are ANDed. */
export async function listObjects(kind: ObjectKind, filters: readonly string[]): Promise<string[]> {
  const { command, field } = LIST_COMMAND[kind];
  const filterArgs = filters.flatMap((filter) => ["--filter", filter]);
  return lines(await docker([...command, ...filterArgs, "--format", field]));
}

/** Docker's `name=` filter matches substrings, so the exact name is compared here. */
export async function networkExists(name: string): Promise<boolean> {
  const names = lines(
    await docker(["network", "ls", "--filter", `name=${name}`, "--format", "{{.Name}}"]),
  );
  return names.includes(name);
}

function labelArgs(labels: Readonly<Record<string, string>>): string[] {
  return Object.entries(labels).flatMap(([key, value]) => ["--label", `${key}=${value}`]);
}

export async function createVolume(
  name: string,
  labels: Readonly<Record<string, string>>,
): Promise<string> {
  return (await docker(["volume", "create", ...labelArgs(labels), name])).trim();
}

const POOL_EXHAUSTED = "could not find an available, non-overlapping IPv4 address pool";

/** Returns the network Id. An exhausted address pool usually means leftovers of interrupted runs. */
export async function createNetwork(
  name: string,
  labels: Readonly<Record<string, string>>,
): Promise<string> {
  try {
    return (await docker(["network", "create", ...labelArgs(labels), name])).trim();
  } catch (error: unknown) {
    if (error instanceof DockerCliError && error.stderr.includes(POOL_EXHAUSTED)) {
      console.error(
        "Docker has no free network address pool. Remove the networks of earlier test runs (README, sweep of " +
          "test leftovers): docker network ls --filter label=academy.workspace.test-run --format '{{.ID}} {{.Name}}'",
      );
    }
    throw error;
  }
}

/**
 * Creates (never starts) a container of the test image with no network, so no test object holds an endpoint
 * (design 12.2). Returns the Id.
 */
export async function createIdleContainer(
  name: string,
  labels: Readonly<Record<string, string>>,
): Promise<string> {
  const args = ["create", "--network", "none", "--name", name, ...labelArgs(labels)];
  return (await docker([...args, TEST_IMAGE, "sleep", "infinity"])).trim();
}

/** Like `createIdleContainer`, but started, with docker-init so a stop ends it at once. Returns the Id. */
export async function runIdleContainer(
  name: string,
  labels: Readonly<Record<string, string>>,
): Promise<string> {
  const args = ["run", "-d", "--init", "--network", "none", "--name", name, ...labelArgs(labels)];
  return (await docker([...args, TEST_IMAGE, "sleep", "infinity"])).trim();
}
