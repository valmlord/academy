# Итоговый проект: API-контракт на TypeSpec

**Твой шаг.** В эталонном плане урока 1 контракт это срез 0, пункт Design First. Он закрывает
контрактную часть REQ-13, REQ-14 и REQ-15 (диапазон слотов, единый формат ошибок, отказ с 400;
номера REQ здесь и ниже из спецификации стартера, в своей нумерации они могут быть другими) и
даёт форму всем операциям срезов 1-6. Вертикальная команда описывала бы операции по одной внутри
срезов 1-6. Здесь весь контракт пишется сразу: Ирина хочет согласовать API до кода, а уроки 4-7
проверяют ваш сервер и страницу по этому контракту.

## Проблема

У Ирины есть подрядчик, который пишет мобильное приложение на том же API. Вы пишете сервер, он
пишет клиента, и каждый читает спецификацию по-своему. Сервер отвечает на кривой запрос 422, клиент
ждёт 400. Сервер шлёт ошибку как `text/plain`, клиент разбирает JSON. Сервер молча принимает поле
`inviteEmail` с опечаткой, и подрядчик неделю думает, что всё работает. Ирина в интервью как раз
этого и боится.

Договорённость в прозе это не исправляет: в ней можно не заметить расхождение. Нужен один
машиночитаемый документ, из которого обе стороны берут операции, поля, границы и коды ошибок.

## Идея: сначала контракт, потом код

Design First: контракт API пишут и согласуют до реализации, и дальше он источник правды. Сервер
проверяют на соответствие ему, клиента генерируют из него.

OpenAPI вручную писать долго, и в нём легко ошибиться: длинный YAML или JSON, ссылки `$ref`,
повторяющиеся схемы. TypeSpec это язык описания API, который компилируется в OpenAPI. Модели в нём
похожи на интерфейсы TypeScript, а HTTP-смысл задают декораторы. В курсе закреплён TypeSpec 1.17.0.

## Как это выглядит

Маленький контракт не из нашего проекта, заметки:

```typespec
import "@typespec/http";

using Http;

@service(#{ title: "Notes" })
namespace Notes;

@doc("Text a person writes.")
@minLength(1)
@maxLength(200)
scalar NoteText extends string;

@doc("The fields a client sends.")
model NoteFields {
  @doc("Body of the note.") text: NoteText;
}

@doc("A stored note.")
model Note {
  @doc("Opaque identifier.") id: string;
  ...NoteFields;
}

@doc("An RFC 9457 problem details body.")
@error
model Problem<Status extends int32> {
  @statusCode statusCode: Status;
  @header contentType: "application/problem+json";
  @doc("Short summary.") title: string;
  @doc("HTTP status, repeated in the body.") status: int32;
}

@doc("400: the request does not match the contract.")
model BadRequest is Problem<400>;

@doc("Notes of one person.")
@route("/notes")
namespace Items {
  @doc("Create a note.")
  @post
  op create(@body note: NoteFields): {
    @statusCode statusCode: 201;
    @body note: Note;
  } | BadRequest;
}
```

Что здесь работает:

- `@route` на пространстве имён задаёт префикс: "all the operations, interfaces and namespaces
  underneath will be prefixed with it".
- `@body` отмечает тело запроса или ответа, `@statusCode` задаёт код ответа, `@path` и `@query`
  отмечают параметры пути и строки запроса.
- Ответ это объединение вариантов через `|`: успех и ошибки. `@error` помечает модель ошибки.
- Тип содержимого задаёт поле `contentType`: "You can specify the content type for an operation by
  including a header parameter named `contentType`." Без него тело-модель уходит как
  `application/json`. Поэтому `@header contentType: "application/problem+json"` в модели ошибки
  делает каждый ответ об ошибке problem+json.
- Повторное использование: spread `...NoteFields` "copies the members of a source model into a
  target model"; `is` копирует свойства и декораторы модели; шаблон `Problem<Status>` даёт одну
  модель ошибки на все коды.
- Границы и форма: `@minLength`, `@maxLength`, `@minValue`, `@maxValue`, `@pattern`, `@format`.
  Необязательное поле пишется с `?`.
- `@doc` "Attach a documentation string". В OpenAPI он становится `description`.

