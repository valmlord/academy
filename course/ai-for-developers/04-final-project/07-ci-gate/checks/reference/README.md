# booking-calendar

Будущий сервис записи на звонки в духе Calendly: хост публикует расписание и виды встреч,
приглашённый выбирает свободный слот и бронирует его. В репозитории материалы заказчика, спецификация и
план срезов, API-контракт, движок слотов и HTTP API на Go и страница бронирования на Nuxt; в этом уроке появляется команда `make ci`, которая проверяет всё это сразу.

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
