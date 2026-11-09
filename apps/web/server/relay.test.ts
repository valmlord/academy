// @vitest-environment node
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import {
  AUTH_SECRET,
  browserHeaders,
  CLIENT_KEY,
  rawClient,
  SERVICE_SECRET,
  settle,
  startUpstream,
  startWeb,
  statusOf,
  ticketFor,
  type Upstream,
  type Web,
} from "@/test/relay-harness";
import { refusedLine, suppressedLine, upstreamFailedLine } from "./strings.ts";

// U-relay and U-relay-forged (#32 design 3.3 item 3, 10.3), over real sockets on 127.0.0.1.

const opened: { close(): Promise<void> }[] = [];

afterEach(async () => {
  for (const server of opened.splice(0)) await server.close();
});

async function setup(behaviour?: Parameters<typeof startUpstream>[0]) {
  const upstream = await startUpstream(behaviour);
  const web = await startWeb({ serviceUrl: upstream.url });
  opened.push(web, upstream);
  return { upstream, web };
}

function upgrade(web: Web, ticket: string, extra: Record<string, string | undefined> = {}) {
  return rawClient(web.port, {
    path: `/api/terminal/socket?ticket=${ticket}`,
    headers: browserHeaders(web, extra),
  });
}

async function refusal(web: Web, client: ReturnType<typeof upgrade>): Promise<string> {
  await client.closed;
  return statusOf(client.text());
}

function connLine(lines: string[], pattern: RegExp): string {
  const found = lines.find((line) => pattern.test(line));
  if (found === undefined) throw new Error(`no line ${pattern} in ${JSON.stringify(lines)}`);
  return found;
}

