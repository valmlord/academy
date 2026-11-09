// @vitest-environment node
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { NextServerShapeError, toNextApp, toNextFactory } from "./next-shape.ts";

// U-next-shape (#32 design 3.1, 3.8 F3).

function shapeError(run: () => unknown): unknown {
  try {
    run();
  } catch (error: unknown) {
    return error;
  }
  throw new Error("expected a NextServerShapeError");
}

describe("toNextFactory and toNextApp (U-next-shape)", () => {
  it("refuses an export that is not a function with F3a", () => {
    const error = shapeError(() => toNextFactory({ default: () => {} }));

    expect(error).toBeInstanceOf(NextServerShapeError);
    expect(error instanceof Error ? error.message : "").toBe("next export is not a function");
  });

  it.each([
    [{}, "prepare"],
    [{ prepare: () => {} }, "getRequestHandler"],
    [{ prepare: () => {}, getRequestHandler: () => {} }, "close"],
    [null, "prepare"],
  ])("refuses %j with F3b naming %s", (value, member) => {
    const error = shapeError(() => toNextApp(value));

    expect(error).toBeInstanceOf(NextServerShapeError);
    expect(error instanceof Error ? error.message : "").toBe(`next app has no ${member}`);
  });

  it("passes a full fake through, calling each member on the app itself", async () => {
    const calls: string[] = [];
    const fake = {
      name: "fake-app",
      async prepare() {
        calls.push(`prepare ${this.name}`);
      },
      getRequestHandler() {
        calls.push(`getRequestHandler ${this.name}`);
        return async () => {
          calls.push("handle");
        };
      },
      async close() {
        calls.push(`close ${this.name}`);
      },
    };
    const factory = vi.fn((_options: unknown) => fake);
    const options = {
      dev: false as const,
      dir: "/app/apps/web",
      hostname: "0.0.0.0",
      port: 3000,
      httpServer: createServer(),
    };

    const app = toNextApp(toNextFactory(factory)(options));
    await app.prepare();
    const handler = app.getRequestHandler();
    const request = new IncomingMessage(new Socket());
    await handler(request, new ServerResponse(request));
    await app.close();

    expect(factory.mock.calls).toEqual([[options]]);
    expect(calls).toEqual([
      "prepare fake-app",
      "getRequestHandler fake-app",
      "handle",
      "close fake-app",
    ]);
  });
});
