# ADR-0003: Стек

- Status: Proposed
- Date: 2026-10-27

## Decision
- Монорепо: pnpm workspaces + Turborepo, Node 22, TypeScript strict везде.
- Web: Next.js (App Router), Tailwind, shadcn/ui.
- Workspace-сервис: Fastify + dockerode + ws.
- БД: PostgreSQL 17, Drizzle ORM и drizzle-kit для миграций.
- Аутентификация: Better Auth (email и пароль).
- Ментор и агентские проверки: Claude Agent SDK; в рабочем месте Claude Code и/или OpenCode.
- Качество: Biome (lint и format), Vitest (unit), testcontainers (интеграция), Playwright (e2e).
- CI: GitHub Actions.

## Why
- Один язык на весь проект: агентам проще держать контекст, общие типы контракта урока
  импортируются и в web, и в workspace.
- shadcn/ui нативно живёт в React, отсюда Next.js, а не Vue.
- Drizzle: схема в TS, явные SQL-миграции, без магии.
- Biome вместо ESLint + Prettier: один быстрый инструмент.

## Alternatives considered
- FastAPI-бэкенд: ближе к рабочему стеку, но два языка и дублирование типов контракта.
- Bun как рантайм (как в Tixter): dockerode и node-pty надёжнее на Node; можно вернуться позже.
