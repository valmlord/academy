// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DockerCommandError,
  type DockerRun,
  expectedProjectFromShell,
  resolveStackWebContainer,
  WebContainerLookupError,
} from "./stack-web-container";

const PORT = "53082";
const PROJECT = "academy-ci";
const ID = "0123456789abcdef".repeat(4);
const OTHER_ID = "fedcba9876543210".repeat(4);
const SENTINEL_KEY = "sentinel-key-96";
const SENTINEL_VALUE = "sentinel-value-96";

class UnexpectedDockerCallError extends Error {
  constructor(args: readonly string[]) {
    super(`the fake docker got an unexpected call: docker ${args.join(" ")}`);
    this.name = "UnexpectedDockerCallError";
  }
}

interface Answers {
  ps: string;
  labels: string;
  port: string;
  mounts: string;
  failOn?: "ps" | "inspect" | "port";
}

function labelsOf(service: string, project: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    "com.docker.compose.service": service,
    "com.docker.compose.project": project,
    "com.docker.compose.oneoff": "False",
    ...extra,
  });
}

const STACK_WEB: Answers = {
  ps: `${ID}\n`,
  labels: labelsOf("web", PROJECT),
  port: `127.0.0.1:${PORT}\n`,
  mounts: "[]",
};

class DockerFailedError extends Error {
  constructor(subcommand: string) {
    super(`Command failed: docker ${subcommand}`);
    this.name = "DockerFailedError";
  }
}

/** Answers the four commands of the lookup for the container `ID` and records every call. */
function fakeDocker(answers: Answers): { docker: DockerRun; calls: string[][] } {
  const calls: string[][] = [];
  const docker: DockerRun = async (args) => {
    calls.push([...args]);
    const { failOn } = answers;
    if (failOn !== undefined && args[0] === failOn) throw new DockerFailedError(failOn);
    const command = args.join(" ");
    if (command === `ps -q --no-trunc --filter publish=${PORT}`) return answers.ps;
    if (command === `inspect --format {{json .Config.Labels}} ${ID}`) return answers.labels;
    if (command === `port ${ID} 3000/tcp`) return answers.port;
    if (command === `inspect --format {{json .Mounts}} ${ID}`) return answers.mounts;
    throw new UnexpectedDockerCallError(args);
  };
  return { docker, calls };
}

/** The lookup's rejection, which must be a WebContainerLookupError. */
async function refusal(
  answers: Answers,
  input: { hostPort?: string; expectedProject?: string | undefined } = {},
): Promise<{ error: WebContainerLookupError; calls: string[][] }> {
  const { docker, calls } = fakeDocker(answers);
  const outcome = await resolveStackWebContainer(
    { hostPort: PORT, expectedProject: PROJECT, ...input },
    docker,
  ).then(
    (id) => new Error(`expected WebContainerLookupError, resolved ${id}`),
    (error: unknown) => error,
  );
  if (!(outcome instanceof WebContainerLookupError)) throw outcome;
  return { error: outcome, calls };
}

