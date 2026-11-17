import { createHash } from "node:crypto";
import { Course } from "@academy/lesson-schema/schema";
import { InvalidWorkspaceKeyError } from "./errors.js";

/** One workspace per learner and lesson (design 4.1): the three parts of every lesson route. */
export interface WorkspaceKey {
  userId: string;
  courseId: string;
  lessonId: string;
}

/** The Docker object names of one workspace. Names are never trusted: destructive calls check labels. */
export interface WorkspaceNames {
  container: string;
  volume: string;
  network: string;
}

// Better Auth ids and test ids fit; `/`, `.` and NUL cannot appear, so a part can never act as a path
// segment or as the separator of the id hash.
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
// Course and lesson ids are the course format's own slugs, so the schema that validates the course is reused.
const slug = Course.shape.id;

/** Hex digits of SHA-256 kept in the id: 80 bits, far from a collision for one learner's lessons. */
const ID_HEX_LENGTH = 20;
/** Keeps every service-made name disjoint from compose's `academy-*` and `academy_*` names. */
const NAME_PREFIX = "wks";

/** The key from untrusted route parameters; the first field that breaks its rule throws. */
export function parseWorkspaceKey(params: Readonly<Record<string, unknown>>): WorkspaceKey {
  const userId = params.userId;
  if (typeof userId !== "string" || !USER_ID_PATTERN.test(userId)) {
    throw new InvalidWorkspaceKeyError("userId");
  }
  const courseId = slug.safeParse(params.courseId);
  if (!courseId.success) throw new InvalidWorkspaceKeyError("courseId");
  const lessonId = slug.safeParse(params.lessonId);
  if (!lessonId.success) throw new InvalidWorkspaceKeyError("lessonId");
  return { userId, courseId: courseId.data, lessonId: lessonId.data };
}

/**
 * Deterministic and fixed-length, so a name derived from it fits Docker's limits. The parts are joined
 * with NUL, which no validated part contains, so moving characters between fields changes the id.
 */
export function workspaceId(instance: string, key: WorkspaceKey): string {
  const input = [instance, key.userId, key.courseId, key.lessonId].join("\0");
  return createHash("sha256").update(input).digest("hex").slice(0, ID_HEX_LENGTH);
}

/** One network per instance, shared by its workspaces and by no compose service (design 4.7.1). */
export function instanceNetworkName(instance: string): string {
  return `${NAME_PREFIX}-${instance}-net`;
}

export function workspaceNames(instance: string, id: string): WorkspaceNames {
  const container = `${NAME_PREFIX}-${instance}-${id}`;
  return { container, volume: `${container}-files`, network: instanceNetworkName(instance) };
}

// Exec target of every workspace (design 5.2, ADR-0002 uid/path contract); #32 runs its sessions with these.
export const LEARNER_UID = 1000;
export const LEARNER_GID = 1000;
export const WORKSPACE_MOUNT = "/workspace";
export const LEARNER_HOME = "/workspace/home";
export const WORK_DIR = "/workspace/home/work";
/** Root-owned, written as the last tar entry: its presence means the starter copy finished. */
export const STARTER_MARKER = "/workspace/.starter-complete";

// Grader identity (design 5.1): each running check of a workspace holds a slot and runs as its own uid, so
// the terminal (LEARNER_UID) can neither enter the slot's directory nor signal the check's processes.
/** A lesson has at most 3 command checks; the fourth slot covers a run that overlaps the next one. */
export const CHECK_SLOTS = 4;
/**
 * The slot uids, CHECK_UID_BASE to CHECK_UID_BASE + CHECK_SLOTS - 1 (2000-2003): above Ubuntu's system uid
 * range (up to 999), apart from LEARNER_UID, and held by no user of the lesson image or of the node Alpine
 * fallback image.
 */
export const CHECK_UID_BASE = 2000;
export type CheckSlot = 0 | 1 | 2 | 3;

export function checkUid(slot: CheckSlot): number {
  return CHECK_UID_BASE + slot;
}

/** Root-owned 0711 on the volume; each slot's own 0700 directory below it holds everything placed for a check. */
export const GRADER_SCRATCH_ROOT = "/workspace/.academy-grader";

