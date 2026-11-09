import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { buildContainerSpec } from "../../src/docker/spec.js";
import { type WorkspaceKey, workspaceId, workspaceNames } from "../../src/identity.js";

// U-smoke-flags (design #33 5.5): images/workspace/test/smoke.sh starts the image with the service's create
// flags, so the smoke test proves the image under the limits a real workspace gets. This guard keeps the two
// from drifting: every leaf of the create body is mapped to a docker run flag, mapped to the keeper command, or
// ignored by name, and anything else fails, so a new key cannot reach the service without the smoke test covering
// it. The array alone is not the command line, so the two docker run lines that use it and the S15-config row are
// pinned as text as well.

const SMOKE_SCRIPT = new URL("../../../../images/workspace/test/smoke.sh", import.meta.url);
const BEGIN_MARKER = "# spec-flags begin";
const END_MARKER = "# spec-flags end";
const NANOS_PER_CPU = 1_000_000_000;
// The run lines hold the keeper unquoted, so only a word that needs no shell quoting can be pinned there.
const SHELL_WORD = /^[A-Za-z0-9_./:=@%+-]+$/;
const S15_CONFIG_PREFIX = "expect S15-config ";

const INSTANCE = "t";
const KEY: WorkspaceKey = {
  userId: "user-1",
  courseId: "sample-course",
  lessonId: "with-workspace",
};
const REQUIRED_ENV = {
  WORKSPACE_SERVICE_SECRET: "s".repeat(32),
  WORKSPACE_INSTANCE: INSTANCE,
  COURSE_ROOT: "/course",
};

class SmokeFlagsMarkerError extends Error {
  constructor(detail: string) {
    super(`smoke.sh spec-flags markers: ${detail}`);
    this.name = "SmokeFlagsMarkerError";
  }
}

class UncoveredCreateBodyKeyError extends Error {
  readonly paths: readonly string[];

  constructor(paths: readonly string[]) {
    super(paths.map((path) => `smoke.sh does not cover create-body key ${path}`).join("\n"));
    this.name = "UncoveredCreateBodyKeyError";
    this.paths = paths;
  }
}

/** The trimmed lines between the two marker lines of smoke.sh's spec_flags array. */
function smokeSpecFlags(script: string): string[] {
  const lines = script.split("\n");
  const begin = lines.indexOf(BEGIN_MARKER);
  const end = lines.indexOf(END_MARKER);
  if (begin === -1 || end === -1)
    throw new SmokeFlagsMarkerError(`begin at ${begin}, end at ${end}`);
  if (lines.indexOf(BEGIN_MARKER, begin + 1) !== -1 || lines.indexOf(END_MARKER, end + 1) !== -1) {
    throw new SmokeFlagsMarkerError("a marker appears twice");
  }
  if (end < begin)
    throw new SmokeFlagsMarkerError(`end (line ${end + 1}) before begin (line ${begin + 1})`);
  return lines.slice(begin + 1, end).map((line) => line.trim());
}

interface Leaf {
  path: string;
  value: unknown;
}

/**
 * Objects recurse by key, arrays by index. An empty array or object is a leaf of its own, so a key whose value
 * is empty still has a path and cannot slip past the guard.
 */
function leaves(value: unknown, path: string): Leaf[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [{ path, value }];
    return value.flatMap((item: unknown, index) => leaves(item, `${path}[${index}]`));
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value);
    if (entries.length === 0) return [{ path, value }];
    return entries.flatMap(([key, item]) => leaves(item, path === "" ? key : `${path}.${key}`));
  }
  return [{ path, value }];
}

// Differences between the smoke container and a workspace that design 5.1 states: the image is the one under
// test, the labels are the smoke run's own and the network is none or bridge. Cmd is not here: it is the keeper
// both run lines must end with.
const IGNORED: readonly RegExp[] = [/^Image$/, /^Labels\./, /^HostConfig\.NetworkMode$/];

type FlagFor = (value: unknown) => string | null;

function text(flag: string): FlagFor {
  return (value) => (typeof value === "string" ? `${flag} ${value}` : null);
}

