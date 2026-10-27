# ADR-0004: Процесс разработки как в продакшене

- Status: Proposed
- Date: 2026-10-27

## Decision
- Любая работа начинается с GitHub issue (шаблоны: feature, bug, LEARN, module/lesson, ADR).
- Ветка `<type>/<issue>-<slug>`, conventional commits со ссылкой на issue, PR с `Closes #N`.
- `main` защищён: merge только через PR с зелёным CI (squash).
- CI: lint, typecheck, unit, build, content:validate, self-test пайплайна, `docker compose up --wait`;
  e2e добавляется вместе с web.
- PR-гигиена в CI: формат заголовка, ссылка на issue, имя ветки.
- Агентский пайплайн (`.claude/`) обязателен для любой задачи; уровни и фазы в `.claude/pipeline.json`.
- Решения, которые дорого менять, оформляются как ADR.
- Релизы: semver-теги и CHANGELOG (задача RELEASE).

## Consequences
- Защита веток для приватных репозиториев на бесплатном плане GitHub может быть недоступна. Тогда
  правило держится на хуках пайплайна (запрет работы на main) и дисциплине.
