---
title: "feat(db): схема v1 и миграции (Drizzle)"
labels: [type:feature, team:dev, tier:task, area:db]
milestone: "M0 Фундамент"
---
`packages/db`: Drizzle, схема v1 (users, enrollments, lesson_progress, attempts, check_results, mentor_reviews), миграции через drizzle-kit, интеграционные тесты на настоящем Postgres (testcontainers).

Критерии приёмки:
- [ ] миграции применяются на пустую базу и повторно не ломаются
- [ ] попытка хранит: lesson id, статус, результаты проверок, ссылку на транскрипт
- [ ] интеграционные тесты в CI
- [ ] ADR о модели данных прогресса
