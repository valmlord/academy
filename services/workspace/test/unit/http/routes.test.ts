import { afterEach, describe, expect, it } from "vitest";
import { workspaceId } from "../../../src/identity.js";
import {
  AUTHORIZED,
  INSTANCE,
  LESSON_IMAGE,
  T0,
  type TestApp,
  testApp,
} from "../../support/http.js";

// U-http, success cases (design 12.1, S33): each route over a manager on the in-memory runtime.

const KEY = { userId: "user-1", courseId: "course-a", lessonId: "with-workspace" };
const W = `/v1/users/${KEY.userId}/courses/${KEY.courseId}/lessons/${KEY.lessonId}/workspace`;
const MINUTE = 60_000;
const opened: TestApp[] = [];

function openApp(): TestApp {
  const built = testApp();
  opened.push(built);
  return built;
}

afterEach(async () => {
  for (const built of opened.splice(0)) await built.app.close();
});

const LIMITS = { nanoCpus: 2_000_000_000, memoryBytes: 2 * 1024 ** 3, pidsLimit: 512 };

describe("lesson routes", () => {
  it("PUT ensures the workspace and answers 200 with the outcome and the idle window", async () => {
    const { app } = openApp();

    const response = await app.inject({ method: "PUT", url: W, headers: AUTHORIZED });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: workspaceId(INSTANCE, KEY),
      ...KEY,
      state: "running",
      image: LESSON_IMAGE,
      outcome: "created",
      idle: {
        stopAt: new Date(T0 + 30 * MINUTE).toISOString(),
        warningAt: new Date(T0 + 25 * MINUTE).toISOString(),
      },
      exit: null,
      limits: LIMITS,
    });
  });

  it("GET answers 200 with the view and no outcome", async () => {
    const { app } = openApp();
    await app.inject({ method: "PUT", url: W, headers: AUTHORIZED });

    const response = await app.inject({ method: "GET", url: W, headers: AUTHORIZED });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ state: "running", image: LESSON_IMAGE });
    expect(response.json()).not.toHaveProperty("outcome");
  });

  it("POST stop answers 200 with a stopped view and its exit", async () => {
    const { app } = openApp();
    await app.inject({ method: "PUT", url: W, headers: AUTHORIZED });

    const response = await app.inject({ method: "POST", url: `${W}/stop`, headers: AUTHORIZED });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      state: "stopped",
      idle: null,
      exit: { code: 143, reason: "exited" },
    });
  });

  it("POST activity answers 204 for a running workspace", async () => {
    const { app } = openApp();
    await app.inject({ method: "PUT", url: W, headers: AUTHORIZED });

    const response = await app.inject({
      method: "POST",
      url: `${W}/activity`,
      headers: AUTHORIZED,
    });

    expect([response.statusCode, response.body]).toEqual([204, ""]);
  });

  it("DELETE answers 204 and removes the workspace", async () => {
    const { app, runtime } = openApp();
    await app.inject({ method: "PUT", url: W, headers: AUTHORIZED });

    const response = await app.inject({ method: "DELETE", url: W, headers: AUTHORIZED });

    expect([response.statusCode, response.body]).toEqual([204, ""]);
    expect(runtime.calls).toContain(`remove ${workspaceId(INSTANCE, KEY)}`);
  });

  it("GET /v1/settings answers the idle and slow-start settings and whether a key is set", async () => {
    const { app } = openApp();

    const response = await app.inject({ method: "GET", url: "/v1/settings", headers: AUTHORIZED });

    expect([response.statusCode, response.json()]).toEqual([
      200,
      { idleStopMinutes: 30, idleWarningMinutes: 5, startSlowSeconds: 10, hasAgentApiKey: false },
    ]);
  });
});
