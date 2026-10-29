---
title: "learn(workspace): workspace service, one container per lesson"
labels: [type:feature, team:dev, tier:learn, area:workspace]
milestone: "M1 Workspace"
---
I write this myself. `services/workspace`: Node + Fastify + dockerode. API: create a workspace for a lesson (a copy of `starter/` in a volume), start, stop, delete; a garbage collector for abandoned containers. CPU, memory and pids limits, non-root, no docker socket inside.

What I want to learn: the Docker Engine API, the lifecycle of processes and containers, idempotency, recovery after a restart.

Acceptance criteria:
- [ ] a repeated "create" for the same lesson returns the same workspace (idempotent)
- [ ] after a service restart, containers are picked up again and orphans are removed
- [ ] integration tests on a real Docker
- [ ] ADR-0002 moved to Accepted with refinements
