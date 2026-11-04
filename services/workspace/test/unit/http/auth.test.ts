import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTHORIZED, TEST_SECRET, type TestApp, testApp } from "../../support/http.js";

// U-auth (design 12.1, Q4): the root hook guards every route but /healthz, and the secret never reaches a log.
// The fastify module is the real one behind a constructor spy, so the test sees the options `buildApp` really
// passes (design 9.2 (a)); fastify is the dependency here, `buildApp`'s choice of options the unit under test.

vi.mock("fastify", async (importOriginal) => {
  const real = await importOriginal<typeof import("fastify")>();
  const spy = vi.fn(real.default);
  return { ...real, default: spy, fastify: spy };
});

const fastifyConstructor = vi.mocked(Fastify);
const UNKNOWN_ROUTE = "/v1/no-such-route";
const opened: TestApp[] = [];

function openApp(): TestApp {
  const built = testApp();
  opened.push(built);
  return built;
}

afterEach(async () => {
  for (const built of opened.splice(0)) await built.app.close();
});

async function statusFor(headers: Record<string, string>): Promise<number> {
  const response = await openApp().app.inject({ method: "GET", url: UNKNOWN_ROUTE, headers });
  return response.statusCode;
}

describe("the root auth hook", () => {
  it("answers 401 without an Authorization header", async () => {
    expect(await statusFor({})).toBe(401);
  });

  it("answers 401 for a wrong secret of the same length", async () => {
    const wrong = `${TEST_SECRET.slice(0, -1)}${TEST_SECRET.endsWith("Z") ? "Y" : "Z"}`;

    expect(await statusFor({ authorization: `Bearer ${wrong}` })).toBe(401);
  });

  it("answers 401 for a secret of another length, shorter or longer", async () => {
    expect(await statusFor({ authorization: `Bearer ${TEST_SECRET.slice(0, 8)}` })).toBe(401);
    expect(await statusFor({ authorization: `Bearer ${TEST_SECRET}extra` })).toBe(401);
  });

  it("answers 401 for the Basic scheme with the secret", async () => {
    expect(await statusFor({ authorization: `Basic ${TEST_SECRET}` })).toBe(401);
  });

  it("lets the correct secret through to routing", async () => {
    expect(await statusFor(AUTHORIZED)).not.toBe(401);
  });

  it("answers /healthz without a header", async () => {
    const response = await openApp().app.inject({ method: "GET", url: "/healthz" });

    expect([response.statusCode, response.json()]).toEqual([200, { ok: true }]);
  });

  it("writes no request line for /healthz, which compose's healthcheck calls every few seconds", async () => {
    const built = openApp();

    await built.app.inject({ method: "GET", url: "/healthz" });
    await built.app.inject({ method: "GET", url: UNKNOWN_ROUTE, headers: AUTHORIZED });

    // The second request is the control: request lines do reach the captured log.
    expect(built.logs()).toContain(UNKNOWN_ROUTE);
    expect(built.logs()).not.toContain("/healthz");
  });

  it("never writes the secret to the log, whether it is right or wrong", async () => {
    const built = openApp();

    await built.app.inject({ method: "GET", url: UNKNOWN_ROUTE, headers: AUTHORIZED });
    await built.app.inject({
      method: "GET",
      url: UNKNOWN_ROUTE,
      headers: { authorization: `Bearer ${TEST_SECRET}x` },
    });

    expect(built.logs()).toContain(UNKNOWN_ROUTE);
    expect(built.logs()).not.toContain(TEST_SECRET);
  });
});

describe("Fastify options (GHSA-3qgw-9275-xf8w guard, design 9.2)", () => {
  it("constructs Fastify once, with no handlerTimeout of its own and exactly the expected options", () => {
    fastifyConstructor.mockClear();

    const { app } = openApp();

    expect(fastifyConstructor).toHaveBeenCalledTimes(1);
    const options: unknown = fastifyConstructor.mock.calls[0]?.[0];
    expect(typeof options === "object" && options !== null).toBe(true);
    expect(Object.hasOwn(options ?? {}, "handlerTimeout")).toBe(false);
    expect(Object.keys(options ?? {}).sort()).toEqual(["frameworkErrors", "logger"]);
    expect(Reflect.get(app.initialConfig, "handlerTimeout")).toBe(0);
  });
});

/** A concrete URL for a route pattern, with valid values for its parameters. */
function concreteUrl(pattern: string): string {
  return pattern
    .replace(":userId", "user-1")
    .replace(":courseId", "course-a")
    .replace(":lessonId", "with-workspace");
}

describe("the route table", () => {
  it("answers 401 without the header on every route except GET and HEAD /healthz", async () => {
    const { app, routes } = openApp();
    const guarded = routes.filter((route) => route.url !== "/healthz");

    const statuses: Record<string, number> = {};
    for (const route of guarded) {
      const response = await app.inject({ method: route.method, url: concreteUrl(route.url) });
      statuses[`${route.method} ${route.url}`] = response.statusCode;
    }

    expect(guarded.length).toBeGreaterThan(0);
    expect(statuses).toEqual(Object.fromEntries(Object.keys(statuses).map((name) => [name, 401])));
  });

  it("contains the six routes of the API besides /healthz", () => {
    const { routes } = openApp();
    const workspace = "/v1/users/:userId/courses/:courseId/lessons/:lessonId/workspace";

    const names = new Set(routes.map((route) => `${route.method} ${route.url}`));

    for (const name of [
      "GET /v1/settings",
      `PUT ${workspace}`,
      `GET ${workspace}`,
      `POST ${workspace}/stop`,
      `POST ${workspace}/activity`,
      `DELETE ${workspace}`,
    ]) {
      expect(names).toContain(name);
    }
  });

  it("has no route that declares a handlerTimeout of its own", () => {
    const { routes } = openApp();

    expect(routes.filter((route) => route.hasHandlerTimeout)).toEqual([]);
  });
});
