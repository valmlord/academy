# Архитектура

```
 Браузер
   |  HTTP                      WebSocket (терминал), SSE (стрим проверок)
   v                                 |
 apps/web (Next.js, shadcn/ui) ------+--------> services/workspace (Fastify, dockerode)
   |  Drizzle                                     |  Docker Engine API (единственный, кто видит docker.sock)
   v                                              v
 Postgres (db)                           контейнеры рабочих мест (по одному на урок)
   ^                                              |  volume с файлами ученика
   |                                              |  агентский CLI, ключ только из env
 packages/db                              проверки: command / hidden-task / rubric (ментор)
 packages/lesson-schema  <---- course/ (контент методистов, валидируется в CI)
```

## Компоненты
- **apps/web**: каталог, урок, кабинет, вход. Читает курс только через `@academy/lesson-schema`.
  Не ходит в Docker напрямую.
- **services/workspace**: жизненный цикл рабочих мест, терминал, запуск проверок, ментор
  (Claude Agent SDK), транскрипты. Единственный сервис с доступом к Docker.
- **packages/lesson-schema**: контракт урока (ADR-0001) и валидатор.
- **packages/db**: схема и миграции (Drizzle).
- **images/workspace**: образ рабочего места.
- **course/**: контент. Пишут методисты, читает платформа.

## Решения, которые дорого менять (у каждого свой ADR)
- Формат урока: ADR-0001
- Среда выполнения рабочих мест: ADR-0002
- Стек: ADR-0003
- Процесс разработки: ADR-0004
- Схема БД, API workspace-сервиса, аутентификация: ADR появятся в соответствующих задачах.
