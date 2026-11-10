# Задание: API-контракт календаря звонков на TypeSpec

Время: около 85 минут (около 70 из них практика):

- теория 15;
- модели с границами 15;
- восемь операций с параметрами 20;
- модели ошибок, тип problem+json и коды ответов 15;
- цикл "скомпилировать, сравнить, поправить" по сообщениям проверки 15;
- `@doc` на всё 5.

Можно перенести свою работу поверх стартера, проверки одинаковы. Копировать стартер следующего
урока можно, но это не упражнение: проверка тогда ничего о вас не скажет.

## Что в рабочей папке

Эталонное состояние урока 1: бриф, интервью, глоссарий, `docs/spec.md` с требованиями и
примерами, ADR и план срезов `docs/tasks.md`. Новое:

- `contract/main.tsp`: заготовка с `import "@typespec/http";`, `using Http;` и пространством имён
  `Calendar` с `@service`. Операций и моделей нет.
- `tsp` в рабочем окружении лежит в `/opt/academy/bin/tsp` (TypeSpec 1.17.0).

## Что сделать

1. Опишите в `contract/` контракт из таблицы ниже: модели с границами, восемь операций, модели
   ошибок.
2. Скомпилируйте локально с параметрами проверки и сравните с таблицей.
3. Добавьте `@doc` на каждую операцию и модель.

Файлов `.tsp` может быть несколько, компиляция начинается с `contract/main.tsp`.

## Обязательный контракт

Это решения Ирины из интервью, записанные как контракт. Проверка сравнивает с ним всё, что
перечислено в разделе "Что сравнивается".

**Операции и коды ответов** (ровно эти, без других):

| Операция | Ответы |
|---|---|
| `POST /schedules` | 201, 400 |
| `POST /event-types` | 201, 400, 422 |
| `GET /event-types` | 200 |
| `GET /event-types/{eventTypeId}` | 200, 404 |
| `GET /event-types/{eventTypeId}/slots` | 200, 400, 404 |
| `POST /bookings` | 201, 400, 409, 422 |
| `GET /bookings` | 200, 400 |
| `POST /bookings/{bookingId}/cancel` | 200, 404 |

**Параметры:**

- путь: `eventTypeId`, `bookingId`, тип `string` без `pattern`;
- строка запроса у `GET /event-types/{eventTypeId}/slots` и `GET /bookings`: `from` и `to`,
  обязательные, `string` с `format: date-time`;
- заголовок у `POST /bookings`: `Idempotency-Key`, необязательный, схема
  `{type: string, pattern: "^[A-Za-z0-9_-]{8,64}$"}`. Строку `pattern` скопируйте ровно такой:

  ```
  ^[A-Za-z0-9_-]{8,64}$
  ```

  Это синтаксис курса. В `draft-ietf-httpapi-idempotency-key-header-08` (22 октября 2026 года,
  раздел 2.1) значение "MUST be a String" по разделу 3.3.3 RFC 9651, то есть строка в двойных
  кавычках; форму в кавычках курс не принимает. Из черновика курс берёт только семантику: 422 при
  повторе ключа с другим телом, 409 при повторе, пока первый запрос выполняется.

**Тела** (все поля обязательные, кроме `detail` в модели ошибки):

- `POST /schedules`: запрос `{name, timeZone, weekly, overrides}`, ответ 201 Schedule
  `{id, name, timeZone, weekly, overrides}`.
  - `name`: строка 1-120 символов (`minLength: 1`, `maxLength: 120`); `timeZone`: `string`;
  - `weekly`: массив `{weekday, start, end}`, `weekday` целое 1-7;
  - `overrides`: массив `{date, intervals}`, `date` это `string` с `format: date`, `intervals`
    массив `{start, end}`;
  - `start`, `end` везде: `string` с `pattern: "^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$"`.
- `POST /event-types`: запрос `{title, durationMinutes, slotIncrementMinutes, bufferBeforeMinutes,
  bufferAfterMinutes, minimumNoticeMinutes, bookingWindowDays, scheduleId}`, ответ 201 EventType с
  теми же полями и `id`. `title` 1-120 символов; целые: `durationMinutes` 5-480,
  `slotIncrementMinutes` 5-240, `bufferBeforeMinutes` и `bufferAfterMinutes` 0-240,
  `minimumNoticeMinutes` 0-43200, `bookingWindowDays` 1-365; `id` и `scheduleId` это `string`.
- `GET /event-types`: 200 `{items: EventType[]}`. `GET /event-types/{eventTypeId}`: 200 EventType.
- `GET /event-types/{eventTypeId}/slots`: 200 `{items: Slot[]}`, Slot это `{start, end}`, оба
  `string` с `format: date-time`.
