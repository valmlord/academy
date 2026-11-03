// Calls the workspace service API from inside its own container, so the secret is read from the container's
// environment and never appears on a command line. Fed on stdin:
//   docker compose -p <project> exec -T workspace node --input-type=module - <mode> [user] < api.mjs
// Modes:
//   reach            GET a workspace of user ci-missing; exit 0 only on 404 workspace-not-found. A 503 means
//                    the service cannot use the Docker socket (P7, design 8.4 "workspace service reaches Docker").
//   ensure <user>    PUT the workspace of <user> for the first lesson with a workspace; prints its container name.
//   delete <user>    DELETE that workspace; exit 0 on 204, or on 404 when it is already gone.
// The lesson comes from the service's own course reader, so the probe uses a lesson the service accepts.
import { readCourseLessons } from "/app/dist/course/lessons.js";
import { workspaceNames } from "/app/dist/identity.js";

const SERVICE_URL = "http://127.0.0.1:4100";
/** A first ensure copies the starter; well under #32's client timeout, far over a normal run. */
const REQUEST_TIMEOUT_MS = 60_000;

const [mode, user = "ci-missing"] = process.argv.slice(2);
const secret = process.env.WORKSPACE_SERVICE_SECRET ?? "";
const course = await readCourseLessons(process.env.COURSE_ROOT ?? "/course");
const lesson = course.all().find((candidate) => candidate.workspace !== null);
if (lesson === undefined) {
  console.error("API FAIL no lesson with a workspace in the course");
  process.exit(1);
}
const path = `/v1/users/${user}/courses/${lesson.courseId}/lessons/${lesson.lessonId}/workspace`;

async function call(method) {
  const response = await fetch(`${SERVICE_URL}${path}`, {
    method,
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text === "" ? null : JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: response.status, body, code: body?.error?.code ?? "-" };
}

if (mode === "reach") {
  const { status, code } = await call("GET");
  console.log(`P7 status=${status} code=${code}`);
  process.exit(status === 404 && code === "workspace-not-found" ? 0 : 1);
} else if (mode === "ensure") {
  const { status, body, code } = await call("PUT");
  if (status !== 200 || typeof body?.id !== "string") {
    console.error(`API ensure FAIL status=${status} code=${code}`);
    process.exit(1);
  }
  console.log(workspaceNames(process.env.WORKSPACE_INSTANCE ?? "", body.id).container);
} else if (mode === "delete") {
  const { status, code } = await call("DELETE");
  const isGone = status === 204 || (status === 404 && code === "workspace-not-found");
  console.log(`API delete status=${status} code=${code}`);
  process.exit(isGone ? 0 : 1);
} else {
  console.error(`API FAIL unknown mode ${mode}; expected reach, ensure or delete`);
  process.exit(2);
}
