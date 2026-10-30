// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { serialised } from "@/test/serialised";
import { createSessionReader, type GetSession, SessionReadError } from "./session-reader";

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  throw new Error("expected the read to fail");
}

describe("createSessionReader", () => {
  it("rethrows a failed read as SessionReadError without the cause or the canary", async () => {
    const failure = Object.assign(
      new Error("Failed query: select * from sessions\nparams: canary-token-dal"),
      { params: ["canary-token-dal"], code: "42P01" },
    );
    const read = createSessionReader({
      getSession: vi.fn<GetSession>().mockRejectedValue(failure),
    });

    const error = await rejectionOf(read(new Headers()));

    expect(error).toBeInstanceOf(SessionReadError);
    expect(error instanceof Error ? error.cause : "not an error").toBeUndefined();
    expect(serialised([[error]])).not.toContain("canary-token-dal");
  });

  it("returns null when there is no session", async () => {
    const read = createSessionReader({ getSession: vi.fn<GetSession>().mockResolvedValue(null) });

    expect(await read(new Headers())).toBeNull();
  });

  it("asks Better Auth not to refresh the session", async () => {
    const getSession = vi.fn<GetSession>().mockResolvedValue(null);
    const read = createSessionReader({ getSession });
    const headers = new Headers({ cookie: "better-auth.session_token=x" });

    await read(headers);

    expect(getSession).toHaveBeenCalledOnce();
    expect(getSession.mock.calls[0]?.[0].query.disableRefresh).toBe(true);
    expect(getSession.mock.calls[0]?.[0].headers).toBe(headers);
  });
});
