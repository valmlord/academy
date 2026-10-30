# SDD: от фичи к спецификации, ADR и задачам

## Проблема

Есть фича "напоминания об оплате" и час разговора с заказчиком. Хочется сразу сказать агенту
"сделай". С чего начать, чтобы через неделю не переписывать половину?

В уроке 4 модуля 00 план жил в чате и умирал вместе с сессией. Здесь он становится файлом:
спецификацией, которую следующие уроки проверяют тестами и линтером.

## Идея: SDD это спектр, а не инструмент

Spec-driven development: сначала письменное намерение, потом код. Birgitta Böckeler (2025) различает
три уровня:

- **spec-first**: спецификацию пишут до задачи для агента;
- **spec-anchored**: спецификацию сохраняют после задачи и по ней развивают фичу;
- **spec-as-source**: главный артефакт это спецификация, люди правят только её.

У инструментов общий скелет: намерение, дизайн, задачи, реализация, проверка по спецификации.
Примеры (не для установки, названия не проверяются):

- **GitHub Spec Kit v1.2.5**: предлагает несколько процессов (Spec-Driven Development, исправление
  багов, оценка идеи, свой процесс) и пишет о них: "These are independent entry points, not
  mandatory phases." Команды самого SDD (`constitution`, `specify`, `plan`, `tasks`, `implement` и
  другие; проверки согласованности разберём в уроке 7) "are designed to run in order, but only
  `/speckit.specify` is strictly required before `/speckit.plan`".
- **Kiro**: `requirements.md`, `design.md`, `tasks.md`; можно начать с требований
  (Requirements-First) или с дизайна (Design-First); требования в форме "WHEN [condition/event] THE
  SYSTEM SHALL [expected behavior]".
- **OpenSpec v1.15.0**: изменение как папка с предложением, дельтой спецификации, дизайном и
  задачами.

Критика (Böckeler): один процесс на любой размер, "like using a sledgehammer to crack a nut"
(маленький баг превратился в 4 user story с 16 критериями приёмки); "I'd rather review code than
all these markdown files"; ложное чувство контроля, когда агент игнорирует спецификацию или
применяет её сверх меры. Matt Pocock ставит в упрёк таким наборам, что они "try to help by owning the
process. But while doing so, they take away your control".

Минимальная форма в Claude Code из рекомендаций: "Interview me until you could write the spec, then
write it to SPEC.md", а потом "Once SPEC.md exists, start a fresh session to build from it, so the
build begins with a clean context and a written definition of done."

PRD или спецификация? В программе курса стоит PRD; Matt Pocock переименовал свой скилл `to-prd` в
`to-spec` (файл `spec.md`, "not PRD.md"). Единого стандарта PRD мы здесь не утверждаем: структура
ниже взята из `to-spec`.

## Спецификация

Шаблон упражнения: разделы `to-spec` (Matt Pocock v1.3.2) плюс отдельный раздел требований:
Problem Statement, Solution, User Stories (нумерованный список "As an <actor>, I want a <feature>,
so that <benefit>"), Requirements, Implementation Decisions, Testing Decisions, Out of Scope и по
желанию Further Notes. В Implementation Decisions по `to-spec` "Do NOT include specific file paths or
code snippets".

**Требование, которое можно проверить**, описывает наблюдаемое поведение при условии:

```markdown
- **REQ-01** WHEN an order is paid THE SYSTEM SHALL mark it as ready for shipping
```

Строка "система должна корректно обрабатывать заказы" непроверяема: не сказано, при каком условии и
что именно наблюдать.

WHEN...SHALL это один из шаблонов EARS (Alistair Mavin), тот, что использует Kiro. В EARS есть и
другие: без условия ("The <system name> shall ..."), по состоянию ("While ..."), для опции ("Where
..."), для нежелательной ситуации ("If ..., then ...") и их сочетания. В упражнении используется
только WHEN...SHALL; требование в другом шаблоне тоже бывает проверяемым.

**Шов** (seam): место, где тесты встречаются с кодом. `to-spec` просит набросать швы для тестов и
говорит: "the ideal number is one". В практике шов уже задан в описании фичи.

## ADR: решение, которое трудно отменить

- **Nygard (2011)**: заголовок, Context, Decision, Status (proposed, accepted, deprecated,
  superseded), Consequences: "All consequences should be listed here, not just the "positive" ones".
  Номера идут подряд и не переиспользуются; отменённое решение не удаляют, а помечают superseded.
- **MADR 4.0.0**: необязательный YAML front matter (`status`, `date` и другие) и разделы Context and
  Problem Statement, Decision Drivers, Considered Options, Decision Outcome с `### Consequences` и
  `### Confirmation`, Pros and Cons of the Options, More Information. Confirmation описывает, как
  проверить соблюдение решения, например тестом.
- **Matt Pocock**: шаблон `ADR-FORMAT` это заголовок и 1-3 предложения. Скилл `domain-modeling`
  предлагает ADR, только если выполнены все три условия: решение трудно отменить, оно удивит без
  контекста и оно результат настоящего компромисса.

В ADR называют и отвергнутый вариант, и почему его не взяли: без этого не видно, в чём был
компромисс. Разница между форматами в весе, а не в правильности. Если ADR пишется на каждое решение ("используем dataclasses"),
важные решения в них тонут.

## Задачи: вертикальные срезы

Скилл `to-tickets` режет работу на вертикальные срезы (tracer bullets): каждый проходит через все
слои и даёт проверяемый результат, каждый "sized to fit in a single fresh context window", у каждого
явно указано, что его блокирует.

Антипаттерн: нарезка по слоям. "T-01 модели, T-02 репозиторий, T-03 API": после первых двух задач
ничего нельзя проверить, а агент в свежей сессии не знает, зачем пишет модели.

У каждой задачи в упражнении есть идентификаторы требований и команда проверки. Это продолжение
урока 4 модуля 00: шаг без проверки нельзя объявить сделанным.

```markdown
## T-01: Paid order becomes ready for shipping
Requirements: REQ-01
Blocked by: none
Check: `PYTHONPATH=src python3 -m unittest tests.test_orders`
Status: todo
```

## Частые ошибки

- Полный процесс SDD на исправление в одну строку.
- Требования вида "должно быть быстро и правильно".
- Код и пути к файлам в Implementation Decisions.
- ADR на каждое решение или ни одного на решение, которое трудно отменить.
- ADR без отрицательных последствий.
- Задачи по слоям вместо вертикальных срезов.
- Синонимы, которых глоссарий велит избегать, в требованиях и заголовках задач.

## Что делать в практике

Вы превратите описание фичи и запись интервью в `docs/spec.md`, один ADR и `docs/tasks.md`.
Интервью уже прошло: решения D1-D5 приняты и подтверждены заказчиком, ровно одно из них стоит ADR.
