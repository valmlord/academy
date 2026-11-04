# Architecture

```
 Browser
   |  HTTP                      WebSocket (terminal), SSE (check stream)
   v                                 |
 apps/web (Next.js, shadcn/ui) ------+--------> services/workspace (Fastify, dockerode)
   |  Drizzle                                     |  Docker Engine API (the only one that sees docker.sock)
   v                                              v
 Postgres (db)                           workspace containers (one per lesson)
   ^                                              |  volume with the learner's files
   |                                              |  agent CLI, key only from env
 packages/db                              checks: command / hidden-task / rubric (mentor)
 packages/lesson-schema  <---- course/ (methodologists' content, validated in CI)
```

## Components
- **apps/web**: catalog, lesson, dashboard, sign-in. Reads the course only through `@academy/lesson-schema`.
  Does not talk to Docker directly.
- **services/workspace**: workspace lifecycle (#31: ensure running, stop, delete, idle stop, reconcile), later
  the terminal (#32), running checks (#34), mentor (Claude Agent SDK) and transcripts. The only service with
  access to Docker (the socket is bind-mounted, ADR-0002 item 1). Reads `course/` read-only at `/course`, to copy
  a lesson's starter into the workspace volume. Its HTTP API is ADR-0010, reachable only from web (client in #32).
- **packages/lesson-schema**: the lesson contract (ADR-0001) and its validator.
- **packages/db**: schema and migrations (Drizzle).
- **images/workspace**: the workspace image.
- **course/**: content. Written by the methodologists, read by the platform.
- **design/**: flows, the design system (tokens) and page prototypes. Written by the design team, read by
  apps/web (ADR-0006).

## Networks (ADR-0002 item 6)
- `default` (`academy_default`): db and web. db is not published on the host unless `compose.db-port.yaml` is
  used.
- `workspace-api` (`academy_workspace-api`, internal, no route out): web and the workspace service, whose port is
  never published.
- `wks-<instance>-net` (created by the workspace service): workspace containers only, with outbound internet;
  they are on no compose network. What they can still reach is the accepted residual of ADR-0002 item 6 (#88).

## Decisions that are costly to change (each has its own ADR)
- Lesson format: ADR-0001
- Workspace runtime: ADR-0002
- Stack: ADR-0003
- Design/dev contract: ADR-0006
- DB schema and progress data model: ADR-0007
- Authentication: ADR-0008
- Course content in the web app: ADR-0009
- Workspace service API: ADR-0010
