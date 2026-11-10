# Итоговый проект: API чтения на Go

**Твой шаг.** В эталонном плане урока 1 это серверная часть срезов 1-3: приглашённый получает
свободные слоты через `GET /event-types/{eventTypeId}/slots`, а хост создаёт расписание и вид
встречи. Урок закрывает REQ-12 (правила окон расписания), REQ-13 (диапазон слотов), REQ-14 (единый
формат ошибок) и REQ-15 (отказ с 400). Номера REQ здесь и ниже из спецификации стартера, в своей
нумерации они могут быть другими. Вертикальная команда добавляла бы эти операции по одной в
срезах 1-3. Здесь сразу все операции чтения и создания, без бронирований: они придут в уроке 5.

## Проблема

Сервер по контракту можно написать за вечер, и на ручной проверке он будет работать. А потом
мобильный подрядчик Ирины пришлёт `POST /event-types` без поля `bufferBeforeMinutes`. В Go-структуре
поле `int`, и отсутствующее поле становится нулём: спецификация Go задаёт значение по умолчанию
"`0` for numeric types". Сервер ответит 201 с буфером 0, а контракт требует 400. Так же тихо
пройдёт лишнее поле с опечаткой, а ошибка уйдёт как `text/plain` вместо problem+json.

Есть ещё соблазн "сгенерировано, значит проверено". Если сервер сгенерирован из контракта
(oapi-codegen), то кажется, что границы и обязательные поля уже на месте. README oapi-codegen про
strict-сервер пишет: "This doesn't include validation of incoming requests." Вопрос для себя
до практики: что ответит такой сервер на `durationMinutes: 481` или на тело без `scheduleId`?

## Идея: граница проверяет всё, что обещает контракт

Контракт урока 2 это список обещаний на входе и на выходе. Сервер выполняет их в одном месте, на
границе, до того как данные попадут в движок:

1. Тело читается строго: неизвестное поле, неверный тип, отсутствующее поле дают 400.
2. Границы и правила проверяются явно: длина в символах, диапазоны чисел, `HH:MM`, пересечение
   окон, известный пояс, диапазон `from`/`to`.
3. Каждая ошибка уходит через одну функцию, которая пишет `application/problem+json`.
4. Ответ успеха содержит ровно поля контракта, а пустой список пишется как `[]`.

## Как это работает в Go

**Маршруты.** С Go 1.22 `http.ServeMux` понимает метод и параметры пути. Шаблон имеет вид
"[METHOD ][HOST]/[PATH]", параметр пути пишется `{NAME}` и читается через `r.PathValue("NAME")`.
"A pattern with the method GET matches both GET and HEAD requests." Если путь совпал, а метод нет,
ServeMux сам ответит "405 Method Not Allowed" с заголовком `Allow`, где перечислены доступные
методы. Если путь не совпал ни с одним шаблоном, ответ 404. Поэтому регистрируйте операции ровно с
методом: `GET /event-types/{eventTypeId}`, а не `/event-types/{eventTypeId}` без метода, иначе
`PUT` попадёт в ваш обработчик. И без косой черты на конце: "A trailing slash in a path acts as an
anonymous "..." wildcard", и `/event-types/{id}/slots/лишнее` перестанет быть 404.

**Строгое чтение тела.** `json.Decoder` с `DisallowUnknownFields` отклоняет неизвестные ключи:
"DisallowUnknownFields causes the Decoder to return an error when the destination is a struct" и
ключ не совпал ни с одним полем. Неверный тип (`"30"` или `30.5` в поле `int`) тоже даёт ошибку.
Отсутствующее поле ошибки не даёт, поэтому обязательные поля держите указателями: `*int` без
ключа остаётся `nil`. С `null` то же: "unmarshaling a JSON null into any other Go type has no
effect on the value and produces no error", а указатель станет `nil`. Ещё одна особенность: ключи
сопоставляются с полями, "preferring an exact match but also accepting a case-insensitive match".

**Длина строки.** Контракт меряет длину в символах: в JSON Schema "The length of a string instance
is defined as the number of its characters". `len` в Go считает байты ("The number of bytes is
called the length of the string"), и 120 кириллических букв это 240 байт. Считайте через
`utf8.RuneCountInString`.

**Ответ.** Заголовки ставятся до `WriteHeader`: "Changing the header map after a call to
ResponseWriter.WriteHeader (or ResponseWriter.Write) has no effect". Если `Content-Type` не задан,
`Write` подставит угаданный по первым байтам тела. Ставьте его сами.

Маленький сервер не из нашего проекта, его можно запустить (`go run main.go`):