function integer(flag: string): FlagFor {
  return (value) => (Number.isInteger(value) ? `${flag} ${String(value)}` : null);
}

/** `--read-only` and `--init` exist only as switches, so only `true` maps to a flag. */
function switchOn(flag: string): FlagFor {
  return (value) => (value === true ? flag : null);
}

const SINGLE_LEAF_FLAGS: ReadonlyArray<readonly [RegExp, FlagFor]> = [
  [/^User$/, text("--user")],
  [/^Env\[\d+\]$/, text("--env")],
  [/^WorkingDir$/, text("--workdir")],
  [/^StopTimeout$/, integer("--stop-timeout")],
  [
    /^HostConfig\.NanoCpus$/,
    (value) => (typeof value === "number" ? `--cpus ${value / NANOS_PER_CPU}` : null),
  ],
  [/^HostConfig\.Memory$/, integer("--memory")],
  [/^HostConfig\.MemorySwap$/, integer("--memory-swap")],
  [/^HostConfig\.PidsLimit$/, integer("--pids-limit")],
  [/^HostConfig\.OomScoreAdj$/, integer("--oom-score-adj")],
  [/^HostConfig\.CapDrop\[\d+\]$/, text("--cap-drop")],
  [/^HostConfig\.SecurityOpt\[\d+\]$/, text("--security-opt")],
  [/^HostConfig\.ReadonlyRootfs$/, switchOn("--read-only")],
  [/^HostConfig\.Init$/, switchOn("--init")],
  [/^HostConfig\.RestartPolicy\.Name$/, text("--restart")],
];

const CMD_WORD = /^Cmd\[(\d+)\]$/;
const TMPFS_PREFIX = "HostConfig.Tmpfs.";
const MOUNT_PREFIX = "HostConfig.Mounts[0].";
const MOUNT_KEYS = ["Type", "Source", "Target", "VolumeOptions.NoCopy"] as const;

/**
 * The four leaves of the one mount become smoke.sh's single `--mount` line. The volume name differs per run,
 * so `Source` maps to the literal `$volume` of the script.
 */
function mountFlag(mount: ReadonlyMap<string, unknown>): string | null {
  const isVolume = mount.get("Type") === "volume" && typeof mount.get("Source") === "string";
  const target = mount.get("Target");
  if (!isVolume || typeof target !== "string" || mount.get("VolumeOptions.NoCopy") !== true)
    return null;
  return `--mount "type=volume,src=$volume,dst=${target},volume-nocopy"`;
}

interface SmokeRun {
  flags: string[];
  /** The create body's Cmd, its words joined by one space, as the run lines end with it. */
  keeper: string;
}

/** What smoke.sh must pass for this create body; throws naming every leaf with no mapping. */
function smokeRunFor(body: unknown): SmokeRun {
  const flags: string[] = [];
  const keeperWords: string[] = [];
  const uncovered: string[] = [];
  const mount = new Map<string, unknown>();
  for (const { path, value } of leaves(body, "")) {
    if (IGNORED.some((pattern) => pattern.test(path))) continue;
    const cmdWord = CMD_WORD.exec(path);
    if (cmdWord !== null) {
      if (typeof value === "string" && SHELL_WORD.test(value))
        keeperWords[Number(cmdWord[1])] = value;
      else uncovered.push(path);
      continue;
    }
    const mountKey = path.startsWith(MOUNT_PREFIX) ? path.slice(MOUNT_PREFIX.length) : null;
    if (mountKey !== null && (MOUNT_KEYS as readonly string[]).includes(mountKey)) {
      mount.set(mountKey, value);
      continue;
    }
    if (path.startsWith(TMPFS_PREFIX) && typeof value === "string") {
      flags.push(`--tmpfs ${path.slice(TMPFS_PREFIX.length)}:${value}`);
      continue;
    }
    const mapping = SINGLE_LEAF_FLAGS.find(([pattern]) => pattern.test(path));
    const flag = mapping === undefined ? null : mapping[1](value);
    if (flag === null) uncovered.push(path);
    else flags.push(flag);
  }
  if (mount.size > 0) {
    const flag = mountFlag(mount);
    if (flag === null) uncovered.push(...MOUNT_KEYS.map((key) => `${MOUNT_PREFIX}${key}`));
    else flags.push(flag);
  }
  if (uncovered.length > 0) throw new UncoveredCreateBodyKeyError(uncovered);
  return { flags, keeper: keeperWords.join(" ") };
}

