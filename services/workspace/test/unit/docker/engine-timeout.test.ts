import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DockerEngine } from "../../../src/docker/engine.js";
import { DockerUnavailableError } from "../../../src/errors.js";

// A daemon that accepts the connection and never answers: the case docker-modem's inactivity timeout exists for.
// A temp unix socket, not Docker, so `pnpm test` stays Docker-free.
const TIMEOUT_MS = 200;
const DEADLINE_MS = 2_000;

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

async function silentDaemon(): Promise<string> {
  directory = await mkdtemp(join(tmpdir(), "wks-engine-"));
  const socketPath = join(directory, "docker.sock");
  const silent = createServer((socket) => {
    sockets.add(socket);
  });
  server = silent;
  await new Promise<void>((resolve) => silent.listen(socketPath, resolve));
  return socketPath;
}

describe("engine timeout", () => {
  it("rejects a call to a silent daemon as unavailable (ECONNRESET) within 2 s", async () => {
    const engine = new DockerEngine({ socketPath: await silentDaemon(), timeoutMs: TIMEOUT_MS });
    const started = Date.now();

    const failure = await engine.ping().then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(DockerUnavailableError);
    expect(failure).toMatchObject({ operation: "ping", errnoCode: "ECONNRESET" });
    expect(Date.now() - started).toBeLessThan(DEADLINE_MS);
  });
});
