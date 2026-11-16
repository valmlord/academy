import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FIXTURE_COURSE_ROOT } from "./fixtures.js";
import { onCleanup, useTestInstance } from "./harness.js";

// I-main (design 12.2): the built entry point as compose runs it, with an explicit environment, so nothing of
// the test runner's own environment (or the root .env) reaches it.

const { instance } = useTestInstance("main.int.test.ts");

const MAIN = fileURLToPath(new URL("../../dist/main.js", import.meta.url));
const SECRET = "i-main-secret-0123456789abcdef-0123";
const STARTUP_TIMEOUT_MS = 15_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const POLL_MS = 100;
/** A fake value with no real key's prefix. */
const AGENT_KEY = "t115-fake-agent-key-not-real";

const settingsSchema = z.object({
  idleStopMinutes: z.number(),
  idleWarningMinutes: z.number(),
  startSlowSeconds: z.number(),
  hasAgentApiKey: z.boolean(),
});

/** A port nothing listens on at this moment, picked by the OS. */
async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.close();
  if (address === null || typeof address === "string") throw new Error("no port assigned");
  return address.port;
}

interface Started {
  child: ChildProcess;
  /** Pino's request log goes to stdout, so a leak check must read it too. */
  stdout: () => string;
  stderr: () => string;
  exit: Promise<number | null>;
}

function startMain(env: Readonly<Record<string, string>>): Started {
  // The Docker endpoint is the one thing taken from the runner, as turbo passes DOCKER_* through.
  const docker = process.env.DOCKER_HOST;
  const child = spawn(process.execPath, [MAIN], {
    env: { ...env, ...(docker === undefined ? {} : { DOCKER_HOST: docker }) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
  });
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });
  const exit = once(child, "exit").then(([code]: unknown[]) =>
    typeof code === "number" ? code : null,
  );
  onCleanup(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  });
  return { child, stdout: () => stdout, stderr: () => stderr, exit };
}

async function healthzOnceUp(base: string): Promise<number> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  for (;;) {
    try {
      return (await fetch(`${base}/healthz`)).status;
    } catch (error: unknown) {
      if (Date.now() > deadline) throw error;
      await sleep(POLL_MS);
    }
  }
}

function serviceEnv(port: number): Record<string, string> {
  return {
    WORKSPACE_SERVICE_SECRET: SECRET,
    WORKSPACE_INSTANCE: instance,
    WORKSPACE_HOST: "127.0.0.1",
    WORKSPACE_PORT: String(port),
    COURSE_ROOT: FIXTURE_COURSE_ROOT,
  };
}

describe("main", () => {
  it("I-main: serves /healthz and the authorized settings, and exits 0 within 5 s of SIGTERM", async () => {
    const port = await freePort();
    const base = `http://127.0.0.1:${String(port)}`;
    const started = startMain(serviceEnv(port));

    const health = await healthzOnceUp(base);
    const settings = await fetch(`${base}/v1/settings`, {
      headers: { authorization: `Bearer ${SECRET}` },
    });
    const settingsBody = settingsSchema.parse(await settings.json());
    const stoppingAt = Date.now();
    started.child.kill("SIGTERM");
    const code = await Promise.race([started.exit, sleep(SHUTDOWN_TIMEOUT_MS, "timeout")]);

    expect(health).toBe(200);
    expect(settings.status).toBe(200);
    expect(settingsBody).toEqual({
      idleStopMinutes: 30,
      idleWarningMinutes: 5,
      startSlowSeconds: 10,
      hasAgentApiKey: false,
    });
    expect(code).toBe(0);
    expect(Date.now() - stoppingAt).toBeLessThan(SHUTDOWN_TIMEOUT_MS);
  });

  it("I-main-key: reports that a key is set and prints it nowhere", async () => {
    const port = await freePort();
    const base = `http://127.0.0.1:${String(port)}`;
    const started = startMain({ ...serviceEnv(port), WORKSPACE_AGENT_API_KEY: AGENT_KEY });

    await healthzOnceUp(base);
    const settings = await fetch(`${base}/v1/settings`, {
      headers: { authorization: `Bearer ${SECRET}` },
    });
    const settingsText = await settings.text();
    started.child.kill("SIGTERM");
    // After the exit, so everything the process wrote has been collected.
    await Promise.race([started.exit, sleep(SHUTDOWN_TIMEOUT_MS, "timeout")]);

    expect(settingsSchema.parse(JSON.parse(settingsText)).hasAgentApiKey).toBe(true);
    expect(settingsText).not.toContain(AGENT_KEY);
    expect(started.stdout()).not.toContain(AGENT_KEY);
    expect(started.stderr()).not.toContain(AGENT_KEY);
  });

  it("I-main: exits 1 without the secret, naming the variable", async () => {
    const { WORKSPACE_SERVICE_SECRET: _omitted, ...env } = serviceEnv(await freePort());
    const started = startMain(env);

    const code = await started.exit;

    expect(code).toBe(1);
    expect(started.stderr()).toContain("WORKSPACE_SERVICE_SECRET");
  });
});
