# ADR-0002: Workspaces: local Docker, one container per lesson

- Status: Proposed (to be refined in the LEARN task "workspace service")
- Date: 2026-10-27
- Issue: (bootstrap)

## Context
Learning happens entirely through the web. The course is about working with agents, so practice
needs a real environment: shell, git, an agent CLI, a repository. There is one user, and the
platform runs locally. The internet connection may be unstable.

## Decision
- The whole platform runs via `docker compose` on the learner's computer.
- `services/workspace` manages the containers through the Docker Engine API (dockerode). Only it
  has access to `docker.sock`.
- One container per (learner, lesson) pair. Files live in a named volume and survive a restart.
- Limits: CPU, memory, pids; non-root; no `--privileged`; no docker socket inside; outbound
  network allowed (the agent needs the model API), no access to internal services.
- Terminal: `docker exec` with a TTY over WebSocket.
- Checks run in the container; `checks/` is mounted read-only only into the grader process
  for the duration of the check. hidden-task runs in a separate copy of the workspace.
- The `WorkspaceRuntime` layer (an interface) separates the logic from Docker, so that later it is
  possible to move to a VPS or cloud sandboxes (E2B, Daytona) by replacing the adapter.

## Alternatives considered
- Cloud sandboxes right away: faster start, but paid, and dependent on the service and the internet.
- VPS: access from anywhere, but an agent with a shell on a server on the internet requires serious
  isolation; not needed for a single user.
- Pyodide in the browser: unsuitable, a real shell and an agent CLI are needed.

## Consequences
- Docker Desktop (or an equivalent) is required on the learner's machine.
- The workspace service becomes the most complex component. It is implemented in LEARN tasks.
