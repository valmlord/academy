import { afterEach, describe, expect, it } from "vitest";
import {
  ContainerNameUnresolvedError,
  CourseFileError,
  DockerApiError,
  DockerResponseShapeError,
  DockerUnavailableError,
  ImageMissingError,
  LessonHasNoWorkspaceError,
  LessonNotFoundError,
  StarterRefusedError,
  StarterTooLargeError,
  WorkspaceBusyError,
  WorkspaceIdentityMismatchError,
  WorkspaceNotFoundError,
  WorkspaceNotRunningError,
} from "../../../src/errors.js";
import { AUTHORIZED, type TestApp, testApp } from "../../support/http.js";

// U-http, error cases (design 12.1, S34): every failure answers the closed `{ error: { code, message } }` shape
// with ADR-0010's status and code, and nothing outside our own messages reaches a body or a log.

const W = "/v1/users/user-1/courses/course-a/lessons/with-workspace/workspace";
const opened: TestApp[] = [];

/** An app whose runtime fails every read with `error`, so `GET W` reaches the error handler with it. */
function failingApp(error: unknown): TestApp {
  const built = testApp();
  built.runtime.inspect = async () => {
    throw error;
  };
  opened.push(built);
  return built;
}

function openApp(): TestApp {
  const built = testApp();
  opened.push(built);
  return built;
}

afterEach(async () => {
  for (const built of opened.splice(0)) await built.app.close();
});

describe("error mapping", () => {
  it.each([
    { error: new LessonNotFoundError("course-a", "x"), status: 404, code: "lesson-not-found" },
    { error: new WorkspaceNotFoundError("id"), status: 404, code: "workspace-not-found" },
    { error: new WorkspaceNotRunningError("id"), status: 409, code: "workspace-not-running" },
    { error: new WorkspaceBusyError("id"), status: 409, code: "workspace-busy" },
    {
      error: new LessonHasNoWorkspaceError("course-a", "x"),
      status: 422,
      code: "lesson-has-no-workspace",
    },
    {
      error: new StarterRefusedError("a/starter", "symlink"),
      status: 500,
      code: "starter-invalid",
    },
    { error: new StarterTooLargeError("a/starter", "8 MiB"), status: 500, code: "starter-invalid" },
    {
      error: new CourseFileError("a/lesson.yaml", "missing"),
      status: 500,
      code: "course-unreadable",
    },
    {
      error: new WorkspaceIdentityMismatchError("wks-local-x"),
      status: 500,
      code: "workspace-identity-mismatch",
    },
    { error: new DockerApiError("start container", 500), status: 502, code: "docker-error" },
    {
      error: new DockerResponseShapeError("inspect container", "State"),
      status: 502,
      code: "docker-response-invalid",
    },
    {
      error: new DockerUnavailableError("inspect container", "ECONNREFUSED"),
      status: 503,
      code: "docker-unavailable",
    },
  ])("maps $error.name to $status $code", async ({ error, status, code }) => {
    const response = await failingApp(error).app.inject({
      method: "GET",
      url: W,
      headers: AUTHORIZED,
    });

    expect([response.statusCode, response.json()]).toEqual([
      status,
      { error: { code, message: error.message } },
    ]);
  });

  it("maps ContainerNameUnresolvedError to 502 docker-error, with no Docker text in the body", async () => {
    const error = new ContainerNameUnresolvedError("wks-local-0123456789abcdef0123", 375);

    const response = await failingApp(error).app.inject({
      method: "GET",
      url: W,
      headers: AUTHORIZED,
    });

    expect([response.statusCode, response.json()]).toEqual([
      502,
      { error: { code: "docker-error", message: error.message } },
    ]);
  });

  it("answers image-missing with the image", async () => {
    const error = new ImageMissingError("academy-workspace:dev");

    const response = await failingApp(error).app.inject({
      method: "GET",
      url: W,
      headers: AUTHORIZED,
    });

    expect([response.statusCode, response.json()]).toEqual([
      409,
      { error: { code: "image-missing", message: error.message, image: "academy-workspace:dev" } },
    ]);
  });

  it("answers 400 invalid-workspace-key naming the parameter", async () => {
    const response = await openApp().app.inject({
      method: "GET",
      url: "/v1/users/user.1/courses/course-a/lessons/with-workspace/workspace",
      headers: AUTHORIZED,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: "invalid-workspace-key", message: "invalid workspace key: userId" },
    });
  });

  it("answers an unlisted error with 500 internal, its text in neither the body nor the log", async () => {
    const canary = "canary-unlisted-5f1e";
    const built = failingApp(Object.assign(new TypeError(`boom ${canary}`), { code: "ECANARY" }));

    const response = await built.app.inject({ method: "GET", url: W, headers: AUTHORIZED });

    expect([response.statusCode, response.json()]).toEqual([
      500,
      { error: { code: "internal", message: "internal error" } },
    ]);
    expect(built.logs()).not.toContain(canary);
    expect(built.logs()).toContain("TypeError (code ECANARY)");
  });

  it("logs a hostile class name as Error and leaves out a code that is not a valid code", async () => {
    const HostileError = Object.defineProperty(class extends Error {}, "name", {
      value: "Evil\nINJECT",
    });
    const built = failingApp(Object.assign(new HostileError("x"), { code: "e-canary-code" }));

    const response = await built.app.inject({ method: "GET", url: W, headers: AUTHORIZED });

    expect([response.statusCode, response.json()]).toEqual([
      500,
      { error: { code: "internal", message: "internal error" } },
    ]);
    const logs = built.logs();
    expect(logs).toContain("request failed with 500: Error");
    expect(logs).not.toContain("INJECT");
    expect(logs).not.toContain("canary");
    expect(logs).not.toContain("(code");
  });
});

describe("framework responses in the error shape", () => {
  it("answers PUT with a JSON content type and no body with 400 bad-request", async () => {
    const response = await openApp().app.inject({
      method: "PUT",
      url: W,
      headers: { ...AUTHORIZED, "content-type": "application/json" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "bad-request",
        message: "the request could not be processed (FST_ERR_CTP_EMPTY_JSON_BODY)",
      },
    });
  });

  it("answers PUT with an unsupported media type with 415 bad-request", async () => {
    const response = await openApp().app.inject({
      method: "PUT",
      url: W,
      headers: { ...AUTHORIZED, "content-type": "text/xml" },
      payload: "<workspace/>",
    });

    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({ error: { code: "bad-request" } });
  });

  it("answers an authorized unknown route with 404 route-not-found", async () => {
    const response = await openApp().app.inject({
      method: "GET",
      url: "/v1/no-such-route",
      headers: AUTHORIZED,
    });

    expect([response.statusCode, response.json()]).toEqual([
      404,
      { error: { code: "route-not-found", message: "no such route" } },
    ]);
  });

  it("answers a bad escape in a parameter with 400 bad-request", async () => {
    const response = await openApp().app.inject({
      method: "GET",
      url: "/v1/users/%zz/courses/c/lessons/l/workspace",
      headers: AUTHORIZED,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "bad-request" } });
  });

  it("answers a bad escape outside any parameter (/v1/%zz) with 400 bad-request, the status observed first", async () => {
    const response = await openApp().app.inject({
      method: "GET",
      url: "/v1/%zz",
      headers: AUTHORIZED,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "bad-request" } });
  });
});