```go
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"unicode/utf8"
)

type noteFields struct {
	Text     *string `json:"text"`
	Priority *int    `json:"priority"`
}

type problem struct {
	Type   string `json:"type"`
	Title  string `json:"title"`
	Status int    `json:"status"`
	Code   string `json:"code"`
	Detail string `json:"detail,omitempty"`
}

func writeProblem(w http.ResponseWriter, status int, code, detail string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(problem{"about:blank", http.StatusText(status), status, code, detail})
}

func createNote(w http.ResponseWriter, r *http.Request) {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var body noteFields
	if err := decoder.Decode(&body); err != nil {
		writeProblem(w, http.StatusBadRequest, "validation_failed", err.Error())
		return
	}
	if body.Text == nil || body.Priority == nil {
		writeProblem(w, http.StatusBadRequest, "validation_failed", "text and priority are required")
		return
	}
	if n := utf8.RuneCountInString(*body.Text); n < 1 || n > 120 {
		writeProblem(w, http.StatusBadRequest, "validation_failed", "text must be 1-120 characters")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"id": "n1", "text": *body.Text, "tags": []string{}})
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /notes", createNote)
	mux.HandleFunc("GET /notes/{noteId}", func(w http.ResponseWriter, r *http.Request) {
		writeProblem(w, http.StatusNotFound, "not_found", "no note "+r.PathValue("noteId"))
	})
	log.Fatal(http.ListenAndServe("127.0.0.1:8080", mux))
}
```

Что попробовать: `GET /notes` даст 405 с `Allow: POST`, тело `{"text": "a", "priority": 1, "x": 1}`
даст 400, тело без `priority` тоже 400.

**problem+json.** По RFC 9457 тип содержимого "application/problem+json". Поле `status` повторяет
код ответа: "Generators MUST use the same status code in the actual HTTP response". Для `type`
можно взять `about:blank`: "When this member is not present, its value is assumed to be
"about:blank"", и тогда `title` "SHOULD be the same as the recommended HTTP status phrase".

**Время в строке запроса.** `from` и `to` приходят в query, а `+` в смещении `+05:45` должен быть
закодирован как `%2B`. Go раскодирует query так, что `+` становится пробелом: "PathUnescape is
identical to QueryUnescape except that it does not unescape '+' to ' ' (space)". Проверка шлёт
`%2B`; если пробуете руками, кодируйте так же. Смещение в метке обязательно: в RFC 3339
"full-time = partial-time time-offset", и метка без смещения это 400.

> **Go для TS-разработчика: HTTP.**
> - **ServeMux вместо Express-роутера.** Метод и путь в одной строке: `mux.HandleFunc("GET
>   /event-types/{eventTypeId}", h)`. 404 ("404 page not found") и 405 с `Allow` стандартная
>   библиотека отвечает сама, не в формате problem+json. Это ответы вне операций контракта, и
>   проверка смотрит у них только статус и `Allow`.
> - **Обработчик.** `func(w http.ResponseWriter, r *http.Request)`: нет `res.json()`, есть
>   заголовки, `WriteHeader`, потом тело.
> - **`nil`-срез и `null`.** "a nil slice encodes as the null JSON value". `var items []EventType`
>   без единого элемента уйдёт как `"items": null`, а схема требует массив. Начинайте с
>   `items := []EventType{}`. То же с `weekly`, `overrides` и `intervals` в ответе.
> - **Модули и `vendor/`.** Сторонний модуль (например oapi-codegen runtime) скачивается из сети,
>   а проверка собирает без сети. Значит, `go mod vendor` и закоммиченный `vendor/`. Сервер из одной
>   стандартной библиотеки этого не требует.

## Частые ошибки

- Обязательные числа как `int`: отсутствующее поле становится нулём, и проверка видит 201 вместо
  400.
- `json.Unmarshal` без `DisallowUnknownFields`: лишнее поле молча принято.
- Длина имени через `len`: 120 кириллических букв отклонены.
- Ошибка через `http.Error`: тип `text/plain`, а не problem+json.
- `Content-Type` поставлен после `WriteHeader`.
- Пустой список как `null`.
- Шаблон без метода или с `/` на конце.
- Сгенерированный сервер без валидатора запросов.
- `now` из часов машины, а не из `CALENDAR_NOW`: слоты расходятся с моделью.
- Диапазон 31 день, посчитанный по календарю в поясе: в спецификации это 31 x 24 часа.

## Что делать в практике

Зарегистрируйте операции, напишите одну функцию problem+json, потом строгое чтение и проверку
тел `POST /schedules` и `POST /event-types`, потом `GET` и слоты на движке из урока 3. Запускайте
проверку и правьте по её сообщениям. Правила проверки и окружение описаны в задании.
