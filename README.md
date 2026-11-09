# Academy

A personal learning platform in the spirit of Hexlet. The first course: "AI for developers". All
learning happens in the web interface: theory, a workspace with a terminal and an agent in a Docker
container, checks, mentor review, progress on the dashboard.

Three agent teams build the platform, the course and its design, and the process works like a real product team:
tasks in GitHub Issues, branches, PRs, CI, ADRs. Some platform tasks (`tier:learn`) I write myself,
while the agents design and review.

## Where things are

```
docs/learning-process.md  how learning works (start here)
docs/architecture.md      platform components
docs/adr/                 architecture decisions
docs/course-reference.md  reference course program
packages/lesson-schema/   lesson contract between the teams + validator
course/                   course content (written by the methodologists)
design/                   flows, design system and page prototypes (written by the design team, ADR-0006)
scripts/                  design token validator (ADR-0006)
tests/design/             tests of the design token validator
```

### Citations of working notes

Designs, research notes and judge reviews are working notes kept on the author's machine; they are not
published. Comments and docs cite them by short ids: "design 4.Q5", "design §3", "(design 0.2)",
"decision A5", "deviation D1", "assumption A15", "(Arch A4)", "O N2", "research §2", "round-4 advisory",
"judge_ux round 1", or a bare id such as "(A17)" or "(U1)" that the file does not define. Such an id cites
the notes of the pull request that first added it to that file:
`git log --reverse --format=%s -S '<id>' -- <file> | head -1` prints that commit, whose subject ends with
the pull request number; the pull request names its issue. A citation that names its issue ("the #50 design
notes") says so itself. F, R and AC ids are defined in `design/flows/` and `design/pages/*/acceptance.md`.

## Getting started

Requirements: Node 22, pnpm 10, Docker, git, gh, python3.

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm content:validate
cp .env.example .env
printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
printf 'WORKSPACE_SERVICE_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
docker compose up -d --build --wait
```

## Web app

`apps/web` applies the database migrations at startup and exits if the database is down or a migration
fails, so start the database first. It also exits when `BETTER_AUTH_SECRET` is missing, shorter than 32
characters or Better Auth's public default. Append a generated one to the root `.env` without printing
it: `printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env`. Every compose command that reads
the file needs it, including `docker compose up -d --wait db`, and so does `pnpm dev`. Every compose
command also needs `WORKSPACE_SERVICE_SECRET` (at least 32 characters), appended the same way:
`printf 'WORKSPACE_SERVICE_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env`.

The database is not published on the host by default. `pnpm dev`, `pnpm seed` and DB clients reach it only
while the shell that starts it has exported `COMPOSE_FILE=docker-compose.yml:compose.db-port.yaml`, which adds
`127.0.0.1:5432` (`DB_PORT`). While that port is published on Docker Desktop, every running workspace
container reaches Postgres as the superuser (on Linux, as in CI, neither the host path nor the db container's
IP was observed reachable), an accepted residual until the workspace egress filter ships
([ADR-0002](docs/adr/0002-workspace-runtime.md) item 6, residuals 1, 2 and 5, #88). So stop workspaces first
(command under "Workspace service") and, when done, unset the variable and recreate db without the port:

```bash
# stop workspaces first (see "Workspace service")
export COMPOSE_FILE=docker-compose.yml:compose.db-port.yaml
docker compose up -d --wait db   # the database alone, on 127.0.0.1:5432
pnpm dev                         # http://localhost:3000, reads DATABASE_URL from the root .env
# when done, in the same shell:
unset COMPOSE_FILE
docker compose up -d --wait db   # db recreated without the host port
```

```bash
docker compose up -d --build --wait   # the whole stack, web on http://127.0.0.1:3080 (WEB_PORT)
```

Always pass `--build` after a change: compose tags the images `academy-web:local` and
`academy-workspace-service:local`, and `up` without `--build` reuses stale ones.

### Course content

The catalog and lesson pages read `course/` at request time (ADR-0009). The image carries a copy of the
learner-visible files only, in `/app/course`: `course.yaml`, every listed `module.yaml`, and `lesson.yaml`,
`theory.md`, `task.md` of every listed lesson; never `checks/`, `starter/` or `quiz.yaml`. So a content change
shows up in the compose stack only after `docker compose up -d --build`; `pnpm dev` shows it on reload.
`bash apps/web/scripts/check-image-course.sh` checks the image against the current `course/` and prints the
lines `C1 OK` to `C4 OK`.

`COURSE_ROOT` names the directory that holds the course, as an absolute path. Unset, `pnpm dev` reads the
repository's `course/`; the image sets `/app/course`; a relative path puts the course pages into their course
error state and logs `web: course read failed: COURSE_ROOT: must be an absolute path`. The line
`web: course read failed: .: missing` means the course root itself does not exist: `COURSE_ROOT` points
nowhere, or the image was built without `/app/course`.

`ACADEMY_SKIP_ROOT_ENV` is for isolated test runs that must not read the root `.env`. Unset, which is the
normal case, `pnpm dev`, `pnpm build`, `pnpm seed` and `pnpm test:e2e` load the root `.env` exactly as
before. Exported as `1`, they skip it and print `root .env not loaded: ACADEMY_SKIP_ROOT_ENV=1` on stderr;
any other value stops startup with an error naming the variable. `COMPOSE_ENV_FILES=/dev/null` is the
compose counterpart. Export both in the shell, never in `.env`. Compose then reads no `.env` at all, so an
isolated compose run passes `BETTER_AUTH_SECRET` and `WORKSPACE_SERVICE_SECRET` in its own environment
(`services/workspace/test/manual/isolated-stack.sh` generates throwaway ones).

### Signing in

The platform has one user, created by a seed script; there is no sign-up. From the repository root:

1. `ls .env`; if it is missing, `cp .env.example .env`.
2. Append both secrets as above; `grep -c '^BETTER_AUTH_SECRET=' .env` and
   `grep -c '^WORKSPACE_SERVICE_SECRET=' .env` each print `1`.
3. Open `.env` in an editor and add `SEED_EMAIL=...` and `SEED_PASSWORD=...` (8 to 128 characters). The
   file is git-ignored. Never type the password on a command line, where the shell history keeps it.
4. Stop workspaces first (command under "Workspace service"), then
   `export COMPOSE_FILE=docker-compose.yml:compose.db-port.yaml` and
   `docker compose up -d --build --wait` (web applies the migrations, including the auth tables; db gets its
   host port for the seed).
5. In the same shell, `pnpm seed` prints `seed: created` (it builds `@academy/db` and `@academy/lesson-schema`
   first). To keep the password out of `.env`, in zsh: `read -rs "SEED_PASSWORD?Seed password: " && export
   SEED_PASSWORD && SEED_EMAIL=you@example.com pnpm seed; unset SEED_PASSWORD`.
6. Open http://127.0.0.1:3080 and sign in with those values.
7. `unset COMPOSE_FILE` and `docker compose up -d --wait db`: db loses its host port again (ADR-0002 item 6).

To change the password, change `SEED_PASSWORD` in `.env`, stop workspaces, export
`COMPOSE_FILE=docker-compose.yml:compose.db-port.yaml`, run `docker compose up -d --wait db` and then
`pnpm seed` again: it prints `seed: updated` and ends every existing session. Afterwards `unset COMPOSE_FILE`
and run `docker compose up -d --wait db` once more. The seed refuses to create a second user.

End-to-end tests sign in with the same `SEED_EMAIL` / `SEED_PASSWORD` and run against the compose stack.
A Playwright trace of a failed local run can hold the typed password; `test-results/` is git-ignored,
delete it when you share a machine.

```bash
pnpm --filter @academy/web exec playwright install chromium --only-shell   # once
pnpm test:e2e                    # E2E_BASE_URL overrides http://127.0.0.1:3080
```

Plain `pnpm test:e2e` against your own stack skips the specs that type into a terminal (`terminal.spec.ts`,
`region-keys.spec.ts`), so it runs no commands in your workspaces and writes no `lesson_progress` rows. It still
opens lesson pages, which starts those lessons' workspaces and can take over a terminal you have open on one of
them. `E2E_TERMINAL=1` runs the terminal specs; only CI and `isolated-stack.sh --e2e` set it, so do not set it
against your own stack. `E2E_WEBKIT=1` adds the region-key spec in WebKit (once:
`pnpm --filter @academy/web exec playwright install chromium webkit`); `E2E_FIREFOX=1` adds it in Firefox as the last
project (`playwright install firefox`), which does not launch on macOS 27 with Playwright's Firefox build 1555. Each switch is `1` or unset
(any other value stops the run); export it in the shell, never in `.env`.

`apps/web/app/globals.css` carries `design/system/tokens.css` verbatim between the `design-tokens`
markers, and `pnpm test` fails when they differ. When a DESIGN PR changes `tokens.css`, its CI goes red;
the orchestrator opens a dev HOTFIX issue "re-copy the token block" whose branch is cut from the DESIGN
branch and whose PR targets it (`gh pr create --base <design-branch>`). The coder copies the file between
the markers and nothing else. GitHub does not close an issue from a PR into a non-default branch, so that
issue is closed by hand after the DESIGN PR merges. A re-copy that changes more than 5 lines runs as
TASK, not HOTFIX.

## Workspace service

`services/workspace` runs one Docker container per learner and lesson (ADR-0002, its HTTP API in ADR-0010).
Compose starts it as `workspace`, on the internal network `workspace-api` only: no host port, no route to
db; web calls it at `http://workspace:4100` with `WORKSPACE_SERVICE_SECRET` (#32, "Browser terminal" below).
It drives Docker through the mounted socket, which is root on the Docker VM. Its workspaces are named
`wks-local-...`, carry the labels `academy.workspace.managed=true` and `academy.workspace.instance=local`, keep
the learner's files in a volume `wks-local-...-files` (kept when a workspace stops) and share the network
`wks-local-net`, which has outbound internet for the agent. Lesson images arrive with #33; until then
`WORKSPACE_IMAGE=node:22.23.4-alpine` in `.env` lets a workspace start.

Each workspace gets at most 2 CPUs, 2 GiB of memory without swap and 512 processes, and stops after 30 idle
minutes (`.env.example` lists the variables). Docker Desktop's default VM of about 7.75 GiB holds db, web and
three busy workspaces. `WORKSPACE_CPU_LIMIT` must not exceed the CPUs Docker has
(`docker info --format '{{.NCPU}}'`); a larger value fails every start with 502 `docker-error`, and the
service log shows `Docker API error during create container (status 400)`.

Workspaces outlive the service: stopping or removing `workspace` leaves them running. Stop them all:

```bash
docker ps -q --filter label=academy.workspace.managed=true --filter label=academy.workspace.instance=local \
  | xargs -r docker stop
```

Rollback (a `git revert` of the #31 commits): first run the stop command above, because the reverted compose
publishes db on the host again and running workspaces would reach it. Then `docker compose up -d --remove-orphans`
removes the orphaned `workspace` container. It leaves the network `academy_workspace-api` behind; remove it with
`docker network rm academy_workspace-api`. The workspaces' volumes stay for a later return.

`services/workspace/test/manual/isolated-stack.sh [t31|t32] [--e2e]` runs a throwaway compose stack next to
yours. The run name (`t31`, the default, or `t32`) picks the project `academy-<run>`, the image tag, the
workspace instance and the host ports (`t31`: 55432 and 53080, `t32`: 55433 and 53081). A preflight stops the
script before anything starts, and so removes nothing, when objects of that project, instance or images are left
over from an earlier run, or when a Docker listing fails. `--e2e` adds the seed, the whole e2e suite with the
terminal specs (the region keys in Chromium and WebKit; Firefox is checked by hand) and the service-down spec.
The last line is `T32 RESULT OK` (the prefix is the run name), or `RESULT FAIL (run rc=..., check status=...,
teardown failed=...)`, where `check status` covers the probes, the red runs and the e2e stages.

### Sweep of test leftovers

The integration tests remove their own objects and sweep those of interrupted runs older than 60 minutes.
To remove leftovers by hand (for example when Docker reports no free network address pool), list them first,
then remove them. Never run the commands of this section while integration tests run: they also take the
objects of a run in progress. Every test object carries `academy.workspace.test-run`, whatever its value (a run
id of 8 hex digits, or `probe-<epoch>` for the network probe's helper, which the tests' own sweep never removes):

```bash
docker ps -a --filter label=academy.workspace.test-run --format '{{.ID}} {{.Names}}'
docker volume ls --filter label=academy.workspace.test-run --format '{{.Name}}'
docker network ls --filter label=academy.workspace.test-run --format '{{.ID}} {{.Name}}'
docker ps -aq --filter label=academy.workspace.test-run | xargs -r docker rm -f
docker volume ls -q --filter label=academy.workspace.test-run | xargs -r docker volume rm
docker network ls -q --filter label=academy.workspace.test-run | xargs -r docker network rm
```

Workspaces the tests create through the service belong to a test instance `t<8 hex digits>-<letter>`, never
`local`. The commands below remove them; without the `| xargs ...` part each one only lists:

```bash
pattern=' t[0-9a-f]{8}-[a-z]$'
docker ps -a --filter label=academy.workspace.instance --format '{{.ID}} {{.Label "academy.workspace.instance"}}' \
  | grep -E "$pattern" | cut -d' ' -f1 | xargs -r docker rm -f
docker volume ls --filter label=academy.workspace.instance --format '{{.Name}} {{.Label "academy.workspace.instance"}}' \
  | grep -E "$pattern" | cut -d' ' -f1 | xargs -r docker volume rm
docker network ls --filter label=academy.workspace.instance --format '{{.ID}} {{.Label "academy.workspace.instance"}}' \
  | grep -E "$pattern" | cut -d' ' -f1 | xargs -r docker network rm
```

## Browser terminal

Every lesson page has an environment region next to the lesson text with one tab, the terminal: a shell (`sh`
until #33) in that lesson's workspace container ([ADR-0011](docs/adr/0011-browser-terminal.md)). Opening a lesson
starts its workspace (created on the first visit, started when stopped); it stops after 30 idle minutes as
before. The browser talks to web's own port (`/api/terminal/socket`), web relays the connection to the workspace
service, and the service keeps one terminal session per learner and lesson. A dropped connection reconnects to
the same session and redraws the screen; a second browser tab on the same lesson takes the session over, and the
first tab offers to take it back. The first key or paste typed into a lesson's terminal records the lesson as
started in the database (an enrollment and an `in-progress` `lesson_progress` row).

**Before the first deploy (until #33 ships the lesson image):** add `WORKSPACE_IMAGE=node:22.23.4-alpine` to the
root `.env` in an editor, and run `docker pull node:22.23.4-alpine` once. Without it every lesson says that the
environment image `academy-workspace:dev` is missing.

- **`pnpm dev` has no terminal.** It runs `next dev` without web's custom server; the lesson's environment says it
  could not start. The terminal works in the compose stack on http://127.0.0.1:3080.
- **The site does not depend on the workspace service.** Web starts after db only. With the service down or
  broken, every page works and only the lesson's terminal says the environment could not start, with a retry
  button; `docker compose up -d --build --wait` then exits non-zero after its wait timeout while web is up.
- **Restarting or rebuilding the workspace service ends every open terminal session.** Each terminal reconnects
  to a new shell; the old shells, and every program started in them, keep running in the background, invisible,
  until the environment stops (idle stop after 30 minutes, or a restart). Files stay. Rebuilding web only makes
  open terminals reconnect to the same session.
- **An open terminal renews its connection silently about every 15 minutes** (`TERMINAL_RELAY_MAX_SECONDS`, 900),
  and each renewal checks the session again: after a sign-out in another tab or a re-key, an open terminal stops
  within that bound and the page shows the session alert. The shell keeps running across a renewal; a text
  selection is cleared. A full-screen program (an editor, `top`) may show a stray cursor or misread the mouse after
  a renewal until it redraws; Ctrl+L redraws it.
- **F6, Shift+F6, Ctrl+Shift+. and Ctrl+Shift+, never reach the shell**: they move focus between the page regions.

Rollback: `git revert` the #32 commits and run `docker compose up -d --build --wait`. The terminal's
`lesson_progress` rows stay valid ADR-0007 rows; nothing needs to be removed.
