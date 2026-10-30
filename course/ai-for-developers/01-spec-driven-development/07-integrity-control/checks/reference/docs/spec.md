# Spec: payment reminders

## Problem Statement

Отдел расчётов вручную ищет просроченные Invoice и пишет Customer письма. Письма уходят поздно,
иногда дважды, иногда Customer, который уже всё оплатил.

## Solution

Функция `plan_reminders` каждое утро по списку Invoice, истории отправленных Reminder и текущей дате
возвращает Reminder, которые нужно отправить сегодня. Следующий Reminder всегда выводится из истории
отправленных (ADR-0001), хранимого расписания нет.

## User Stories

1. Как сотрудник отдела расчётов, я хочу каждое утро получать список Reminder на сегодня, чтобы не
   искать просроченные Invoice вручную.
2. Как сотрудник отдела расчётов, я хочу, чтобы уровень Reminder рос со временем, чтобы Customer,
   который молчит, получал всё более настойчивые письма.
3. Как Customer, я не хочу получать Reminder по оплаченному, отменённому или почти оплаченному
   Invoice.
4. Как сотрудник отдела расчётов, я хочу видеть Reminder одного Customer подряд, чтобы обрабатывать
   их вместе.

## Requirements

- **REQ-01** WHEN an issued Invoice is at least 7 days past its due date and no Reminder was sent for it THE SYSTEM SHALL plan a FIRST Reminder for it.
- **REQ-02** WHEN the highest level sent for an issued Invoice is FIRST and at least 14 days have passed since that Reminder was sent THE SYSTEM SHALL plan a SECOND Reminder for it.
- **REQ-03** WHEN the highest level sent for an issued Invoice is SECOND and at least 14 days have passed since that Reminder was sent THE SYSTEM SHALL plan a FINAL Reminder for it.
- **REQ-04** WHEN a FINAL Reminder was already sent for an Invoice THE SYSTEM SHALL plan no further Reminder for it.
- **REQ-05** WHEN the Outstanding Balance of an Invoice is below 500 cents THE SYSTEM SHALL plan no Reminder for it.
- **REQ-06** WHEN an Invoice is not in status ISSUED THE SYSTEM SHALL plan no Reminder for it.
- **REQ-07** WHEN the system plans a Reminder THE SYSTEM SHALL set its Outstanding Balance to the sum of the Invoice lines minus the paid amount, and its Customer and currency to those of the Invoice.
- **REQ-08** WHEN several Reminders are planned THE SYSTEM SHALL return at most one per Invoice, ordered by Customer and then by Invoice id.
- **REQ-09** WHEN an Invoice has an open Dispute THE SYSTEM SHALL plan no Reminder for it, and once the Dispute is resolved the other requirements apply again.

## Implementation Decisions

- Шов один: `plan_reminders(invoices, sent_reminders, today)` в модуле `invoices.reminders`; функция
  чистая, ничего не читает и не пишет.
- Следующий уровень выводится из истории отправленных Reminder при каждом вызове (ADR-0001).
- Сроки 7 и 14 дней и порог 500 центов - именованные константы модуля.
- Если для Invoice отправлено несколько Reminder высшего уровня, 14 дней в REQ-02 и REQ-03 считаются от
  последнего из них (самый поздний `sent_on`).
- Если во входе несколько Invoice с одним id, учитывается только первый из них по порядку списка, даже
  если он не в статусе ISSUED; остальные с тем же id пропускаются.

## Testing Decisions

- Тесты вызывают только `plan_reminders` и строят входы из классов `invoices.models`.
- Каждый тест проверяет одно требование; в имени теста стоит метка требования, например
  `test_req_03_...`.
- Ожидаемые значения в тестах - литералы из требований, а не пересчёт тем же способом, что в коде.

## Out of Scope

- Отправка писем и их текст.
- Пени за просрочку.
