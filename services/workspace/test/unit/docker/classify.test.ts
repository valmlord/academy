import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { classifyDockerError } from "../../../src/docker/classify.js";
import { DockerApiError, DockerUnavailableError } from "../../../src/errors.js";

const DOCKER_MESSAGE_CANARY = "canary-docker-echo-7f3a";

function errnoError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

describe("classifyDockerError", () => {
  it.each([
    ["ENOENT", "connect ENOENT /var/run/docker.sock"],
    ["ECONNREFUSED", "connect ECONNREFUSED /var/run/docker.sock"],
    ["EACCES", "connect EACCES /var/run/docker.sock"],
    ["ECONNRESET", "socket hang up"],
  ])("classifies %s as Docker unavailable", (code, message) => {
    const result = classifyDockerError("ping", errnoError(code, message));

    expect(result).toBeInstanceOf(DockerUnavailableError);
    expect(result).toMatchObject({ operation: "ping", errnoCode: code });
  });

  it("classifies a plain ECONNRESET object, as docker-modem's timeout produces it, as unavailable", () => {
    const result = classifyDockerError("ping", { code: "ECONNRESET", message: "socket hang up" });

    expect(result).toBeInstanceOf(DockerUnavailableError);
  });

  it("keeps the status of an HTTP error", () => {
    const result = classifyDockerError("create container", { statusCode: 409, reason: "conflict" });

    expect(result).toBeInstanceOf(DockerApiError);
    expect(result).toMatchObject({ operation: "create container", statusCode: 409 });
  });

  it("never carries Docker's own message, in the message or anywhere a logger would print", () => {
    const dockerError = Object.assign(
      new Error(`(HTTP code 500) server error - ${DOCKER_MESSAGE_CANARY}`),
      { statusCode: 500, json: { message: DOCKER_MESSAGE_CANARY } },
    );

    const result = classifyDockerError("start container", dockerError);

    expect(result).toBeInstanceOf(DockerApiError);
    expect(inspect(result, { depth: Number.POSITIVE_INFINITY })).not.toContain(
      DOCKER_MESSAGE_CANARY,
    );
  });

  it.each([
    ["a string", "boom"],
    ["undefined", undefined],
    ["an error with an unknown code", errnoError("EPIPE", "broken pipe")],
  ])("classifies %s as a Docker API error with status 0", (_name, error) => {
    const result = classifyDockerError("ping", error);

    expect(result).toBeInstanceOf(DockerApiError);
    expect(result).toMatchObject({ statusCode: 0 });
  });
});