Импорты: пакет по имени (`import "@typespec/http";`), файл по относительному пути
(`import "./models.tsp";`) или каталог: "If a directory is imported, TypeSpec will search for a
`main.tsp` file within that directory."

## Ошибки в формате RFC 9457

RFC 9457 описывает "problem detail" для ошибок HTTP. В JSON его тип содержимого
`application/problem+json`. Члены `type` (URI-ссылка на тип проблемы), `title` (короткое описание
типа), `status` (код HTTP), `detail` (объяснение этого случая). Расширять объект можно: "Problem
type definitions MAY extend the problem details object with additional members". В контракте урока
так добавлен `code`, машинный код из закрытого списка.

## Ключ идемпотентности: синтаксис курса и семантика черновика

Повтор `POST /bookings` при плохой сети защищает заголовок `Idempotency-Key`. Его описывает
Internet-Draft `draft-ietf-httpapi-idempotency-key-header-08` (22 октября 2026 года). Это черновик,
не RFC.

- Семантику курс берёт из него. Раздел 2.2: ключ "MUST NOT be reused with another request with a
  different request payload". Раздел 2.7: при повторе с другим телом сервер "SHOULD reply with an
  HTTP `422` status code", а при повторе, пока первый запрос ещё выполняется, "SHOULD reply with an
  HTTP `409` status code".
- Синтаксис у курса свой. В черновике значение это "MUST be a String (Section 3.3.3 of
  [RFC9651])", то есть строка в двойных кавычках: `Idempotency-Key: "8e03978e-..."`. В курсе
  значение без кавычек, 8-64 символа `A-Z a-z 0-9 _ -`, как в интервью. Форму в кавычках курс не
  принимает.

## Как проверка компилирует контракт

Проверка не читает готовый OpenAPI, `tspconfig.yaml` или JS из рабочей папки. Она сама копирует
файлы `*.tsp` из `contract/`, компилирует их закреплённым TypeSpec 1.17.0 со своими параметрами и
сравнивает результат с обязательным контрактом. Параметры те же, что можно задать локально:
эмиттер `@typespec/openapi3`, `file-type: json`, `openapi-versions: 3.1.0`,
`seal-object-schemas: true` и `--warn-as-error`. Про `seal-object-schemas` документация эмиттера
говорит: для OpenAPI 3.1 он ставит "`unevaluatedProperties` to false" (в выводе 1.17.0 это схема
`{"not": {}}`, которой не соответствует ни одно значение). Так правило "лишние поля отклоняются"
попадает в машиночитаемый контракт само. А `--warn-as-error` значит: "All warnings
will be treated and emitted as errors".

> **Для TS-разработчика: TypeSpec, а дальше Go и Nuxt.** `model` читается как `interface`, `?` как
> необязательное поле, `Problem<Status>` как обобщённый тип, `"confirmed" | "cancelled"` как
> объединение литералов. Разница в том, что декораторы (`@route`, `@statusCode`, `@header`) несут
> HTTP-смысл, которого в TS-типе нет. Числа пишите как `int32`: в OpenAPI это `type: integer`. Из
> OpenAPI этого урока в уроке 6 генерируются типы клиента для страницы на Nuxt, а сервер на Go в
> уроках 4-5 проверяется пробами по нему же.

## Частые ошибки

- Написать OpenAPI руками или положить `tspconfig.yaml` с нужными опциями и считать, что этого
  достаточно: проверка читает только `.tsp` и компилирует со своими параметрами.
- Импорт JS-файла или другого пакета (`@typespec/rest`): проверка разрешает только
  `@typespec/http`, `@typespec/openapi`, `@typespec/openapi3` и ваши `.tsp`.
- Ответ об ошибке без `contentType`: он уходит как `application/json`.
- Одна модель на запрос и ответ с `id`: в теле `POST` окажется поле `id`. Отдельная модель полей
  запроса плюс spread решает это.
- `pattern` ключа идемпотентности набран вручную с лишним или пропущенным символом: сравнивается
  точная строка.
- Предупреждение компилятора, которое локально не мешает: в проверке оно ошибка.

## Что делать в практике

Опишите в `contract/` восемь операций по решениям Ирины и таблице в задании, скомпилируйте локально
с параметрами проверки и доведите до совпадения по сообщениям проверки. В конце добавьте `@doc` на
каждую операцию и модель.