describe("relay (U-relay)", () => {
  it("relays the upgrade and passes bytes unchanged both ways", async () => {
    const { upstream, web } = await setup();
    const client = upgrade(web, ticketFor(Date.now()));

    await client.until(/\r\n\r\n/);
    client.socket.write(Buffer.from([0x81, 0x00, 0xff, 0x0a]));
    await client.until(/echo:/);

    expect(statusOf(client.text())).toBe("HTTP/1.1 101 Switching Protocols");
    expect(Buffer.concat(upstream.records[0]?.received ?? [])).toEqual(
      Buffer.from([0x81, 0x00, 0xff, 0x0a]),
    );
    expect(client.text().split("\r\n\r\n")[1]).toBe("echo:\x81\x00\xff\n");
    client.socket.destroy();
  });

  it("builds the upstream path from the ticket alone, whatever else the query says", async () => {
    const { upstream, web } = await setup();
    const client = rawClient(web.port, {
      path: `/api/terminal/socket?u=user_b&ticket=${ticketFor(Date.now())}&path=/v1/users/user_b`,
      headers: browserHeaders(web),
    });

    await client.until(/101/);

    expect(upstream.records.map((record) => record.url)).toEqual([
      "/v1/users/user_a/courses/agentic-dev/lessons/first-lesson/workspace/terminal",
    ]);
    client.socket.destroy();
  });

  it("sends the service exactly the allowlisted headers", async () => {
    const { upstream, web } = await setup();
    const client = upgrade(web, ticketFor(Date.now()), {
      Cookie: "better-auth.session_token=canary-cookie",
      Authorization: "Bearer canary-browser-authorization",
      "User-Agent": "canary-agent",
      "X-Academy-Conn": "ffffffffffffffff",
    });

    await client.until(/101/);
    const [record] = upstream.records;

    expect([...(record?.headerNames ?? [])].sort()).toEqual([
      "authorization",
      "connection",
      "host",
      "sec-websocket-key",
      "sec-websocket-version",
      "upgrade",
      "x-academy-conn",
    ]);
    expect(record?.headers.authorization).toBe(`Bearer ${SERVICE_SECRET}`);
    expect(record?.headers["sec-websocket-key"]).toBe(CLIENT_KEY);
    expect(record?.headers["x-academy-conn"]).toMatch(/^[0-9a-f]{16}$/);
    expect(record?.headers["x-academy-conn"]).not.toBe("ffffffffffffffff");
    client.socket.destroy();
  });

  it("refuses a ticket re-signed for another user with 401 and never contacts the service (U-relay-forged)", async () => {
    const { upstream, web } = await setup();
    const [encoded = "", mac = ""] = ticketFor(Date.now()).split(".");
    const payload: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString());
    if (typeof payload !== "object" || payload === null)
      throw new Error("payload is not an object");
    const reEncoded = Buffer.from(JSON.stringify({ ...payload, u: "user_b" })).toString(
      "base64url",
    );
    const forged = `${reEncoded}.${mac}`;

    const status = await refusal(web, upgrade(web, forged));

    expect(status).toBe("HTTP/1.1 401 Unauthorized");
    expect(web.lines).toEqual([refusedLine(connOf(web.lines), "bad-ticket")]);
    expect(upstream.records).toEqual([]);
  });

  it.each([
    ["missing", undefined, undefined],
    ["another site", "http://evil.example", undefined],
    ["another port of localhost", "http://localhost:5173", "localhost:3080"],
    ["127.0.0.1 for a localhost Host", "http://127.0.0.1:3080", "localhost:3080"],
  ])("refuses an Origin that is %s with 403", async (_case, origin, host) => {
    const { upstream, web } = await setup();
    const client = upgrade(web, ticketFor(Date.now()), {
      Origin: origin,
      ...(host === undefined ? {} : { Host: host }),
    });

    expect(await refusal(web, client)).toBe("HTTP/1.1 403 Forbidden");
    expect(web.lines).toEqual([refusedLine(connOf(web.lines), "forbidden-origin")]);
    expect(upstream.records).toEqual([]);
  });

  it.each(["example.com", "192.168.1.10:3080", "localhost.evil.example:3080"])(
    "refuses the non-loopback Host %s with 403",
    async (host) => {
      const { upstream, web } = await setup();
      const client = upgrade(web, ticketFor(Date.now()), { Host: host, Origin: `http://${host}` });

      expect(await refusal(web, client)).toBe("HTTP/1.1 403 Forbidden");
      expect(web.lines).toEqual([refusedLine(connOf(web.lines), "forbidden-host")]);
      expect(upstream.records).toEqual([]);
    },
  );

  it.each([
    ["an Upgrade other than websocket", { Upgrade: "h2c" }, "GET"],
    ["WebSocket version 8", { "Sec-WebSocket-Version": "8" }, "GET"],
    ["a malformed WebSocket key", { "Sec-WebSocket-Key": "short==" }, "GET"],
    ["a POST", {}, "POST"],
  ])("refuses %s with 400", async (_case, extra, method) => {
    const { upstream, web } = await setup();
    const client = rawClient(web.port, {
      method,
      path: `/api/terminal/socket?ticket=${ticketFor(Date.now())}`,
      headers: browserHeaders(web, extra),
    });

    expect(await refusal(web, client)).toBe("HTTP/1.1 400 Bad Request");
    expect(web.lines).toEqual([refusedLine(connOf(web.lines), "bad-request")]);
    expect(upstream.records).toEqual([]);
  });

  it.each([
    ["no ticket", "/api/terminal/socket"],
    ["two tickets", "/api/terminal/socket?ticket=a.b&ticket=c.d"],
  ])("refuses %s with 401", async (_case, path) => {
    const { upstream, web } = await setup();
    const client = rawClient(web.port, { path, headers: browserHeaders(web) });

    expect(await refusal(web, client)).toBe("HTTP/1.1 401 Unauthorized");
    expect(upstream.records).toEqual([]);
  });

  it("refuses a replayed ticket", async () => {
    const { upstream, web } = await setup();
    const ticket = ticketFor(Date.now());
    const first = upgrade(web, ticket);
    await first.until(/101/);

    expect(await refusal(web, upgrade(web, ticket))).toBe("HTTP/1.1 401 Unauthorized");
    expect(upstream.records).toHaveLength(1);
    first.socket.destroy();
  });

  it("answers 503 when the service is not configured", async () => {
    const web = await startWeb({ env: { BETTER_AUTH_SECRET: AUTH_SECRET } });
    opened.push(web);

    expect(await refusal(web, upgrade(web, ticketFor(Date.now())))).toBe(
      "HTTP/1.1 503 Service Unavailable",
    );
    expect(web.lines).toEqual([refusedLine(connOf(web.lines), "unconfigured")]);
  });

  it("answers 503 when the ticket key cannot be derived", async () => {
    const web = await startWeb({
      env: {
        WORKSPACE_SERVICE_URL: "http://127.0.0.1:9",
        WORKSPACE_SERVICE_SECRET: SERVICE_SECRET,
      },
    });
    opened.push(web);

    expect(await refusal(web, upgrade(web, ticketFor(Date.now())))).toBe(
      "HTTP/1.1 503 Service Unavailable",
    );
  });

  it("answers 502 and closes both sides when the service answers 409", async () => {
    const { upstream, web } = await setup("conflict");
    const client = upgrade(web, ticketFor(Date.now()));

    expect(await refusal(web, client)).toBe("HTTP/1.1 502 Bad Gateway");
    expect(web.lines).toEqual([upstreamFailedLine(connOf(web.lines), "409")]);
    expect(upstream.sockets[0]?.destroyed).toBe(true);
  });

  it("answers 502 when the service's port is closed", async () => {
    const upstream = await startUpstream();
    await upstream.close();
    const web = await startWeb({ serviceUrl: upstream.url });
    opened.push(web);

    expect(await refusal(web, upgrade(web, ticketFor(Date.now())))).toBe(
      "HTTP/1.1 502 Bad Gateway",
    );
    expect(web.lines).toEqual([upstreamFailedLine(connOf(web.lines), "ECONNREFUSED")]);
  });

  it("answers 502 for a malformed WORKSPACE_SERVICE_URL", async () => {
    const web = await startWeb({ serviceUrl: "not a url" });
    opened.push(web);

    expect(await refusal(web, upgrade(web, ticketFor(Date.now())))).toBe(
      "HTTP/1.1 502 Bad Gateway",
    );
    expect(web.lines).toEqual([upstreamFailedLine(connOf(web.lines), "ERR_INVALID_URL")]);
  });

  it("logs neither the ticket nor the browser's Authorization", async () => {
    const { web } = await setup();
    const ticket = ticketFor(Date.now());
    const [encoded = ""] = ticket.split(".");
    const forged = `${encoded}.${"A".repeat(43)}`;

    await refusal(web, upgrade(web, forged, { Authorization: "Bearer canary-authorization" }));

    expect(web.lines.join("\n")).not.toContain(encoded);
    expect(web.lines.join("\n")).not.toContain("canary");
  });
});

