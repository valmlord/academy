# Контракт роли и вызов `claude -p` из скрипта

## Проблема

Скрипт ревью вызывал `claude -p --output-format json --json-schema '...'` и брал находки из
`structured_output`. Если этого поля не было, он искал JSON в тексте `result`. Однажды модель не
вернула структурный вывод и ответила абзацем рассуждений, а внутри абзаца был блок, похожий на JSON,
с полями `file` и `line`. Скрипт его разобрал, и эти "находки" ушли дальше как итог ревью. Код выхода
0, `subtype` равен `success`, ни одна строка скрипта не упала.

Модель тут ни при чём. У вызова не было контракта, а у результата не было проверки, и скрипт принял за
ответ то, что ответом не было.

## Контракт роли

Anthropic в статье о своей мультиагентной исследовательской системе (Hadfield и др., 2025) пишет:
"Each subagent needs an objective, an output format, guidance on the tools and sources to use, and
clear task boundaries". Без подробного описания задачи агенты, по их опыту, "duplicate work, leave
gaps, or fail to find necessary information".

В этом модуле контракт роли это файл `pipeline/contracts/<роль>.md` с тремя разделами:

- **Цель**: какой результат нужен и когда работа закончена;
- **Формат вывода**: что получит следующий этап; саму форму задаёт JSON Schema в
  `<роль>.schema.json`;
- **Границы**: чего роль не делает. Ревьюер, например, не правит код и не сообщает находку без места.

Инструментов в контракте нет. Их ставит строка вызова, и запрет исполняет харнесс, а не текст (урок 1).

Роль это отдельный процесс `claude`. Ни вашего скрипта, ни других ролей она не видит. О задаче она
знает то, что пришло в промпте и системном промпте, и то, что сама прочтёт в проекте. Всё, что ей
нужно, должно быть там.

Поэтому контракт роль получает в каждом своём вызове, целиком. Например, `--append-system-prompt-file`
добавляет текст файла к системному промпту по умолчанию, а `--system-prompt-file` заменяет им
системный промпт (CLI reference). Какие способы годятся в курсе, сказано в задании (C11).

Форма находки задана в брифе: `id, file, line, quote, claim, severity`. "Место" это файл, строка и
цитата с этой строки; в уроке 5 вы будете проверять его кодом.

## Схема вывода

`--json-schema` принимает схему строкой JSON. С `--output-format json` проверенный объект приходит в
поле `structured_output` (headless). Механизм описан на странице structured outputs, на которую
ссылается строка `--json-schema`: Claude Code добавляет в сессию инструмент `StructuredOutput`, модель
отдаёт ответ через него, и если объект не подходит под схему, вызывает его снова. Число попыток под
`-p` задаёт `MAX_STRUCTURED_OUTPUT_RETRIES`, по умолчанию 5; после них запуск падает.

Какие схемы годятся:

- "The SDK validates schemas with JSON Schema draft-07, so schemas that declare a newer version are
  rejected" (страница structured outputs);
- страница API о structured outputs перечисляет неподдерживаемое: числовые ограничения (`minimum`,
  `maximum`, `multipleOf`), `minLength` и `maxLength`, "Array constraints beyond `minItems` of 0 or 1",
  `additionalProperties` со значением не `false`. Проходит ли схема из `--json-schema` через эти
  ограничения API, документация Claude Code не говорит;
- `format` Claude Code принимает как пометку и не проверяет.

Поэтому схема в курсе описывает форму: какие поля, какого типа, какие обязательны, какие значения
допустимы в перечислениях. Диапазоны ("строка не дальше конца файла") проверяет детерминированный код
на стыке, это урок 5. Точное подмножество ключевых слов напечатано в задании.

## Вызов роли

### Что вернул вызов

С `--output-format json` вызов печатает одно сообщение `result`, со `stream-json` это последняя
строка потока; первой обычно идёт `system/init`, а между ними сообщения, которые CLI печатает по ходу
работы. По справочнику TypeScript SDK у сообщения две ветки:

- `subtype: "success"`: есть `result` (текст) и, возможно, `structured_output`;
- `subtype` из `error_max_turns`, `error_during_execution`, `error_max_budget_usd`,
  `error_max_structured_output_retries`: есть список `errors`, нет ни `result`, ни `structured_output`.

