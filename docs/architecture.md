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
- **services/workspace**: workspace lifecycle, terminal, running checks, mentor
  (Claude Agent SDK), transcripts. The only service with access to Docker.
- **packages/lesson-schema**: the lesson contract (ADR-0001) and its validator.
- **packages/db**: schema and migrations (Drizzle).
- **images/workspace**: the workspace image.
- **course/**: content. Written by the methodologists, read by the platform.
- **design/**: flows, the design system (tokens) and page prototypes. Written by the design team, read by
  apps/web (ADR-0006).

## Decisions that are costly to change (each has its own ADR)
- Lesson format: ADR-0001
- Workspace runtime: ADR-0002
- Stack: ADR-0003
- Design/dev contract: ADR-0006
- DB schema and progress data model: ADR-0007
- Workspace service API, authentication: their ADRs will come with the corresponding tasks.
