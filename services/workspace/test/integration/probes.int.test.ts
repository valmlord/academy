import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HIDDEN_DIR } from "@academy/lesson-schema/schema";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { StarterItem } from "../../src/course/starter.js";
import { DockerEngine } from "../../src/docker/engine.js";
import { NEVER_STARTED_AT } from "../../src/docker/schemas.js";
import { buildStarterTar } from "../../src/docker/tar.js";
import {
  LEARNER_GID,
  LEARNER_HOME,
  LEARNER_UID,
  networkLabels,
  STARTER_MARKER,
  WORK_DIR,
  WORKSPACE_MOUNT,
  type WorkspaceKey,
} from "../../src/identity.js";
import {
  DockerCliError,
  docker,
  inspectObject,
  listObjects,
  parseJsonLines,
  TEST_IMAGE,
} from "./docker-cli.js";
import { createWorkspaceObjects, statusOf, testContainerSpec } from "./fixtures.js";
import { runLabels, useTestInstance } from "./harness.js";

// The facts of design section 0 that the service's algorithms rely on and no document settles. Each probe
// prints what it observed, so the result is evidence even when it matches the expectation.

const { runId, instance } = useTestInstance("probes.int.test.ts");

describe("P4: network name conflicts", () => {
  it("answers 409 to a second network create with the same name, and keeps the first network", async () => {
    const engine = new DockerEngine();
    const name = `wks-${instance}-net`;
    const firstId = await engine.createNetwork(name, networkLabels(instance));

    const status = await statusOf(engine.createNetwork(name, networkLabels(instance)));
    console.log(`P4 network create on an existing name status=${String(status)}`);

    expect(status).toBe(409);
    expect(await listObjects("network", [`name=${name}`])).toEqual([firstId]);
    await engine.removeNetwork(firstId);
    expect(await inspectObject("network", firstId)).toBeNull();
  });
});

const key: WorkspaceKey = {
  userId: "probe-user",
  courseId: "sample-course",
  lessonId: "with-workspace",
};

/** A small starter with a nested directory, an executable file and a plain file. */
const PROBE_STARTER: StarterItem[] = [
  { rel: "notes.txt", kind: "file", mode: 0o644, content: Buffer.from("probe notes\n") },
  { rel: "src", kind: "directory", mode: 0o755, content: null },
  { rel: "src/run.sh", kind: "file", mode: 0o755, content: Buffer.from("#!/bin/sh\necho ok\n") },
];
const ARCHIVE_MTIME = new Date("2026-01-01T00:00:00Z");

/** A created, never-started workspace container of the service's own spec (read-only rootfs, volume). */
async function neverStartedWorkspace(engine: DockerEngine): Promise<string> {
  const names = await createWorkspaceObjects(engine, instance, key);
  return engine.createContainer(names.container, testContainerSpec(instance, key, names));
}

/** `uid:gid mode path` per path, read inside the container by busybox `stat`. */
async function ownership(id: string, paths: readonly string[]): Promise<string[]> {
  const output = await docker(["exec", id, "stat", "-c", "%u:%g %a %n", ...paths]);
  return output.trim().split("\n");
}

describe("P1: archive into the volume of a never-started container", () => {
  it("keeps the header owner and mode of every entry, and gives new directories the header owner", async () => {
    const engine = new DockerEngine();
    const id = await neverStartedWorkspace(engine);

    await engine.putArchive(
      id,
      WORKSPACE_MOUNT,
      await buildStarterTar(PROBE_STARTER, ARCHIVE_MTIME),
    );
    await engine.startContainer(id);
    const observed = await ownership(id, [
      WORKSPACE_MOUNT,
      LEARNER_HOME,
      WORK_DIR,
      `${WORK_DIR}/notes.txt`,
      `${WORK_DIR}/src`,
      `${WORK_DIR}/src/run.sh`,
      STARTER_MARKER,
    ]);
    console.log(`P1 observed: ${observed.join(" | ")}`);

    expect(observed).toEqual([
      `0:0 755 ${WORKSPACE_MOUNT}`,
      `1000:1000 755 ${LEARNER_HOME}`,
      `1000:1000 755 ${WORK_DIR}`,
      `1000:1000 644 ${WORK_DIR}/notes.txt`,
      `1000:1000 755 ${WORK_DIR}/src`,
      `1000:1000 755 ${WORK_DIR}/src/run.sh`,
      `0:0 444 ${STARTER_MARKER}`,
    ]);
    expect(await docker(["exec", id, "cat", `${WORK_DIR}/notes.txt`])).toBe("probe notes\n");
  });
});

