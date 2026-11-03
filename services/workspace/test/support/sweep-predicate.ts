// The harness sweep of earlier test runs (design 12.2). Pure and Docker-free, so the rule that decides what a
// test run may remove from a shared daemon is unit-tested against the owner's objects as negative cases.
// It imports no product module: a bug in the code under test must not widen what the harness removes.

export type SweepKind = "container" | "volume" | "network" | "image";

export interface SweepCandidate {
  kind: SweepKind;
  name: string;
  labels: Readonly<Record<string, string>>;
  createdAtMs: number;
}

export interface SweepContext {
  /** This run's id; its own objects are never swept, they belong to its own cleanup. */
  runId: string;
  /** Names read by the setup's owner snapshot. */
  ownerNames: ReadonlySet<string>;
  /** Runs whose sentinel names this host and a PID that is no longer alive, computed once per pass. */
  deadRuns: ReadonlySet<string>;
  nowMs: number;
}

export const TEST_LABEL = {
  run: "academy.workspace.test-run",
  pid: "academy.workspace.test-pid",
  host: "academy.workspace.test-host",
  managed: "academy.workspace.managed",
  instance: "academy.workspace.instance",
} as const;

/** A run that stopped without its teardown is swept after this age even when its sentinel says nothing. */
export const STALE_AFTER_MS = 60 * 60 * 1000;

const RUN_ID_PATTERN = /^[0-9a-f]{8}$/;
const TEST_INSTANCE_PATTERN = /^t([0-9a-f]{8})-[a-z]$/;
const OWNER_NAME_PREFIXES = ["academy-", "academy_", "wks-local-"];
// `local` is the owner's deployed instance and `t31` the isolated recipe's; neither belongs to a test run.
const PROTECTED_INSTANCES = new Set(["local", "t31"]);

function isDenied(candidate: SweepCandidate, ownerNames: ReadonlySet<string>): boolean {
  if (ownerNames.has(candidate.name)) return true;
  if (OWNER_NAME_PREFIXES.some((prefix) => candidate.name.startsWith(prefix))) return true;
  const instance = candidate.labels[TEST_LABEL.instance];
  return instance !== undefined && PROTECTED_INSTANCES.has(instance);
}

/** The test run an object's marker names, or `null` when it carries no well-formed marker. */
export function markedRun(labels: Readonly<Record<string, string>>): string | null {
  const run = labels[TEST_LABEL.run];
  if (run !== undefined && RUN_ID_PATTERN.test(run)) return run;
  if (labels[TEST_LABEL.managed] !== "true") return null;
  const match = TEST_INSTANCE_PATTERN.exec(labels[TEST_LABEL.instance] ?? "");
  return match?.[1] ?? null;
}

/**
 * True only for a container, volume or network of an earlier test run that is over. The deny list runs in
 * front of the marker rule, so a single bug in either cannot make an owner object sweepable.
 */
export function isSweepable(candidate: SweepCandidate, context: SweepContext): boolean {
  if (candidate.kind === "image") return false;
  if (isDenied(candidate, context.ownerNames)) return false;
  const run = markedRun(candidate.labels);
  if (run === null || run === context.runId) return false;
  // A reused PID only delays a sweep until the age rule applies; it never sweeps a live run early.
  return context.deadRuns.has(run) || context.nowMs - candidate.createdAtMs > STALE_AFTER_MS;
}
