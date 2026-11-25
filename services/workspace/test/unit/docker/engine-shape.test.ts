import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DockerEngine, ENGINE_API_VERSION } from "../../../src/docker/engine.js";
import { DockerResponseShapeError } from "../../../src/errors.js";
import { mapError } from "../../../src/http/errors.js";

// A daemon on a temp unix socket that answers with a label value of the wrong type, which a real daemon never
// sends (label values are always strings), so `pnpm test` stays Docker-free.
const CONTAINER_REF = "wks-shape-fixture";
const HOSTILE_KEY = `evil key\nINJECT${"x".repeat(1000)}`;
const BAD_GATEWAY = 502;

let server: Server | undefined;
let directory: string | undefined;
const sockets = new Set<Socket>();

afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  const open = server;
  server = undefined;
  if (open !== undefined) await new Promise<void>((resolve) => open.close(() => resolve()));
  if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

function json(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

/** Answers a GET on one pathname (the query is ignored) with `body`; anything else gets a 404. */
async function daemonAnswering(pathname: string, body: unknown): Promise<string> {
  directory = await mkdtemp(join(tmpdir(), "wks-shape-"));
  const socketPath = join(directory, "docker.sock");
  const http = createServer((request, response) => {
    const requested = new URL(request.url ?? "/", "http://daemon").pathname;
    if (request.method === "GET" && requested === pathname) json(response, 200, body);
    else json(response, 404, { message: "not found" });
  });
  http.on("connection", (socket: Socket) => sockets.add(socket));
  server = http;
  await new Promise<void>((resolve) => http.listen(socketPath, resolve));
  return socketPath;
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe("engine response shape", () => {
  it("a label value of the wrong type rejects inspect container with a path that holds no part of the key", async () => {
    const socketPath = await daemonAnswering(
      `/${ENGINE_API_VERSION}/containers/${CONTAINER_REF}/json`,
      {
        Id: "c0ffee",
        Name: `/${CONTAINER_REF}`,
        State: {
          Status: "running",
          Running: true,
          StartedAt: "2026-01-01T00:00:00Z",
          ExitCode: 0,
          OOMKilled: false,
        },
        Config: { Image: "academy-workspace:fixture", Labels: { [HOSTILE_KEY]: 5 } },
        HostConfig: { Memory: 0, MemorySwap: 0 },
      },
    );
    const engine = new DockerEngine({ socketPath });

    const failure = await rejectionOf(engine.inspectContainer(CONTAINER_REF));

    const expectedMessage =
      "unexpected Docker response to inspect container at Config.Labels.<key>";
    expect(failure).toBeInstanceOf(DockerResponseShapeError);
    expect(failure).toMatchObject({
      operation: "inspect container",
      issuePath: "Config.Labels.<key>",
      message: expectedMessage,
    });
    const mapped = mapError(failure);
    expect(mapped.status).toBe(BAD_GATEWAY);
    expect(mapped.body.error.message).toBe(expectedMessage);
    for (const fragment of ["evil", "INJECT", "\n"]) {
      expect(mapped.body.error.message).not.toContain(fragment);
    }
  });

  it("a bad label inside a network list rejects with the item index and <key>", async () => {
    const socketPath = await daemonAnswering(`/${ENGINE_API_VERSION}/networks`, [
      { Id: "n1", Name: "wks-net-ok", Labels: { managed: "true" } },
      { Id: "n2", Name: "wks-net-bad", Labels: { "evil\nkey": 5 } },
    ]);
    const engine = new DockerEngine({ socketPath });

    const failure = await rejectionOf(engine.listNetworks({ label: ["managed=true"] }));

    expect(failure).toBeInstanceOf(DockerResponseShapeError);
    expect(failure).toMatchObject({ operation: "list networks", issuePath: "1.Labels.<key>" });
  });
});
