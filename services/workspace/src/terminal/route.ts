import fastifyWebsocket, { type WebsocketPluginOptions } from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import { keyOf, WORKSPACE_ROUTE } from "../http/routes.js";
import { CLOSE, CLOSE_REASON } from "./protocol.js";
import type { TerminalRegistry } from "./registry.js";

// `GET W/terminal` (ADR-0010 item 13, design 3.5): a WebSocket upgrade behind the root Bearer hook and the key
// rule, both answered before the upgrade. Declared in a child plugin so `buildApp` stays synchronous.

/** Largest client message (ADR-0011 item 6); `ws` closes a larger one with 1009. */
const MAX_MESSAGE_BYTES = 64 * 1024;
/** `X-Academy-Conn` as the relay sends it; anything else, a newline included, is logged as `-`. */
const CONNECTION_ID_PATTERN = /^[0-9a-f]{16}$/;

export const TERMINAL_ROUTE = `${WORKSPACE_ROUTE}/terminal`;
export const websocketPlugin = fastifyWebsocket;
export const websocketOptions: WebsocketPluginOptions = {
  options: { maxPayload: MAX_MESSAGE_BYTES },
  // The plugin's default handler logs the `ws` error object, stack included, which ADR-0011 item 11 forbids
  // ("never ... error objects"). F5c is already logged, with the code only, by the session's own `error` listener,
  // attached in `connect` before its first await. The `wsHandler` never throws or rejects (3.2.2 C4), so this
  // handler only sees errors of an established socket.
  errorHandler: (_error, socket) => {
    socket.terminate();
  },
};

/** The relay's correlation id when it has the expected form, else `-`; it only ever reaches a log line. */
export function connectionId(header: unknown): string {
  return typeof header === "string" && CONNECTION_ID_PATTERN.test(header) ? header : "-";
}

export function declareTerminalRoute(child: FastifyInstance, registry: TerminalRegistry): void {
  child.route({
    method: "GET",
    url: TERMINAL_ROUTE,
    // A HEAD would otherwise be answered by Fastify's generated route; now it is an unknown route (404).
    exposeHeadRoute: false,
    // Runs before the upgrade, so a bad key is a 400 body like on every other lesson route.
    preHandler: async (request) => {
      keyOf(request.params);
    },
    // A plain GET opens no shell: the route exists only as an upgrade.
    handler: async (_request, reply) =>
      reply.code(404).send({ error: { code: "route-not-found", message: "no such route" } }),
    wsHandler: (socket, request) => {
      // `connect` attaches the socket's listeners before its first await, so no frame is lost.
      registry
        .connect(keyOf(request.params), socket, connectionId(request.headers["x-academy-conn"]))
        // 3.2.2 C4, a backstop: `connect` handles its own failures and does not reject.
        .catch(() => {
          if (socket.readyState === socket.OPEN)
            socket.close(CLOSE.internal, CLOSE_REASON.internal);
        });
    },
  });
}
