# Academy

Личная платформа обучения в духе Hexlet. Первый курс: "ИИ для разработчиков". Всё обучение
идёт через веб-интерфейс: теория, рабочее место с терминалом и агентом в Docker-контейнере,
проверки, разбор ментора, прогресс в кабинете.

Платформу и курс делают две команды агентов, а процесс устроен как в настоящей продуктовой
команде: задачи в GitHub Issues, ветки, PR, CI, ADR. Часть задач по платформе (`tier:learn`)
пишу сам, агенты проектируют и ревьюят.

## Где что лежит

```
CLAUDE.md                 инструкции оркестратора: как идёт любая задача
.claude/pipeline.json     машина состояний: уровни задач, фазы, судьи (источник истины)
.claude/agents/dev/       команда разработки: researcher, architect, coder, tester, mentor, 3 судьи
.claude/agents/content/   методисты: content-researcher, curriculum-architect, lesson-author,
                          practice-designer, student, 3 судьи
.claude/hooks/            хуки, которые не дают нарушить процесс
.claude/feedback/         ошибки ролей: каждый FAIL судьи дописывает урок, роль читает перед работой
pipeline/                 описание машины состояний и общие правила для агентов
docs/learning-process.md  как устроено обучение (начать отсюда)
docs/architecture.md      компоненты платформы
docs/adr/                 архитектурные решения
docs/course-reference.md  референсная программа курса
packages/lesson-schema/   контракт урока между командами + валидатор
course/                   контент курса (пишут методисты)
learner/                  профиль и журнал ученика (по нему подстраивается курс)
backlog/                  черновики первых задач, импортируются в GitHub Issues
tests/pipeline/           самотест хуков пайплайна
```

## Старт

Нужно: Node 22, pnpm 10, Docker, git, gh, python3, свежий Claude Code (хуки используют SubagentStop с `agent_transcript_path`).

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm content:validate && pnpm test:pipeline
cp .env.example .env
docker compose up -d --wait
```

## Подключить GitHub

```bash
gh repo create academy --private --source . --push
python3 scripts/github_bootstrap.py --dry-run   # посмотреть план
python3 scripts/github_bootstrap.py             # метки, вехи и 20 задач из backlog/
```
Скрипт также заменяет `@OWNER` в `.github/CODEOWNERS` на твой логин. Это изменение надо
закоммитить через ветку и PR, как любое другое.

## Как запустить задачу

Открываешь Claude Code в репозитории и пишешь, например, "возьми #1". Оркестратор читает задачу,
выбирает уровень, объявляет `[PROJECT #1] pipeline: ...`, создаёт ветку и ведёт задачу по фазам
до PR. Подробности в `CLAUDE.md`.

Предлагаемый порядок: #1 (каркас web) и модуль "Введение" параллельно, затем M0, затем
LEARN-задачи M1.