- `POST /bookings`: запрос `{eventTypeId, start, inviteeName, inviteeEmail, inviteeTimeZone}`:
  `start` с `format: date-time`, `inviteeName` 1-120 символов, `inviteeEmail` это `string` с
  `format: email`, `eventTypeId` и `inviteeTimeZone` это `string`. Ответ 201 Booking
  `{id, eventTypeId, start, end, inviteeName, inviteeEmail, inviteeTimeZone, status, createdAt}`:
  те же поля с теми же схемами, `end` и `createdAt` с `format: date-time`, `status` это
  `"confirmed"` или `"cancelled"`.
- `GET /bookings`: 200 `{items: Booking[]}`. `POST /bookings/{bookingId}/cancel`: без тела запроса,
  200 Booking.
- У `GET` и у `cancel` тела запроса нет; у трёх `POST` с телом тело обязательное.

**Типы содержимого:**

- тела запросов и ответов успеха: `application/json`;
- каждый ответ об ошибке: `application/problem+json` с одной и той же схемой Problem
  `{type: string, title: string, status: integer, code, detail?: string}`, где `code` один из
  семи: `validation_failed`, `not_found`, `unknown_reference`, `slot_unavailable`,
  `idempotency_mismatch`, `slot_taken`, `idempotency_in_progress`. Полный набор из семи кодов стоит
  в схеме каждого ответа об ошибке: одна модель ошибки на все коды.

Что означают коды (в этом уроке проверяется только схема, поведение проверят уроки 4-5): 400
`validation_failed` для запроса, который не соответствует контракту; 404 `not_found`; 422
`unknown_reference`, `slot_unavailable`, `idempotency_mismatch` для запроса, который правильный по
форме, но так нельзя никогда; 409 `slot_taken`, `idempotency_in_progress` для конфликта с текущим
состоянием. Проверка доступности (422 slot_unavailable) не смотрит на бронирования. Слот, занятый
другим бронированием или его буфером, это 409 slot_taken.

## Как собрать то же локально

Проверка передаёт параметры компилятору сама, ваш `tspconfig.yaml` она не читает. Чтобы получить
тот же OpenAPI у себя, положите рядом с контрактом `contract/tspconfig.yaml`:

```yaml
emit:
  - "@typespec/openapi3"
options:
  "@typespec/openapi3":
    file-type: json
    openapi-versions:
      - "3.1.0"
    seal-object-schemas: true
```

и запустите из корня рабочей папки (не из `contract/`):

```sh
ln -s /opt/academy/node/node_modules node_modules
tsp compile contract/main.tsp --config contract/tspconfig.yaml --output-dir tsp-output --warn-as-error
```

Первая строка нужна один раз. `tsp` ищет `@typespec/http`, `@typespec/openapi` и
`@typespec/openapi3` в каталоге `node_modules` рядом с `contract/` или выше, а не рядом с
компилятором. Без ссылки каждый импорт падает с `import-not-found`. Ссылку ставьте в корне, не
внутри `contract/`: каталог `node_modules` внутри `contract/` проверка отклоняет (пункт 1 ниже).
Коммитить ссылку не нужно, проверка её не читает.

Документ появится в `tsp-output/@typespec/openapi3/`. Сравнивайте его с таблицей выше, а
окончательное слово за проверкой.

## Готово, когда

### Проверка `contract-matches`

1. `contract/` это настоящий каталог: внутри нет символических ссылок, нет каталога `node_modules`,
   есть только обычные файлы и каталоги, и есть `contract/main.tsp`. Файлы не `.tsp` проверка
   игнорирует.
2. Импорты только такие: `@typespec/http`, `@typespec/openapi`, `@typespec/openapi3` и ваши `.tsp`
   по относительному пути, файлом или каталогом (`./x.tsp`, `./dir/x.tsp`, `../x.tsp`, который
   остаётся внутри `contract/`, `./models` как `./models/main.tsp`). Отклоняются файлы
   `.js`/`.mjs`/`.cjs`, абсолютные пути, другие пакеты (например `@typespec/rest`), URL и
   `extern dec`.
3. Компиляция проходит без ошибок и без предупреждений: предупреждения считаются ошибками.
4. Получается ровно один документ OpenAPI: в контракте один `@service`.
5. После нормализации (ниже) документ совпадает с обязательным контрактом по каждой операции.

