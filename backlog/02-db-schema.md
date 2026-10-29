---
title: "feat(db): schema v1 and migrations (Drizzle)"
labels: [type:feature, team:dev, tier:task, area:db]
milestone: "M0 Foundation"
---
`packages/db`: Drizzle, schema v1 (users, enrollments, lesson_progress, attempts, check_results, mentor_reviews), migrations through drizzle-kit, integration tests on a real Postgres (testcontainers).

Acceptance criteria:
- [ ] migrations apply to an empty database and do not break when applied again
- [ ] an attempt stores: lesson id, status, check results, a link to the transcript
- [ ] integration tests in CI
- [ ] an ADR on the progress data model
