---
title: "feat(web): каркас apps/web (Next.js, shadcn/ui, Playwright, Docker)"
labels: [type:feature, team:dev, tier:project, area:web]
milestone: "M0 Фундамент"
---
Поднять `apps/web`: Next.js (App Router, TypeScript), Tailwind + shadcn/ui, Vitest, Playwright, Dockerfile (multi-stage), сервис `web` в docker-compose с healthcheck, e2e-джоба в CI.

Критерии приёмки:
- [ ] `pnpm dev` открывает главную со списком курсов (пока заглушка)
- [ ] `docker compose up -d --build --wait` поднимает web и db, healthcheck зелёный
- [ ] Playwright smoke-тест открывает главную, работает в CI
- [ ] lint/typecheck/test/build проходят в CI