/** Label keys: the identity record of every object the service makes, immutable after create. */
export const LABEL = {
  managed: "academy.workspace.managed",
  schema: "academy.workspace.schema",
  instance: "academy.workspace.instance",
  role: "academy.workspace.role",
  id: "academy.workspace.id",
  user: "academy.workspace.user",
  course: "academy.workspace.course",
  lesson: "academy.workspace.lesson",
} as const;

/**
 * Bumped by any change that could make existing labels fail to parse (ADR-0010), so an older or newer
 * service recognises the other's objects as `other-schema` instead of garbage.
 */
export const LABEL_SCHEMA = "1";
const SCHEMA_PATTERN = /^[1-9][0-9]*$/;

export type WorkspaceRole = "container" | "volume";
export type ObjectRole = WorkspaceRole | "network";
export type Labels = Readonly<Record<string, string>>;

export function workspaceLabels(
  instance: string,
  key: WorkspaceKey,
  role: WorkspaceRole,
): Record<string, string> {
  return {
    [LABEL.managed]: "true",
    [LABEL.schema]: LABEL_SCHEMA,
    [LABEL.instance]: instance,
    [LABEL.role]: role,
    [LABEL.id]: workspaceId(instance, key),
    [LABEL.user]: key.userId,
    [LABEL.course]: key.courseId,
    [LABEL.lesson]: key.lessonId,
  };
}

/** The per-instance network carries no key: it holds no workspace data. */
export function networkLabels(instance: string): Record<string, string> {
  return {
    [LABEL.managed]: "true",
    [LABEL.schema]: LABEL_SCHEMA,
    [LABEL.instance]: instance,
    [LABEL.role]: "network",
  };
}

/**
 * Whether a network is this instance's own (design 5.1). `schema` is not checked: the network holds no
 * workspace data, so a service of any schema version may attach to it.
 */
export function networkLabelsMatch(labels: Labels, instance: string): boolean {
  return (
    labels[LABEL.managed] === "true" &&
    labels[LABEL.instance] === instance &&
    labels[LABEL.role] === "network"
  );
}

export type LabelParse =
  | { kind: "valid"; key: WorkspaceKey; id: string; role: WorkspaceRole }
  | { kind: "other-schema"; schema: string }
  | { kind: "invalid" };

function keyFromLabels(labels: Labels): WorkspaceKey | null {
  try {
    return parseWorkspaceKey({
      userId: labels[LABEL.user],
      courseId: labels[LABEL.course],
      lessonId: labels[LABEL.lesson],
    });
  } catch (error) {
    if (error instanceof InvalidWorkspaceKeyError) return null;
    throw error;
  }
}

/**
 * Three results, because reconcile treats them differently (design 6.5): `other-schema` is a well-formed
 * schema version other than ours on a managed object of this instance (a rollback must leave it alone),
 * `invalid` is anything else that does not prove a workspace of ours, including an id label that differs
 * from the id recomputed from the key labels.
 */
export function parseWorkspaceLabels(labels: Labels, instance: string): LabelParse {
  if (labels[LABEL.managed] !== "true" || labels[LABEL.instance] !== instance) {
    return { kind: "invalid" };
  }
  const schema = labels[LABEL.schema];
  if (schema === undefined || !SCHEMA_PATTERN.test(schema)) return { kind: "invalid" };
  if (schema !== LABEL_SCHEMA) return { kind: "other-schema", schema };
  const role = labels[LABEL.role];
  if (role !== "container" && role !== "volume") return { kind: "invalid" };
  const key = keyFromLabels(labels);
  if (key === null) return { kind: "invalid" };
  const id = workspaceId(instance, key);
  if (labels[LABEL.id] !== id) return { kind: "invalid" };
  return { kind: "valid", key, id, role };
}

/** A Docker list `filters` value; label filters are ANDed by the engine. */
export interface ListFilter {
  label: string[];
}

/**
 * The one filter every list uses: managed objects of this instance, optionally of one role. Never anything
 * wider, because the result of a list may be acted on, and the owner's and other instances' objects must
 * never appear in it.
 */
export function listFilter(instance: string, role?: ObjectRole): ListFilter {
  const label = [`${LABEL.managed}=true`, `${LABEL.instance}=${instance}`];
  if (role !== undefined) label.push(`${LABEL.role}=${role}`);
  return { label };
}