Страница structured outputs: "A `success` subtype doesn't by itself mean the run produced an answer.
Treat a result as a failure when the result's `is_error` is `true` or `structured_output` is absent".
Отсюда первые две из трёх ловушек.

1. Успех без вывода: `structured_output` нет. Это ровно случай из начала урока.
2. `success` при сбое: `is_error` равен `true`. Пример на той же странице: "the final model request
   ended in an API error or a refusal". Headless: при сбое внутри запуска, например без аутентификации,
   Claude Code "prints the failure as the result on stdout". На Claude Code 2.1.267 курс наблюдал такой
   ответ: `subtype: "success"`, `is_error: true`, `result: "Failed to authenticate: ..."`, код выхода 1. Одного
   `subtype` мало.
3. Код выхода. Он 0 при успехе и ненулевой при сбое, но и при ненулевом коде на stdout бывает JSON, и
   в нём причина.

`--max-turns` ограничивает число ходов (по умолчанию лимита нет). `--max-budget-usd` останавливает
запуск по клиентской оценке расходов, и "Spend can pass the cap" (CLI reference): лимит останавливает
разгон, а не гарантирует сумму.

Какой вид ошибки `RoleCallError` соответствует какому исходу, сказано в брифе.

### MCP и доверие к папке

Строка `--tools` в CLI reference: "The flag doesn't affect MCP tools; to deny those too, use
`--disallowedTools "mcp__*"`." Headless добавляет: "Without `--bare`, a `-p` session runs the hooks in
a project's `.claude/settings.json` and connects the servers in its `.mcp.json`, even in a folder
you've never trusted."

Значит, `--tools Read,Grep,Glob` ещё не делает роль читателем: инструменты серверов MCP остаются.
Урок учит трём способам закрыть MCP:

- `--disallowedTools "mcp__*"`: убирает все инструменты MCP;
- `--bare`: "only servers supplied on the command line connect". Ещё он пропускает хуки, skills и
  CLAUDE.md, но инструменты оставляет: "Claude has access to the Bash, file read, and file edit tools",
  так что `--tools` нужен и с ним. В bare-режиме Claude Code не читает учётные данные OAuth, и
  настоящему вызову через Anthropic API нужен `ANTHROPIC_API_KEY` (другие способы из headless урок
  не разбирает);
- `--strict-mcp-config` без `--mcp-config`: только серверы из `--mcp-config`, а их нет.

Есть и четвёртый способ, `--safe-mode`: по его строке в CLI reference не загружаются CLAUDE.md,
skills, плагины, хуки, MCP-серверы, свои команды и агенты. Урок его не разбирает, поэтому в вызове роли его нет (правило C10 в задании).