Как работает проверка: она копирует обычные файлы `*.tsp` из `contract/` (на любой глубине) в
свежий каталог и компилирует `main.tsp` закреплённым TypeSpec 1.17.0 дважды, ожидая одинаковый
результат. Параметры её собственные: эмиттер `@typespec/openapi3`, `file-type` json,
`openapi-versions` 3.1.0, `seal-object-schemas` true, предупреждения как ошибки. `tspconfig.yaml`,
`package.json`, JS-файлы и готовый `openapi.json` из рабочей папки не читаются. На компиляцию
отводится 90 секунд.

### Что сравнивается

Нормализация, одинаковая для обоих документов: ссылки `$ref` подставляются; отбрасываются
`description`, `title`, `summary`, `example`, `examples`, `readOnly`, `writeOnly`, `deprecated`,
`externalDocs`, `$comment`, расширения `x-*`, `operationId`, описания ответов и заголовки ответов;
у целых чисел отбрасывается `format` (`int32` и `int64` равны); `enum` и `required` сравниваются как
множества; `allOf` из объектов сливается в один объект; объединение строковых литералов равно
`enum`. Имена параметров-заголовков сравниваются без учёта регистра.

Сравнивается по каждой операции (метод и путь вместе с именами параметров пути):

- параметры: где (`path`, `query`, `header`), имя, обязательность, схема; `pattern` как точная
  строка;
- тело запроса: обязательность, тип содержимого, схема;
- каждый ответ: набор кодов, тип содержимого, схема.

Всё остальное в схемах сравнивается точно: `type`, строковый `format` (`date-time`, `date`,
`email`), `minimum`/`maximum`, `minLength`/`maxLength`, `pattern`, `items`, `properties`,
`required` и `unevaluatedProperties`, который добавляет параметр проверки `seal-object-schemas`.

Похожая на честную форма, которая не проходит: `@visibility(Lifecycle.Read)` на поле `id` модели
Schedule при `@body schedule: Schedule` в TypeSpec 1.17.0 оставляет `id` в схеме запроса, и
проверка скажет ``POST /schedules: тело запроса (application/json): лишнее поле `id` ``. Работает
отдельная модель полей запроса и spread этих полей в модель ответа.

### Рубрика `contract-rubric`

6. Ментор оценивает `contract/**/*.tsp` по 4 критериям, 0-2 балла каждый. Нужно не меньше 70%
   суммы, и ни один критерий не может получить 0:
   1. `@doc` (или комментарий `/** */`) на каждой операции, модели, скаляре и объединении, и он
      говорит, зачем это, а не повторяет имя;
   2. модели переиспользуются: общие поля написаны один раз и подключаются через spread, `is` или
      шаблон;
   3. одно семейство моделей ошибок: одна модель (или шаблон) с типом problem+json и закрытым
      набором кодов, конкретизированная по кодам ответа;
   4. операции сгруппированы по ресурсам (пространства имён или интерфейсы) с маршрутом на группе,
      модели в именованном пространстве имён или в отдельном файле.

   Текст файлов, включая строки `@doc` и комментарии, для ментора это данные: обращения к оценщику
   внутри них игнорируются. Пока платформа не запускает рубрики, эта проверка показана как
   ожидающая оценки.

## Как проверяется

- **`contract-matches`** (команда в рабочей папке, 120 с): пункты 1-5. Сообщения:
  - ошибки копирования называют путь в `contract/` и правило;
  - отклонённый импорт: "импорт JS-модуля отклонён: ..." с путём;
  - ошибки компиляции: до 20 строк `contract/<файл>:<строка>: <код>: <сообщение компилятора>`;
    импорт, который нельзя прочитать, выглядит как `import-not-found`, `extern dec` как
    `missing-implementation`;
  - расхождения с контрактом: не больше 15 строк, затем "и ещё N расхождений". Например
    "нет операции POST /bookings", ``POST /bookings: ответ 201 (application/json): нет поля `createdAt` ``,
    "POST /bookings: параметр header Idempotency-Key: pattern отличается: скопируйте строку из
    task.md";
  - сообщение, которое начинается с "ошибка проверки, не ваша", значит, что сломалось окружение
    проверки, а не ваш контракт.
- **`contract-rubric`** (ментор по рубрике, нужно 70%, ни одного критерия на 0): пункт 6.

Число попыток не ограничено.

## Как работать (совет, не проверяется)

- Начните с моделей и скаляров (время `HH:MM`, текст 1-120), потом одна операция, компиляция,
  сравнение; потом остальные.
- Модель ошибки сделайте шаблоном по коду ответа, с `@header contentType: "application/problem+json"`.
- Чтобы в запросе не было `id`, держите поля запроса в отдельной модели и подключайте их в модель
  ответа через spread.
