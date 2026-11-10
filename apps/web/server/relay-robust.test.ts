// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
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
  within,
} from "@/test/relay-harness";

// U-relay-robust (#32 design 3.3.1): no malformed request or reset stops web. After each input the same server
// still answers a valid upgrade with 101, and no error escaped to the process.

const opened: { close(): Promise<void> }[] = [];
let spies: ReturnType<typeof processSpies> | undefined;

afterEach(async () => {
  spies?.restore();
  spies = undefined;
  for (const server of opened.splice(0)) await server.close();
});

async function setup(behaviour?: Parameters<typeof startUpstream>[0]) {
  const upstream = await startUpstream(behaviour);
  const web = await startWeb({ serviceUrl: upstream.url });
  opened.push(web, upstream);
  spies = processSpies();
  return { upstream, web };
}

function terminal(web: Web, query: string): Client {
  return rawClient(web.port, {
    path: `/api/terminal/socket?${query}`,
    headers: browserHeaders(web),
  });
}

async function stillServes(web: Web): Promise<void> {
  const client = terminal(web, `ticket=${ticketFor(Date.now())}`);
  await client.until(/\r\n\r\n/);
  expect(statusOf(client.text())).toBe("HTTP/1.1 101 Switching Protocols");
  client.socket.destroy();
  await settle();
  expect(spies?.escaped).toEqual([]);
}

function macOf(ticket: string): { encoded: string; mac: string } {
  const [encoded = "", mac = ""] = ticket.split(".");
  return { encoded, mac };
}

describe("relay robustness (U-relay-robust)", () => {
  it.each([
    ["a MAC of 42 characters", (t: string) => `${macOf(t).encoded}.${macOf(t).mac.slice(0, 42)}`],
    [
      "a MAC of 42 characters plus %C3%A9",
      (t: string) => `${macOf(t).encoded}.${macOf(t).mac.slice(0, 42)}%C3%A9`,
    ],
    ["a non-ASCII payload", (t: string) => `%C3%BC%E2%82%AC.${macOf(t).mac}`],
    ["a 3000-character ticket", (t: string) => `${"A".repeat(2956)}.${macOf(t).mac}`],
  ])("refuses %s with 401 and keeps serving", async (_case, forge) => {
    const { upstream, web } = await setup();
    const client = terminal(web, `ticket=${forge(ticketFor(Date.now()))}`);

    await client.closed;

    expect(statusOf(client.text())).toBe("HTTP/1.1 401 Unauthorized");
    expect(upstream.records).toEqual([]);
    await stillServes(web);
  });

  it("answers a malformed request URL as an ordinary request and keeps serving", async () => {
    const { web } = await setup();
    const client = rawClient(web.port, { path: "//[", headers: browserHeaders(web) });

    await within(client.until(/\r\n\r\n/), "//[");
    client.socket.destroy();

    expect(statusOf(client.text())).toBe("HTTP/1.1 308 Permanent Redirect");
    expect(web.requests).toEqual(["//["]);
    await stillServes(web);
  });

  it("survives a client reset while the refusal is written", async () => {
    const { web } = await setup();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const client = terminal(web, "ticket=bad.ticket");
      client.socket.resetAndDestroy();
      await client.closed;
    }

    await settle();
    await stillServes(web);
  });

  it("survives a client reset during the connect to the service", async () => {
    const { upstream, web } = await setup("silent");
    const client = terminal(web, `ticket=${ticketFor(Date.now())}`);
    await waitFor(() => upstream.records.length === 1);

    client.socket.resetAndDestroy();
    await waitFor(() => upstream.sockets[0]?.destroyed === true);
    await settle();
    upstream.setBehaviour("accept");

    await stillServes(web);
  });

  it("survives the service resetting the connection after the 101", async () => {
    const { upstream, web } = await setup("reset-after-101");
    const client = terminal(web, `ticket=${ticketFor(Date.now())}`);

    await client.closed;
    await settle();
    upstream.setBehaviour("accept");

    expect(statusOf(client.text())).toBe("HTTP/1.1 101 Switching Protocols");
    await stillServes(web);
  });
});

async function waitFor(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !condition(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(condition()).toBe(true);
}