Что из проекта работает под `-p` в папке, которой никто не доверял (permissions, таблица "What runs
before you trust a folder"):

- хуки из файлов настроек и блок `env`: "Used";
- правила `permissions.allow` из `.claude/settings.json`: "Not used";
- серверы из `.mcp.json`: "Connected without asking, approved or not".

В тексте раздела "Project allow rules and workspace trust" сказано и про запреты: "`deny` and `ask`
rules aren't affected, since they only restrict." Пользовательские настройки тоже действуют: без
`--bare` запуск загружает всё, "including anything configured in the working directory or `~/.claude`"
(headless). Блок `env` проекта действует даже с `--bare` (permissions).

И действуют настройки не только на старте. Страница settings: "Claude Code watches your settings
files and reloads them when they change, so it applies most edits to the running session without a
restart, including edits to `permissions`, `hooks`..." Перезагрузка касается пользовательских,
проектных, локальных и управляемых настроек. Файл, созданный посреди сессии, Claude Code тоже
загружает, если его папка была на старте; для `.claude/` проекта и это не нужно. Исключения есть:
например, `model` читается только при старте. Так что файл настроек, который скрипт запишет на время
вызова и удалит после него, может подействовать на уже запущенную роль.

Вывод: ограничение роли пишется в её собственной строке вызова. Настройки проекта действуют на все
вызовы в папке сразу: запрет Edit "для ревьюера" в `.claude/settings.json` запретит правку и кодеру.

### Режимы

`--permission-mode` принимает `default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions`
и `manual` как синоним `default`. С версии 2.1.302 `claude -p` без режима стартует в Manual
(permission modes): "Calls needing approval are denied unless you approve them with an allow rule,
hook, `canUseTool` callback, or `--permission-prompt-tool`." Кодер без одобрения правки ничего не
изменит.

- `acceptEdits`: в таблице режимов "Reads, file edits, and common filesystem commands". Команды это
  `mkdir`, `touch`, `rm`, `rmdir`, `mv`, `cp` и `sed`, и одобряются они только для путей внутри
  рабочего каталога или `additionalDirectories`.
- Правило `--allowedTools Edit` одобряет правку и без режима: "`Edit` rules apply to all built-in
  tools that edit files" (permissions).
- `auto`: команды оболочки проверяет отдельная модель-классификатор. В курсе кодер так не работает:
  команду там одобряет классификатор, а не правило, записанное в вызове.
- `plan`: "Reads, plus classifier-approved commands when auto mode is available". Он может одобрить
  команды, поэтому как режим читателя в курсе не годится.
- `dontAsk`: отказывает в каждом вызове, который спросил бы разрешения, хотя установленный мод
  (в документации "mod", расширение из раздела о плагинах; урок их не разбирает) ещё может одобрить
  часть таких вызовов.
- `bypassPermissions`: в таблице режимов "Everything"; в курсе не используется.

### Строка вызова

Правило C10: "в вызове роли только флаги, которым учит урок: так всё, что строка вызова задаёт в
правах и выводе роли, разобрано в уроке". Список флагов в задании. Это правило о строке, а не обо всех правах
роли: хуки, `env`, deny-правила и пользовательские настройки действуют мимо неё, как показано выше.
C10 гарантирует только, что каждый флаг в строке вам объяснён.

Почему нет некоторых документированных флагов:

- `--settings`: его значения "override the same keys in your `settings.json` files", то есть один
  флаг может переключить любой ключ, права и хуки тоже;
- `--agent` и `--agents`: документация не говорит, что сильнее, `--agent` или `--model`, а серверы MCP,
  заданные прямо в `--agents`, `--strict-mcp-config` не фильтрует (sub-agents).

Ловушка списочных флагов. `--tools`, `--allowedTools` и `--disallowedTools` берут несколько значений
подряд. На Claude Code 2.1.267 курс наблюдал: промпт, стоящий после их значений, становится ещё одним
именем инструмента, и вызов падает с "Input must be provided either through stdin or as a prompt
argument". Наблюдённые варианты:

```bash
claude -p --output-format json --allowedTools Read Edit "Найди TODO"     # промпт съеден
claude -p "Найди TODO" --output-format json --allowedTools Read Edit     # промпт дошёл
claude -p --output-format json --allowedTools Read,Edit -- "Найди TODO"  # промпт дошёл
echo "Найди TODO" | claude -p --output-format json --allowedTools Read   # промпт дошёл
```

Что `--` заканчивает флаги, тоже наблюдение на 2.1.267: в CLI reference о `--` ничего нет. Надёжнее
всего stdin, и длинный промпт с diff всё равно удобнее передавать так. Если промпт идёт аргументом,
передайте `stdin=subprocess.DEVNULL`: под `-p` CLI читает stdin ("Non-interactive mode reads stdin",
headless), а без этого дочерний процесс получит stdin вашего скрипта. Учебный fake в таком случае
ждёт данных из открытого stdin до 2 секунд.

И мелочь: `-v` это `--version`, а не `--verbose`.

## Частые ошибки

- Брать `result`, когда нет `structured_output`, или считать успехом `subtype: "success"`, не глядя
  на `is_error`.
- Ставить `--tools` без закрытия MCP или считать, что `--bare` ограничивает инструменты.
- Ограничивать роль через `.claude/settings.json`.
- Давать читателю `plan`, а кодеру `auto`.
- Зашивать модель и лимит в код вместо чтения `roles.json` при каждом вызове.
- Писать схему, которая принимает всё (`{}`).

## Что делать в практике

Вы заполните контракты и схемы трёх ролей (кодер, ревьюер, summarizer) и напишете `call_role`: она
строит строку вызова из контракта и `roles.json`, вызывает `claude` и возвращает проверенный объект, а
на любом сбое бросает `RoleCallError` нужного вида. Прогоните её на учебном fake во всех его
сценариях.
