# Локальный запуск в Docker

Запускал на своём Mac, Docker 29.9.2. Порт страницы на хосте перенёс с 3000 на 3100 файлом
`ports.override.yaml`: на 3000 у меня уже работает другой стек, и два `web` не поделили бы порт. Сам
`compose.yaml` не менялся, внутри контейнера web по-прежнему слушает 3000.

```yaml
# Moves the R8 page to host port 3100 so the demo run cannot collide with another local stack on 3000.
services:
  web:
    ports: !override
      - "3100:3000"
```

## Сборка и запуск

```sh
docker compose -p calendar-r8-44 -f compose.yaml -f ports.override.yaml up --build -d
```

Пути к обоим файлам здесь сокращены. Первая полная сборка тоже прошла, но ниже вывод повторного запуска той же
команды: слои взяты из кеша, поэтому шаги сборки помечены `CACHED`, а контейнеры уже работали с первого запуска
(`Running`). Начало вывода:

```text
 Image calendar-r8-44-web Building 
 Image calendar-r8-44-api Building 
#1 [internal] load local bake definitions
#1 reading from stdin 1.59kB done
#1 DONE 0.0s
```

Шаги #2-#32 вырезаны, кроме двух финальных шагов сборки, по одному на образ:

```text
#14 [api build 5/5] RUN CGO_ENABLED=0 go build -trimpath -o /out/server ./cmd/server
#14 CACHED
```

```text
#26 [web build 6/6] RUN CALENDAR_API_URL="http://api:8080" node node_modules/nuxt/bin/nuxt.mjs build
#26 CACHED
```

Конец вывода, без сокращений:

```text
 Image calendar-r8-44-api Built 
 Image calendar-r8-44-web Built 
 Container calendar-r8-44-web-1 Running 
 Container calendar-r8-44-api-1 Running 
 Container calendar-r8-44-api-1 Waiting 
 Container calendar-r8-44-api-1 Healthy 
```

## Состояние контейнеров

```sh
docker compose -p calendar-r8-44 ps
```

```text
NAME                   IMAGE                                                                     COMMAND                  SERVICE   CREATED          STATUS                    PORTS
calendar-r8-44-api-1   sha256:c18ecf4b16ea7ea392738562029d07eabc3c8cf170b3d707cd3f6510bc862bba   "/app/server"            api       11 minutes ago   Up 11 minutes (healthy)   8080/tcp
calendar-r8-44-web-1   sha256:9c76fd5982ef52116bd023f6648a15a4b72d5ee6a070cff8a2595293670cabf8   "/nodejs/bin/node /a…"   web       11 minutes ago   Up 11 minutes             0.0.0.0:3100->3000/tcp, [::]:3100->3000/tcp
```

api в состоянии healthy, его порт 8080 наружу не открыт. web запущен и открыт на хосте на 3100.

## Запрос через страницу

Запрос идёт на порт web, страница проксирует `/api/` на api:

```sh
curl -si http://localhost:3100/api/event-types
```

```text
HTTP/1.1 200 OK
content-type: application/json
date: Mon, 09 Nov 2026 13:05:46 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked

{"items":[]}
```

Список пустой: compose не создаёт никаких данных, а расписание и вид встречи я перед этим запросом не
создавал. Ответ 200 с `{"items":[]}` показывает, что цепочка страница -> прокси `/api/` -> api работает.
