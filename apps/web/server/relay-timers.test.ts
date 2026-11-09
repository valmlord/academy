// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  browserHeaders,
  type Client,
  processSpies,
  rawClient,
  settle,
  startUpstream,
  startWeb,
  statusOf,
  ticketFor,
  type Web,
} from "@/test/relay-harness";
import { cutAtDeadlineLine } from "./strings.ts";

// U-relay-close, U-relay-timers, U-relay-idle and U-relay-cap (#32 design 3.3 item 3, 10.3): every end of a
// pair releases both sockets and both timers, an idle pair is never cut, and the deadline is
// min(dl, connect + cap).

const opened: { close(): Promise<void> }[] = [];
let spies: ReturnType<typeof processSpies> | undefined;

afterEach(async () => {
  vi.useRealTimers();
  spies?.restore();
  spies = undefined;
  for (const server of opened.splice(0)) await server.close();
});

async function setup(
  behaviour?: Parameters<typeof startUpstream>[0],
  options: { capSeconds?: number; connectTimeoutMs?: number } = {},
) {
  const upstream = await startUpstream(behaviour);
  const web = await startWeb({ serviceUrl: upstream.url, ...options });
  opened.push(web, upstream);
  spies = processSpies();
  return { upstream, web };
}

function terminal(web: Web, ticket: string): Client {
  return rawClient(web.port, {
    path: `/api/terminal/socket?ticket=${ticket}`,
    headers: browserHeaders(web),
  });
}

// setImmediate is never faked here, so this waits on I/O while setTimeout is fake.
async function poll(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 5000 && !condition(); i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  expect(condition()).toBe(true);
}

describe("relay pair release (U-relay-close, U-relay-timers)", () => {
  async function upgraded(options: { capSeconds?: number } = {}) {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { upstream, web } = await setup("accept", options);
    const client = terminal(web, ticketFor(Date.now()));
    await client.until(/\r\n\r\n/);
    expect(statusOf(client.text())).toBe("HTTP/1.1 101 Switching Protocols");
    // The deadline timer of the live pair.
    expect(vi.getTimerCount()).toBe(1);
    return { upstream, web, client };
  }

  async function expectReleased(
    client: Client,
    upstream: Awaited<ReturnType<typeof startUpstream>>,
  ) {
    await client.closed;
    await poll(() => upstream.sockets[0]?.destroyed === true);
    await settle();
    expect(vi.getTimerCount()).toBe(0);
    expect(spies?.escaped).toEqual([]);
  }

  it("releases both sockets and every timer when the browser closes", async () => {
    const { upstream, client } = await upgraded();

    client.socket.destroy();

    await expectReleased(client, upstream);
  });

  it("releases both sockets and every timer when the service closes", async () => {
    const { upstream, client } = await upgraded();

    upstream.sockets[0]?.destroy();

    await expectReleased(client, upstream);
  });

  it("releases both sockets and every timer at the deadline", async () => {
    const { upstream, client, web } = await upgraded({ capSeconds: 120 });

    vi.advanceTimersByTime(120_000);

    await expectReleased(client, upstream);
    expect(web.lines.filter((line) => line.endsWith("cut at deadline"))).toHaveLength(1);
  });

  it("releases both sockets and every timer after a non-101 answer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { upstream, web } = await setup("conflict");
    const client = terminal(web, ticketFor(Date.now()));

    await expectReleased(client, upstream);
    expect(statusOf(client.text())).toBe("HTTP/1.1 502 Bad Gateway");
  });

  it("destroys the pending service request on a client reset, and its late error finds a listener", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { upstream, web } = await setup("silent");
    const client = terminal(web, ticketFor(Date.now()));
    await poll(() => upstream.records.length === 1);
    // The connect timer of the pending pair.
    expect(vi.getTimerCount()).toBe(1);

    client.socket.resetAndDestroy();

    await expectReleased(client, upstream);
  });
});

describe("relay idle connections (U-relay-idle, real timers)", () => {
  it("keeps an upgraded pair without traffic open past the connect timeout", async () => {
    const { upstream, web } = await setup("accept", { connectTimeoutMs: 200 });
    const client = terminal(web, ticketFor(Date.now()));
    await client.until(/101/);

    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(client.socket.destroyed).toBe(false);
    expect(upstream.sockets[0]?.destroyed).toBe(false);
    client.socket.destroy();
  });

  it("destroys a connect the service never answers after the connect timeout", async () => {
    const { web } = await setup("silent", { connectTimeoutMs: 200 });
    const startedAt = performance.now();
    const client = terminal(web, ticketFor(Date.now()));

    await client.closed;
    const elapsed = performance.now() - startedAt;

    expect(elapsed).toBeGreaterThanOrEqual(150);
    expect(elapsed).toBeLessThanOrEqual(1000);
    expect(web.lines).toEqual([expect.stringMatching(/: upstream failed \(timeout\)$/)]);
  });
});

describe("relay deadline (U-relay-cap)", () => {
  it("cuts at connect + cap when the ticket's deadline is later", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { upstream, web } = await setup("accept", { capSeconds: 120 });
    const client = terminal(web, ticketFor(Date.now(), { dl: Date.now() + 3_600_000 }));
    await client.until(/101/);

    vi.advanceTimersByTime(119_000);
    await settle();
    expect(client.socket.destroyed).toBe(false);
    vi.advanceTimersByTime(1_000);

    await client.closed;
    await poll(() => upstream.sockets[0]?.destroyed === true);
    const conn = web.lines[0]?.slice("terminal relay ".length, "terminal relay ".length + 16) ?? "";
    expect(web.lines).toEqual([cutAtDeadlineLine(conn)]);
  });

  it("cuts at the ticket's deadline when the session expires first", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { web } = await setup("accept", { capSeconds: 900 });
    const client = terminal(web, ticketFor(Date.now(), { dl: Date.now() + 60_000 }));
    await client.until(/101/);

    vi.advanceTimersByTime(59_000);
    await settle();
    expect(client.socket.destroyed).toBe(false);
    vi.advanceTimersByTime(1_000);

    await client.closed;
    expect(web.lines.filter((line) => line.endsWith("cut at deadline"))).toHaveLength(1);
  });
});
