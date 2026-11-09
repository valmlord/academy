// @vitest-environment node
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { inspect } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";

// The marker throws outside Next's server layers; the module under test is everything after it.
vi.mock("server-only", () => ({}));

const { answerForError, createWorkspaceClient } = await import("./client");

// U-client and U-state-map (#32 design 10.3), against a real HTTP server on an ephemeral loopback port.

const SECRET = "canary-service-secret-c".padEnd(40, "x");
const KEY = { userId: "user_1", courseId: "agentic-dev", lessonId: "first-lesson" };

const WORKSPACE = {
  id: "0123456789abcdef0123",
  ...KEY,
  state: "running",
  image: "node:22.23.4-alpine",
  outcome: "created",
  idle: { stopAt: "2026-11-04T12:30:00.000Z", warningAt: "2026-11-04T12:25:00.000Z" },
  exit: null,
  limits: { nanoCpus: 2_000_000_000, memoryBytes: 2_147_483_648, pidsLimit: 512 },
};

interface Recorded {
  method: string | undefined;
  url: string | undefined;
  authorization: string | undefined;
}

let server: Server | undefined;

afterEach(async () => {
  const open = server;
  server = undefined;
  if (open !== undefined) {
    open.closeAllConnections();
    await new Promise<void>((resolve) => open.close(() => resolve()));
  }
});

async function serve(
  answer: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ baseUrl: URL; recorded: Recorded[] }> {
  const recorded: Recorded[] = [];
  const started = createServer((request, response) => {
    recorded.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
    });
    answer(request, response);
  });
  server = started;
  await new Promise<void>((resolve) => started.listen(0, "127.0.0.1", resolve));
  const address = started.address();
  if (address === null || typeof address === "string") throw new Error("server has no TCP address");
  return { baseUrl: new URL(`http://127.0.0.1:${address.port}`), recorded };
}

function json(status: number, body: unknown) {
  return (_request: IncomingMessage, response: ServerResponse) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
}

function clientFor(
  baseUrl: URL,
  timeouts: { getTimeoutMs?: number; ensureTimeoutMs?: number } = {},
) {
  const log = vi.fn((_line: string) => {});
  const client = createWorkspaceClient({
    config: () => ({ kind: "configured", baseUrl, secret: SECRET }),
    fetch: (input, init) => fetch(input, init),
    log,
    ...timeouts,
  });
  return { client, log };
}

function logged(log: ReturnType<typeof vi.fn>): string {
  return log.mock.calls
    .flat()
    .map((argument) => inspect(argument, { depth: Number.POSITIVE_INFINITY }))
    .join("\n");
}

