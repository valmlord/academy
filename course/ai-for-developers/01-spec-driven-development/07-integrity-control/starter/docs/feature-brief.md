# Бриф фичи: напоминания об оплате

Компания и её правила вымышлены, это материал упражнения.

## Зачем

Отдел расчётов сейчас вручную просматривает просроченные Invoice и пишет Customer письма. Письма
уходят с опозданием, иногда дважды, иногда Customer, который уже всё оплатил. Нужна функция, которая
каждое утро говорит, какие Reminder сегодня отправить. Само отправление писем в эту фичу не входит.

## Шов

Одна функция в модуле `invoices.reminders`:

```python
def plan_reminders(
    invoices: list[Invoice],
    sent_reminders: list[SentReminder],
    today: date,
) -> list[Reminder]: ...
```

Она ничего не читает и не пишет сама: всё, что ей нужно, приходит в аргументах, результат -
список Reminder, которые нужно отправить сегодня. Типы уже есть в `invoices.models` и не меняются:

| Тип | Поля |
|---|---|
| `Invoice` | `id: int`, `customer: str`, `currency: str`, `status: InvoiceStatus`, `dispute: DisputeState`, `issued_on: date`, `due_on: date`, `lines: list[InvoiceLine]`, `paid_cents: int` |
| `InvoiceLine` | `description: str`, `amount_cents: int` |
| `SentReminder` | `invoice_id: int`, `level: ReminderLevel`, `sent_on: date` |
| `Reminder` | `invoice_id: int`, `customer: str`, `level: ReminderLevel`, `outstanding_cents: int`, `currency: str` |
| `InvoiceStatus` | `DRAFT`, `ISSUED`, `PAID`, `CANCELLED` |
| `DisputeState` | `NONE`, `OPEN`, `RESOLVED` |
| `ReminderLevel` | `FIRST`, `SECOND`, `FINAL` |

Деньги - целые числа в минимальных единицах валюты (центах), без float.
`paid_cents` - всё, что уже зачтено по Invoice: сумма всех Payment и Credit Note.

## Область значений интерфейса

Функцию вызывают только с такими значениями, всё остальное вне интерфейса:

- `invoices` и `sent_reminders`: списки от 0 до 50 элементов указанных dataclass, точные типы;
- `today` и каждое поле-дата: `date` от 2000-01-01 до 2099-12-31;
- каждое целое поле (деньги, идентификаторы): от 0 до 1 000 000 000;
- каждое строковое поле: от 1 до 64 символов из `[A-Za-z0-9-]`;
- перечисления: только их члены; `lines`: список от 0 до 50 элементов.

## Что известно до интервью

- Customer получает не больше одного Reminder по одному Invoice в день.
- Отдел расчётов хочет три уровня Reminder: мягкий, настойчивый и последний.
- Подробности (сроки, пороги, порядок) решены на интервью: `docs/grilling-transcript.md`.
