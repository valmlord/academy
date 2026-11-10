# Итоговый проект: развёртывание в Docker и изменение требования

**Твой шаг.** В эталонном плане урока 1 это срез 7: хост поднимает API и страницу одной командой
(REQ-21; номер из спецификации стартера, в своей нумерации он может быть другим). После него проект
живёт дальше: заказчик просит изменение, и его делает агент. Урок проверяет, что репозиторий к
этому готов: `make ci` из урока 7 и правила для агента в `AGENTS.md`.

## Проблема

Образ, собранный "как получилось", работает на ноутбуке и ломается в другом месте:

- `FROM golang` без тега это "latest": через месяц под тем же Dockerfile другая версия Go;
- в последней стадии весь набор для сборки и оболочка, а процесс работает от root;
- последняя стадия `scratch` без базы часовых поясов: `time.LoadLocation("Europe/Berlin")` падает, и
  каждое расписание вне UTC даёт ошибку;
- проверка здоровья вызывает `curl`, а в маленьком образе его нет: контейнер API никогда не
  становится healthy, и страница ждёт его вечно;
- в compose остались `CALENDAR_NOW` и `CALENDAR_BOOKING_DELAY_MS` из тестов: развёрнутый сервис
  живёт в замороженном времени и тормозит каждое бронирование.

Вторая проблема приходит позже. Агент получает новое требование и правит только сервер. Контракт
и сгенерированный клиент остаются старыми, тест на новое поведение никто не пишет. Ему никто не
сказал, в каком порядке здесь делают изменения и когда работа закончена.

## Идея

1. **Многостадийная сборка.** Первая стадия собирает программу со всем инструментарием, последняя
   содержит только результат. Dockerfile reference: "Optionally a name can be given to a new build
   stage by adding `AS name` to the `FROM` instruction", и это имя "can be used in subsequent
   `FROM <name>`". Из другой стадии файлы берёт `COPY --from=<имя>`.
2. **Закреплённые версии.** У `FROM` три формы: `<image>`, `<image>[:<tag>]` и
   `<image>[@<digest>]`. "If you omit either of them, the builder assumes a `latest` tag by default".
   Тег версии или дайджест делает сборку повторимой.
3. **Не root.** `USER <user>[:<group>]` или `USER <UID>[:<GID>]` задаёт пользователя "for the
   remainder of the current stage". В конце последней стадии должен стоять не root.
4. **Проверка здоровья без оболочки.** Образы distroless "do not contain package managers, shells
   or any other programs you would expect to find in a standard Linux distribution". Значит, проверку
   здоровья выполняет сам сервер: у него есть подкоманда, например `server healthcheck`, которая
   спрашивает свой `GET /event-types` и завершается с кодом 0 только на 200.
5. **Наружу только страница.** API доступен странице по имени сервиса внутри сети compose
   (`http://api:8080`), а с вашей машины до него ходят через прокси `/api/` страницы.
6. **Репозиторий, готовый к агенту.** `AGENTS.md` говорит порядок работы (требование, контракт,
   `make gen`, сервер, тесты) и когда работа закончена: `make ci` проходит. Гейт урока 7 ловит
   агента, который пропустил шаг.

## Как это выглядит

Начало и конец Dockerfile сервера (середину напишете сами):

```dockerfile
# syntax=docker/dockerfile:1
FROM golang:1.27.3-trixie AS build
WORKDIR /src
# ... COPY и go build в /out/server

FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=build /out/server /app/server
USER nonroot:nonroot
ENTRYPOINT ["/app/server"]
```

`ENTRYPOINT` в форме exec, JSON-массивом. В образе без оболочки он "must be specified in `vector`
form, to avoid the container runtime prefixing with a shell" (README distroless), а форма shell
запускает программу "as a subcommand of `/bin/sh -c`, which does not pass signals" (Dockerfile
reference). Если `ENTRYPOINT` или `CMD` несколько, действует последний: "Only the last `ENTRYPOINT`
instruction in the Dockerfile will have an effect".

Часовые пояса. Базовый образ `gcr.io/distroless/static` по его README содержит "tzdata". Другой
путь не зависит от образа: пакет Go `time/tzdata` (см. врезку ниже).

Проверка здоровья в compose:

```yaml
services:
  api:
    healthcheck:
      test:
        - CMD
        - /app/server
        - healthcheck
      interval: 5s
```

