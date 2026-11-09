// jsdom (the default environment) provides MessageEvent and CloseEvent.
import { describe, expect, it } from "vitest";
import {
  type BrowserWebSocket,
  browserSocketOpener,
  parseServerFrame,
  resizeFrame,
  terminalSocketUrl,
} from "./protocol";

// The browser side of ADR-0011 item 6: frames the service would refuse are never sent, and only its two text
// frames are read.

describe("terminal protocol (browser side)", () => {
  it("keeps a fitted size inside the service's resize range", () => {
    expect(JSON.parse(resizeFrame({ cols: 1, rows: 0 }))).toEqual({
      t: "resize",
      cols: 2,
      rows: 1,
    });
    expect(JSON.parse(resizeFrame({ cols: 900.7, rows: 300 }))).toEqual({
      t: "resize",
      cols: 500,
      rows: 200,
    });
  });

  it("reads attached and snapshot frames and nothing else", () => {
    expect(parseServerFrame('{"t":"attached","resumed":true}')).toEqual({
      t: "attached",
      resumed: true,
    });
    expect(parseServerFrame('{"t":"snapshot","d":"abc"}')).toEqual({ t: "snapshot", d: "abc" });
    expect(parseServerFrame('{"t":"attached","resumed":"yes"}')).toBeNull();
    expect(parseServerFrame('{"t":"other"}')).toBeNull();
    expect(parseServerFrame("not json")).toBeNull();
    expect(parseServerFrame("null")).toBeNull();
  });

  it("builds the socket URL on the page's own host with the ticket encoded", () => {
    expect(terminalSocketUrl({ protocol: "http:", host: "localhost:3080" }, "a.b+c")).toBe(
      "ws://localhost:3080/api/terminal/socket?ticket=a.b%2Bc",
    );
  });

  it("adapts a browser WebSocket: binary output as bytes, text as text, the close code", () => {
    const created: FakeWebSocket[] = [];
    class FakeWebSocket implements BrowserWebSocket {
      binaryType: BinaryType = "blob";
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      readonly sent: string[] = [];
      readonly url: string;
      constructor(url: string) {
        this.url = url;
        created.push(this);
      }
      send(data: string): void {
        this.sent.push(data);
      }
      close(): void {}
    }
    const events: string[] = [];
    const open = browserSocketOpener(FakeWebSocket, { protocol: "http:", host: "127.0.0.1:3080" });

    const socket = open("tk", {
      onText: (text) => events.push(`text ${text}`),
      onBinary: (bytes) => events.push(`binary ${bytes.length}`),
      onClose: (code) => events.push(`close ${code}`),
    });
    const ws = created[0];
    ws?.onmessage?.(new MessageEvent("message", { data: '{"t":"attached","resumed":false}' }));
    ws?.onmessage?.(new MessageEvent("message", { data: new Uint8Array([1, 2, 3]).buffer }));
    ws?.onclose?.(new CloseEvent("close", { code: 4001 }));
    socket.send("x");

    expect(ws?.url).toBe("ws://127.0.0.1:3080/api/terminal/socket?ticket=tk");
    expect(ws?.binaryType).toBe("arraybuffer");
    expect(events).toEqual(['text {"t":"attached","resumed":false}', "binary 3", "close 4001"]);
    expect(ws?.sent).toEqual(["x"]);
  });
});
