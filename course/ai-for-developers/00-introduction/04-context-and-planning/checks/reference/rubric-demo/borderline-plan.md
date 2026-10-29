# План: экспорт CSV в GET /invoices

## Цель

`GET /invoices` умеет отдавать CSV с теми же счетами и фильтрами, что и JSON.

## Вне скоупа

- `src/invoices/generated/` не правим руками, это `make codegen`.
- Пагинация.

## Контекст

- `invoice-service/src/invoices/api.py`: сюда выбор формата.
- `invoice-service/src/invoices/service.py`: сериализация.
- `invoice-service/tests/test_api.py`.

## Шаги

1. Добавить to_csv в service.py и выбор формата по Accept в api.py.
   Проверка: `make test` зелёный.
2. Тесты на CSV без фильтра и с фильтром status.
   Проверка: `make test`, новые тесты зелёные.
3. Проверить формат суммы.
   Проверка: `make test`, проверить, что работает.

## Вопросы до старта

- Сумма "как в счёте": в центах или в основной единице?
