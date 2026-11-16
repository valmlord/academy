import type { Writable } from "node:stream";
import Fastify, { type FastifyInstance } from "fastify";
import type { WorkspaceLimits } from "../config.js";
import type { WorkspaceManager } from "../manager.js";
import type { TerminalRegistry } from "../terminal/registry.js";
import { declareTerminalRoute, websocketOptions, websocketPlugin } from "../terminal/route.js";
import { authorizationChecker } from "./auth.js";
import { frameworkErrors, installErrorHandling } from "./errors.js";
import { registerRoutes } from "./routes.js";

// The HTTP surface (design 7, ADR-0010). `buildApp` constructs Fastify exactly once and passes no
// `handlerTimeout`: GHSA-3qgw-9275-xf8w in fastify < 5.12.8 needs a nonzero one (design 9.2).

export interface ServiceSettings {
  idleStopMinutes: number;
  idleWarningMinutes: number;
  startSlowSeconds: number;
  /** Whether terminal shells get the agent key (ADR-0002 item 14); never the key or any part of it. */
  hasAgentApiKey: boolean;
}

export interface AppDeps {
  secret: string;
  manager: WorkspaceManager;
  settings: ServiceSettings;
  limits: WorkspaceLimits;
  /** The terminal sessions behind `GET W/terminal` (#32). */
  terminals: TerminalRegistry;
  /** Where pino writes; tests pass a stream they read, the service leaves it to stdout. */
  logStream?: Writable;
}

/** One registered route as the `onRoute` collector saw it; HEAD routes Fastify adds for GET included. */
export interface RouteEntry {
  method: string;
  url: string;
  /** Whether the route's own options carry a `handlerTimeout` key (design 9.2 (c)). */
  hasHandlerTimeout: boolean;
}

export interface BuiltApp {
  app: FastifyInstance;
  routes: RouteEntry[];
}

/** The only route that answers without the secret: compose's healthcheck has none. */
const PUBLIC_ROUTES: ReadonlySet<string> = new Set(["/healthz"]);
const UNAUTHORIZED = 401;

export function buildApp(deps: AppDeps): BuiltApp {
  // Pino's default request serializer logs method and URL, never headers, so the secret stays out of logs.
  const options = {
    logger: deps.logStream === undefined ? true : { stream: deps.logStream },
    frameworkErrors,
  };
  const app = Fastify(options);
  const routes: RouteEntry[] = [];
  // First, because Fastify calls it only for routes registered after it.
  app.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      routes.push({ method, url: route.url, hasHandlerTimeout: "handlerTimeout" in route });
    }
  });
  const isAuthorized = authorizationChecker(deps.secret);
  // A root hook also runs for the not-found handler, so an unknown route needs the secret too.
  app.addHook("onRequest", async (request, reply) => {
    const route = request.routeOptions.url;
    if (route !== undefined && PUBLIC_ROUTES.has(route)) return;
    if (isAuthorized(request.headers.authorization)) return;
    return reply.code(UNAUTHORIZED).send({
      error: { code: "unauthorized", message: "missing or invalid credentials" },
    });
  });
  // Compose's healthcheck calls it every 5 s: at info level its request lines would bury the real events.
  app.get("/healthz", { logLevel: "warn" }, async () => ({ ok: true }));
  registerRoutes(app, deps);
  // Plugins load at `ready()`, after this function returned: the root hooks and the error handling above
  // already apply to the child, and the websocket plugin's route hook exists before the terminal route.
  app.register(websocketPlugin, websocketOptions);
  app.register(async (child) => declareTerminalRoute(child, deps.terminals));
  installErrorHandling(app);
  return { app, routes };
}