По справке compose `test` "can be either a string or a list", и у списка "the first item must be
either `NONE`, `CMD` or `CMD-SHELL`". В справке пример записан в одну строку,
`["CMD", "curl", "-f", "http://localhost"]`, но проверка курса принимает только блочный YAML,
поэтому список здесь по строкам. Страница ждёт API через `depends_on` с
`condition: service_healthy`: зависимость должна стать healthy "(as indicated by healthcheck) before starting a
dependent service".

Адрес API для страницы. В уроке 6 цель прокси `/api/` фиксировалась при сборке Nuxt. В образе это
значит: адрес `http://api:8080` нужен уже во время `nuxt build` внутри Dockerfile, например через
`ARG` и `build.args` в compose. `ARG` объявите внутри стадии сборки, после `FROM`: `ARG` до первого
`FROM` выбирает базовый образ, и задавать его через `build.args` курс не даёт.

Две ловушки YAML 1.1:

- `yes`, `no`, `on`, `off` и их варианты в YAML 1.1 логические значения;
- двоеточие в YAML 1.1 "allows expressing integers in base 60": `22:22` без кавычек это число
  1342, а не пара портов. Справка compose прямо советует: `HOST:CONTAINER` "should always be specified as a
  (quoted) string, to avoid conflicts with YAML base-60 float". Пишите `- "3000:3000"`.

Имя стадии. BuildKit приводит его к нижнему регистру (`stageName = strings.ToLower(args[2])` в
`parse.go`). После `FROM ... AS Build` пишите `FROM build`.

Запуск у себя: `docker compose up --build`, флаг `--build` значит "Build images before starting
containers".

> **Go для TS-разработчика: часовые пояса в образе.**
> - **База поясов обычно не в программе.** Пакет `time` ищет файлы базы в системе, и в образе
>   без них пояса не загрузятся.
> - **`time/tzdata`** "provides an embedded copy of the timezone database": если пакет
>   импортирован, то "if the time package cannot find tzdata files on the system, it will use this
>   embedded information".
> - **Где импортировать.** "This package should normally be imported by a program's main
>   package, not by a library": `import _ "time/tzdata"` в `cmd/server/main.go`.
> - **Цена.** "Importing this package will increase the size of a program by about 450 KB".

## Изменение требования через агента

Видимое изменение урока: операция `GET /bookings/{bookingId}`, бронирование с текущим статусом или
404 `not_found`. Дайте её своему агенту и смотрите, идёт ли он по `AGENTS.md`: строка `REQ-NN` в
`docs/spec.md`, операция в `contract/`, `make gen` с коммитом клиента, обработчик в сервере, тест в
наборе урока 7, `make ci`. Набор должен падать на сервере, который отвечает 200 на неизвестный `id`
или показывает отменённое бронирование подтверждённым.

После этого будет скрытое изменение: другое требование, которого вы не видите. Его делает агент в
копии вашего репозитория, и проверка смотрит те же вещи. Подготовить к нему можно только
репозиторий: понятный `AGENTS.md`, строгий `make ci`, тесты, которые падают на нарушенном
поведении.

## Частые ошибки

- `latest` или образ без тега, в том числе в стадии сборки.
- `USER nonroot` в стадии сборки, а последняя стадия без `USER`; или `USER root` после `USER
  nonroot`.
- Проверка здоровья через `curl`, `wget` или `sh -c` в образе без оболочки.
- `ENTRYPOINT /app/server` в форме shell.
- `ports` у `api` "для удобства отладки".
- `compose.override.yaml` или `.env` рядом с `compose.yaml`: `docker compose up` читает их сам, и
  то, что запустится, уже не то, что проверено.
- Незакавыченные `3000:30`, `22:22`, `yes`.
- `CALENDAR_NOW` или задержка в `environment` развёртывания.
- `AGENTS.md` пересказывает README вместо порядка работы и признака "готово".
- Агент правит `schema.d.ts` руками или не добавляет тест: гейт это видит.

## Что делать в практике

Сначала подкоманда проверки здоровья в сервере, потом Dockerfile API и страницы, потом
`compose.yaml` и прогон `docker compose up --build` у себя с выводом в `docs/deploy-run.md`. Потом
README и `AGENTS.md`, потом `GET /bookings/{bookingId}` через агента. Правила статической проверки и
остальных проверок описаны в задании.