describe("relay log limiter (U-relay)", () => {
  function fakeClock() {
    let now = Date.UTC(2026, 10, 4, 12, 0, 0);
    const timers: { at: number; callback: () => void }[] = [];
    return {
      now: () => now,
      setTimer: (callback: () => void, ms: number) => {
        timers.push({ at: now + ms, callback });
        return undefined;
      },
      advance(ms: number) {
        now += ms;
        for (const timer of timers.filter((t) => t.at <= now)) {
          timers.splice(timers.indexOf(timer), 1);
          timer.callback();
        }
      },
      pending: () => timers.length,
    };
  }

  async function limited(paths: string[], clock: ReturnType<typeof fakeClock>) {
    const upstream: Upstream = await startUpstream();
    const web = await startWeb({
      serviceUrl: upstream.url,
      now: clock.now,
      setTimer: clock.setTimer,
    });
    opened.push(web, upstream);
    for (const path of paths) {
      const client = rawClient(web.port, { path, headers: browserHeaders(web) });
      await client.closed;
    }
    return web;
  }

  it("prints one F4a line for 100 refusals and F4e at the end of the window without another refusal", async () => {
    const clock = fakeClock();
    const web = await limited(
      Array.from({ length: 100 }, () => "/api/terminal/socket?ticket=bad.ticket"),
      clock,
    );

    expect(web.lines).toEqual([refusedLine(connOf(web.lines), "bad-ticket")]);
    clock.advance(10_000);

    expect(web.lines.slice(1)).toEqual([suppressedLine(99, "bad-ticket")]);
    expect(clock.pending()).toBe(0);
  });

  it("prints one F4d line for 100 contained errors of one kind and F4e with the contained reason", async () => {
    const clock = fakeClock();
    const web = await limited([], clock);
    const first = new PassThrough();
    const written: Buffer[] = [];
    first.on("data", (chunk: Buffer) => written.push(chunk));

    web.relay.contain(first, new TypeError("canary"));
    for (let count = 1; count < 100; count += 1) {
      web.relay.contain(new PassThrough(), new TypeError("canary"));
    }
    await settle();

    expect(Buffer.concat(written).toString("latin1")).toBe(
      "HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n",
    );
    expect(web.lines).toEqual(["terminal relay -: error contained (TypeError)"]);
    clock.advance(10_000);

    expect(web.lines.slice(1)).toEqual([suppressedLine(99, "contained")]);
  });

  it("keeps a flood of one contained error from hiding another kind's first line (S5-N1)", async () => {
    const clock = fakeClock();
    const web = await limited([], clock);

    for (let count = 0; count < 5; count += 1) {
      web.relay.contain(new PassThrough(), new TypeError("canary"));
    }
    web.relay.contain(new PassThrough(), new RangeError("canary"));

    expect(web.lines).toEqual([
      "terminal relay -: error contained (TypeError)",
      "terminal relay -: error contained (RangeError)",
    ]);
  });
});

function connOf(lines: string[]): string {
  const line = connLine(lines, /^terminal relay [0-9a-f]{16}:/);
  return line.slice("terminal relay ".length, "terminal relay ".length + 16);
}