describe("P2: HEAD /archive on a never-started container", () => {
  it("answers 200 for a path in the volume and 404 for a missing one", async () => {
    const engine = new DockerEngine();
    const id = await neverStartedWorkspace(engine);

    const markerBefore = await engine.pathExists(id, STARTER_MARKER);
    await engine.putArchive(
      id,
      WORKSPACE_MOUNT,
      await buildStarterTar(PROBE_STARTER, ARCHIVE_MTIME),
    );
    const markerAfter = await engine.pathExists(id, STARTER_MARKER);
    const missing = await engine.pathExists(id, `${WORKSPACE_MOUNT}/absent`);
    const state = await engine.inspectContainer(id);
    console.log(
      `P2 marker before=${String(markerBefore)} after=${String(markerAfter)} missing=${String(missing)}`,
    );

    expect([markerBefore, markerAfter, missing]).toEqual([false, true, false]);
    expect(state?.State.StartedAt).toBe(NEVER_STARTED_AT);
  });
});

/** Long enough that a `sleep` which rejects `infinity` (and exits at once) is seen as stopped. */
const KEEPER_WATCH_MS = 3_000;

describe("P3: the keeper command", () => {
  it("keeps a workspace container running: busybox `sleep infinity` does not return", async () => {
    const engine = new DockerEngine();
    const id = await neverStartedWorkspace(engine);

    await engine.startContainer(id);
    await new Promise((resolve) => setTimeout(resolve, KEEPER_WATCH_MS));
    const state = await engine.inspectContainer(id);
    const keepers = await docker(["exec", id, "pgrep", "-f", "-x", "sleep infinity"]);
    console.log(
      `P3 running after ${KEEPER_WATCH_MS} ms=${String(state?.State.Running)} keepers=${keepers.trim().split("\n").length}`,
    );

    expect(state?.State.Running).toBe(true);
    expect(keepers.trim().split("\n")).toHaveLength(1);
  });
});

/** Whether a command run in the container as the learner fails (non-zero exit). */
async function failsAsLearner(id: string, command: readonly string[]): Promise<boolean> {
  try {
    await docker(["exec", "-u", `${LEARNER_UID}:${LEARNER_GID}`, id, ...command]);
    return false;
  } catch (error: unknown) {
    if (error instanceof DockerCliError) return true;
    throw error;
  }
}

describe("P5: the root-owned marker on the volume", () => {
  it("cannot be removed or renamed by uid 1000 without capabilities", async () => {
    const engine = new DockerEngine();
    const id = await neverStartedWorkspace(engine);
    await engine.putArchive(
      id,
      WORKSPACE_MOUNT,
      await buildStarterTar(PROBE_STARTER, ARCHIVE_MTIME),
    );
    await engine.startContainer(id);

    const removeFails = await failsAsLearner(id, ["rm", "-f", STARTER_MARKER]);
    const renameFails = await failsAsLearner(id, ["mv", STARTER_MARKER, `${LEARNER_HOME}/marker`]);
    const markerKept = await engine.pathExists(id, STARTER_MARKER);
    console.log(
      `P5 remove refused=${String(removeFails)} rename refused=${String(renameFails)} marker kept=${String(markerKept)}`,
    );

    expect([removeFails, renameFails, markerKept]).toEqual([true, true, true]);
  });
});

