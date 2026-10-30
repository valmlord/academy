# Скиллы: устройство и жизненный цикл в проекте

## Проблема

В CLAUDE.md 120 строк, из них 40 занимает процедура релиза, которая нужна раз в месяц, и 25 строк
описания, как проверять изменения. Всё это грузится в каждую сессию, а агент всё равно один раз сам
запустил релиз.

CLAUDE.md читается целиком в начале каждой сессии. Процедура релиза там это просто ещё одна
инструкция, и модель вправе решить, что сейчас её время. Нужен способ держать процедуру рядом, но
грузить её по требованию и решать, кто её вызывает.

## Идея: знание, которое грузится по требованию

**Скилл** это каталог с файлом `SKILL.md` (YAML-frontmatter и Markdown) и, по желанию, каталогами
`scripts/`, `references/`, `assets/`. Формат описан открытым стандартом Agent Skills
(agentskills.io); Anthropic разработала его и опубликовала как открытый стандарт.

Загрузка по шагам (progressive disclosure, по спецификации):

1. при старте в контекст попадают только имя и описание каждого скилла (около 100 токенов);
2. тело `SKILL.md` загружается при активации: "Keep your main SKILL.md under 500 lines";
3. файлы из `references/`, `scripts/`, `assets/` нужны по ходу работы.

Ссылки держат на одном уровне. Спецификация: "Avoid deeply nested reference chains". Руководство
Anthropic по написанию скиллов: "All reference files should link directly from `SKILL.md`", потому
что "Claude might partially read files when they're referenced from other referenced files". Речь о
цепочках чтения, а не о глубине каталогов. Скрипт другое дело: на него может ссылаться и справочный
файл, его запускают, а не читают ("Claude can run it without loading its contents into context").

## Три набора правил, а не один

- **Спецификация agentskills.io.** `name` обязателен: 1-64 символа, строчные буквы, цифры и дефис,
  без дефиса по краям и без `--`, совпадает с именем каталога. `description` обязателен, 1-1024
  символа. Ещё есть `license`, `compatibility`, `metadata`, `allowed-tools` (экспериментальное).
- **Claude Code 2.1.312.** Все поля необязательны, `name` по умолчанию равен имени каталога. Сверху
  поля Claude Code (`disable-model-invocation`, `user-invocable`, `context`, `hooks` и другие, всего
  в таблице 20). Незнакомое поле Claude Code молча игнорирует, так что опечатка в имени поля не даёт
  ошибки. Булевы поля принимают `yes`, `no`, `on`, `off`, `1`, `0` в любом регистре, помимо `true`
  и `false`.
- **Подстановки в теле (Claude Code).** `${CLAUDE_SKILL_DIR}` это "The directory containing the
  skill's `SKILL.md` file": через него тело вызывает свой скрипт "regardless of the current working
  directory", например `python3 ${CLAUDE_SKILL_DIR}/scripts/release.py`. `$ARGUMENTS` это "All
  arguments passed when invoking the skill", то есть текст после `/release`.
- **Загрузка в claude.ai, Skills API и упаковка `package_skill.py`** из anthropics/skills (раздел
  "Using skill frontmatter outside Claude Code"): можно только `name`, `description`, `license`,
  `compatibility`, `metadata`, `allowed-tools`. "If you include a field the spec doesn't allow,
  packaging or upload fails with a hard error instead of ignoring the field."

Другие клиенты читают лишние поля по-своему: например, Cursor поддерживает
`disable-model-invocation`. Вывод: поле Claude Code ставьте только туда, где оно нужно, а скилл,
который должен переноситься, держите на полях спецификации.

## Кто вызывает скилл (Claude Code 2.1.312)

| Frontmatter | Вы | Claude | Что в контексте |
|---|---|---|---|
| по умолчанию | да | да | описание всегда, тело при вызове |
| `disable-model-invocation: true` | да | не сам | описания нет, тело при вызове |
| `user-invocable: false` | нет | да | описание всегда, тело при вызове |

Процедуре с побочными эффектами (релиз, деплой) нужен `disable-model-invocation: true`.
`user-invocable: false` модель не останавливает: "you can't invoke the skill, but Claude still can".

`allowed-tools` разрешает перечисленные инструменты без запроса только в ходе, который вызвал скилл.
Ограничением он не служит: "every tool remains callable".

В Codex аналог `disable-model-invocation` это `policy.allow_implicit_invocation: false` в
`agents/openai.yaml` скилла.

## Где лежат скиллы

Claude Code: личные `~/.claude/skills/<имя>/SKILL.md`, проектные `.claude/skills/<имя>/SKILL.md`,
скиллы плагинов (вызываются как `/plugin-name:skill-name`) и корпоративные. При одинаковых именах
"Enterprise over personal, and personal over project". Команды слились со скиллами: файл
`.claude/commands/<имя>.md` проигрывает скиллу с тем же именем, и два источника одной процедуры
расходятся.

