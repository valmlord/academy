import "server-only";
import { z } from "zod";
import { workspaceServiceConfig } from "./config";
import type { WorkspaceServiceConfig } from "./env";

// Web's client of the workspace service (ADR-0010). Every answer, refusal and network failure becomes a result
// the environment states of #32 design 3.6 can show; nothing here throws. Responses are untrusted input and
// validated with zod. Log lines carry the operation, the status and a code from a closed charset, never the
// secret, a header, a body or an error message.

export interface WorkspaceKey {
  userId: string;
  courseId: string;
  lessonId: string;
}

// ADR-0010 item 4. z.object drops fields a later /v1 adds (item 2: additive changes only).
const WorkspaceSchema = z.object({
  id: z.string(),
  userId: z.string(),
  courseId: z.string(),
  lessonId: z.string(),
  state: z.enum(["running", "stopped"]),
  image: z.string().nullable(),
  outcome: z.enum(["created", "started", "running"]).optional(),
  idle: z.object({ stopAt: z.string(), warningAt: z.string() }).nullable(),
  exit: z.object({ code: z.number(), reason: z.enum(["memory-limit", "exited"]) }).nullable(),
  limits: z.object({ nanoCpus: z.number(), memoryBytes: z.number(), pidsLimit: z.number() }),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

// ADR-0010 item 6. The image name is shown in the "image missing" copy, so its length is bounded.
const ErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    image: z.string().min(1).max(256).optional(),
  }),
});

/** The failures design 3.6 tells apart; everything else is `failed`, the generic "start failed" copy (D8). */
export type WorkspaceFailure =
  | { kind: "docker-down" }
  | { kind: "image-missing"; image: string }
  | { kind: "rejected" }
  | { kind: "failed" };

export type WorkspaceAnswer =
  | { kind: "workspace"; workspace: Workspace }
  | { kind: "not-found" }
  | WorkspaceFailure;

/** `DELETE W`'s answer: the contract's 204, the volume still in use (409 `workspace-busy`), or a failure. */
export type RemoveAnswer = { kind: "removed" } | { kind: "busy" } | WorkspaceFailure;

/** `POST W/activity`'s answer; `not-running` is the 409 for a workspace the service does not track as running. */
export type ActivityAnswer = { kind: "recorded" } | { kind: "not-running" } | WorkspaceFailure;

export interface WorkspaceClient {
  /** `GET W`: reads the workspace; `not-found` when neither container nor volume exists. */
  get(key: WorkspaceKey): Promise<WorkspaceAnswer>;
  /** `PUT W`: creates or starts the workspace and answers it running, with `outcome`. */
  ensure(key: WorkspaceKey): Promise<WorkspaceAnswer>;
  /** `POST W/stop`: stops the container, keeps the volume, and answers the workspace stopped. */
  stop(key: WorkspaceKey): Promise<WorkspaceAnswer>;
  /** `DELETE W`: removes the container and the volume. */
  remove(key: WorkspaceKey): Promise<RemoveAnswer>;
  /** `POST W/activity`: moves the idle window of a running workspace. */
  activity(key: WorkspaceKey): Promise<ActivityAnswer>;
}

// GET is a few Docker reads. PUT is at most 102 engine calls and up to 10 s of waiting on a name another process
// holds, each call bounded only by the service's 30 s inactivity timeout (ADR-0010 item 8 as amended by #181):
// 120 s covers a slow create without leaving the learner waiting forever.
export const GET_TIMEOUT_MS = 10_000;
export const ENSURE_TIMEOUT_MS = 120_000;
// Stop and delete queue on the workspace lock behind an ensure (ADR-0010 item 8), then wait out the container's
// 10 s stop grace (services/workspace/src/docker/spec.ts), so they get the ensure's bound.
export const STOP_TIMEOUT_MS = 120_000;
export const REMOVE_TIMEOUT_MS = 120_000;
// Activity takes no lock and makes no Docker call.
export const ACTIVITY_TIMEOUT_MS = 10_000;

export interface WorkspaceClientDeps {
  config: () => WorkspaceServiceConfig;
  fetch: typeof fetch;
  log: (line: string) => void;
  getTimeoutMs?: number;
  ensureTimeoutMs?: number;
}

const LOGGED_CODE = /^[a-z][a-z0-9-]{0,63}$/;
const LOGGED_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

function loggable(value: unknown, pattern: RegExp): string {
  return typeof value === "string" && pattern.test(value) ? value : "-";
}

/** The design 3.6 state of a non-2xx answer (U-state-map); `body` is the parsed JSON or undefined. */
export function answerForError(
  status: number,
  body: unknown,
): { kind: "not-found" } | WorkspaceFailure {
  const parsed = ErrorBodySchema.safeParse(body);
  if (!parsed.success) return { kind: "failed" };
  const { code, image } = parsed.data.error;
  if (status === 404 && code === "workspace-not-found") return { kind: "not-found" };
  if (status === 503 && code === "docker-unavailable") return { kind: "docker-down" };
  if (status === 409 && code === "image-missing" && image !== undefined) {
    return { kind: "image-missing", image };
  }
  if (status === 500 && code === "workspace-identity-mismatch") return { kind: "rejected" };
  return { kind: "failed" };
}

