# План: экспорт CSV в GET /invoices

## Цель

`GET /invoices?format=csv` отдаёт CSV: те же счета и те же фильтры (`status`), что и JSON-ответ.
Без `format=csv` ответ остаётся JSON, как сейчас. Параметр, а не заголовок `Accept`: `api.handle`
получает только метод, путь и query string, заголовков у него нет.

## Вне скоупа

- `src/invoices/generated/`: создаётся `make codegen` из `schema/invoice.schema.json`, руками не
  правим; схема данных в этой задаче не меняется.
- `db/migrations/`: миграции не нужны и не трогаются.
- `tests/fixtures/invoices.json`: общий с QA, новые данные только в отдельном файле.
- Пагинация, выбор формата по заголовку `Accept` (нужна смена сигнатуры `handle`), другие эндпоинты.

## Контекст

- `invoice-service/src/invoices/api.py`: `handle(method, path, query_string)` и `_list`, сюда добавляется выбор формата.
- `invoice-service/src/invoices/service.py`: `to_json_dict`, рядом появится сериализация в CSV.
- `invoice-service/src/invoices/models.py`: поля `Invoice`.
- `invoice-service/tests/test_api.py`: стиль существующих тестов.
- `invoice-service/Makefile`: тесты только через `make test` (`APP_ENV=test`).

## Шаги

1. Тест на CSV-ответ без фильтра: `handle("GET", "/invoices", "format=csv")` даёт `200`,
   `Content-Type: text/csv; charset=utf-8`, заголовок колонок и 3 строки фикстур.
   Проверка: `make test` падает ровно на новом тесте `test_lists_invoices_as_csv`.
2. Функция `to_csv(invoices)` в `service.py`; `_list` выбирает формат по параметру `format`.
   Проверка: `make test`, все тесты зелёные, включая `test_lists_invoices_as_csv`.
3. Тест: `status=paid&format=csv` фильтрует так же, как JSON; неизвестный статус даёт `400`; неизвестный `format` даёт `400`.
   Проверка: `make test`, новые `test_csv_respects_status_filter` и `test_csv_unknown_status_is_400` зелёные.
4. Сумма "как в счёте": формат по ответу на вопрос 1 ниже, тест на формат суммы.
   Проверка: `make test` зелёный и `make lint` без замечаний.

Каждый шаг помещается в свежую сессию: на вход ему нужен только этот план и пути из раздела Контекст.

## Вопросы до старта

- "Сумма как в счёте": это `1200.00` в основной единице или центы, как в JSON? Какой разделитель
  дробной части ждёт табличный редактор бухгалтерии?
- Разделитель колонок: запятая или точка с запятой?
- Нужен ли заголовок `Content-Disposition` с именем файла, или CSV открывают из браузера?
- Устроит ли `?format=csv`, или клиенту важен именно заголовок `Accept: text/csv`?
