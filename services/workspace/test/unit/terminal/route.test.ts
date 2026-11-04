import type { WebSocket } from "@fastify/websocket";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type WorkspaceKey, workspaceId } from "../../../src/identity.js";
import { AUTHORIZED, INSTANCE, type TestApp, testApp } from "../../support/http.js";

// U-route and the connection-id part of U-term-log (design 10.1): `GET W/terminal` through `buildApp`, in the
// child-plugin form, over the in-memory runtime.

const KEY: WorkspaceKey = { userId: "user-1", courseId: "course-a", lessonId: "with-workspace" };
const PATH = "/v1/users/user-1/courses/course-a/lessons/with-workspace/workspace/terminal";
const BAD_KEY_PATH = "/v1/users/user.1/courses/course-a/lessons/with-workspace/workspace/terminal";
const ROUTE = "/v1/users/:userId/courses/:courseId/lessons/:lessonId/workspace/terminal";
const ID = workspaceId(INSTANCE, KEY);
const OVERSIZED_BYTES = 70 * 1024;

const opened: TestApp[] = [];

async function openApp(): Promise<TestApp> {
  const built = testApp();
  opened.push(built);
  // The websocket plugin (and its `injectWS`) and the terminal route load at `ready()`.
  await built.app.ready();
  await built.manager.ensure(KEY);
  return built;
}

afterEach(async () => {
  for (const built of opened.splice(0)) {
    built.terminals.closeAll();
    await built.app.close();
  }
});

interface Client {
  ws: WebSocket;
  isAttached: () => boolean;
  closed: Promise<{ code: number; reason: string }>;
}

async function connect(app: TestApp, headers: Record<string, string>): Promise<Client> {
  let isAttached = false;
  let resolveClosed: (event: { code: number; reason: string }) => void = () => undefined;
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    resolveClosed = resolve;
  });
  const ws = await app.app.injectWS(
    PATH,
    { headers },
    {
      onInit: (socket) => {
        socket.on("message", (_data, isBinary) => {
          if (!isBinary) isAttached = true;
        });
        socket.on("close", (code, reason) => resolveClosed({ code, reason: reason.toString() }));
      },
    },
  );
  return { ws, isAttached: () => isAttached, closed };
}

function openShellCalls(app: TestApp): string[] {
  return app.runtime.calls.filter((call) => call.startsWith("openShell"));
}

describe("GET W/terminal (U-route)", () => {
  it("answers 401 before the upgrade without the Bearer secret", async () => {
    const app = await openApp();

    await expect(app.app.injectWS(PATH, { headers: {} })).rejects.toThrow(
      "Unexpected server response: 401",
    );
    expect(openShellCalls(app)).toEqual([]);
  });

  it("answers 400 before the upgrade for a bad key", async () => {
    const app = await openApp();

    await expect(app.app.injectWS(BAD_KEY_PATH, { headers: AUTHORIZED })).rejects.toThrow(
      "Unexpected server response: 400",
    );
    const plain = await app.app.inject({ method: "GET", url: BAD_KEY_PATH, headers: AUTHORIZED });
    expect(plain.statusCode).toBe(400);
    expect(plain.json()).toMatchObject({ error: { code: "invalid-workspace-key" } });
  });

  it("answers a plain authorized GET with 404 route-not-found and opens no shell", async () => {
    const app = await openApp();

    const response = await app.app.inject({ method: "GET", url: PATH, headers: AUTHORIZED });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: "route-not-found", message: "no such route" },
    });
    expect(openShellCalls(app)).toEqual([]);
  });

  it("answers HEAD with 404 route-not-found", async () => {
    const app = await openApp();

    const response = await app.app.inject({ method: "HEAD", url: PATH, headers: AUTHORIZED });

    expect(response.statusCode).toBe(404);
    const plain = await app.app.inject({
      method: "GET",
      url: "/v1/no-such-route",
      headers: AUTHORIZED,
    });
    expect(response.headers["content-length"]).toBe(plain.headers["content-length"]);
    expect(openShellCalls(app)).toEqual([]);
  });

  it("declares exactly one GET entry for the terminal URL and no handlerTimeout anywhere", async () => {
    const app = await openApp();

    const entries = app.routes.filter((route) => route.url === ROUTE);

    expect(entries.map((route) => route.method)).toEqual(["GET"]);
    expect(app.routes.filter((route) => route.hasHandlerTimeout)).toEqual([]);
  });

  it("closes the client with 1003 on a binary frame", async () => {
    const app = await openApp();
    const client = await connect(app, AUTHORIZED);
    await vi.waitFor(() => expect(client.isAttached()).toBe(true));

    client.ws.send(Buffer.from([1, 2, 3]));

    expect((await client.closed).code).toBe(1003);
  });

  it("closes the client with 1009 on a 70 KiB message", async () => {
    const app = await openApp();
    const client = await connect(app, AUTHORIZED);
    await vi.waitFor(() => expect(client.isAttached()).toBe(true));

    client.ws.send(JSON.stringify({ t: "input", d: "x".repeat(OVERSIZED_BYTES) }));

    expect((await client.closed).code).toBe(1009);
  });
});

describe("connection ids (U-term-log, route part)", () => {
  it("names the X-Academy-Conn id in F5a", async () => {
    const app = await openApp();
    const client = await connect(app, { ...AUTHORIZED, "x-academy-conn": "0123456789abcdef" });
    await vi.waitFor(() => expect(client.isAttached()).toBe(true));

    app.terminals.closeAll();
    await client.closed;

    expect(app.terminalLogs).toContain(`terminal ${ID} 0123456789abcdef: ended 1001`);
  });

  it("logs an X-Academy-Conn with a newline as -", async () => {
    const app = await openApp();
    const forged = "0123456789abcdef\nterminal forged line";
    const client = await connect(app, { ...AUTHORIZED, "x-academy-conn": forged });
    await vi.waitFor(() => expect(client.isAttached()).toBe(true));

    app.terminals.closeAll();
    await client.closed;

    expect(app.terminalLogs).toContain(`terminal ${ID} -: ended 1001`);
    expect(app.terminalLogs.join("\n")).not.toContain("forged");
  });
});
