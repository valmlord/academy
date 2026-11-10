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

export interface WorkspaceClient {
  /** `GET W`: reads the workspace; `not-found` when neither container nor volume exists. */
  get(key: WorkspaceKey): Promise<WorkspaceAnswer>;
  /** `PUT W`: creates or starts the workspace and answers it running, with `outcome`. */
  ensure(key: WorkspaceKey): Promise<WorkspaceAnswer>;
}

// GET is a few Docker reads. PUT is at most 30 engine calls, each bounded only by the service's 30 s
// inactivity timeout (ADR-0010 item 8): 120 s covers a slow create without leaving the learner waiting forever.
export const GET_TIMEOUT_MS = 10_000;
export const ENSURE_TIMEOUT_MS = 120_000;

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
export function answerForError(status: number, body: unknown): WorkspaceAnswer {
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

export function createWorkspaceClient(deps: WorkspaceClientDeps): WorkspaceClient {
  const getTimeoutMs = deps.getTimeoutMs ?? GET_TIMEOUT_MS;
  const ensureTimeoutMs = deps.ensureTimeoutMs ?? ENSURE_TIMEOUT_MS;

  async function request(
    method: "GET" | "PUT",
    key: WorkspaceKey,
    timeoutMs: number,
  ): Promise<WorkspaceAnswer> {
    const fail = (reason: string): WorkspaceAnswer => {
      deps.log(`web: workspace service ${method} failed: ${reason}`);
      return { kind: "failed" };
    };
    try {
      const config = deps.config();
      if (config.kind === "unconfigured") return fail("unconfigured");
      const path = `/v1/users/${encodeURIComponent(key.userId)}/courses/${encodeURIComponent(
        key.courseId,
      )}/lessons/${encodeURIComponent(key.lessonId)}/workspace`;
      const response = await deps.fetch(new URL(path, config.baseUrl), {
        method,
        headers: { authorization: `Bearer ${config.secret}` },
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await readJson(response);
      if (response.ok) {
        const parsed = WorkspaceSchema.safeParse(body);
        if (!parsed.success || !sameKey(parsed.data, key)) {
          return fail(`invalid response (${response.status})`);
        }
        return { kind: "workspace", workspace: parsed.data };
      }
      const answer = answerForError(response.status, body);
      if (answer.kind !== "not-found") {
        const code = ErrorBodySchema.safeParse(body).data?.error.code;
        deps.log(
          `web: workspace service ${method} failed: ${response.status} ${loggable(code, LOGGED_CODE)}`,
        );
      }
      return answer;
    } catch (error: unknown) {
      return fail(describeThrown(error));
    }
  }

  return {
    get: (key) => request("GET", key, getTimeoutMs),
    ensure: (key) => request("PUT", key, ensureTimeoutMs),
  };
}

// One client per process: it holds no connection of its own (fetch pools them) and reads the configuration
// on every call.
export const workspaceClient: WorkspaceClient = createWorkspaceClient({
  config: workspaceServiceConfig,
  fetch: (input, init) => fetch(input, init),
  log: (line) => console.error(line),
});
