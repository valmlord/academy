import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import type { TestProject } from "vitest/node";
import { docker, TEST_IMAGE } from "./docker-cli.js";
import {
  checkInstanceTable,
  createSentinel,
  type OwnerSnapshot,
  readOwnerSnapshot,
  sweepLeftovers,
  teardownRun,
} from "./harness.js";

const RUN_ID_BYTES = 4;
const INTEGRATION_FILE = /\.int\.test\.ts$/;
const LOG_PREFIX = "@academy/workspace test:integration";

function report(stage: string, error: unknown): void {
  // vitest 5.0.5 replaces a globalSetup error with an unrelated one, so the cause is printed first.
  const detail = error instanceof Error ? error.message : typeof error;
  console.error(`${LOG_PREFIX}: ${stage} failed: ${detail}`);
}

/** Pulled only when absent: a pull never replaces an image already on the daemon (16.5 H9). */
async function ensureTestImage(): Promise<void> {
  const present = await docker(["image", "ls", "--format", "{{.ID}}", TEST_IMAGE]);
  if (present.trim() === "") await docker(["pull", TEST_IMAGE]);
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const runId = randomBytes(RUN_ID_BYTES).toString("hex");
  let snapshot: OwnerSnapshot;
  try {
    const files = readdirSync(new URL(".", import.meta.url)).filter((file) =>
      INTEGRATION_FILE.test(file),
    );
    checkInstanceTable(runId, files);
    snapshot = await readOwnerSnapshot();
    await createSentinel(runId);
    await sweepLeftovers(runId, snapshot);
    await ensureTestImage();
  } catch (error: unknown) {
    report("setup", error);
    throw error;
  }
  console.log(`${LOG_PREFIX}: run ${runId}`);
  project.provide("testRunId", runId);
  return async () => {
    try {
      await teardownRun(runId, snapshot);
    } catch (error: unknown) {
      report("teardown", error);
      throw error;
    }
  };
}
