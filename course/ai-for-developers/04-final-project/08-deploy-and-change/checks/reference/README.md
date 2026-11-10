# booking-calendar

Будущий сервис записи на звонки в духе Calendly: хост публикует расписание и виды встреч,
приглашённый выбирает свободный слот и бронирует его. В репозитории материалы заказчика, спецификация и
план срезов, API-контракт, движок слотов и HTTP API на Go и страница бронирования на Nuxt; команда `make ci` проверяет всё это сразу; в этом уроке появляются развёртывание в Docker и первое изменение требования.

| Файл | Что в нём |
|---|---|
| `docs/brief.md` | бриф заказчика |
| `docs/interview.md` | протокол интервью с заказчиком |
| `GLOSSARY-MAP.md`, `docs/booking/GLOSSARY.md` | словарь предметной области |
| `docs/spec.md` | спецификация (заполняете вы) |
| `docs/tasks.md` | план вертикальных срезов (заполняете вы) |
| `docs/adr/template.md` | шаблон ADR в форме MADR |
| `contract/main.tsp` | API-контракт на TypeSpec (как скомпилировать его с параметрами проверки, описано в task.md) |
| `Makefile` | цель `build` собирает `bin/slots` и `bin/server`; `gen`, `build-web`, `serve-web` и `ci` описаны в task.md |
| `backend/` | Go-модуль: `internal/slots` (движок слотов), `cmd/server` (HTTP API по контракту), `cmd/slots` (обвязка `bin/slots`: строка JSON на входе, строка JSON на выходе) |
| `testdata/slots/*.json` | случаи движка в формате примеров из `docs/spec.md` |
| `frontend/` | Nuxt 4: зависимости закреплены в `package-lock.json` (`npm ci` в `frontend/`) |
| `compose.yaml`, `backend/Dockerfile`, `frontend/Dockerfile` | локальное развёртывание в Docker (ниже) |
| `AGENTS.md` | правила для агента, который меняет этот репозиторий |

## Развёртывание на своей машине

Нужен Docker с Compose v2. Из корня репозитория:

```sh
docker compose up --build
```

Compose собирает два образа и запускает их:

- `api`: сервер из `backend/` на порту 8080 внутри сети compose, наружу не открыт. Проверка здоровья вызывает сам
  сервер: `/app/server healthcheck` спрашивает `GET /event-types` и завершается с кодом 0 только на ответ 200.
- `web`: страница бронирования из `frontend/`, стартует после того, как `api` стал healthy, и открыта на
  <http://localhost:3000>. Адрес API (`http://api:8080`) задаётся при сборке образа: цель прокси `/api/` Nuxt
  фиксирует в сборке.

Порт `api` наружу не открыт, но страница проксирует `/api/` на него, поэтому расписание и вид встречи создаются
запросами с вашей машины через `web`:

```sh
curl -s -X POST http://localhost:3000/api/schedules -H 'Content-Type: application/json' \
  -d '{"name":"Ирина","timeZone":"Europe/Berlin","weekly":[{"weekday":1,"start":"09:00","end":"17:00"}],"overrides":[]}'
curl -s -X POST http://localhost:3000/api/event-types -H 'Content-Type: application/json' \
  -d '{"title":"Знакомство","durationMinutes":30,"slotIncrementMinutes":30,"bufferBeforeMinutes":0,"bufferAfterMinutes":0,"minimumNoticeMinutes":60,"bookingWindowDays":30,"scheduleId":"<id из ответа>"}'
```

Затем откройте `http://localhost:3000/book/<id вида встречи>?date=<дата>&tz=Europe/Berlin`.

Остановить и удалить контейнеры: `docker compose down`. Данные хранятся в памяти сервера и пропадают вместе с
контейнером `api`.
