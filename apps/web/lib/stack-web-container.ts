// Finds the web container that e2e/course-unreadable.spec.ts may change with `docker exec -u 0`. It accepts a
// container only when it is the one running container publishing the base URL's port, its compose labels name the
// web service of the project the stage expects (never the owner's), its 3000/tcp is bound on 127.0.0.1:<port> and
// nowhere else, and no entry of `docker inspect .Mounts` (binds, volumes, `--mount type=tmpfs`) has a destination
// at, under or above the course directory. A `--tmpfs` mount is kept in HostConfig.Tmpfs, not in .Mounts, and is
// not checked. So the course directory of an accepted container is image content, where a chmod lands in that
// container's writable layer, or lies in a `--tmpfs` of that container. Either way the chmod reaches no host file
// and no other container, provided the course holds no symlink, which this module does not check.
// Erasable syntax only (no enum, namespace or parameter property): playwright.config.ts imports this file by its
// .ts path, as it does lib/disposable-stack.ts.

import { z } from "zod";

/** Runs `docker <args>` and resolves with its stdout; rejects on a non-zero exit or when docker is missing. */
export type DockerRun = (args: readonly string[]) => Promise<string>;

// docker-compose.yml's top-level `name:`, the owner's stack.
export const OWNER_COMPOSE_PROJECT = "academy";

// The variable the stage sets to the compose project it created.
const EXPECTED_PROJECT_VARIABLE = "E2E_COMPOSE_PROJECT";
// The web service's container port (docker-compose.yml, web `ports:`).
const WEB_CONTAINER_PORT = "3000/tcp";
// apps/web/Dockerfile copies the course export here (COURSE_ROOT).
const COURSE_DIR = "/app/course";
const LOOPBACK_HOST = "127.0.0.1";
const DECIMAL_PORT = /^[0-9]+$/;
const CONTAINER_ID = /^[0-9a-f]{64}$/;

const ComposeLabels = z.object({
  "com.docker.compose.service": z.string(),
  "com.docker.compose.project": z.string(),
});
const Mounts = z.array(z.object({ Destination: z.string().startsWith("/") }));

/**
 * Never built with a cause and never given a caught error's text: the Playwright report prints both, and a
 * parse error may quote the docker answer, which holds every label or mount of the container.
 */
export class WebContainerLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebContainerLookupError";
  }
}

export class DockerCommandError extends Error {
  constructor(subcommand: string, hostPort: string, cause: unknown) {
    super(`docker ${subcommand} failed while looking up the web container on port ${hostPort}`, {
      cause,
    });
    this.name = "DockerCommandError";
  }
}

/** A found value on one line, whatever it holds: JSON escaping without the quotes. */
function oneLine(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

/** The shell's E2E_COMPOSE_PROJECT; a value from the root .env does not count. */
export function expectedProjectFromShell(
  env: Record<string, string | undefined>,
  rootEnvKeys: readonly string[],
): string | undefined {
  if (rootEnvKeys.includes(EXPECTED_PROJECT_VARIABLE)) return undefined;
  return env[EXPECTED_PROJECT_VARIABLE];
}

/** A mount at the course directory, under it, or at one of its ancestors. */
function coversCourseDir(destination: string): boolean {
  const path = destination.replace(/\/+$/, "");
  return (
    path === COURSE_DIR || path.startsWith(`${COURSE_DIR}/`) || COURSE_DIR.startsWith(`${path}/`)
  );
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // The caller refuses with its own message; the parser's would quote the answer.
    return undefined;
  }
}

export interface StackWebContainerInput {
  hostPort: string;
  expectedProject: string | undefined;
}

/** The id of the one container the spec may change; any other is refused with WebContainerLookupError. */
export async function resolveStackWebContainer(
  { hostPort, expectedProject }: StackWebContainerInput,
  docker: DockerRun,
): Promise<string> {
  if (!DECIMAL_PORT.test(hostPort)) {
    throw new WebContainerLookupError("the host port is not a decimal port");
  }
  if (expectedProject === undefined || expectedProject === "") {
    throw new WebContainerLookupError(
      `no compose project expected for this run: set ${EXPECTED_PROJECT_VARIABLE} in the shell`,
    );
  }
  if (expectedProject === OWNER_COMPOSE_PROJECT) {
    throw new WebContainerLookupError(
      `the expected project is the owner's project ${OWNER_COMPOSE_PROJECT}`,
    );
  }
  const run = async (args: readonly string[]): Promise<string> => {
    try {
      return await docker(args);
    } catch (error: unknown) {
      throw new DockerCommandError(args[0] ?? "", hostPort, error);
    }
  };

  const ids = (await run(["ps", "-q", "--no-trunc", "--filter", `publish=${hostPort}`]))
    .split("\n")
    .filter((line) => line !== "");
  const [id] = ids;
  if (ids.length !== 1 || id === undefined) {
    throw new WebContainerLookupError(
      `${ids.length} running containers publish port ${hostPort}, expected one`,
    );
  }
  if (!CONTAINER_ID.test(id)) {
    throw new WebContainerLookupError("the docker ps line is not a container id");
  }

  const labels = ComposeLabels.safeParse(
    parsedJson(await run(["inspect", "--format", "{{json .Config.Labels}}", id])),
  );
  if (!labels.success) {
    throw new WebContainerLookupError(
      `the container labels are not a compose service and project (port ${hostPort})`,
    );
  }
  const service = labels.data["com.docker.compose.service"];
  const project = labels.data["com.docker.compose.project"];
  if (service !== "web") {
    throw new WebContainerLookupError(
      `the container on port ${hostPort} is compose service ${oneLine(service)}, not web`,
    );
  }
  if (project !== expectedProject) {
    throw new WebContainerLookupError(
      `the container on port ${hostPort} belongs to compose project ${oneLine(project)}, not ${oneLine(expectedProject)}`,
    );
  }

  const bindings = (await run(["port", id, WEB_CONTAINER_PORT]))
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const expectedBinding = `${LOOPBACK_HOST}:${hostPort}`;
  if (bindings.length !== 1 || bindings[0] !== expectedBinding) {
    const found = bindings.length === 0 ? "nothing" : bindings.map(oneLine).join(", ");
    throw new WebContainerLookupError(
      `port ${WEB_CONTAINER_PORT} is bound on ${found}, not ${expectedBinding}`,
    );
  }

  const mounts = Mounts.safeParse(
    parsedJson(await run(["inspect", "--format", "{{json .Mounts}}", id])),
  );
  if (!mounts.success) {
    throw new WebContainerLookupError(
      `the container mounts are not a list of absolute destinations (port ${hostPort})`,
    );
  }
  for (const { Destination: destination } of mounts.data) {
    if (coversCourseDir(destination)) {
      throw new WebContainerLookupError(
        `a mount at ${oneLine(destination)} covers ${COURSE_DIR} (port ${hostPort})`,
      );
    }
  }
  return id;
}