describe("workspace client (U-client)", () => {
  it("sends GET W with the Bearer secret and returns the validated workspace", async () => {
    const { baseUrl, recorded } = await serve(json(200, WORKSPACE));
    const { client } = clientFor(baseUrl);

    const answer = await client.get(KEY);

    expect(answer).toEqual({ kind: "workspace", workspace: WORKSPACE });
    expect(recorded).toEqual([
      {
        method: "GET",
        url: "/v1/users/user_1/courses/agentic-dev/lessons/first-lesson/workspace",
        authorization: `Bearer ${SECRET}`,
      },
    ]);
  });

  it("sends PUT W for ensure", async () => {
    const { baseUrl, recorded } = await serve(json(200, WORKSPACE));
    const { client } = clientFor(baseUrl);

    const answer = await client.ensure(KEY);

    expect(answer.kind).toBe("workspace");
    expect(recorded.map((request) => request.method)).toEqual(["PUT"]);
  });

  it.each([
    { case: "a body that is not JSON", body: "not json" },
    { case: "a state outside the contract", body: { ...WORKSPACE, state: "paused" } },
    { case: "a missing limits object", body: { ...WORKSPACE, limits: undefined } },
    { case: "another user's workspace", body: { ...WORKSPACE, userId: "someone_else" } },
  ])("answers failed for $case on 200", async ({ body }) => {
    const { baseUrl } = await serve((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(typeof body === "string" ? body : JSON.stringify(body));
    });
    const { client, log } = clientFor(baseUrl);

    const answer = await client.get(KEY);

    expect(answer).toEqual({ kind: "failed" });
    expect(log.mock.calls).toEqual([["web: workspace service GET failed: invalid response (200)"]]);
  });

  it("answers failed for a refused connection", async () => {
    const { baseUrl } = await serve(json(200, WORKSPACE));
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
    const { client, log } = clientFor(baseUrl);

    const answer = await client.ensure(KEY);

    expect(answer).toEqual({ kind: "failed" });
    expect(log.mock.calls).toEqual([["web: workspace service PUT failed: TypeError ECONNREFUSED"]]);
  });

  it("answers failed when the host name does not resolve", async () => {
    const { client, log } = clientFor(new URL("http://workspace.invalid:4100"));

    const answer = await client.get(KEY);

    expect(answer).toEqual({ kind: "failed" });
    expect(log.mock.calls[0]?.[0]).toMatch(/^web: workspace service GET failed: TypeError/);
  });

  it("answers failed when the service does not answer within the timeout", async () => {
    // Never answers: the request stays open until the client gives up.
    const { baseUrl } = await serve(() => {});
    const { client, log } = clientFor(baseUrl, { ensureTimeoutMs: 100 });

    const answer = await client.ensure(KEY);

    expect(answer).toEqual({ kind: "failed" });
    expect(log.mock.calls).toEqual([["web: workspace service PUT failed: TimeoutError"]]);
  });

  it("answers failed without a request when the service is not configured", async () => {
    const log = vi.fn((_line: string) => {});
    const fetchSpy = vi.fn((input: URL | RequestInfo, init?: RequestInit) => fetch(input, init));
    const client = createWorkspaceClient({
      config: () => ({ kind: "unconfigured" }),
      fetch: fetchSpy,
      log,
    });

    const answer = await client.get(KEY);

    expect(answer).toEqual({ kind: "failed" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(log.mock.calls).toEqual([["web: workspace service GET failed: unconfigured"]]);
  });

  it("never logs the secret, the body's message or a code outside its charset", async () => {
    const { baseUrl } = await serve(
      json(502, { error: { code: "Canary Code\nline", message: `canary-message ${SECRET}` } }),
    );
    const { client, log } = clientFor(baseUrl);

    const answer = await client.get(KEY);

    expect(answer).toEqual({ kind: "failed" });
    expect(log.mock.calls).toEqual([["web: workspace service GET failed: 502 -"]]);
    expect(logged(log)).not.toContain("canary");
  });
});

describe("answerForError (U-state-map)", () => {
  const body = (code: string, extra: Record<string, string> = {}) => ({
    error: { code, message: "m", ...extra },
  });

  it.each([
    [404, body("workspace-not-found"), { kind: "not-found" }],
    [503, body("docker-unavailable"), { kind: "docker-down" }],
    [
      409,
      body("image-missing", { image: "academy-workspace:dev" }),
      { kind: "image-missing", image: "academy-workspace:dev" },
    ],
    [500, body("workspace-identity-mismatch"), { kind: "rejected" }],
    [400, body("invalid-workspace-key"), { kind: "failed" }],
    [400, body("bad-request"), { kind: "failed" }],
    [401, body("unauthorized"), { kind: "failed" }],
    [404, body("lesson-not-found"), { kind: "failed" }],
    [404, body("route-not-found"), { kind: "failed" }],
    [409, body("image-missing"), { kind: "failed" }],
    [409, body("workspace-not-running"), { kind: "failed" }],
    [409, body("workspace-busy"), { kind: "failed" }],
    [422, body("lesson-has-no-workspace"), { kind: "failed" }],
    [500, body("starter-invalid"), { kind: "failed" }],
    [500, body("course-unreadable"), { kind: "failed" }],
    [500, body("internal"), { kind: "failed" }],
    [502, body("docker-error"), { kind: "failed" }],
    [502, body("docker-response-invalid"), { kind: "failed" }],
    [502, undefined, { kind: "failed" }],
  ])("maps %i %j to %j", (status, errorBody, expected) => {
    expect(answerForError(status, errorBody)).toEqual(expected);
  });
});
