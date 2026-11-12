# Fan-out ревьюеров и synthesizer

## Проблема

Скрипт ревью запускал трёх ревьюеров: безопасность, производительность, тесты. Автор хотел, чтобы они
работали одновременно, и написал так:

```python
with ThreadPoolExecutor() as pool:
    for section in SECTIONS:
        reports[section] = pool.submit(review, section).result()
```

Каждый вызов шёл около 40 секунд, а ревью целиком две минуты. Пул потоков был, параллельности не
было. `submit` ставит вызов в работу и сразу возвращает `Future`, а `result()` ждёт конца вызова. Здесь
`result()` стоит внутри цикла, поэтому второй раздел уходит только после того, как вернулся первый.
Три вызова прошли друг за другом, втрое дольше, чем нужно.

Урок о том, как запустить независимых ревьюеров действительно параллельно, как свести их находки в
один список и когда несколько агентов вообще нужны.

## Идея: sectioning

В модуле 00 (урок 2) мы обещали шаблоны workflow, в уроке 3 построили первый: цепочку с гейтами.
Статья Anthropic "Building effective agents" (2024-12-19) описывает параллельную работу в двух
вариантах:

- "Sectioning: Breaking a task into independent subtasks run in parallel."
- "Voting: Running the same task multiple times to get diverse outputs."

Граница в самой статье размыта. Ревью кода на уязвимости несколькими промптами стоит там примером
voting, а второй пример voting говорит о промптах, которые оценивают "different aspects", то есть о
разных подзадачах. Поэтому критерий курса такой: одна и та же задача несколько раз это voting, разные
подзадачи это sectioning.

Один и тот же промпт "к какой категории относится тикет" трижды на одном тикете, с ответом
большинства, это voting.
Наши безопасность, производительность и тесты это sectioning: у каждого раздела своя задача и свой
контракт. После разделов идёт synthesizer, он сводит их находки в один список.

## Остальные шаблоны

Та же статья: "Workflows are systems where LLMs and tools are orchestrated through predefined code
paths." В workflow список шагов задан в коде до запуска.

| Шаблон | Что это | Когда подходит |
|---|---|---|
| цепочка с гейтами (урок 3) | шаги по очереди, проверка кодом между ними | задача делится на известные шаги |
| маршрутизация | "Routing classifies an input and directs it to a specialized followup task." | у входа есть отдельные категории, и их можно точно распознать |
| sectioning, voting | выше | подзадачи независимы, или нужно несколько прогонов одной задачи |
| orchestrator-workers | "a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results" | подзадачи нельзя предсказать: в коде число файлов и суть правки зависят от задачи |
| evaluator-optimizer | один вызов отвечает, другой оценивает и даёт обратную связь, в цикле | "when we have clear evaluation criteria, and when iterative refinement provides measurable value" |

Отличие orchestrator-workers от параллельных разделов статья формулирует так: "subtasks aren't
pre-defined, but determined by the orchestrator based on the specific input". Наши три раздела заданы
в коде до запуска. Агент из модуля 00 сам выбирает следующий шаг в цикле, и его путь заранее не
известен.

## Как запустить параллельно

Правило одно: сначала запустить все вызовы, потом ждать результаты.

```python
import time
from concurrent.futures import ThreadPoolExecutor

def review(section: str) -> str:
    time.sleep(1)
    return section

started = time.monotonic()
with ThreadPoolExecutor() as pool:
    futures = {s: pool.submit(review, s) for s in ("security", "performance", "tests")}
    reports = {s: f.result() for s, f in futures.items()}
print(round(time.monotonic() - started, 1))  # 1.0, а не 3.0
```

Каждый поток ждёт свой процесс `claude`, так что потоков достаточно. Годятся и `asyncio`, и
`subprocess.Popen` напрямую. У `Popen` та же ловушка: `communicate()` по документации Python "Wait for
process to terminate". Цикл, который запускает процесс и тут же зовёт его `communicate(input=...)`,
снова последовательный.

Сбой. Документация `Future.result()`: "If the call raised an exception, this method will raise the
same exception." `RoleCallError` одного раздела всплывёт на его `result()`. Не перехватите его там, и
упадёт весь пайплайн вместе с разделами, которые отработали.

## Независимость и synthesizer

Ревьюер раздела получает изменение и свой контракт. Рассуждений кодера он не получает (урок 3), ответов
других разделов тоже. Ревьюер тестов, который видел находки безопасности, уже не независимый взгляд:
он проверяет чужой вывод.

Почему параллельно можно именно ревьюеров. Walden Yan из Cognition ("Don't Build Multi-Agents",
2025-06-12) пишет: "Actions carry implicit decisions, and conflicting decisions carry bad results". В его
примере два субагента делают каждый свою часть клона Flappy Bird, фон и птицу, и в итоге выходит "a bird
and background with completely different visual styles". Это пишущие агенты. Наши ревьюеры только читают.
Вывод курса, в посте его нет: параллельные читатели не конфликтуют, их решения не попадают в общий
код. Писатель в пайплайне один, кодер.

