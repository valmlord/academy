// The browser's side of the terminal protocol (ADR-0011 item 6): the frames it sends, the text frames it reads,
// the close codes it acts on, and the adapter from a browser WebSocket to the state machine's socket port.
// Imports nothing, so the client bundle carries no server code (design 3.7).

/** Close codes the service sends with a meaning for the browser (ADR-0011 item 6, design 3.8 F6). */
export const CLOSE_CODE = {
  shellExited: 4000,
  takenOver: 4001,
  environmentStopped: 4002,
} as const;

// The service's message limits (services/workspace/src/terminal/protocol.ts). A frame outside them is closed
// 1008 `invalid message`, which would end the connection, so the browser keeps inside them.
export const INPUT_MAX_UNITS = 8192;
const COLS_MIN = 2;
const COLS_MAX = 500;
const ROWS_MIN = 1;
const ROWS_MAX = 200;
export const ACK_MAX = 16_777_216;

export const TERMINAL_SOCKET_PATH = "/api/terminal/socket";

export interface TerminalSize {
  cols: number;
  rows: number;
}

export type ServerFrame = { t: "attached"; resumed: boolean } | { t: "snapshot"; d: string };

export function inputFrame(data: string): string {
  return JSON.stringify({ t: "input", d: data });
}

/** Clamped to the service's range: a fitted size outside it (a tiny or huge frame) still attaches. */
export function resizeFrame(size: TerminalSize): string {
  const cols = clamp(Math.trunc(size.cols), COLS_MIN, COLS_MAX);
  const rows = clamp(Math.trunc(size.rows), ROWS_MIN, ROWS_MAX);
  return JSON.stringify({ t: "resize", cols, rows });
}

export function ackFrame(processed: number): string {
  return JSON.stringify({ t: "ack", n: processed });
}

/** The service's text frames; anything else (not JSON, another shape) is `null` and ignored by the caller. */
export function parseServerFrame(text: string): ServerFrame | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  if (!("t" in value)) return null;
  if (value.t === "attached" && "resumed" in value && typeof value.resumed === "boolean")
    return { t: "attached", resumed: value.resumed };
  if (value.t === "snapshot" && "d" in value && typeof value.d === "string")
    return { t: "snapshot", d: value.d };
  return null;
}

/** The relay is same-origin on web's own port (design 3.3); the ticket is the only query parameter. */
export function terminalSocketUrl(
  location: { protocol: string; host: string },
  ticket: string,
): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}${TERMINAL_SOCKET_PATH}?ticket=${encodeURIComponent(ticket)}`;
}

/** What the state machine needs of a socket; a socket that fails to open reports a close (1006). */
export interface TerminalSocket {
  send(text: string): void;
  close(): void;
}

export interface SocketHandlers {
  onText(text: string): void;
  onBinary(bytes: Uint8Array): void;
  onClose(code: number): void;
}

export type OpenSocket = (ticket: string, handlers: SocketHandlers) => TerminalSocket;

/** The parts of the DOM `WebSocket` the adapter uses, so a test can pass a fake constructor. */
export interface BrowserWebSocket {
  binaryType: BinaryType;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(data: string): void;
  close(): void;
}

export type BrowserWebSocketConstructor = new (url: string) => BrowserWebSocket;

/** Adapts the browser's WebSocket to the machine's port; output arrives as binary frames (ArrayBuffer). */
export function browserSocketOpener(
  WebSocketClass: BrowserWebSocketConstructor,
  location: { protocol: string; host: string },
): OpenSocket {
  return (ticket, handlers) => {
    const socket = new WebSocketClass(terminalSocketUrl(location, ticket));
    socket.binaryType = "arraybuffer";
    socket.onmessage = (event) => {
      // `MessageEvent.data` is typed `any`; it is narrowed from unknown before use.
      const data: unknown = event.data;
      if (typeof data === "string") handlers.onText(data);
      else if (data instanceof ArrayBuffer) handlers.onBinary(new Uint8Array(data));
    };
    socket.onclose = (event) => handlers.onClose(event.code);
    return {
      send: (text) => socket.send(text),
      close: () => socket.close(),
    };
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
