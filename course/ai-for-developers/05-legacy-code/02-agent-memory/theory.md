# Погружение агента: факт там, где он нужен

## Проблема

Команда parcel-desk записала в корневой `CLAUDE.md`: внешний демон `printerd` забирает этикетки по именам файлов, которые пишет `shipping/labels.py`. Основная сессия поручает встроенному Explore разобрать `labels.py`. Explore возвращает аккуратную карту модуля и предлагает "привести имена файлов к единому виду". Про `printerd` в отчёте ни слова: Explore начинает работу без ваших файлов CLAUDE.md, и строку из корня он не получил.

Факт был записан, но не там, где он нужен. В legacy-проекте таких фактов много: внешняя система читает файлы, которые пишет один модуль; выгрузка каждую неделю заменяет файл данных; любое изменение цены согласуют с другой командой. Этот урок про то, куда положить каждый такой факт, чтобы агент получил его тогда, когда работает с нужным файлом.

## Идея: место факта следует из его охвата

Факт области касается названных файлов. Ему нужно место, которое загружается, когда агент работает с этими файлами: `CLAUDE.md` в подкаталоге или правило в `.claude/rules/` с полем `paths`. Факт сессии касается любого файла, в том числе модуля, которого ещё нет. Ему нужно место, которое загружается при запуске: корневой `CLAUDE.md`, правило без `paths` или файл, импортированный из корневого `CLAUDE.md`.

У выбора есть последствия. Факт сессии в корневом `CLAUDE.md` до Explore не доходит. Факт области в правиле с `paths` или в `CLAUDE.md` подкаталога доходит до Explore, когда тот работает с файлами этой области. А факт области в месте, которое загружается при запуске, агент получает при работе с любым файлом, и по модели проверки этого урока это ошибка размещения.

В практике уровень заметки решает её последняя строка, строка охвата: `Applies only to:` со списком файлов или `Applies to: any file, a new module included.`. Если факт можно приложить и к другому файлу, уровень от этого не меняется.

## Что говорит документация

Утверждения ниже взяты для Claude Code 2.1.311 (эта версия стоит в рабочей среде) и проверены 2026-11-16. Каждое названо по странице и заголовку раздела.

- Страница памяти, "How CLAUDE.md files load": "Claude Code loads `CLAUDE.md` and `CLAUDE.local.md` from your current working directory and every directory above it." Поэтому в курсе сессия запускается из корня репозитория, `/workspace/home/work`: иначе корневой файл окажется файлом подкаталога.
- Там же про подкаталоги: "Instead of loading them at launch, Claude Code loads each one once Claude reads, writes, or edits another file in that subdirectory." Чтение включает просмотр одного файла командой Bash. Справочник инструментов, "Edit tool behavior", перечисляет эти команды: "Those commands are `cat`, `nl`, `bat`, `batcat`, `head`, `tail`, `sed -n 'X,Yp'`, `grep`, `egrep`, `fgrep`, and `rg`, each run on one file with no pipes or redirects." И дальше: "When Claude views a file this way, Claude Code also loads any subdirectory `CLAUDE.md` and path-scoped rules that apply to that file."
- Страница памяти, "Set up rules": "Rules without `paths` frontmatter are loaded at launch with the same priority as `.claude/CLAUDE.md`." В "Rule frontmatter reference": "If the YAML between the markers doesn't parse, Claude Code ignores the frontmatter and loads the rule as if it had no `paths`." И: "`paths` is the only field Claude Code reads from a rule; any other field is ignored without an error. Claude Code removes the frontmatter before loading the rule into context."
- "Path-specific rules": "A path-scoped rule loads when Claude uses the Read, Write, or Edit tool on a matching file." Просмотр одного файла командой Bash тоже считается. Шаблоны считаются от базового каталога, для правил проекта это "the directory that contains the rule's `.claude` folder". Шаблон без `/`, например `*.md`, совпадает с файлами на любой глубине, а `/*.md` только с файлами прямо в базовом каталоге. Значение `paths` по таблице в "Rule frontmatter reference" "Accepts a YAML list or a comma-separated string".
- "Import additional files": "CLAUDE.md files can import additional files using `@path/to/import` syntax." Относительный путь считается от файла с импортом, импорты бывают вложенными "with a maximum depth of four hops", и "Import parsing skips Markdown code spans and fenced code blocks." Про комментарии сказано в "How CLAUDE.md files load": блочные HTML-комментарии в файлах CLAUDE.md вырезаются до того, как текст попадает в контекст, комментарии внутри блоков кода сохраняются, а "When you open a CLAUDE.md file directly with the Read tool, comments remain visible".
- Страница про субагентов, "Built-in subagents": "Explore and Plan start without your CLAUDE.md files and the git status snapshot to keep research fast and inexpensive." В "What loads at startup": "For Explore, Plan, and subagents with `omitClaudeMd`, a subdirectory's `CLAUDE.md` and matching path-scoped rules still load when the subagent works with files there."
- Best practices, "Give Claude a check to run": "If your repo already has one of these, the single most useful line in your `CLAUDE.md` is the command that runs it." В parcel-desk такая проверка есть, это тесты на `unittest`. pytest в рабочей среде нет.