Synthesizer вызывается, когда закончились все разделы. Он получает находки разделов, которые отработали,
с полем `section` (и `severity`: из неё он выводит важность итоговой находки), и никаких рассказов ролей. Две находки разных разделов об одной строке он может свести
в одну. Каждая итоговая находка хранит `source_ids`: id исходных находок, из которых она собрана. Это её
происхождение. Поля `section` у итоговой находки нет: какой раздел что сказал, видно по `source_ids`. В
уроке 5 код на стыке проверит, что итоговая находка сводится к принятым исходным. После synthesizer
summarizer, как в уроке 3, пишет человеку итог, только теперь по итоговым находкам.

"Находок нет" и "не проверяли" это разные ответы. Если вызов раздела упал, его не повторяют, остальные
продолжают, отчёт перечисляет упавший раздел в `unreviewed`, а `status` равен `incomplete`. Отчёт
`clean` после упавшего раздела говорит человеку неправду. Если упали все три раздела, сводить нечего, и
пайплайн останавливается без отчёта.

Fan-out умножает траты (модуль 00, урок 3): три ревьюера вместо одного, у каждого свой контекст, и
неудачные вызовы тоже стоят денег.

## Сколько агентов нужно

Результаты расходятся, и у каждого своя база:

- Anthropic о своей исследовательской системе (Hadfield и др., 2025-06-13): Claude Opus 4 ведущим и
  Claude Sonnet 4 субагентами "outperformed single-agent Claude Opus 4 by 90.2%" на внутреннем eval
  исследовательских задач. Агенты там тратят около 4x токенов чата, мультиагентные системы около 15x.
  И ещё: "most coding tasks involve fewer truly parallelizable tasks than research".
- Блог claude.com (2026-01-23): "multi-agent implementations typically use 3-10x more tokens than
  single-agent approaches".
- MAST (Cemri и др., arXiv:2503.13657 v3): "performance gains on popular benchmarks are often
  minimal".
- "The Illusion of Multi-Agent Advantage" (Jwalapuram и др., arXiv:2606.13003 v2, 2026; препринт, без
  рецензии): автоматически собранные мультиагентные системы "consistently underperform CoT-SC despite
  being up to 10x more expensive".
- Страница Anthropic "Optimizing for cost and intelligence": "In Anthropic's measurements, delegation
  came out ahead in only two situations". Первая: рутинная работа с длинным хвостом стоимости (лёгкая
  часть BrowseComp, "on earlier models"). Вторая: работа больше одного окна контекста. На внутреннем
  бенчмарке поиска дефектов Claude Opus 5.5 с субагентами Claude Sonnet 5.5 "cost about a third less
  than one Claude Opus 5.5 session per part at its default effort, and scored about the same". И: "When
  the work is one dependent chain, or fits in a single context without a long cost tail, the
  orchestrator's model alone at lower effort came out ahead in every case measured on earlier models".

Измеряли разное: разные задачи, модели и способы собрать систему. Плюс 90% получен на
исследовательских задачах, а в коде, по тому же посту, параллельных частей меньше. Страница Anthropic
прямо называет, где делегирование не окупилось: одна зависимая цепочка или работа, которая помещается
в один контекст. Поэтому выбирайте по измеримым признакам задачи: части независимы? работа больше
одного окна? есть длинный хвост рутины? Если нет, хватит одного агента. "Больше агентов значит лучше"
не признак.

## Модель на роль

Та же страница: "Tune one model before you add a second: sweep effort on your current model first" и
"Build a pairing only if it beats the single model's whole curve of score against spend." Пример оттуда,
внутренний бенчмарк задач по коду: субагенты на Claude Haiku 5.5 под Claude Opus 5.5 на `medium` снизили стоимость попытки на 32%, а долю
решённых задач примерно на 4 пункта (95% интервал от 1.3 до 7.1). Это "about what a mix of `low` and
`medium` without subagents would give at that cost". Дешевле, но не даром.

Правило курса: роли ставят более дешёвую модель, только если на ваших измерениях роль на ней
действительно дешевле, а доля успеха падает не больше допуска, который вы назвали заранее. Нет
измерения или допуска, нет и решения.

## По должностям или по контексту

В уроке 3 блог claude.com советовал делить работу по контексту, а не по типу работы. "Агент фронтенда,
агент бэкенда и агент QA пишут параллельно" это деление по должностям, и у него обе беды сразу:
координация и параллельные писатели с несогласованными неявными решениями. Модуль рекомендует другое:
один писатель и параллельные читатели, поделённые по контексту, который нужен каждой задаче. Наш
fan-out так и устроен.

## Частые ошибки

- `result()` или `communicate(input=...)` внутри цикла запуска.
- Один `RoleCallError` роняет все разделы.
- Упавший раздел выпал из отчёта или помечен как проверенный.
- Упавший раздел вызван ещё раз.
- Ответ одного ревьюера передан другому, "чтобы не повторялись". В том числе через общий файл, который
  пополняется, пока разделы ещё работают, или только местами находок без `id`.
- Synthesizer получил ответы ревьюеров целиком вместо находок.
- Итоговая находка без `source_ids`.
- Несколько агентов "потому что специалисты", без измерения.

## Что делать в практике

Вы заполните контракты и схемы трёх разделов и synthesizer, запустите разделы параллельно в
`pipeline/run.py`, сведёте их находки через synthesizer, передадите его итог summarizer и отметите
упавшие разделы. Потом квиз о выборе шаблона и модели.