function sameKey(workspace: Workspace, key: WorkspaceKey): boolean {
  return (
    workspace.userId === key.userId &&
    workspace.courseId === key.courseId &&
    workspace.lessonId === key.lessonId
  );
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// An undici network failure is a TypeError whose cause carries the system code (ECONNREFUSED, ENOTFOUND).
function describeThrown(error: unknown): string {
  if (!(error instanceof Error)) return "NonError";
  const cause: unknown = error.cause;
  const code = cause instanceof Error ? Reflect.get(cause, "code") : undefined;
  const codePart = typeof code === "string" && /^[A-Z_]{1,32}$/.test(code) ? ` ${code}` : "";
  return `${loggable(error.name, LOGGED_NAME)}${codePart}`;
}

/** A request that got an answer, or `failed` already logged. */
type Sent = { kind: "sent"; status: number; body: unknown } | { kind: "failed" };

const NO_CONTENT = 204;

export function createWorkspaceClient(deps: WorkspaceClientDeps): WorkspaceClient {
  const getTimeoutMs = deps.getTimeoutMs ?? GET_TIMEOUT_MS;
  const ensureTimeoutMs = deps.ensureTimeoutMs ?? ENSURE_TIMEOUT_MS;

  function fail(label: string, reason: string): { kind: "failed" } {
    deps.log(`web: workspace service ${label} failed: ${reason}`);
    return { kind: "failed" };
  }

  async function send(
    label: string,
    method: "GET" | "PUT" | "POST" | "DELETE",
    key: WorkspaceKey,
    pathSuffix: "" | "/stop" | "/activity",
    timeoutMs: number,
  ): Promise<Sent> {
    try {
      const config = deps.config();
      if (config.kind === "unconfigured") return fail(label, "unconfigured");
      const path = `/v1/users/${encodeURIComponent(key.userId)}/courses/${encodeURIComponent(
        key.courseId,
      )}/lessons/${encodeURIComponent(key.lessonId)}/workspace${pathSuffix}`;
      const response = await deps.fetch(new URL(path, config.baseUrl), {
        method,
        headers: { authorization: `Bearer ${config.secret}` },
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
      return { kind: "sent", status: response.status, body: await readJson(response) };
    } catch (error: unknown) {
      return fail(label, describeThrown(error));
    }
  }

  function logRefusal(label: string, status: number, body: unknown): void {
    const code = ErrorBodySchema.safeParse(body).data?.error.code;
    deps.log(`web: workspace service ${label} failed: ${status} ${loggable(code, LOGGED_CODE)}`);
  }

  // A refusal that every operation maps alike; `not-found` is meaningful only where the caller asks for it.
  function failureOf(label: string, status: number, body: unknown): WorkspaceFailure {
    logRefusal(label, status, body);
    const answer = answerForError(status, body);
    return answer.kind === "not-found" ? { kind: "failed" } : answer;
  }

  async function workspaceRequest(
    label: string,
    method: "GET" | "PUT" | "POST",
    key: WorkspaceKey,
    pathSuffix: "" | "/stop",
    timeoutMs: number,
  ): Promise<WorkspaceAnswer> {
    const sent = await send(label, method, key, pathSuffix, timeoutMs);
    if (sent.kind === "failed") return sent;
    const { status, body } = sent;
    if (status >= 200 && status < 300) {
      const parsed = WorkspaceSchema.safeParse(body);
      if (!parsed.success || !sameKey(parsed.data, key)) {
        return fail(label, `invalid response (${status})`);
      }
      return { kind: "workspace", workspace: parsed.data };
    }
    const answer = answerForError(status, body);
    if (answer.kind !== "not-found") logRefusal(label, status, body);
    return answer;
  }

  async function remove(key: WorkspaceKey): Promise<RemoveAnswer> {
    const label = "DELETE";
    const sent = await send(label, "DELETE", key, "", REMOVE_TIMEOUT_MS);
    if (sent.kind === "failed") return sent;
    const { status, body } = sent;
    // The contract answers exactly 204; another 2xx is not proof that the volume is gone.
    if (status === NO_CONTENT) return { kind: "removed" };
    if (status >= 200 && status < 300) return fail(label, `invalid response (${status})`);
    if (status === 409 && ErrorBodySchema.safeParse(body).data?.error.code === "workspace-busy") {
      logRefusal(label, status, body);
      return { kind: "busy" };
    }
    return failureOf(label, status, body);
  }

  async function activity(key: WorkspaceKey): Promise<ActivityAnswer> {
    const label = "POST activity";
    const sent = await send(label, "POST", key, "/activity", ACTIVITY_TIMEOUT_MS);
    if (sent.kind === "failed") return sent;
    const { status, body } = sent;
    if (status === NO_CONTENT) return { kind: "recorded" };
    if (status >= 200 && status < 300) return fail(label, `invalid response (${status})`);
    // Expected once the workspace has stopped, so not an incident worth a log line.
    if (
      status === 409 &&
      ErrorBodySchema.safeParse(body).data?.error.code === "workspace-not-running"
    ) {
      return { kind: "not-running" };
    }
    return failureOf(label, status, body);
  }

  return {
    get: (key) => workspaceRequest("GET", "GET", key, "", getTimeoutMs),
    ensure: (key) => workspaceRequest("PUT", "PUT", key, "", ensureTimeoutMs),
    stop: (key) => workspaceRequest("POST stop", "POST", key, "/stop", STOP_TIMEOUT_MS),
    remove,
    activity,
  };
}

// One client per process: it holds no connection of its own (fetch pools them) and reads the configuration
// on every call.
export const workspaceClient: WorkspaceClient = createWorkspaceClient({
  config: workspaceServiceConfig,
  fetch: (input, init) => fetch(input, init),
  log: (line) => console.error(line),
});