`.agents/skills/` в проекте читают Codex, Cursor, Gemini CLI и GitHub Copilot. На странице скиллов
Claude Code 2.1.312 этот каталог не упомянут, поэтому для Claude Code скилл кладут в
`.claude/skills/`.

**Плагин** это устанавливаемый набор скиллов, хуков и команд. В README Matt Pocock сказано: "A plugin
updates itself".

Примеры наборов (имена не проверяются): anthropics/skills (`skill-creator`, `pdf`, `webapp-testing`
и другие) и скиллы Matt Pocock v1.3.2, их конвейер разберём в уроке 5.

## Скилл, CLAUDE.md, хук или субагент

- **CLAUDE.md** грузится в каждую сессию. Туда идёт то, что нужно всегда, например команда тестов.
- **Скилл** грузится по требованию: процедура или справка. Сигнал из документации: "You paste the
  same playbook or multi-step procedure into chat for the third time".
- **Хук** "Fires on its event without Claude deciding". Если правило обязано выполняться каждый раз,
  ему место в хуке: "Claude skipped a rule that must hold every time: move the rule into a hook".
- **Субагент** работает в своём контексте и возвращает сводку.

`@`-импорт в CLAUDE.md и файл в `.claude/rules/` остаются памятью: импорт грузится вместе с
CLAUDE.md, правило грузится сразу или при работе с файлами из `paths:` (урок 5 модуля 00). Перенос
процедуры туда не делает её скиллом.

## Мост к уроку 1: скилл `verify`

Claude Code 2.1.312: "When a session starts with a skill named `verify` or `simplify` in place,
Claude Code's commit instructions tell Claude to run it right before each commit, except for changes
to docs or tests" (с v2.1.286). Проектный скилл `verify` заменяет встроенный. Это инструкция модели,
а не ворота харнесса: детерминированной проверкой остаются Stop-хук и CI. С
`disable-model-invocation: true` инструкции коммита на скилл уже не указывают. Встроенный `/verify`
проверяет изменение запуском приложения "without falling back to tests or type checks", поэтому
`verify` на тестах меняет смысл этого имени для команды.

В практике мы сознательно берём этот обмен. Плюс: на проектный скилл с именем `verify` указывают
инструкции коммита, и процедура проверки тестами выполняется перед каждым коммитом (кроме правок
документации и тестов). Цена: `/verify` в этом проекте больше не значит встроенную проверку
запуском приложения. Команда, которой нужно и то и другое, даёт своему скиллу другое имя и теряет
привязку к коммитам.

## Жизненный цикл

1. Написать скилл.
2. Проверить на реалистичных запросах в свежих сессиях со скиллом и без него: "Seeing a skill
   trigger tells you Claude found it, not that it did what you intended."
3. Подправить описание: от него зависит, найдёт ли модель скилл.
4. Смотреть `/skill-doctor` (с v2.1.252): сколько стоит каждый скилл и как часто он вызывается.
5. Удалять то, что не используется.

## Чужие скиллы

- Документация Anthropic: "Use Skills only from trusted sources"; вредный скилл может заставить
  Claude вызывать инструменты не по назначению. Читайте каждый файл скилла.
- `` !`команда` `` в теле скилла выполняется до того, как содержимое увидит модель.
- Поле `hooks` скилла это "Hooks that Claude Code registers when the skill is invoked and keeps
  running for the rest of the session": они включаются при вызове скилла, а не при старте сессии, и
  работают до её конца.
- В Claude Code у скилла тот же доступ к сети, что у любой программы на компьютере.
- Плагин, который обновляется сам, меняет содержимое без вашего ревью (цепочка поставок, LLM03 из
  урока 6 модуля 00). Проверенная копия в репозитории управляется вами.

## Частые ошибки

- Держать процедуру релиза в CLAUDE.md "на всякий случай".
- Оставить релиз без `disable-model-invocation: true`.
- Считать `user-invocable: false` запретом для модели.
- Считать `allowed-tools` ограничением.
- Ставить поля Claude Code в скилл, который будут загружать в Skills API.
- Опечататься в имени поля: Claude Code промолчит.
- Перенести процедуру в `@`-импорт или `.claude/rules/` и считать, что память похудела.

## Что делать в практике

Вы вынесете из раздутого CLAUDE.md процедуру проверки в переносимый скилл `verify`, процедуру релиза
в скилл `release`, который модель сама не вызывает, перенесёте скрипт релиза внутрь скилла и
оставите в памяти проекта только то, что нужно в каждой сессии.