describe("resolveStackWebContainer", () => {
  it("returns the expected project's web container that publishes the port on 127.0.0.1 with no .Mounts entry over the course", async () => {
    const { docker, calls } = fakeDocker(STACK_WEB);

    const id = await resolveStackWebContainer({ hostPort: PORT, expectedProject: PROJECT }, docker);

    expect(id).toBe(ID);
    expect(calls).toEqual([
      ["ps", "-q", "--no-trunc", "--filter", `publish=${PORT}`],
      ["inspect", "--format", "{{json .Config.Labels}}", ID],
      ["port", ID, "3000/tcp"],
      ["inspect", "--format", "{{json .Mounts}}", ID],
    ]);
  });

  it.each(["", "80a", " 8080"])("refuses a host port that is not decimal: %j", async (hostPort) => {
    const { error, calls } = await refusal(STACK_WEB, { hostPort });

    expect(error.message).toContain("the host port is not a decimal port");
    expect(calls).toEqual([]);
  });

  it.each([undefined, ""])(
    "refuses when no compose project is expected: %j",
    async (expectedProject) => {
      const { error, calls } = await refusal(STACK_WEB, { expectedProject });

      expect(error.message).toContain("no compose project expected for this run");
      expect(calls).toEqual([]);
    },
  );

  it("refuses the owner's project academy as the expected project", async () => {
    const { error, calls } = await refusal(
      { ...STACK_WEB, labels: labelsOf("web", "academy") },
      { expectedProject: "academy" },
    );

    expect(error.message).toContain("the expected project is the owner's project academy");
    expect(calls).toEqual([]);
  });

  it.each([
    ["academy-t32", "academy-t31"],
    ["academy", "academy-ci"],
  ])(
    "refuses the web container of another compose project: found %s, expected %s",
    async (found, expected) => {
      const { error } = await refusal(
        { ...STACK_WEB, labels: labelsOf("web", found) },
        { expectedProject: expected },
      );

      expect(error.message).toContain(`belongs to compose project ${found}, not ${expected}`);
    },
  );

  it("refuses when no running container publishes the port", async () => {
    const { error } = await refusal({ ...STACK_WEB, ps: "" });

    expect(error.message).toContain(`0 running containers publish port ${PORT}`);
  });

  it("refuses when two containers publish the port", async () => {
    const { error } = await refusal({ ...STACK_WEB, ps: `${ID}\n${OTHER_ID}\n` });

    expect(error.message).toContain(`2 running containers publish port ${PORT}`);
  });

  it.each(["0123456789ab", ID.toUpperCase(), `${ID} --privileged`, `${ID.slice(1)}g`])(
    "refuses a docker ps line that is not a 64-hex container id: %s",
    async (line) => {
      const { error, calls } = await refusal({ ...STACK_WEB, ps: `${line}\n` });

      expect(error.message).toContain("the docker ps line is not a container id");
      expect(calls).toHaveLength(1);
    },
  );

  it("refuses a container that is not the compose web service", async () => {
    const { error } = await refusal({ ...STACK_WEB, labels: labelsOf("db", PROJECT) });

    expect(error.message).toContain("is compose service db, not web");
  });

  it.each([
    ["no project key", JSON.stringify({ "com.docker.compose.service": "web" })],
    ["no service key", JSON.stringify({ "com.docker.compose.project": PROJECT })],
    ["no labels at all", "null"],
    ["a list", JSON.stringify(["web", PROJECT])],
    ["a number as the service", labelsOf("web", PROJECT, { "com.docker.compose.service": 1 })],
  ])(
    "refuses labels without the compose project or service key, or not a string map: %s",
    async (_case, labels) => {
      const { error } = await refusal({ ...STACK_WEB, labels });

      expect(error.message).toContain("the container labels are not a compose service and project");
    },
  );

  it.each([
    ["another address", `0.0.0.0:${PORT}\n`, `0.0.0.0:${PORT}`],
    ["more than one", `127.0.0.1:${PORT}\n[::]:${PORT}\n`, `127.0.0.1:${PORT}, [::]:${PORT}`],
    ["no binding", "", "nothing"],
  ])(
    "refuses a port bound on another address or on more than one: %s",
    async (_case, port, found) => {
      const { error } = await refusal({ ...STACK_WEB, port });

      expect(error.message).toContain(`port 3000/tcp is bound on ${found}, not 127.0.0.1:${PORT}`);
    },
  );

  it.each(["/", "/app", "/app/", "/app/course", "/app/course/x/course.yaml"])(
    "refuses a .Mounts entry at, under or above the course directory: %s",
    async (destination) => {
      const { error } = await refusal({
        ...STACK_WEB,
        mounts: JSON.stringify([{ Type: "bind", Destination: destination }]),
      });

      expect(error.message).toContain(`a mount at ${destination} covers /app/course`);
    },
  );

  it("accepts mounts beside the course directory", async () => {
    const { docker } = fakeDocker({
      ...STACK_WEB,
      mounts: JSON.stringify([
        { Type: "bind", Destination: "/app/courses" },
        { Type: "volume", Destination: "/app/apps/web/.next/cache" },
      ]),
    });

    const id = await resolveStackWebContainer({ hostPort: PORT, expectedProject: PROJECT }, docker);

    expect(id).toBe(ID);
  });

  it.each([
    ["no list", JSON.stringify({ Destination: "/data" })],
    ["a relative destination", JSON.stringify([{ Destination: "app/course" }])],
    ["no destination", JSON.stringify([{ Type: "tmpfs" }])],
    ["not JSON", "[{"],
  ])("refuses mounts that are not a list of absolute destinations: %s", async (_case, mounts) => {
    const { error } = await refusal({ ...STACK_WEB, mounts });

    expect(error.message).toContain("the container mounts are not a list of absolute destinations");
  });

  const SENTINEL = { [SENTINEL_KEY]: SENTINEL_VALUE };
  it.each([
    [
      "service mismatch",
      { ...STACK_WEB, labels: labelsOf("db", PROJECT, SENTINEL) },
      "is compose service db, not web",
    ],
    [
      "project mismatch",
      { ...STACK_WEB, labels: labelsOf("web", "academy-t32", SENTINEL) },
      `belongs to compose project academy-t32, not ${PROJECT}`,
    ],
    [
      "mount refusal",
      {
        ...STACK_WEB,
        labels: labelsOf("web", PROJECT, SENTINEL),
        mounts: JSON.stringify([
          { Destination: "/app/course", Source: SENTINEL_VALUE, ...SENTINEL },
        ]),
      },
      "a mount at /app/course covers /app/course",
    ],
    [
      "labels that are not JSON",
      { ...STACK_WEB, labels: `{"${SENTINEL_KEY}": ${SENTINEL_VALUE}` },
      "the container labels are not a compose service and project",
    ],
    [
      "labels with a non-string value",
      {
        ...STACK_WEB,
        labels: labelsOf("web", PROJECT, { "com.docker.compose.service": SENTINEL }),
      },
      "the container labels are not a compose service and project",
    ],
    [
      "mounts that are not JSON",
      { ...STACK_WEB, mounts: `[{"${SENTINEL_KEY}": ${SENTINEL_VALUE}` },
      "the container mounts are not a list of absolute destinations",
    ],
    [
      "a mount without a string Destination",
      { ...STACK_WEB, mounts: JSON.stringify([{ Destination: SENTINEL }]) },
      "the container mounts are not a list of absolute destinations",
    ],
  ])(
    "names neither the label map nor the mounts when it refuses: %s",
    async (_case, answers, fragment) => {
      const { error } = await refusal(answers);

      expect(error.message).toContain(fragment);
      expect(error.message).not.toContain(SENTINEL_KEY);
      expect(error.message).not.toContain(SENTINEL_VALUE);
      expect(error.cause).toBeUndefined();
    },
  );

  it.each(["ps", "inspect", "port"] as const)(
    "fails when the docker CLI fails: docker %s",
    async (failOn) => {
      const { docker } = fakeDocker({ ...STACK_WEB, failOn });

      const outcome = await resolveStackWebContainer(
        { hostPort: PORT, expectedProject: PROJECT },
        docker,
      ).catch((error: unknown) => error);

      expect(outcome).toBeInstanceOf(DockerCommandError);
      expect(outcome).toHaveProperty("message", expect.stringContaining(`docker ${failOn} failed`));
      expect(outcome).toHaveProperty("cause", expect.any(DockerFailedError));
    },
  );
});

describe("expectedProjectFromShell", () => {
  it("takes the shell value and ignores one from the root .env", () => {
    const env = { E2E_COMPOSE_PROJECT: PROJECT };

    const fromShell = expectedProjectFromShell(env, []);
    const fromRootEnv = expectedProjectFromShell(env, ["E2E_COMPOSE_PROJECT"]);

    expect(fromShell).toBe(PROJECT);
    expect(fromRootEnv).toBeUndefined();
  });
});