function uncoveredPaths(body: unknown): readonly string[] {
  try {
    smokeRunFor(body);
  } catch (error) {
    if (error instanceof UncoveredCreateBodyKeyError) return error.paths;
    throw error;
  }
  throw new Error("smokeRunFor accepted a create body with unmapped keys");
}

function serviceCreateBody(): ReturnType<typeof buildContainerSpec> {
  return buildContainerSpec({
    image: "academy-workspace:dev",
    instance: INSTANCE,
    key: KEY,
    names: workspaceNames(INSTANCE, workspaceId(INSTANCE, KEY)),
    limits: loadConfig(REQUIRED_ENV).limits,
  });
}

describe("smoke.sh spec flags", () => {
  it("smoke.sh starts the image with exactly the service's create flags", () => {
    const script = readFileSync(SMOKE_SCRIPT, "utf8");

    const fromSmoke = smokeSpecFlags(script);
    const fromService = smokeRunFor(serviceCreateBody()).flags;

    // Sorted on both sides: docker run gives flag order no meaning, and duplicates still count.
    expect([...fromSmoke].sort()).toEqual([...fromService].sort());
  });

  it("a create-body key without a smoke flag fails the guard", () => {
    const body = serviceCreateBody();
    const [mount] = body.HostConfig.Mounts;
    const extended = {
      ...body,
      Hostname: "planted",
      Cmd: [...body.Cmd, "planted value"],
      HostConfig: {
        ...body.HostConfig,
        CapAdd: [],
        Mounts: [{ ...mount, VolumeOptions: { NoCopy: true, Labels: { planted: "yes" } } }],
      },
    };

    const paths = uncoveredPaths(extended);

    expect([...paths].sort()).toEqual(
      [
        `Cmd[${body.Cmd.length}]`,
        "HostConfig.CapAdd",
        "HostConfig.Mounts[0].VolumeOptions.Labels.planted",
        "Hostname",
      ].sort(),
    );
  });

  it("smoke.sh starts both containers with only the spec flags, the run label and the service's keeper", () => {
    const lines = readFileSync(SMOKE_SCRIPT, "utf8")
      .split("\n")
      .map((line) => line.trim());
    const { keeper } = smokeRunFor(serviceCreateBody());
    const runLines = [
      `if ! kid=$(docker run -d --pull never --network bridge --label "$run_label" "\${spec_flags[@]}" "$image" ${keeper}); then`,
      `if ! id=$(docker run -d --pull never --network none --label "$run_label" "\${spec_flags[@]}" "$image" ${keeper}); then`,
    ];

    const usingArray = lines.filter((line) => line.includes("spec_flags"));
    // A run line continued from the line above would take that line's words as flags.
    const continued = lines.flatMap((line, index) =>
      runLines.includes(line) && index > 0 && (lines[index - 1] ?? "").endsWith("\\")
        ? [`line ${index + 1} continues line ${index}: ${lines[index - 1] ?? ""}`]
        : [],
    );

    expect([...usingArray].sort()).toEqual(["spec_flags=(", ...runLines].sort());
    expect(continued).toEqual([]);
  });

  it("smoke.sh pins the image Cmd and User the service creates with", () => {
    const lines = readFileSync(SMOKE_SCRIPT, "utf8")
      .split("\n")
      .map((line) => line.trim());
    const body = serviceCreateBody();
    const wanted = `${S15_CONFIG_PREFIX}0 eq 'null ${JSON.stringify(body.Cmd)} ${body.User}' -- docker image inspect --format '{{json .Config.Entrypoint}} {{json .Config.Cmd}} {{.Config.User}}' "$image"`;

    const s15Config = lines.filter((line) => line.startsWith(S15_CONFIG_PREFIX));

    expect(s15Config).toEqual([wanted]);
  });
});