Чего документация не говорит. Она называет чтение, запись и правку файла (и просмотр одного файла через `cat`, `head`, `grep` в Bash); про поиск инструментами Grep и Glob она молчит, поэтому на них не рассчитывайте. Рекурсивный `grep -r` это не просмотр одного файла. Правка через `sed -i` или перенаправление `>` в Bash тоже не названа среди триггеров: для правил с `paths` документация называет инструменты Read, Write и Edit и просмотр одного файла. Если факт должен срабатывать при любой правке гарантированно, нужна уже не память, а хук, как на ступени про хуки в лестнице размещения из урока 1 модуля 02.

## Как это проверяется в практике

Проверка не запускает Claude Code. Она вычисляет загрузку по своей модели, построенной на утверждениях выше, и читает только четыре места: корневой `CLAUDE.md`, `CLAUDE.md` в подкаталогах, `.claude/rules/**/*.md` в корне репозитория и файлы `.md`, до которых доходит импорт `@` из `CLAUDE.md`. Это правило курса, а не полный список мест, откуда Claude Code берёт память. Точные правила модели, термины фактов и сообщения проверки в задании.

Пример правила области из другого, выдуманного проекта:

```markdown
---
paths:
  - billing/invoice.py
---
Отдел отчётности читает CSV, который пишет `billing/invoice.py`, по номерам столбцов, а не по заголовкам.
```

По модели проверки этот текст загружается при чтении, записи или правке `billing/invoice.py` и не загружается при работе с другими файлами.

## Привычка: сверять загрузку с документацией своей версии

Когда и вместе с какими файлами агент загружает файл памяти, решает конкретный инструмент, и документация Claude Code сама отмечает, что это менялось от версии к версии. На странице памяти есть, например, "Reading `AGENTS.md` directly requires Claude Code v2.1.277 or later" и "Before v2.1.309, Claude Code didn't apply this limit to files that load on demand". Страницы описывают только новейший выпуск; на сегодня это 2.1.326 (16 ноября 2026), проверено 2026-11-17. Поэтому, прежде чем полагаться на загрузку, проверьте её для своей версии и запишите, что проверили:

1. Узнайте версию: `claude --version` печатает её в виде `<версия> (Claude Code)`.
2. Откройте страницы из таблицы ниже и найдите каждое утверждение под его заголовком. Поиском по странице найдите внутри этих разделов упоминания версий и сравните их со своей версией.
3. Откройте список изменений (changelog), найдите запись своей версии и прочитайте все записи выше неё, то есть новее, с поиском по словам CLAUDE.md, rules, `paths`, import, memory, Explore.
4. Запишите в корневой `CLAUDE.md` одной строкой: `<!-- memory layout checked: Claude Code <version>, docs and changelog read <YYYY-MM-DD> -->`.

Блочный комментарий вырезается до того, как текст попадает в контекст агента, но виден, когда файл открыт через Read, и виден людям в репозитории. Адреса страниц, подробности каждого шага и то, как читать упоминания версий, в задании.

| Утверждение | Страница | Раздел |
|---|---|---|
| загрузка из рабочего каталога и выше; `CLAUDE.md` подкаталога при работе с файлом там; комментарии | память | "How CLAUDE.md files load" |
| команды Bash, которые считаются просмотром одного файла | справочник инструментов | "Edit tool behavior" |
| правила без `paths` загружаются при запуске | память | "Set up rules" |
| неразобранный frontmatter, единственное поле `paths`, frontmatter убирается, формы значения `paths` | память | "Rule frontmatter reference" |
| когда загружается правило с `paths`, базовый каталог, шаблоны | память | "Path-specific rules" |
| импорты `@` | память | "Import additional files" |
| Explore начинает без файлов CLAUDE.md | субагенты | "Built-in subagents" |
| `CLAUDE.md` подкаталога и правила с `paths` у Explore | субагенты | "What loads at startup" |
| команда проверки в `CLAUDE.md` | best practices | "Give Claude a check to run" |

## Частые ошибки

- Все заметки в корневом `CLAUDE.md`: факты областей загружаются при запуске, то есть с любым файлом.
- `@docs/team-notes.md` в корневом `CLAUDE.md`: по модели проверки все пять фактов загружаются при запуске.
- Правило с шаблоном `*.py` для факта одного модуля: шаблон без `/` совпадает с файлами на любой глубине.
- `shipping/CLAUDE.md` для факта о двух файлах: он загружается и при работе с другими файлами этого каталога, например с `shipping/quote.py`.
- Термин факта области в строке оглавления корневого `CLAUDE.md`.
- Устаревшая команда тестов оставлена как есть.
- Версия в отметке переписана из урока, а не взята из `claude --version`.

## Что делать в практике

В рабочей папке parcel-desk с одним тестом, корневой `CLAUDE.md` в стиле сгенерированного файла и `docs/team-notes.md` с пятью заметками команды. Нужно исправить команду тестов, пройти проверку версии и разместить каждую заметку по её строке охвата.
