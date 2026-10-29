---
title: "feat(web): apps/web scaffold (Next.js, shadcn/ui, Playwright, Docker)"
labels: [type:feature, team:dev, tier:project, area:web]
milestone: "M0 Foundation"
---
Set up `apps/web`: Next.js (App Router, TypeScript), Tailwind + shadcn/ui, Vitest, Playwright, Dockerfile (multi-stage), a `web` service in docker-compose with a healthcheck, an e2e job in CI.

Acceptance criteria:
- [ ] `pnpm dev` opens the home page with a list of courses (a stub for now)
- [ ] `docker compose up -d --build --wait` starts web and db, the healthcheck is green
- [ ] a Playwright smoke test opens the home page and runs in CI
- [ ] lint/typecheck/test/build pass in CI
