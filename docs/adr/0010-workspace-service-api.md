# ADR-0010: Workspace service API

- Status: Proposed
- Date: 2026-11-03
- Issue: #31

## Context
ADR-0002 puts every Docker call behind `services/workspace`, the only process with the Docker socket. Web
(#32 terminal, #34 checks, the F8-F11 environment states) needs to start, read, stop and delete a learner's
workspace for a lesson, and to tell the service that the learner is still active. The service runs as the compose
service `workspace` on the internal network `workspace-api`, which only web shares with it (ADR-0002 item 6), and
keeps no state of its own: Docker objects and their labels are the only source of truth (ADR-0002 item 3). The
contract between them is costly to change once #32 builds its client on it, so it is fixed here.

## Decision
1. **Base, transport, auth.** Base URL `http://workspace:4100` on `workspace-api`; JSON over HTTP; the port is
   never published. Every route except `GET /healthz` requires `Authorization: Bearer <WORKSPACE_SERVICE_SECRET>`
   (ADR-0002 item 2), unknown routes included: the auth hook runs before the not-found handler. A missing or
   wrong header answers 401 `unauthorized`. Fastify also answers `HEAD` for every `GET` route.
2. **Versioning.** Every route but `/healthz` is under `/v1`. Within `/v1` changes are additive only: new routes
   and new response fields. Removing or renaming a route, a field or an error code, or changing what one means,
   needs `/v2`. The error codes of item 6 are a closed set: adding one is a change of this ADR.
3. **Routes.** `W = /v1/users/:userId/courses/:courseId/lessons/:lessonId/workspace`. `userId` matches
   `^[A-Za-z0-9_-]{1,64}$`; `courseId` and `lessonId` are lesson-schema slugs. Routes take no request body.

   | Method, path | Success | Errors |
   |---|---|---|
   | `GET /healthz` | 200 `{ "ok": true }`, no auth, no Docker call | - |
   | `GET /v1/settings` | 200 `{ idleStopMinutes, idleWarningMinutes, startSlowSeconds }` | 401 |
   | `PUT W` (ensure running) | 200 `Workspace` with `outcome` | 400 `invalid-workspace-key`, 401, 404 `lesson-not-found`, 409 `image-missing`, 422 `lesson-has-no-workspace`, 500 `starter-invalid` / `course-unreadable` / `workspace-identity-mismatch`, 502 `docker-error` / `docker-response-invalid`, 503 `docker-unavailable` |
   | `GET W` | 200 `Workspace` | 400, 401, 404 `workspace-not-found`, 500 `workspace-identity-mismatch`, 502, 503 |
   | `POST W/stop` | 200 `Workspace` (`state: "stopped"`) | 400, 401, 404 `workspace-not-found`, 500 `workspace-identity-mismatch`, 502, 503 |
   | `POST W/activity` | 204 | 400, 401, 409 `workspace-not-running` |
   | `DELETE W` | 204, also when nothing existed | 400, 401, 409 `workspace-busy`, 500 `workspace-identity-mismatch`, 502, 503 |
   | any unknown route, authorized | - | 404 `route-not-found` |
   | Fastify's own client errors (`FST_ERR_CTP_*`, `FST_ERR_BAD_URL`, ...) | - | their 4xx status, `bad-request` |

   Only `PUT` reads the course: `GET`, `stop`, `DELETE` and `activity` work from Docker objects and the validated
   key alone, so a workspace whose lesson left the course stays stoppable and deletable. Restart is `stop` then
   `PUT`; reset is `DELETE` then `PUT`. Responses are synchronous (a create copies a starter of at most 8 MiB).
4. **`Workspace` body.**
   ```
   {
     "id": string,                          derived workspace id (20 hex), not a Docker Id
     "userId": string, "courseId": string, "lessonId": string,
     "state": "running" | "stopped",
     "image": string | null,                null when only the volume exists
     "outcome": "created" | "started" | "running",   PUT only
     "idle": { "stopAt": string, "warningAt": string } | null,
     "exit": { "code": number, "reason": "memory-limit" | "exited" } | null,
     "limits": { "nanoCpus": number, "memoryBytes": number, "pidsLimit": number }
   }
   ```
   - `state`: a volume without a container is `stopped` with `image: null`; neither container nor volume is 404
     `workspace-not-found`.
   - `outcome`: `created` when this call copied the starter (a new container, or a never-started one whose copy
     had not finished), `started` when it started an existing container, `running` when it found it running.
   - `idle`: ISO 8601 UTC timestamps (`Date.prototype.toISOString`). Set on a running workspace the idle tracker
     knows (every one the process ensured or reconcile adopted); `null` otherwise, and always on a stopped one.
   - `exit`: set on a stopped container that has run; `null` while running, for a never-started container and
     for a volume alone. `reason` is `memory-limit` exactly when the container ended with exit code 137 **and**
     Docker recorded an out-of-memory kill in this run of the container; every other ending is `exited`. It is a
     hint for #32's copy, not proof that memory ended the container: an OOM kill of a child followed by a SIGKILL
     of the keeper also reads `memory-limit`. Docker may set the OOM flag after the OOM killer took a non-init
     process while the container went on running; observed on Docker Desktop 29.9.2 (integration test I-oom) for
     such a container stopped gracefully later: `I-oom OOMKilled=true ExitCode=143`, which reads `exited`.
   - `limits`: the configured limits in the units the Docker Engine API takes (`WORKSPACE_CPU_LIMIT=2` is
     `nanoCpus: 2000000000`, `WORKSPACE_MEMORY_LIMIT=2g` is `memoryBytes: 2147483648`). They are the service's
     configured values, not read from the running container: a container keeps the limits it was created with until
     `DELETE` (ADR-0002 item 5), so #32 does not present them as the container's actual limits.
5. **Settings.** `GET /v1/settings` returns `ENVIRONMENT_IDLE_STOP_MINUTES` (default 30),
   `ENVIRONMENT_IDLE_WARNING_MINUTES` (default 5) and `ENVIRONMENT_START_SLOW_SECONDS` (default 10) as
   `idleStopMinutes`, `idleWarningMinutes`, `startSlowSeconds`, so web shows the same numbers the service enforces.
6. **Errors.** Every non-2xx body is `{ "error": { "code": string, "message": string } }`; `image-missing` adds
   `"image"` inside the error object: `{ "error": { "code", "message", "image" } }`. The codes:

   | Status | Code | When |
   |---|---|---|
   | 400 | `invalid-workspace-key` | a path parameter breaks its rule; the message names it (`invalid workspace key: userId`) |
   | 400 or the framework's 4xx | `bad-request` | Fastify rejected the request before a handler (a bad escape such as `/v1/%zz` is 400, an unsupported media type 415); message `the request could not be processed (<FST code>)`, never Fastify's own message |
   | 401 | `unauthorized` | missing or wrong secret; message `missing or invalid credentials` |
   | 404 | `lesson-not-found` | the course has no such lesson |
   | 404 | `workspace-not-found` | neither container nor volume exists |
   | 404 | `route-not-found` | an authorized request to an unknown route |
   | 409 | `image-missing` | the lesson's image (or `WORKSPACE_IMAGE`) is not on the daemon; the service never pulls; a volume the call created is kept for reuse |
   | 409 | `workspace-not-running` | `activity` for a workspace the idle tracker does not know; no Docker call |
   | 409 | `workspace-busy` | `DELETE` while another container still uses the volume |
   | 422 | `lesson-has-no-workspace` | the lesson exists but has no `workspace` section |
   | 500 | `starter-invalid` | the starter was refused (ADR-0002 item 4) or is too large; nothing was copied |
   | 500 | `course-unreadable` | any course file is missing, a symlink, invalid YAML or schema, or a duplicate id: the whole course is unreadable, as in the web (ADR-0009 item 7) |
   | 500 | `workspace-identity-mismatch` | a container or volume under this key's names whose labels do not parse to this key, or a network named `wks-<instance>-net` without the service's labels; nothing changed |
   | 500 | `internal` | anything else; message `internal error` |
   | 502 | `docker-error` | Docker answered with an error status, or a create answered "name taken" while no container of that name could be found after the bounded re-inspects (item 7) |
   | 502 | `docker-response-invalid` | a Docker response did not have the expected shape |
   | 503 | `docker-unavailable` | the socket is missing or refused, or the connection was cut (also how a 30 s inactivity timeout surfaces) |

   Never in a body or a log: the secret, file contents, request headers, Docker's own messages (Docker echoes
   request content, which can hold an API key once #115 passes one into workspaces), container environment.
   Messages name the entity and a closed reason (a relative course path, a parameter name, a Docker operation and
   status). An unlisted error is logged by constructor name and `code` only.
7. **Retries and idempotence.**
   - `PUT W` is idempotent and converges from every crash point (ADR-0002 item 7). A 502 on `PUT W` may be
     retried, ensure is idempotent. A 503 during a create or a starter copy leaves the outcome unknown; the retry
     of the ensure converges as well.
   - `DELETE W` removes the container, then the volume. A crash between them leaves the volume, which `GET`
     reports as `stopped`. The caller retries `DELETE` on any non-204 answer.
8. **Timeout chain** (for #32's client timeout). One ensure is at most 30 engine calls plus at most 0.75 s of fixed
   backoff. The 30 is the counted worst case, with no margin: 16 calls on the first create path (a "name taken"
   answer and up to 5 inspects by name), then 14 for the start-404 retry, whose create can meet the same answer from
   another process. The 0.75 s is two waits of the re-inspect schedule 25, 50, 100, 200 ms. Each call is bounded
   only by a 30 s socket **inactivity** timeout, not a per-call duration: a response that keeps trickling is not
   cut. Calls on one workspace (ensure, stop, delete, idle stop, reconcile actions) queue on its lock behind earlier
   calls; `GET` and `activity` take no lock.
9. **Activity obligations.** The idle stop ends a running workspace after `idleStopMinutes` without activity;
   every `PUT` and every `activity` call moves the window. #32 calls `POST W/activity` on terminal input and
   output, at most once per 30 s per workspace; #34 calls it at the start and at the end of a check. The service
   itself sees no terminal traffic.
10. **Startup order.** The service listens before it talks to Docker (it answers 503 while Docker is down). #32,
    which adds web's client, adds `web.depends_on.workspace: condition: service_healthy` (healthcheck: `GET
    /healthz` every 5 s, timeout 3 s, 20 retries, start period 5 s).
11. **No database.** The service never connects to Postgres; anything durable about a workspace that web needs
    (ADR-0007) is web's to store.
12. **Label schema rule.** Any change that could make existing labels fail to parse under the current `schema`
    label (the user id rule, lesson-schema's slug schema, the id derivation, a label name or the set of required
    labels) bumps `schema`, because a later service then meets old workspaces as `other-schema` (kept by
    reconcile) instead of `invalid` (stopped mid-run and removed). Objects of another label schema under a key's
    names (after a rollback, or a newer service that ran on this Docker): every keyed route (`PUT`, `GET`,
    `stop`, `DELETE` of W) answers 500 `workspace-identity-mismatch` and changes nothing until the other
    version's objects are gone; #32 shows it as "this workspace belongs to another version of the service" rather
    than a generic error.

## Alternatives considered
- **Opaque stored ids**: need a store mapping id to key; a deterministic id from the key makes ownership
  structural and needs no state.
- **Separate create and start calls**: F8 always wants "running"; two calls double the client's failure states.
- **Asynchronous create with polling**: needs a store for pending operations; a create copies at most 8 MiB, so a
  synchronous answer is fast enough.
- **Raw `node:http`**: routing, the not-found and error contract and in-process request tests would be rebuilt by
  hand; Fastify brings them.
- **A new error code (or 409 `image-missing`) for "name taken, no container"**: changes the closed code set of
  this contract for a transient, or gives it the wrong meaning; 502 `docker-error` with a retry is enough.
- **Rethrowing Docker's 409 for "name taken, no container"**: on Docker Desktop 29.9.2 a concurrent create
  answers 409 before the winner's container is inspectable by name, so two concurrent ensures would fail.

## Consequences
- #32 builds its client on this contract: it sizes its timeout from item 8, retries as item 7 says, calls
  `activity` as item 9 says and adds the `depends_on` of item 10.
- Every response field and code is part of `/v1`; a breaking change needs `/v2` and an update of this ADR.
- The service holds no state, so a restart loses only idle windows; reconcile re-adopts running workspaces at
  startup (ADR-0002 item 8).

## Amendments
- #32 (Proposed), 2026-11-04. The terminal of ADR-0011:
  - Item 1: Fastify answers `HEAD` for every `GET` route except `GET W/terminal`, which sets `exposeHeadRoute: false`;
    a `HEAD` on it answers 404 `route-not-found` like any unknown route.
  - Item 8: creating a terminal session takes the workspace's lock; attaching to a live session does not.
  - Item 9 is replaced: "every `PUT` and every `activity` call moves the window, and so does terminal input, a
    terminal resize and terminal output while a browser is attached to the session; output with no browser
    attached does not. The service sees the terminal traffic itself (ADR-0011), so web does not call `activity`
    for the terminal; #34 calls it at the start and at the end of a check. Terminal activity for a workspace the
    idle tracker does not know (after a restart, before reconcile adopts it) is ignored."
  - Item 10, second sentence, is replaced (Stepan, 2026-11-04): "Web does not `depends_on` the workspace service. The
    site (sign-in, dashboard, catalog, lesson text) needs nothing from the service, and with the dependency a
    service that cannot start (no Docker socket, a broken image) would keep the whole site down. Web calls the
    service only on demand (the environment actions and the terminal relay) and shows an unreachable service as the
    Terminal tab's 'start failed' state; a compose unit test asserts that `web.depends_on` names no `workspace`.
    `docker compose up --wait` still exits non-zero while the service is unhealthy, with web running."
    The first sentence (the service listens before it talks to Docker) and the healthcheck stay.
  - Item 5: web reads `ENVIRONMENT_START_SLOW_SECONDS` from its own environment; compose passes the same variable, with
    the same default 10 and range 1-120, to web and to the service, so the lesson page shows the slow-start note
    without a service call before the start (item 10 as amended). `GET /v1/settings` stays unchanged.
  - Item 13 (new), route `GET W/terminal`: a WebSocket upgrade, behind the same Bearer check (401 before the upgrade)
    and key rule (400 `invalid-workspace-key` before the upgrade). A request without an upgrade answers 404
    `route-not-found` and opens no shell. After the upgrade, errors are close codes, not bodies; the protocol, close
    codes and limits are ADR-0011 items 6, 7 and 10. The optional request header `X-Academy-Conn` (16 lowercase hex)
    is a log correlation id only. No new error code. A stop, remove or idle stop of a workspace with a terminal
    session closes its sockets with 4002. A failed exec resize is ignored and logged.
  - Item 11 unchanged: the terminal writes nothing durable; web records "lesson started" (ADR-0007 item 5).
  - Consequences, first bullet: "adds the `depends_on` of item 10" no longer applies (item 10 as amended).
- #101 (Proposed), 2026-11-09. Item 9, last sentence as amended by #32 is replaced: "#34 calls `POST W/activity` at
  the start of a check run, every 30 s while it runs, and at its end." With `ENVIRONMENT_IDLE_STOP_MINUTES` at its
  minimum of 5 and the warning up to 4 minutes before the stop, the warning can fire after 1 minute without activity
  (`services/workspace/src/config.ts`), and a command check may run up to 1800 s; a fixed 30 s cadence, the
  terminal's own, stays below every legal window and needs no new setting in web.
- #106 (Proposed), 2026-11-10. Web calls `POST W/stop` then `PUT W` for restart (the `PUT` only after a stop answered
  `stopped` or 404 `workspace-not-found`), and `DELETE W` then `PUT W` for reset. Reset calls `DELETE` at most 3 times
  in total (two retries, after 500 ms and after 1000 ms, item 7) and never calls `PUT` after a non-204 answer.
  "Продолжить работу" (F10.2) calls `POST W/activity`; it is not terminal activity, so item 9 as amended by #32 and
  #101 still holds. While the environment runs, the lesson page reads `GET W` for `idle`; `GET` takes no lock and
  does not move the idle window. No route, field or error code changes.
