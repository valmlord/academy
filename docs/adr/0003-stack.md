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
