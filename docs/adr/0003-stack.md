# ADR-0003: Stack

- Status: Proposed
- Date: 2026-10-27

## Decision
- Monorepo: pnpm workspaces + Turborepo, Node 22, TypeScript strict everywhere.
- Web: Next.js (App Router), Tailwind, shadcn/ui.
- Workspace service: Fastify + dockerode + ws.
- DB: PostgreSQL 17, Drizzle ORM and drizzle-kit for migrations.
- Authentication: Better Auth (email and password).
- Mentor and agent checks: Claude Agent SDK; in the workspace, Claude Code and/or OpenCode.
- Quality: Biome (lint and format), Vitest (unit), testcontainers (integration), Playwright (e2e).
- CI: GitHub Actions.

## Why
- One language for the whole project: easier for agents to keep the context, and the shared lesson
  contract types are imported by both web and workspace.
- shadcn/ui lives natively in React, hence Next.js rather than Vue.
- Drizzle: schema in TS, explicit SQL migrations, no magic.
- Biome instead of ESLint + Prettier: one fast tool.

## Alternatives considered
- FastAPI backend: closer to the stack used at work, but two languages and duplicated contract types.
- Bun as the runtime (as in Tixter): dockerode and node-pty are more reliable on Node; can be revisited later.

## Amendments
- #1 (Proposed): shadcn/ui is initialised on Radix (`-b radix`, preset nova, style `radix-nova`), because
  the design system inventory (`design/system/README.md`) is written against shadcn's Radix docs;
  switching later means regenerating every component.
- #31 (Proposed): the workspace service (`services/workspace`) adds these choices.
  - `dockerode@5.0.1` without `@types/dockerode`: a local declaration (`src/docker/dockerode.d.ts`) types every
    result as `Promise<unknown>`, and zod validates each response before use, because the community types put
    `any` in dozens of places. Only `src/docker/engine.ts` imports dockerode (a unit test walks `src/` for it).
  - `tar-stream@3.2.2` builds the starter archive in memory, because the service sets owner, group and mode per
    entry and refuses symlinks before packing.
  - zod at the HTTP boundary (path parameters parsed in each handler), without a Fastify type provider.
  - `fast-check@4.10.2` (dev) for property-based unit tests.
  - Integration tests run against the real Docker daemon; their helpers create, inspect and remove test objects
    with the `docker` CLI, a second path to the daemon independent of the engine code under test.
  - `fastify@5.12.7` exact, with a known advisory, GHSA-3qgw-9275-xf8w (medium, affected `>=5.8.0 <5.12.8`): an
    uncaught `ERR_HTTP_HEADERS_SENT` ends the process when a nonzero `handlerTimeout` meets a streaming response.
    It is not reachable while `handlerTimeout` stays `0` (no option passes one) and no route streams (every route
    answers a small JSON body or 204). A unit guard pins it: a spy on the Fastify constructor asserts it is called
    once with no `handlerTimeout` key, and the route table asserts that no route declares one. 5.12.8, the fixed
    release, was published on 2026-11-02 and was too new to take; the bump to 5.12.8 is planned once it is two
    weeks old (after 2026-11-16) and before #32 adds a streaming response or a nonzero `handlerTimeout`. The guard
    stays after the bump.
- #32 (Proposed): the browser terminal (ADR-0011) adds these choices.
  - Workspace service: `@fastify/websocket@11.3.4` (11.3.6, which answers `HEAD` on WebSocket routes with 404, was
    too new; the terminal route sets `exposeHeadRoute: false`, declares its own HTTP `handler` next to `wsHandler`,
    and is declared in a child plugin so `buildApp` stays synchronous), `ws@8.22.0` pinned through `overrides` in
    `pnpm-workspace.yaml` until the fastify 5.12.8 bump removes the pin (not a direct dependency), `@types/ws@8.18.2`
    (dev), `@xterm/headless@6.0.0` (CommonJS: default import, then destructure; `allowProposedApi` for serialize) and
    `@xterm/addon-serialize@0.14.0` for the server-held screen.
  - Web: `@xterm/xterm@6.0.0`, `@xterm/addon-fit@0.11.0`, `zod@4.6.7` (the service's version, for the service
    client in the bundle), `fast-check@4.10.2` (dev); a custom server compiled with `tsc` that imports only `node:*`
    and `next` (ADR-0011 item 2).
  - GHSA-3qgw-9275-xf8w stays unreachable with the terminal route. The advisory needs both a nonzero
    `handlerTimeout` and a route that answers with a streaming response through Fastify's reply. `handlerTimeout`
    stays `0` (the #31 guard still asserts the constructor gets none and no route declares one; the terminal route
    is in the route table it walks). The terminal route sends no streaming reply: its HTTP `handler` answers a small
    JSON 404, and for an upgrade `@fastify/websocket` calls `reply.hijack()`, after which Fastify never writes to the
    response; the 101 answer and every frame are written by `ws` on the raw socket. The bump to 5.12.8 stays planned
    after 2026-11-16 as its own change; the guard stays after it.
