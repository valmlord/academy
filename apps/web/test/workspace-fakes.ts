import type { WorkspaceClient } from "@/lib/workspace/client";

// Fakes of the workspace service's client for the environment tests. A method a test did not give rejects, so
// a test that reaches a call it did not expect fails loudly instead of reading a made-up answer.

/** A fake client method was called that the test did not override. */
export class UnexpectedWorkspaceCallError extends Error {
  constructor(method: keyof WorkspaceClient) {
    super(`the fake workspace client got an unexpected ${method} call`);
    this.name = "UnexpectedWorkspaceCallError";
  }
}

function unexpected(method: keyof WorkspaceClient): () => Promise<never> {
  return async () => {
    throw new UnexpectedWorkspaceCallError(method);
  };
}

export function fakeWorkspaceClient(overrides: Partial<WorkspaceClient>): WorkspaceClient {
  return {
    get: overrides.get ?? unexpected("get"),
    ensure: overrides.ensure ?? unexpected("ensure"),
    stop: overrides.stop ?? unexpected("stop"),
    remove: overrides.remove ?? unexpected("remove"),
    activity: overrides.activity ?? unexpected("activity"),
  };
}