const REPO_COURSE_DIR = fileURLToPath(new URL("../../../../course", import.meta.url));
/** `course/<course>/<module>/<lesson>/checks` */
const CHECKS_DEPTH = 4;

/** The relative path of the first lesson (sorted walk) that has a `checks/` directory. */
function firstLessonWithChecks(dir: string, rel: string, depth: number): string | null {
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (depth === CHECKS_DEPTH - 1 && entries.includes(HIDDEN_DIR)) return rel;
  if (depth >= CHECKS_DEPTH - 1) return null;
  for (const name of entries) {
    const found = firstLessonWithChecks(
      join(dir, name),
      rel === "" ? name : `${rel}/${name}`,
      depth + 1,
    );
    if (found !== null) return found;
  }
  return null;
}

// Runs inside the container: lstat `checks` and two spellings of it below the lesson, one JSON line per name.
// The variants are built from code points, so this source stays ASCII.
const P8_SNIPPET = `
const fs = require("node:fs");
const lesson = "/course/" + process.argv[1];
const names = ["checks", "Checks", "chec" + String.fromCodePoint(0x212a) + "s"];
for (const name of names) {
  try {
    const stat = fs.lstatSync(lesson + "/" + name, { bigint: true });
    console.log(JSON.stringify({ name, dev: String(stat.dev), ino: String(stat.ino), directory: stat.isDirectory() }));
  } catch (error) {
    console.log(JSON.stringify({ name, error: String(error.code) }));
  }
}
`;

const p8StatLine = z.object({
  name: z.string(),
  dev: z.string(),
  ino: z.string(),
  directory: z.boolean(),
});
const p8Line = z.union([p8StatLine, z.object({ name: z.string(), error: z.string() })]);
type P8StatLine = z.infer<typeof p8StatLine>;
type P8Line = z.infer<typeof p8Line>;

type VariantResult = "same" | "enoent" | "other";

function variantResult(control: P8StatLine, variant: P8Line): VariantResult {
  if ("error" in variant) return variant.error === "ENOENT" ? "enoent" : "other";
  return variant.dev === control.dev && variant.ino === control.ino ? "same" : "other";
}

/** `same`, `enoent`, `distinct` (a variant resolves to another entry or fails otherwise) or `mixed`. */
function p8Outcome(results: readonly VariantResult[]): string {
  if (results.every((result) => result === "same")) return "same";
  if (results.every((result) => result === "enoent")) return "enoent";
  if (results.includes("other")) return "distinct";
  return "mixed";
}

describe("P8: case variants of checks/ on the course bind mount", () => {
  it("records whether the variants resolve to the checks/ directory inside a container", async () => {
    const lesson = firstLessonWithChecks(REPO_COURSE_DIR, "", 0);
    if (lesson === null) throw new Error("P8: no lesson with checks/");

    const output = await docker([
      "run",
      "--rm",
      "--network",
      "none",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--user",
      `${LEARNER_UID}:${LEARNER_GID}`,
      ...Object.entries(runLabels(runId)).flatMap(([label, value]) => [
        "--label",
        `${label}=${value}`,
      ]),
      "-v",
      `${REPO_COURSE_DIR}:/course:ro`,
      TEST_IMAGE,
      "node",
      "-e",
      P8_SNIPPET,
      lesson,
    ]);
    const [control, ...variants] = parseJsonLines(output, p8Line);
    if (control === undefined || "error" in control || !control.directory) {
      throw new Error(
        `P8: probe broken (checks/ of ${lesson} is not a directory in the container)`,
      );
    }
    const os = (await docker(["info", "--format", "{{.OperatingSystem}}"])).trim();
    const outcome = p8Outcome(variants.map((variant) => variantResult(control, variant)));
    console.log(`P8 outcome=${outcome} os=${os}`);

    expect(variants).toHaveLength(2);
    expect(["same", "enoent", "distinct", "mixed"]).toContain(outcome);
  });
});
