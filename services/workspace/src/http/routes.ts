import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { WorkspaceLimits } from "../config.js";
import { parseWorkspaceKey, type WorkspaceKey } from "../identity.js";
import type { WorkspaceManager, WorkspaceView } from "../manager.js";
import type { EnsureOutcome, WorkspaceExit } from "../runtime.js";
import type { ServiceSettings } from "./app.js";

// The lesson routes and the settings route of design 7. Routes take no body; the key comes from the path and
// is validated here, so everything below works on a checked `WorkspaceKey`.

export const WORKSPACE_ROUTE = "/v1/users/:userId/courses/:courseId/lessons/:lessonId/workspace";

export interface RouteDeps {
  manager: WorkspaceManager;
  settings: ServiceSettings;
  limits: WorkspaceLimits;
}

/** The `Workspace` body of ADR-0010; times are ISO 8601 strings. */
export interface WorkspaceBody {
  id: string;
  userId: string;
  courseId: string;
  lessonId: string;
  state: WorkspaceView["state"];
  image: string | null;
  outcome?: EnsureOutcome;
  idle: { stopAt: string; warningAt: string } | null;
  exit: WorkspaceExit | null;
  limits: WorkspaceLimits;
}

// Anything that is not a map of strings is no key at all; parseWorkspaceKey then names the first field.
const pathParams = z.record(z.string(), z.string()).catch({});

/** The checked key of a lesson route; the first broken part throws `InvalidWorkspaceKeyError` (400). */
export function keyOf(params: unknown): WorkspaceKey {
  return parseWorkspaceKey(pathParams.parse(params));
}

function workspaceBody(
  view: WorkspaceView,
  limits: WorkspaceLimits,
  outcome?: EnsureOutcome,
): WorkspaceBody {
  const { idle } = view;
  return {
    id: view.id,
    userId: view.key.userId,
    courseId: view.key.courseId,
    lessonId: view.key.lessonId,
    state: view.state,
    image: view.image,
    ...(outcome === undefined ? {} : { outcome }),
    idle:
      idle === null
        ? null
        : {
            stopAt: new Date(idle.stopAt).toISOString(),
            warningAt: new Date(idle.warningAt).toISOString(),
          },
    exit: view.exit,
    limits,
  };
}

const NO_CONTENT = 204;

export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { manager, settings, limits } = deps;
  app.get("/v1/settings", async () => ({ ...settings }));
  app.put(WORKSPACE_ROUTE, async (request) => {
    const result = await manager.ensure(keyOf(request.params));
    return workspaceBody(result.workspace, limits, result.outcome);
  });
  app.get(WORKSPACE_ROUTE, async (request) =>
    workspaceBody(await manager.get(keyOf(request.params)), limits),
  );
  app.post(`${WORKSPACE_ROUTE}/stop`, async (request) =>
    workspaceBody(await manager.stop(keyOf(request.params)), limits),
  );
  app.post(`${WORKSPACE_ROUTE}/activity`, async (request, reply) => {
    manager.activity(keyOf(request.params));
    return reply.code(NO_CONTENT).send();
  });
  app.delete(WORKSPACE_ROUTE, async (request, reply) => {
    await manager.remove(keyOf(request.params));
    return reply.code(NO_CONTENT).send();
  });
}
