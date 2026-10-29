# Стоимость трёх сессий

## Данные

`prices.json`: снимок цен на `snapshotDate` (источник `sourceUrl`). Для каждого уровня (`tiers`):

| Поле | Смысл |
|---|---|
| `inputPerMTok` | цена некэшированного входа, $ за 1 000 000 токенов |
| `outputPerMTok` | цена выхода, $ за 1 000 000 токенов |
| `cacheReadMultiplier` | чтение из кэша стоит `inputPerMTok x cacheReadMultiplier` |
| `batchMultiplier` | скидка Batch API; к этим интерактивным сессиям не применяется |

У `small` указана нижняя цена из таблицы ("from"). Записи в кэш в снимке нет, в логах тоже: её не считаем.

`sessions/<x>.jsonl`: одна строка на запрос к модели.

| Поле | Смысл |
|---|---|
| `turn` | номер запроса в сессии |
| `tier` | уровень из `prices.json`, по которому оплачен запрос |
| `input_tokens` | некэшированный вход (по полной цене входа) |
| `cache_read_input_tokens` | вход, прочитанный из кэша |
| `output_tokens` | выход |
| `idle_seconds_before` | сколько секунд сессия простаивала перед этим запросом |

Стоимость запроса = `input_tokens x inputPerMTok / 1e6`
+ `cache_read_input_tokens x inputPerMTok x cacheReadMultiplier / 1e6`
+ `output_tokens x outputPerMTok / 1e6`. Стоимость сессии = сумма по её запросам.

## Ответ: `answers.json`

| Поле | Значение |
|---|---|
| `session_cost_usd.a`, `.b`, `.c` | стоимость сессии в $, число |
| `a_repriced_on_mid_tier_usd` | токены сессии a по ценам уровня `mid` (уровень сессии c), число |
| `b_cache_miss_turn` | `turn` первого запроса после долгой паузы, у которого `cache_read_input_tokens` равно 0, целое |
| `largest_component.a`, `.b`, `.c` | `output`, `uncached-input` или `cache-read`: составляющая с наибольшей долей стоимости сессии в $ |
| `cheaper_per_task` | `a` или `c`: какая сессия обошлась дешевле за ту же задачу |

Числа без кавычек, строки в кавычках, строгий JSON (без `NaN`, `Infinity`, комментариев).
