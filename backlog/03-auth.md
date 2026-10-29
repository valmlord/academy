---
title: "feat(web): sign-in and dashboard (Better Auth)"
labels: [type:feature, team:dev, tier:task, area:web]
milestone: "M0 Foundation"
---
Email and password authentication, protected routes, a dashboard page with courses and progress (empty for now). A seed script creates a local user.

Acceptance criteria:
- [ ] a lesson cannot be opened without signing in
- [ ] e2e: sign-in, sign-out, redirect to the sign-in page
- [ ] secrets only in env, `.env.example` updated
