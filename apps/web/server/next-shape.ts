import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { NEXT_NOT_FUNCTION, type NextAppMember, nextAppMissingMessage } from "./strings.ts";

// The custom server loads `next` with createRequire and gets `unknown` (#32 design 3.1, "next import, the one
// form"): these narrow it by hand, without a type assertion, to the three members the server calls. A Next
// upgrade that changes the export fails here with F3 at startup instead of at the first request.

export interface NextOptions {
  dev: false;
  dir: string;
  hostname: string;
  port: number;
  /** Next attaches its own upgrade listener here, never to the listening server (ADR-0011 item 2). */
  httpServer: Server;
}

export type NextFactory = (options: NextOptions) => unknown;

export type RequestHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

export interface NextApp {
  prepare(): Promise<void>;
  getRequestHandler(): RequestHandler;
  close(): Promise<void>;
}

export class NextServerShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NextServerShapeError";
  }
}

/** `require("next")` is the factory function itself (CommonJS); refuses anything else with F3a. */
export function toNextFactory(loaded: unknown): NextFactory {
  if (typeof loaded !== "function") throw new NextServerShapeError(NEXT_NOT_FUNCTION);
  return (options) => Reflect.apply(loaded, undefined, [options]);
}

function memberOf(value: unknown, name: NextAppMember): (...args: unknown[]) => unknown {
  const member: unknown =
    typeof value === "object" && value !== null ? Reflect.get(value, name) : undefined;
  if (typeof member !== "function") throw new NextServerShapeError(nextAppMissingMessage(name));
  return (...args) => Reflect.apply(member, value, args);
}

/** The factory's result with `prepare`, `getRequestHandler` and `close`; refuses a missing one with F3b. */
export function toNextApp(value: unknown): NextApp {
  const prepare = memberOf(value, "prepare");
  const getRequestHandler = memberOf(value, "getRequestHandler");
  const close = memberOf(value, "close");
  return {
    async prepare() {
      await prepare();
    },
    getRequestHandler() {
      const handler = getRequestHandler();
      if (typeof handler !== "function") {
        throw new NextServerShapeError(nextAppMissingMessage("getRequestHandler"));
      }
      return async (request, response) => {
        await Reflect.apply(handler, undefined, [request, response]);
      };
    },
    async close() {
      await close();
    },
  };
}
