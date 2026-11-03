import { describe, expect, it } from "vitest";
import { DockerEngine } from "../../src/docker/engine.js";
import { DockerUnavailableError } from "../../src/errors.js";
import { useTestInstance } from "./harness.js";

useTestInstance("engine-read.int.test.ts");

/** The version every request is pinned to (design 1); the daemon must serve at least this one. */
const MIN_API = [1, 44];

function apiAtLeast(version: string, min: readonly number[]): boolean {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  return major > (min[0] ?? 0) || (major === min[0] && minor >= (min[1] ?? 0));
}

describe("engine connection", () => {
  it("pings the daemon and reads an API version of at least 1.44", async () => {
    const engine = new DockerEngine();

    await engine.ping();
    const version = await engine.version();

    expect(apiAtLeast(version.ApiVersion, MIN_API)).toBe(true);
  });
});

describe("engine without a daemon", () => {
  it("reports a missing socket as Docker unavailable (ENOENT)", async () => {
    const engine = new DockerEngine({ socketPath: "/nonexistent/docker.sock" });

    const failure = await engine.ping().then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(DockerUnavailableError);
    expect(failure).toMatchObject({ operation: "ping", errnoCode: "ENOENT" });
  });
});
