# ADR-0002: Workspaces: local Docker, one container per lesson

- Status: Proposed (refined by #31; becomes Accepted when Stepan accepts it in the PR)
- Date: 2026-10-27, refined 2026-11-03
- Issue: (bootstrap), refined by #31

## Context
Learning happens entirely through the web. The course is about working with agents, so practice
needs a real environment: shell, git, an agent CLI, a repository. There is one user, and the
platform runs locally. The internet connection may be unstable.

## Decision
- The whole platform runs via `docker compose` on the learner's computer.
- `services/workspace` manages the containers through the Docker Engine API (dockerode). Only it
  has access to `docker.sock`.
- One container per (learner, lesson) pair. Files live in a named volume and survive a restart.
- Limits: CPU, memory, pids; non-root; no `--privileged`; no docker socket inside; outbound network allowed (the
  agent needs the model API); no access to the platform's internal services by any container address or the
  bridge gateway (db in the default stack and the workspace service; proved by the probe in item 6); web and a
  published db are reachable only as the accepted residuals of item 6, which last until the workspace egress
  filter ships (#88), and after it for every workspace created before it unless #88 re-creates existing ones.
- Terminal: `docker exec` with a TTY over WebSocket.
- Checks run in the container; `checks/` is mounted read-only only into the grader process
  for the duration of the check. hidden-task runs in a separate copy of the workspace.
- The `WorkspaceRuntime` layer (an interface) separates the logic from Docker, so that later it is
  possible to move to a VPS or cloud sandboxes (E2B, Daytona) by replacing the adapter.

## Refinements (#31)
The numbered items are what the code, compose files and comments cite as "ADR-0002 item <n>".

1. **Service.** Compose service `workspace` (`services/workspace/Dockerfile`, image
   `academy-workspace-service:${WORKSPACE_SERVICE_IMAGE_TAG:-local}`), with the Docker socket bind-mounted
   (`/var/run/docker.sock`), `course/` read-only at `/course`, running as root with `cap_drop: [ALL]`,
   `no-new-privileges:true` and a read-only root filesystem, `init: true`, `restart: unless-stopped`, on the
   `workspace-api` network only, no published port. No socket proxy (Stepan, 2026-11-02). The socket is root on
   the Docker VM: whoever controls the service controls every container and volume on that daemon, the owner's
   `academy_db-data` included. Root without capabilities can use the socket (probe P7, an authorized `GET` of a
   missing workspace from inside the service container, which must answer 404, not 503):
   - Mac (Docker Desktop 29.9.2, isolated recipe): `P7 status=404 code=workspace-not-found`; with the socket
     mount removed, `P7 status=503 code=docker-unavailable`.
   - CI (Ubuntu 24.04.5 LTS, e2e step "workspace service reaches Docker"): `P7 status=404 code=workspace-not-found`.
2. **Auth.** `Authorization: Bearer <WORKSPACE_SERVICE_SECRET>` on every route except `GET /healthz`; the secret
   has at least 32 characters; the header value and the secret are both hashed with SHA-256 and compared with
   `timingSafeEqual`. The service port is never published; only web shares a network with it.
3. **Identity.** Workspace id = the first 20 hex digits of SHA-256 over instance, user id, course id and lesson id
   joined with NUL. Names: container `wks-<instance>-<id>`, volume `wks-<instance>-<id>-files`, network
   `wks-<instance>-net`. Eight labels (`academy.workspace.managed`, `.schema`, `.instance`, `.role`, `.id`,
   `.user`, `.course`, `.lesson`; the last four not on the network), immutable after create. Every list filters
   `managed=true` and this instance. One service process per instance (`WORKSPACE_INSTANCE`, compose sets
   `local`). The per-key lock key is the container name. Names are never trusted: every destructive call checks
   the labels of a fresh inspect first.
4. **Files.** The volume is mounted at `/workspace`: `/workspace` root-owned `0755`, `/workspace/.starter-complete`
   root `0444` (the last tar entry, so its presence means the copy finished), `/workspace/home` (`HOME`) and
   `/workspace/home/work` (the starter, the working directory) owned by `1000:1000`. The starter is copied by the
   Engine API's `PUT /archive` from a tar built in memory (at most 8 MiB and 2,000 entries). Refusals are by
   effect, not by name: a starter path segment whose folded name (NFKC, default-ignorable code points removed,
   lower case) is `checks` is refused first, which does not depend on the filesystem; then a directory with the
   `(dev, ino)` of the lesson's `checks/`; then symlinks anywhere below the course root, hard links (`nlink > 1`),
   any entry with the identity of a grader file, special files, and a file that changed between the walk and the
   read. Probe P8 (`lstat` of `checks`, `Checks` and the KELVIN SIGN spelling on the read-only bind mount of
   `course/`, inside a container):
   - Mac (Docker Desktop 29.9.2): `P8 outcome=same os=Docker Desktop`
   - CI (`db` job): `P8 outcome=enoent os=Ubuntu 24.04.5 LTS`

   Neither outcome is `distinct` or `mixed`, so the identity line and the grader identity set also hold on both
   bind mounts; the folded-name line refuses the variants before any lookup either way.
5. **Limits and hardening.** CPU `WORKSPACE_CPU_LIMIT=2`, memory `WORKSPACE_MEMORY_LIMIT=2g` with swap equal to
   memory, `WORKSPACE_PIDS_LIMIT=512`, `OomScoreAdj` 500 (the kernel picks a workspace before Postgres when the VM
   runs out of memory), user `1000:1000`, `CapDrop: ALL`, `no-new-privileges:true`, read-only root filesystem,
   `/tmp` a 256 MiB tmpfs (`rw,nosuid,nodev,exec`), `Init: true`, `Cmd` `sleep infinity`, restart policy `no`,
   `StopTimeout` 10 s, `Env` exactly `HOME=/workspace/home`, one network, one volume mount. The create body is an
   exact allowlist of keys; adding a key is a reviewed change. The spec, the hardening and the limits apply when a
   container is created: an existing container whose labels match the key (a stopped one, or one never started) is
   started as it is, so it keeps the image, HostConfig and network it was created with until `DELETE`. A later change
   that must reach existing workspaces (a tighter spec, new limits, the egress filter of #88) therefore re-creates
   them, either by bumping the label schema or a spec-version label, or by comparing the HostConfig before a start
   and re-creating on a difference; neither exists in #31 and both are follow-up work. Residual: named volumes have
   no disk quota, so a workspace can fill the Docker VM disk that also holds `academy_db-data`.
6. **Network.** Three zones: `default` (`academy_default`: db, web); `workspace-api` (`academy_workspace-api`,
   `internal: true`: web and the workspace service); `wks-<instance>-net` (created by the service, not internal:
   workspace containers only). Docker isolates different user-defined bridges from each other, and workspaces are
   on no compose network. db is not published on the host by default; `compose.db-port.yaml` adds
   `127.0.0.1:${DB_PORT:-5432}:5432` as an opt-in, selected per shell with
   `export COMPOSE_FILE=docker-compose.yml:compose.db-port.yaml`. The network probe
   (`services/workspace/test/network/probe-isolation.sh`) results, including the observed W1, W2a/W2b and D2
   (published) values, as printed:

   Mac (Docker Desktop 29.9.2, isolated recipe, project `academy-t31`; web published as `127.0.0.1:53080`, web on
   `default` at 172.20.0.3 and on `workspace-api` at 172.19.0.3). Run `--rows c2`, with `compose.db-port.yaml`:
   ```
   NP platform Docker Desktop
   NP setup workspace wks-t31-0946a65f3f63d4462294
   NP setup gateway 172.21.0.1 host.docker.internal=192.168.65.254
   NP C1 OK 172.21.0.3:8080 REACHABLE
   NP C2 OK host.docker.internal:55432 REACHABLE
   NP result OK
   ```
   Run `--rows all`, default stack (db unpublished):
   ```
   NP platform Docker Desktop
   NP setup workspace wks-t31-0946a65f3f63d4462294
   NP setup gateway 172.21.0.1 host.docker.internal=192.168.65.254
   NP C1 OK 172.21.0.3:8080 REACHABLE
   NP setup db published=none
   NP D1 OK host.docker.internal:55432 UNREACHABLE (ECONNREFUSED)
   NP D1 OK 192.168.65.254:55432 UNREACHABLE (ECONNREFUSED)
   NP D2 OK 172.20.0.2:5432 UNREACHABLE (TIMEOUT)
   NP D3 OK 172.21.0.1:55432 UNREACHABLE (ECONNREFUSED)
   NP S1 OK 172.19.0.2:4100 UNREACHABLE (TIMEOUT)
   NP S2 OK 172.21.0.1:4100 UNREACHABLE (ECONNREFUSED)
   NP S3 OK host.docker.internal:4100 UNREACHABLE (ECONNREFUSED)
   NP S4 OK 192.168.65.254:4100 UNREACHABLE (ECONNREFUSED)
   NP W1 OK (observed REACHABLE: accepted residual, ADR-0002 item 6) 172.20.0.3:3000
   NP W1 OK (observed UNREACHABLE) 172.19.0.3:3000 UNREACHABLE (TIMEOUT)
   NP W2a OK (observed REACHABLE: accepted residual, ADR-0002 item 6) host.docker.internal:53080
   NP W2b OK (observed REACHABLE: accepted residual, ADR-0002 item 6) 192.168.65.254:53080
   NP W2c OK 172.21.0.1:53080 UNREACHABLE (ECONNREFUSED)
   NP E1 OK api.anthropic.com REACHABLE (status 404)
   NP A1 OK web -> workspace:4100/healthz 200
   NP result OK
   ```
   D2 with db published was not probed on the Mac.

   CI (GitHub Actions `ubuntu-24.04`, e2e job "workspace network isolation", project `academy`, run with
   `COMPOSE_FILE=docker-compose.yml:compose.db-port.yaml`, so db is published on `127.0.0.1:5432`; draft PR #91,
   run 41677046685):
   ```
   NP platform Ubuntu 24.04.5 LTS
   NP setup workspace wks-local-c242617cf8cf92d6fd3e
   NP setup gateway 172.20.0.1 host.docker.internal=UNRESOLVED
   NP C1 OK 172.20.0.3:8080 REACHABLE
   NP setup db published=5432
   NP D1 OK host.docker.internal:5432 UNRESOLVED
   NP D1 SKIP (unresolved)
   NP D2 OK (observed UNREACHABLE) 172.19.0.2:5432 UNREACHABLE (TIMEOUT)
   NP D3 OK 172.20.0.1:5432 UNREACHABLE (ECONNREFUSED)
   NP S1 OK 172.18.0.2:4100 UNREACHABLE (TIMEOUT)
   NP S2 OK 172.20.0.1:4100 UNREACHABLE (ECONNREFUSED)
   NP S3 OK host.docker.internal:4100 UNRESOLVED
   NP S4 SKIP (unresolved)
   NP W1 OK (observed UNREACHABLE) 172.18.0.3:3000 UNREACHABLE (TIMEOUT)
   NP W1 OK (observed UNREACHABLE) 172.19.0.3:3000 UNREACHABLE (TIMEOUT)
   NP W2a OK host.docker.internal:3080 UNRESOLVED
   NP W2b OK UNRESOLVED:3080 UNRESOLVED
   NP W2c OK 172.20.0.1:3080 UNREACHABLE (ECONNREFUSED)
   NP E1 OK api.anthropic.com REACHABLE (status 404)
   NP A1 OK web -> workspace:4100/healthz 200
   NP result OK
   ```

   > **Residual: workspace egress (accepted by Stepan, 2026-11-02, Q-W1 option (a); follow-up #88, egress filter
   > for workspace networks).** Workspace containers have unrestricted outbound network. Until the egress filter
   > ships, and after it for every workspace created before it unless #88 re-creates it (item 5):
   > 1. **Mac loopback.** On Docker Desktop, `host.docker.internal` (and its IP) forwards to every listener on the
   >    Mac's `127.0.0.1`. Every workspace reaches web on `WEB_PORT` (3080), `pnpm dev` on 3000, any other local
   >    server, and the db port whenever `compose.db-port.yaml` is in use. On Linux a `127.0.0.1` publish is not
   >    reachable from a bridge (probe rows D3 and W2c on CI: the gateway path; `host.docker.internal` does not
   >    resolve there, so D1/W2a/W2b prove nothing on Linux).
   > 2. **The db override reopens the superuser.** While `compose.db-port.yaml` is in use on a platform where item 1
   >    or 5 holds (Docker Desktop; neither was observed on Linux CI), every workspace connects to Postgres as
   >    `academy`, a superuser, with the documented default password `academy` (unless the owner changed it before the
   >    volume was first created): read and write every table, including `sessions` (a valid session token signs in as
   >    the owner) and password hashes, and run shell commands as the `postgres` user in the db container through
   >    `COPY ... TO PROGRAM`; from there the db container reaches web on `default`. The override stays active
   >    wherever `COMPOSE_FILE` is set: an open terminal, a shell profile, or a line in the owner's `.env` (the
   >    repository checks only `.env.example`). `pnpm dev`, the main reason to use the override, is also when
   >    workspaces run. Mitigation, not enforced: the README tells to stop workspaces first and to
   >    `unset COMPOSE_FILE` afterwards; the override file's header says the same.
   > 3. **Web is reachable and sits next to the socket holder.** Where item 1 or 5 holds (Docker Desktop; neither was
   >    observed on Linux CI), a workspace reaches every web route: public pages, the sign-in endpoint (rate-limited;
   >    whether workspace requests share the browser's rate-limit bucket is unverified, so a workspace hammering
   >    sign-in may lock the owner out for the window), and every authenticated route with a stolen session. Web is
   >    the only container on `workspace-api` besides the workspace service, which holds the Docker socket (root on
   >    the Docker VM: every workspace, the owner's `academy_db-data`); from #32 web also holds
   >    `WORKSPACE_SERVICE_SECRET`. Code execution in web is therefore one hop from the socket.
   > 4. **LAN.** Listeners on the Mac's LAN addresses (anything bound to `0.0.0.0`) and other LAN hosts (router
   >    admin pages, NAS, printers) are reachable. Not probed.
   > 5. **Published ports by container IP; what is not reachable.** On Docker Desktop (observed on 29.9.2), a port
   >    that a container on another bridge publishes on the host, even on `127.0.0.1` only, is reachable from
   >    workspace containers by that container's IP: web's 3000 always (probe row W1, web on `default`), db's 5432
   >    while `compose.db-port.yaml` is in use (inferred from web, not probed on the Mac). On Linux (CI, Ubuntu
   >    24.04.5 LTS) both were observed unreachable, db published (probe rows W1, D2 above). The residual lasts until
   >    the egress filter ships (#88) on every platform where it is observed, and for a workspace created before #88
   >    until that workspace is re-created (item 5). Not reachable (probe NP, Mac and CI):
   >    Postgres in the default stack by every path, the workspace service by every path, unpublished ports of other
   >    containers, the bridge gateway on the db, service and web ports, other workspace instances' networks.
7. **Lifecycle.** `ensure` is idempotent and converges from every crash point (nothing, volume only, a
   never-started container with or without the starter marker, a stopped or running container). Idle stop after
   `ENVIRONMENT_IDLE_STOP_MINUTES` (30) without activity, with a warning `ENVIRONMENT_IDLE_WARNING_MINUTES` (5)
   before; the sweep runs every 30 s. Restart policy `no`: only the service starts workspaces.
8. **Reconcile and GC.** At startup and every 5 minutes. Never stops or removes a running container on derived
   state (a lesson that left the course is adopted into idle tracking, so idle stop ends it); never removes a
   volume; removes nothing in a pass when the course is unreadable; keeps containers of another label schema,
   running or not. The GC primitives act on `managed=true` + this instance + the state from a fresh inspect by
   Id, so damaged (`invalid`) workspaces of this instance are cleaned up (a running one stopped gracefully, a
   stopped one removed without `force` and without its volume), while a foreign object is never touched.
9. **`WorkspaceRuntime` at the lifecycle level**: `ensureRunning`, `stop`, `remove`, `inspect`, `listManaged`,
   `listManagedVolumes`, and the GC primitives `stopContainer` / `removeContainer` by Id. `DockerRuntime` is the
   one adapter.
10. **Image contract** (#33, `images/workspace`). Every lesson names `academy-workspace:dev` (the schema default),
    built on the learner's machine by `scripts/build-workspace-image.sh`, which tags it only after its smoke test
    passes, and never pulled (the service only inspects it, ADR-0010 item 6 `image-missing`). Ubuntu 24.04 by
    digest, apt packages at exact versions from a dated snapshot; every tarball and binary checked against a pinned
    sha256 (the agent CLI also against its signed manifest); apt and npm verified by their signed indexes and lockfile
    integrity. uid/gid 1000 is `learner` with home `/workspace/home` and no
    supplementary group; `HOME=/workspace/home`, working directory `/workspace/home/work`; nothing under
    `/workspace` in the image; a read-only root filesystem with a writable `$HOME` and `/tmp`; no `ENTRYPOINT`,
    `sleep` accepting `infinity`; the setuid/setgid files are the base's (pinned by the smoke test), and they, like
    any file capability, grant nothing under `no-new-privileges` and `--cap-drop ALL`. Tool
    locations are a contract with the lesson checks and change only together with them: `python3` (3.12), `git`,
    `make`, `rg` in `/usr/bin`; Go at `/usr/local/go`; Node 22 at `/opt/node`; the TypeSpec tools in a read-only
    `/opt/academy/node` with wrappers in `/opt/academy/bin`; the agent CLI in its own directory under `/opt` (the
    `ENV PATH` line of `images/workspace/Dockerfile` names it), never in `/usr/bin`, `/bin` or the `python3`
    directory (#43). `PATH`, `LANG` and `DISABLE_AUTOUPDATER=1` come from the
    image; the create body adds only `HOME` (item 5). No API key is in the image or reaches a workspace (a follow-up
    issue decides how); the learner signs in with `/login`. **Residual**: `/login` stores a long-lived OAuth token in
    the agent CLI's credentials file in the home on each workspace volume. Every process in that workspace runs as
    the same uid and
    can read it, so can anyone holding the Docker socket (the service, or the host user), and a process in the
    workspace can send it out through the outbound network that item 6 leaves open (its residuals). Accepted for
    #33 because the learner is the only user and logs in deliberately; the follow-up issue decides the key and
    login path. **Residual** of the layer scan: it searches raw bytes, so a secret re-encoded inside a file (UTF-16,
    base64) or inside a compressed file in a layer is not found; only the context allowlist
    (`images/workspace/.dockerignore`) keeps such files out of the build. `WORKSPACE_IMAGE` remains an override for
    test runs (the isolated recipe), empty in normal use. A
    rebuilt image reaches only workspaces created after the rebuild: an existing container keeps its image until it
    is removed (item 5; #92 for re-creation).
11. **Engine API v1.44**: every request path carries the version prefix, so a daemon upgrade cannot change the
    shape of a response; every response is validated before use.
12. **Checks** (how `checks/` reaches the grader) are left to #34.
13. **Terminal** (#32, ADR-0011). The decision's "docker exec with a TTY over WebSocket" is a service-held exec per
    workspace: `Cmd [TERMINAL_SHELL, "-l"]` (`TERMINAL_SHELL`, default `/bin/bash` since #33, which the image of
    item 10 has), `User 1000:1000`, `WorkingDir /workspace/home/work`, `Env` adds `TERM=xterm-256color` and
    `LANG=C.UTF-8` to the container's `HOME`; the exec create and start bodies are exact allowlists like the
    container create body.
    Item 9's `WorkspaceRuntime` gains `openShell`. Residual 3 of item 6 is now in effect: web holds
    `WORKSPACE_SERVICE_SECRET` and relays long-lived terminal connections; a workspace that reaches web's port still
    needs a ticket minted for a signed-in session to open one, and malformed requests cannot stop web.

## Alternatives considered
- Cloud sandboxes right away: faster start, but paid, and dependent on the service and the internet.
- VPS: access from anywhere, but an agent with a shell on a server on the internet requires serious
  isolation; not needed for a single user.
- Pyodide in the browser: unsuitable, a real shell and an agent CLI are needed.
- (#31) A socket proxy, userns-remap or rootless Docker: declined by Stepan (2026-11-02); the socket stays root
  on the Docker VM (item 1).
- (#31) An egress filter for workspace networks in #31 (an allowlisting proxy on internal networks): declined by
  Stepan (Q-W1 option (a)), moved to #88 (item 6).

## Consequences
- Docker Desktop (or an equivalent) is required on the learner's machine.
- The workspace service is the most complex component; its HTTP API is ADR-0010.
- Every compose command needs `WORKSPACE_SERVICE_SECRET` in `.env`.
- Host access to the database (`pnpm dev`, `pnpm seed`, a DB client) needs the `compose.db-port.yaml` override,
  which opens residual 2 of item 6 while it is in use.
- Of the stop causes F8's copy lists, "processes" and "CPU" cannot occur: a pids limit makes `fork` fail and a
  CPU limit throttles, neither stops a container; only memory can.
- Rollback (a `git revert` of the #31 commits): the `workspace` service and `academy_workspace-api` become compose
  orphans and `wks-local-*` containers keep running. First run the README stop-by-label command, because the
  reverted compose publishes db on the host again (residual 2 of item 6); then
  `docker compose up -d --remove-orphans`, which removes the `workspace` container but leaves the network
  `academy_workspace-api`, removed with `docker network rm academy_workspace-api` (volumes stay for a later return).
- The workspace image is about 1 GB and is built locally (`scripts/build-workspace-image.sh`)
  from seven download hosts (the Ubuntu apt archive, `snapshot.ubuntu.com`, `go.dev`, `dl.google.com`, `nodejs.org`,
  the agent CLI's release host (named in `images/workspace/Dockerfile`), `registry.npmjs.org`) and Docker Hub; a build
  fails when one of them is down or a pinned file
  changed, and the apt snapshot freezes security fixes until its date is bumped.
