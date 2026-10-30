# #41 demo record B: L2 `02-skills`, L3 `03-domain-ontology`, L4 `04-spec-adr-tasks`

Practice-designer B, run 2026-10-29 on macOS. Interpreters: `python3` = `/opt/homebrew/bin/python3.12`
(Python 3.12.13) through a shim first on `PATH`; second run of starter and reference on Python 3.11.14;
no 3.10 on this machine (`/usr/bin/python3` is 3.9.6, used only for the PyYAML 6.0.3 comparison and the
quiz scorer). Re-run on the image interpreter before `ready` (design 2.4).

Protocol (00 2.4): for every case a fresh copy of `starter/` (plus `checks/reference/` overlaid for
reference-based cases; for L2 the root `scripts/release.py` is deleted first, because an overlay cannot
delete), then `env -i PATH=<shim>:/usr/bin:/bin HOME=<copy>/.home ACADEMY_CHECKS_DIR=$G python3 -I
"$G/<script>"` in the copy, where `$G` is `checks/` without `reference/` and `data/reserve/`. Driver and
outputs (scratch, not shipped): `scratchpad/pdB/demo.py`, `run.sh`, `all.out`, `cheats.py`,
`yaml_compare.py`, `resolver_demo.py`, `quiz_demo.py`.

## Shared code for practice-designer A

- 2.3 subset + 2.7 grammar/resolver + C1-C6: `course/ai-for-developers/01-spec-driven-development/04-spec-adr-tasks/checks/sdd_grammar.py`
  (canonical; identical copies in `02-skills/checks/` and `03-domain-ontology/checks/`), sha256
  `8055c2a2ce9478d5f35f713d7979403f9d1056bf1056e718923754c3f50f40a3`. The copy in `01-verification/checks/`
  is an older snapshot (frontmatter messages differ); A should re-copy and diff.
- API: `parse_frontmatter(text, boolean_fields=..., typed_rule_only=...)`, `read_boolean`, `tokens`,
  `token_matches`, `fenced_line_flags`, `scanned_regions`, `avoided_tokens`, `test_method_names`,
  `labels_of`, `record_method_name`, `load_glossary(root).avoid_words`, `parse_spec`, `parse_tasks`,
  `find_cycle`, `parse_adr`, `load_root`, `check_c1..check_c6`, `lint(root, avoid_words)`,
  `Finding.line()` = `<rule> <file>: <token>`; `ArtifactParseError` = linter exit 2.
- Resolution choices the design leaves open (A's L7 roots and task.md must agree): requirement lines are
  read from `## Requirements` only, outside fences; C1 "listed" = the `Requirements:` line, C2 "cited" =
  any `REQ-NN` in the task block (heading included) or a test label; C5 scans spec and tasks lines outside
  fences (headings included); `## T-NN:` headings and field lines inside fences or with `T-NN`/`REQ-NN`
  placeholders are not tasks; C4 also reports a duplicate number or a Nygard title number that differs from
  the file number (token: file name).
- One-violation roots: a done task citing a missing REQ also yields C3 (`C2 ... REQ-12`, `C3 ... REQ-12`),
  and a dangling or self `superseded by` also yields C5 if spec/tasks cite that ADR. Build those L7 roots
  with a `todo` task and without the citation.
- L4 domain fixed in the L4 starter (`docs/feature-brief.md`, `src/invoices/models.py`): `Invoice(id, customer,
  currency, status: InvoiceStatus, dispute: DisputeState, issued_on, due_on, lines: list[InvoiceLine],
  paid_cents)`, `SentReminder(invoice_id, level: ReminderLevel, sent_on)`, `Reminder(invoice_id, customer,
  level, outstanding_cents, currency)`; enums `InvoiceStatus` DRAFT/ISSUED/PAID/CANCELLED, `DisputeState`
  NONE/OPEN/RESOLVED, `ReminderLevel` FIRST/SECOND/FINAL. L4 reference: REQ-01..REQ-08, T-01..T-05,
  ADR-0001 (`checks/reference/docs/`): the L5 starter and L5 mutants must follow these texts.
- Starters L2-L4 carry A's L1 reference state (A's `01-verification/starter` + `checks/reference`, without
  `agent-report.md`), synced 2026-10-29; re-sync if A changes L1.

## Results: every command case (147 cases, 0 mismatches)

`ok` = verdict as designed. Columns: lesson | base | case | verdict | first message line.

```
ok  | 02 | starter   | untouched starter | FAIL(exit 1) | .claude/skills/verify/SKILL.md: не найден
ok  | 02 | reference | reference | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | verify with disable-model-invocation: true | FAIL(exit 1) | .claude/skills/verify/SKILL.md: поле `disable-model-invocation` не переносимо: при упаковке или загрузке в clau
ok  | 02 | reference | verify with disable-model-invocation: yes | FAIL(exit 1) | .claude/skills/verify/SKILL.md: поле `disable-model-invocation` не переносимо: при упаковке или загрузке в clau
ok  | 02 | reference | release without disable-model-invocation | FAIL(exit 1) | .claude/skills/release/SKILL.md: нет `disable-model-invocation`: модель может вызвать релиз сама
ok  | 02 | reference | release disable-model-invocation: false | FAIL(exit 1) | .claude/skills/release/SKILL.md: `disable-model-invocation` ложно: модель всё ещё может вызвать скилл сама
ok  | 02 | reference | release disable-model-invocation: no | FAIL(exit 1) | .claude/skills/release/SKILL.md: `disable-model-invocation` ложно: модель всё ещё может вызвать скилл сама
ok  | 02 | reference | release disable-model-invocation: Off | FAIL(exit 1) | .claude/skills/release/SKILL.md: `disable-model-invocation` ложно: модель всё ещё может вызвать скилл сама
ok  | 02 | reference | release disable-model-invocation: 0 | FAIL(exit 1) | .claude/skills/release/SKILL.md: `disable-model-invocation` ложно: модель всё ещё может вызвать скилл сама
ok  | 02 | reference | release disable-model-invocation: "true" | FAIL(exit 1) | .claude/skills/release/SKILL.md: frontmatter, строка 4: `disable-model-invocation`: outside this exercise: write the boolean unquoted
ok  | 02 | reference | release disable-model-invocation: 'yes' | FAIL(exit 1) | .claude/skills/release/SKILL.md: frontmatter, строка 4: `disable-model-invocation`: outside this exercise: write the boolean unquoted
ok  | 02 | reference | release disable-model-invocation: enabled | FAIL(exit 1) | .claude/skills/release/SKILL.md: `disable-model-invocation: enabled` - не документированное написание булева
ok  | 02 | reference | release user-invocable: no | FAIL(exit 1) | .claude/skills/release/SKILL.md: `user-invocable` ложно: тогда вызвать скилл не можете вы, а Claude может ("With
ok  | 02 | reference | release user-invocable: 0 | FAIL(exit 1) | .claude/skills/release/SKILL.md: `user-invocable` ложно: тогда вызвать скилл не можете вы, а Claude может ("With
ok  | 02 | reference | typo key disable-model-invokation | FAIL(exit 1) | .claude/skills/release/SKILL.md: неизвестное поле `disable-model-invokation`: Claude Code молча игнорирует неизве�
ok  | 02 | reference | CL 2.1.186 key display-name | FAIL(exit 1) | .claude/skills/release/SKILL.md: неизвестное поле `display-name`: Claude Code молча игнорирует неизвестные п
ok  | 02 | reference | CL 2.1.186 key default-enabled | FAIL(exit 1) | .claude/skills/release/SKILL.md: неизвестное поле `default-enabled`: Claude Code молча игнорирует неизвестные
ok  | 02 | reference | CL 2.1.186 key fallback | FAIL(exit 1) | .claude/skills/release/SKILL.md: неизвестное поле `fallback`: Claude Code молча игнорирует неизвестные пол
ok  | 02 | reference | name: Verify | FAIL(exit 1) | .claude/skills/verify/SKILL.md: `name` вне этого упражнения: 1-64 символов из a-z, 0-9 и одиночных дефисо�
ok  | 02 | reference | name: verify- | FAIL(exit 1) | .claude/skills/verify/SKILL.md: `name` вне этого упражнения: 1-64 символов из a-z, 0-9 и одиночных дефисо�
ok  | 02 | reference | name: ver--ify | FAIL(exit 1) | .claude/skills/verify/SKILL.md: `name` вне этого упражнения: 1-64 символов из a-z, 0-9 и одиночных дефисо�
ok  | 02 | reference | name does not match dir (releases) | FAIL(exit 1) | .claude/skills/release/SKILL.md: `name` должен совпадать с именем каталога скилла `release`
ok  | 02 | reference | description 1025 chars | FAIL(exit 1) | .claude/skills/release/SKILL.md: `description` длиной 1025 символов, нужно от 20 до 1024
ok  | 02 | reference | description: Use when: tests fail (unquoted) | FAIL(exit 1) | .claude/skills/release/SKILL.md: frontmatter, строка 3: quote the value: в нём есть `: ` или оно кончается на `:`
ok  | 02 | reference | disable-model-invocation: true # human only | FAIL(exit 1) | .claude/skills/release/SKILL.md: frontmatter, строка 4: remove the trailing comment: ` #` в значении без кавычек
ok  | 02 | reference | frontmatter after a blank line | FAIL(exit 1) | .claude/skills/verify/SKILL.md: frontmatter, строка 1: первая строка файла должна быть ровно `---` (frontmatter 
ok  | 02 | reference | body references a missing path | FAIL(exit 1) | .claude/skills/release/SKILL.md: путь `references/checklist.md` из тела не существует внутри каталога скилла
ok  | 02 | reference | chain SKILL.md -> references/a.md -> references/b.md | FAIL(exit 1) | .claude/skills/release/references/a.md: ссылается на `references/b.md`, а SKILL.md на этот файл не ссылается; пра�
ok  | 02 | reference | release procedure kept in CLAUDE.md | FAIL(exit 1) | память проекта (CLAUDE.md): 44 непустых строк вместе, допускается не больше 20
ok  | 02 | reference | procedure moved to docs/release.md and imported with @docs/release.md | FAIL(exit 1) | память проекта (CLAUDE.md, docs/release.md): 46 непустых строк вместе, допускается не больше 20
ok  | 02 | reference | procedure moved to .claude/rules/release.md (no paths:) | FAIL(exit 1) | память проекта (.claude/rules/release.md, CLAUDE.md): 45 непустых строк вместе, допускается не больш
ok  | 02 | reference | procedure moved to .claude/rules/release.md (with paths:) | FAIL(exit 1) | память проекта (.claude/rules/release.md, CLAUDE.md): 49 непустых строк вместе, допускается не больш
ok  | 02 | reference | root scripts/release.py left in place | FAIL(exit 1) | scripts/release.py: старый скрипт в корне репозитория должен быть перенесён в скилл
ok  | 02 | reference | skills only under .agents/skills/ | FAIL(exit 1) | .claude/skills/verify/SKILL.md: не найден; скилл лежит только в .agents/skills/verify/, а страница скиллов Cl
ok  | 02 | reference | .claude/commands/release.md present | FAIL(exit 1) | .claude/commands/release.md: команда с тем же именем, что у скилла: скилл побеждает, но два источ
ok  | 02 | reference | memory without the test command | FAIL(exit 1) | память проекта (CLAUDE.md): нет команды тестов `PYTHONPATH=src python3 -m unittest discover -s tests -t .`
ok  | 02 | reference | verify body without the test command | FAIL(exit 1) | .claude/skills/verify/SKILL.md: в теле нет команды тестов `PYTHONPATH=src python3 -m unittest discover -s tests -t .` в обра
ok  | 02 | reference | second space after the colon (name:  verify) | FAIL(exit 1) | .claude/skills/verify/SKILL.md: frontmatter, строка 2: one space after the colon: второй пробел после двоеточия отк
ok  | 02 | reference | metadata version: 1.0 unquoted | FAIL(exit 1) | .claude/skills/verify/SKILL.md: frontmatter, строка 6: quote the value: без кавычек YAML читает его как число, дат
ok  | 02 | reference | block scalar description: > | FAIL(exit 1) | .claude/skills/release/SKILL.md: frontmatter, строка 3: write the value on one line: значение без кавычек не может начинаться с | или >
ok  | 02 | reference | tab in a value | FAIL(exit 1) | .claude/skills/verify/SKILL.md: frontmatter, строка 4: outside this exercise: символ табуляции
ok  | 02 | reference | duplicate key | FAIL(exit 1) | .claude/skills/verify/SKILL.md: frontmatter, строка 5: outside this exercise: повторный ключ `license`
ok  | 02 | reference | empty value (license:) | FAIL(exit 1) | .claude/skills/verify/SKILL.md: frontmatter, строка 4: outside this exercise: пустое значение (незаполненный ключ
ok  | 02 | reference | flow sequence allowed-tools: [Bash] | FAIL(exit 1) | .claude/skills/release/SKILL.md: frontmatter, строка 5: quote the value: значение начинается со служебного сим�
ok  | 02 | reference | name non-ASCII (vérify) in verify dir | FAIL(exit 1) | .claude/skills/verify/SKILL.md: `name` вне этого упражнения: 1-64 символов из a-z, 0-9 и одиночных дефисо�
ok  | 02 | reference | near-miss disable-model-invocation: true | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss disable-model-invocation: True | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss disable-model-invocation: TRUE | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss disable-model-invocation: yes | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss disable-model-invocation: Yes | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss disable-model-invocation: on | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss disable-model-invocation: ON | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss disable-model-invocation: 1 | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss user-invocable: yes | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss user-invocable: 1 | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss direct reference to references/a/b.md | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss references/a.md links back to SKILL.md | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss SKILL.md -> a.md and b.md, a.md also links b.md | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss SKILL.md -> forms.md -> scripts/fill.py (PBP) | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss description: "Use when: tests fail" | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss description: 'Use when: tests fail' | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss metadata with two pairs | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss whole-line # comment in frontmatter | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss allowed-tools on release | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss when_to_use on release | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss body prose 'перенесено из `scripts/release.py`' | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss CLAUDE.md 8 lines + .claude/rules/style.md 6 lines | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss procedure in docs/release.md that nothing imports | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss CRLF line endings in SKILL.md | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 02 | reference | near-miss @-import of a file inside a code span does not count | PASS | Пройдено: скиллы и память проекта по правилам упражнения. Срабатывание описаний п
ok  | 03 | starter   | untouched starter | FAIL(exit 1) | GLOSSARY-MAP.md: в `## Contexts` должны быть ссылки ровно на два файла контекстов (списком Markdown-�
ok  | 03 | reference | reference | PASS | Пройдено: структура глоссария верна. Качество определений и связей оценивает мен�
ok  | 03 | reference | one flat GLOSSARY.md with both meanings | FAIL(exit 1) | docs/billing/GLOSSARY.md: нет термина `Invoice`
ok  | 03 | reference | account avoided in ledger | FAIL(exit 1) | docs/ledger/GLOSSARY.md:10: `account` в `_Avoid_` - это термин этого же контекста; термин нельзя одновре�
ok  | 03 | reference | definition with src/invoices/models.py | FAIL(exit 1) | docs/billing/GLOSSARY.md:10: в определении `Invoice` деталь реализации (имя файла .py); глоссарий опи�
ok  | 03 | reference | _Avoid_ with 6 words | FAIL(exit 1) | docs/billing/GLOSSARY.md:11: в `_Avoid_` у `Invoice` 6 слов, допускается не больше 4
ok  | 03 | reference | multi-word _Avoid_ entry (bill to) | FAIL(exit 1) | docs/billing/GLOSSARY.md:11: `_Avoid_`: каждое слово - одно английское слово из букв, без пробелов: 'bi
ok  | 03 | reference | a term missing (Dispute) | FAIL(exit 1) | docs/billing/GLOSSARY.md: нет термина `Dispute`
ok  | 03 | reference | Customer without account in _Avoid_ | FAIL(exit 1) | docs/billing/GLOSSARY.md:7: у `Customer` в `_Avoid_` перечислены не все слова, которых по интервью коман�
ok  | 03 | reference | Invoice without bill in _Avoid_ | FAIL(exit 1) | docs/billing/GLOSSARY.md:10: у `Invoice` в `_Avoid_` перечислены не все слова, которых по интервью коман�
ok  | 03 | reference | _Avoid_ word is a term of the same context (payment under Invoice) | FAIL(exit 1) | docs/billing/GLOSSARY.md:11: `payment` в `_Avoid_` - это термин этого же контекста; термин нельзя одновре
ok  | 03 | reference | 13 terms in billing | FAIL(exit 1) | docs/billing/GLOSSARY.md: терминов 13, допускается не больше 12
ok  | 03 | reference | relationship line without an event | FAIL(exit 1) | GLOSSARY-MAP.md:12: в строке связи нет доменного события в обратных кавычках в PascalCase, напри
ok  | 03 | reference | relationship line naming one context | FAIL(exit 1) | GLOSSARY-MAP.md:12: строка связи должна называть оба контекста их именами из заголовков `# <
ok  | 03 | reference | only one relationship line | FAIL(exit 1) | GLOSSARY-MAP.md: в `## Relationships` нужно не меньше 2 строк списка, сейчас 1
ok  | 03 | reference | map links only one context | FAIL(exit 1) | GLOSSARY-MAP.md: в `## Contexts` должны быть ссылки ровно на два файла контекстов (списком Markdown-�
ok  | 03 | reference | definition without a sentence (two words) | FAIL(exit 1) | docs/ledger/GLOSSARY.md:7: определение `Account` должно быть хотя бы одним предложением (не меньше
ok  | 03 | reference | definition with SELECT | FAIL(exit 1) | docs/ledger/GLOSSARY.md:7: в определении `Account` деталь реализации (ключевое слово SQL); глоссарий
ok  | 03 | reference | definition with backticked path | FAIL(exit 1) | docs/ledger/GLOSSARY.md:7: в определении `Account` деталь реализации (путь или файл в обратных кав�
ok  | 03 | reference | definition with class Account | FAIL(exit 1) | docs/ledger/GLOSSARY.md:7: в определении `Account` деталь реализации (class из кода); глоссарий описы�
ok  | 03 | reference | near-miss extra terms up to 12 | PASS | Пройдено: структура глоссария верна. Качество определений и связей оценивает мен�
ok  | 03 | reference | near-miss different order of terms | PASS | Пройдено: структура глоссария верна. Качество определений и связей оценивает мен�
ok  | 03 | reference | near-miss `Credit note` spelling | PASS | Пройдено: структура глоссария верна. Качество определений и связей оценивает мен�
ok  | 03 | reference | near-miss `CreditNote` spelling | PASS | Пройдено: структура глоссария верна. Качество определений и связей оценивает мен�
ok  | 03 | reference | near-miss no context description line | PASS | Пройдено: структура глоссария верна. Качество определений и связей оценивает мен�
ok  | 03 | reference | near-miss relationships write `billing` lower-case | PASS | Пройдено: структура глоссария верна. Качество определений и связей оценивает мен�
ok  | 03 | reference | near-miss _Avoid_ absent where the interview gives no synonym (Account) | PASS | Пройдено: структура глоссария верна. Качество определений и связей оценивает мен�
ok  | 03 | reference | near-miss definition with 'таблица' in the everyday sense | PASS | Пройдено: структура глоссария верна. Качество определений и связей оценивает мен�
ok  | 03 | reference | near-miss lower-case 'class' in English prose | PASS | Пройдено: структура глоссария верна. Качество определений и связей оценивает мен�
ok  | 03 | reference | near-miss ./ prefix in map links | PASS | Пройдено: структура глоссария верна. Качество определений и связей оценивает мен�
ok  | 04 | starter   | untouched starter | FAIL(exit 1) | docs/spec.md, `## Requirements`: строк вида `- **REQ-NN** WHEN <условие> THE SYSTEM SHALL <поведение>` 0, нужно от 6 �
ok  | 04 | reference | reference | PASS | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает ментор по рубрике.
ok  | 04 | reference | requirements as 'the system should handle reminders correctly' lines | FAIL(exit 1) | docs/spec.md, `## Requirements`: строк вида `- **REQ-NN** WHEN <условие> THE SYSTEM SHALL <поведение>` 0, нужно от 6 �
ok  | 04 | reference | REQ-09 cited in tasks but absent from the spec | FAIL(exit 1) | docs/tasks.md:16: T-03 ссылается на REQ-09, которого нет в спецификации
ok  | 04 | reference | REQ-03 removed from the spec, still cited in tasks | FAIL(exit 1) | docs/tasks.md:10: T-02 ссылается на REQ-03, которого нет в спецификации
ok  | 04 | reference | a REQ no task lists (REQ-08) | FAIL(exit 1) | docs/spec.md:34: требование REQ-08 не указано ни в одной задаче
ok  | 04 | reference | cycle T-02 -> T-03 -> T-02 | FAIL(exit 1) | docs/tasks.md: ссылки `Blocked by` образуют цикл: T-02 -> T-03 -> T-02
ok  | 04 | reference | two ADRs | FAIL(exit 1) | docs/adr: файлов ADR вида NNNN-<slug>.md 2 (docs/adr/0001-derive-reminders-from-history.md, docs/adr/0002-use-dataclasses.md), нужен р
ok  | 04 | reference | status approved | FAIL(exit 1) | docs/adr/0001-derive-reminders-from-history.md: статус 'approved' вне допустимого набора
ok  | 04 | reference | status deprecated (valid Nygard, not for a new ADR here) | FAIL(exit 1) | docs/adr/0001-derive-reminders-from-history.md: статус нового ADR здесь `proposed` или `accepted`
ok  | 04 | reference | `client` in a requirement | FAIL(exit 1) | docs/spec.md:27: слово `client` глоссарий велит избегать; возьмите термин глоссария (термин le
ok  | 04 | reference | `client` inside a Russian sentence of a requirement | FAIL(exit 1) | docs/spec.md:27: слово `client` глоссарий велит избегать; возьмите термин глоссария (термин le
ok  | 04 | reference | `clients` in a requirement (plural) | FAIL(exit 1) | docs/spec.md:27: слово `clients` глоссарий велит избегать; возьмите термин глоссария (термин l
ok  | 04 | reference | `client` in a ## T-NN: title | FAIL(exit 1) | docs/tasks.md:15: слово `client` глоссарий велит избегать; возьмите термин глоссария (термин l
ok  | 04 | reference | `account` in a task line | FAIL(exit 1) | docs/tasks.md:8: слово `account` глоссарий велит избегать; возьмите термин глоссария (термин l
ok  | 04 | reference | MADR ADR with ### Consequences missing everywhere | FAIL(exit 1) | docs/adr/0001-derive-from-history.md: нет раздела `### Consequences` внутри `## Decision Outcome`
ok  | 04 | reference | MADR with an unfilled key left empty (consulted:) | FAIL(exit 1) | docs/adr/0001-derive-from-history.md: front matter, строка 6: outside this exercise: пустое значение (незаполненный �
ok  | 04 | reference | MADR with status: yes (typed) | FAIL(exit 1) | docs/adr/0001-derive-from-history.md: front matter, строка 3: quote the value: без кавычек YAML читает его как число,
ok  | 04 | reference | a task with Status: done | FAIL(exit 1) | docs/tasks.md:3: у T-01 `Status: done`; в этом уроке у всех задач `Status: todo`
ok  | 04 | reference | no task Blocked by: none | FAIL(exit 1) | docs/tasks.md: ни у одной задачи нет `Blocked by: none`: с чего начинать работу?
ok  | 04 | reference | Check: without backticks | FAIL(exit 1) | docs/tasks.md:18: в T-03 строка не в форме `Check:` и ровно одна команда в обратных кавычках
ok  | 04 | reference | Check: with two backticked commands | FAIL(exit 1) | docs/tasks.md:18: в T-03 строка не в форме `Check:` и ровно одна команда в обратных кавычках
ok  | 04 | reference | only 2 tasks | FAIL(exit 1) | docs/tasks.md: блоков `## T-NN: <название>` 2, нужно от 3 до 8
ok  | 04 | reference | Blocked by a missing task T-09 | FAIL(exit 1) | docs/tasks.md:21: T-04 заблокирована несуществующей задачей T-09
ok  | 04 | reference | duplicate REQ id | FAIL(exit 1) | docs/spec.md:34: идентификатор REQ-07 уже есть в строке 33
ok  | 04 | reference | headings out of order | FAIL(exit 1) | docs/spec.md: разделы идут не в порядке `## Problem Statement`, `## Solution`, `## User Stories`, `## Requirements`, `## Implemen
ok  | 04 | reference | Implementation Decisions mention invoices/reminders.py | FAIL(exit 1) | docs/spec.md:38: в `## Implementation Decisions` есть `.py`: без путей к коду
ok  | 04 | reference | Testing Decisions without plan_reminders | FAIL(exit 1) | docs/spec.md, `## Testing Decisions`: раздел должен называть шов `plan_reminders`
ok  | 04 | reference | User Stories with 2 items | FAIL(exit 1) | docs/spec.md, `## User Stories`: нужен нумерованный список не меньше чем из 3 пунктов, сейчас 2
ok  | 04 | reference | Out of Scope empty | FAIL(exit 1) | docs/spec.md, `## Out of Scope`: нужен хотя бы один пункт списка
ok  | 04 | reference | ADR file numbered 0002 | FAIL(exit 1) | docs/adr/0002-derive.md: первый ADR получает номер 0001: `docs/adr/0001-<slug>.md`
ok  | 04 | reference | Nygard ADR with empty Consequences | FAIL(exit 1) | docs/adr/0001-derive-reminders-from-history.md: раздел про последствия пустой
ok  | 04 | reference | workspace glossary `_Avoid_` for client deleted + `client` in a requirement (pristine glossary still applies) | FAIL(exit 1) | docs/spec.md:27: слово `client` глоссарий велит избегать; возьмите термин глоссария (термин le
ok  | 04 | reference | near-miss REQ-01 and REQ-10 both present | PASS | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает ментор по рубрике.
ok  | 04 | reference | near-miss `billing` in a requirement (bill avoided) | PASS | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает ментор по рубрике.
ok  | 04 | reference | near-miss Russian `клиент` in a requirement | PASS | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает ментор по рубрике.
ok  | 04 | reference | near-miss `clientId` in prose | PASS | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает ментор по рубрике.
ok  | 04 | reference | near-miss `LedgerAccount` in a task line | PASS | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает ментор по рубрике.
ok  | 04 | reference | near-miss `client` inside a fenced block of the spec | PASS | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает ментор по рубрике.
ok  | 04 | reference | near-miss `account` in a Check: line | PASS | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает ментор по рубрике.
ok  | 04 | reference | near-miss verbatim MADR-T filled in (comment line, status "accepted", unquoted date, all headings, HTML comments) | PASS | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает ментор по рубрике.
ok  | 04 | reference | near-miss MADR with status: 'proposed' | PASS | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает ментор по рубрике.
ok  | 04 | reference | near-miss MADR with plain status: accepted | PASS | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает ментор по рубрике.
ok  | 04 | reference | near-miss Status: proposed (Nygard) | PASS | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает ментор по рубрике.
ok  | 04 | reference | near-miss Further Notes after Out of Scope | PASS | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает ментор по рубрике.
ok  | 04 | reference | near-miss tasks keep the commented example block | PASS | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает ментор по рубрике.
ok  | 04 | reference | near-miss docs/adr/template.md still present | PASS | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает ментор по рубрике.
mismatches: 0
```

## Cheat probes (00 2.4 (4a), (4b), (4d)) and the 3.11 run, EMPTY starter unless stated

```
02-skills: (4a) usercustomize no -I exit 0, -I exit 1; (4b) PATH shim exit 0, fixed PATH exit 1; (4d) reference absent, data/reserve absent; 3.11 starter exit 1, reference exit 0; 3.12 reference exit 0
03-domain-ontology: (4a) usercustomize no -I exit 0, -I exit 1; (4b) PATH shim exit 0, fixed PATH exit 1; (4d) reference absent, data/reserve absent; 3.11 starter exit 1, reference exit 0; 3.12 reference exit 0
04-spec-adr-tasks: (4a) usercustomize no -I exit 0, -I exit 1; (4b) PATH shim exit 0, fixed PATH exit 1; (4d) reference absent, data/reserve absent; 3.11 starter exit 1, reference exit 0; 3.12 reference exit 0
```
(4c) does not apply: these checks execute no learner code. Each "without -I" / "PATH shim" row passing
shows the attack is real; the `-I` and fixed-PATH rows fail as required.

## Frontmatter subset vs PyYAML 6.0.3 (`/usr/bin/python3`)

```
plain                  yaml=ok                           subset=ACCEPT
colon_unquoted         yaml=error:ScannerError           subset=REJECT: quote the value: в нём есть `: ` или оно кончается на `:`
colon_dq               yaml=ok                           subset=ACCEPT
colon_sq               yaml=ok                           subset=ACCEPT
sq_escape              yaml=ok                           subset=ACCEPT
comment_bool           yaml=ok                           subset=REJECT: remove the trailing comment: ` #` в значении без кавычек
hash_nospace           yaml=ok                           subset=ACCEPT
bool_True              yaml=ok                           subset=ACCEPT
bool_yes               yaml=ok                           subset=ACCEPT
bool_On                yaml=ok                           subset=ACCEPT
bool_1                 yaml=ok                           subset=ACCEPT
bool_quoted            yaml=ok                           subset=REJECT: `disable-model-invocation`: outside this exercise: write the boolean unquoted
nospace                yaml=ok                           subset=REJECT: outside this exercise: после двоеточия нужен один пробел
indicator_star         yaml=error:ComposerError          subset=REJECT: quote the value: значение начинается со служебного символа YAML
indicator_bracket      yaml=ok                           subset=REJECT: quote the value: значение начинается со служебного символа YAML
trailing_colon         yaml=error:ScannerError           subset=REJECT: quote the value: в нём есть `: ` или оно кончается на `:`
dup                    yaml=ok                           subset=REJECT: outside this exercise: повторный ключ `name`
meta                   yaml=ok                           subset=ACCEPT
meta_unquoted_version  yaml=ok                           subset=REJECT: quote the value: без кавычек YAML читает его как число, дату, null или булево
tab_in                 yaml=error:ScannerError           subset=REJECT: outside this exercise: символ табуляции
percent                yaml=ok                           subset=ACCEPT
dash_start             yaml=error:ScannerError           subset=REJECT: quote the value: значение начинается со служебного символа YAML
url                    yaml=ok                           subset=ACCEPT
empty                  yaml=ok                           subset=REJECT: outside this exercise: пустое значение (незаполненный ключ удалите)
when_to_use            yaml=ok                           subset=ACCEPT
comment_line           yaml=ok                           subset=ACCEPT
two_spaces             yaml=ok                           subset=REJECT: one space after the colon: второй пробел после двоеточия отклоняется
block                  yaml=ok                           subset=REJECT: write the value on one line: значение без кавычек не может начинаться с | или >
crlf                   yaml=ok                           subset=ACCEPT
value 'null'         pyyaml=NoneType               rejected=True
value '~'            pyyaml=NoneType               rejected=True
value 'Null'         pyyaml=NoneType               rejected=True
value '1.0'          pyyaml=float                  rejected=True
value '1'            pyyaml=int                    rejected=True
value '0'            pyyaml=int                    rejected=True
value 'yes'          pyyaml=bool                   rejected=True
value 'On'           pyyaml=bool                   rejected=True
value 'y'            pyyaml=str                    rejected=True (strict side)
value 'n'            pyyaml=str                    rejected=True (strict side)
value '2026-10-29'   pyyaml=date                   rejected=True
value '2026-1-2'     pyyaml=str                    rejected=True (strict side)
value '0x1F'         pyyaml=int                    rejected=True
value '1e3'          pyyaml=str                    rejected=False
value '1.5e3'        pyyaml=str                    rejected=True (strict side)
value '.inf'         pyyaml=float                  rejected=True
value '.NaN'         pyyaml=float                  rejected=True
value '1_000'        pyyaml=int                    rejected=True
value '0o17'         pyyaml=str                    rejected=False
value '017'          pyyaml=int                    rejected=True
value '12:30'        pyyaml=int                    rejected=True
value 'MIT'          pyyaml=str                    rejected=False
value 'Apache-2.0'   pyyaml=str                    rejected=False
value 'release'      pyyaml=str                    rejected=False
value 'v1.0'         pyyaml=str                    rejected=False
value '1.0.0'        pyyaml=str                    rejected=False
value '2026-10-29x'  pyyaml=str                    rejected=False
value 'Use git'      pyyaml=str                    rejected=False
value 'true-ish'     pyyaml=str                    rejected=False
value 'None'         pyyaml=str                    rejected=False
value 'nil'          pyyaml=str                    rejected=False
value '0b101'        pyyaml=int                    rejected=True
value '+1'           pyyaml=int                    rejected=True
value '-1'           pyyaml=int                    rejected=True
value '1:20:30.5'    pyyaml=float                  rejected=True
value '.5'           pyyaml=float                  rejected=True
value '1.'           pyyaml=float                  rejected=True
value '='            pyyaml=error:ConstructorError rejected=True
value '<'            pyyaml=str                    rejected=False
value 'yes!'         pyyaml=str                    rejected=False
value '2026-10-29 '  pyyaml=date                   rejected=True
value '1.0  '        pyyaml=float                  rejected=True
value 'MIT '         pyyaml=str                    rejected=False
forms: 29, accepted-but-differs: 0; values: 43, misses: 0, strict-side: 4; pyyaml 6.0.3
```
No accepted form reads differently in YAML and no YAML-typed value is accepted outside the boolean fields
(43 values, 0 misses; 4 strict-side rejections `y`, `n`, `1.5e3`, `2026-1-2`, as design 2.3).

## Resolver and C1-C6 on roots built from the L4 reference (tests labelled, tasks done)

```
avoid words: ['account', 'bill', 'client', 'complaint', 'debt', 'dunning', 'posting', 'refund', 'settlement']
clean (all done, labels)                                -> []
clean: superseding ADR mentions the one it replaces     -> []
clean: todo task whose REQ has no test                  -> []
C1 REQ no task lists                                    -> ['C1 docs/spec.md: REQ-08']
C2 test label for absent REQ                            -> ['C2 tests/test_reminders.py: REQ-11']
C2 task citing absent REQ                               -> ['C2 docs/tasks.md: REQ-12', 'C3 docs/tasks.md: REQ-12']
C3 done task REQ without test                           -> ['C3 docs/tasks.md: REQ-06']
C4 numbering gap                                        -> ['C4 docs/adr: ADR-0002']
C4 superseded by missing ADR                            -> ['C4 docs/adr/0001-derive-reminders-from-history.md: ADR-0007', 'C5 docs/spec.md: ADR-0001']
C4 self-supersede                                       -> ['C4 docs/adr/0001-derive-reminders-from-history.md: 0001-derive-reminders-from-history.md', 'C5 docs/spec.md: ADR-0001']
C5 spec cites superseded ADR                            -> ['C5 docs/spec.md: ADR-0001']
C5 tasks cite deprecated ADR                            -> ['C5 docs/tasks.md: ADR-0001']
C6 clients inside Russian requirement                   -> ['C6 docs/spec.md: clients']
C6 client in test name test_req_01_client2              -> ['C6 tests/test_reminders.py: client']
C6 client in T-NN title                                 -> ['C6 docs/tasks.md: client']
clean: REQ-1 never matches REQ-10 (label req_1 ignored) -> []
clean: generated tests invisible (setattr label)        -> []
no docs/spec.md                                         -> parse error: docs/spec.md: файл не найден
no GLOSSARY-MAP.md                                      -> parse error: GLOSSARY-MAP.md: файл не найден
linked context missing                                  -> parse error: GLOSSARY-MAP.md: связанный файл контекста не найден: docs/ledger/GLOSSARY.md
labels: ['REQ-02', 'REQ-05'] ['REQ-01', 'REQ-02', 'REQ-03'] [] []
record id: test_req_01_a
tokens: ['client', 'clientid', 'billing', 'test', 'req', 'client', 'customer', 's']
```

## Quizzes and reserves (scratch scorer, 00 2.1 rules; 200k Monte Carlo, seed 41)

```
skills-quiz            problems=none empty=0.0 key=1.0 always={'a': 0.16666666666666666, 'b': 0.16666666666666666, 'c': 0.16666666666666666, 'd': 0.16666666666666666} longest=0.00 analytic=0.1211% mc=0.1230% (|d|/se=0.25) over3=0.3628% positions={'a': 1, 'b': 1, 'c': 1, 'd': 1}
ontology-quiz          problems=none empty=0.0 key=1.0 always={'a': 0.16666666666666666, 'b': 0.16666666666666666, 'c': 0.16666666666666666, 'd': 0.16666666666666666} longest=0.17 analytic=0.1211% mc=0.0980% (|d|/se=2.97) over3=0.3628% positions={'a': 1, 'b': 1, 'c': 1, 'd': 1}
sdd-quiz               problems=none empty=0.0 key=1.0 always={'a': 0.16666666666666666, 'b': 0.16666666666666666, 'c': 0.16666666666666666, 'd': 0.16666666666666666} longest=0.17 analytic=0.1211% mc=0.1275% (|d|/se=0.82) over3=0.3628% positions={'b': 1, 'a': 1, 'c': 1, 'd': 1}
skills-quiz reserve    problems=none empty=0.0 key=1.0 always={'a': 0.16666666666666666, 'b': 0.16666666666666666, 'c': 0.16666666666666666, 'd': 0.16666666666666666} longest=0.17 analytic=0.1211% mc=0.1190% (|d|/se=0.27) over3=0.3628% positions={'b': 1, 'a': 1, 'c': 1, 'd': 1}
ontology-quiz reserve  problems=none empty=0.0 key=1.0 always={'a': 0.16666666666666666, 'b': 0.16666666666666666, 'c': 0.16666666666666666, 'd': 0.16666666666666666} longest=0.17 analytic=0.1211% mc=0.1090% (|d|/se=1.56) over3=0.3628% positions={'b': 1, 'c': 1, 'a': 1, 'd': 1}
sdd-quiz reserve       problems=none empty=0.0 key=1.0 always={'a': 0.16666666666666666, 'b': 0.16666666666666666, 'c': 0.16666666666666666, 'd': 0.16666666666666666} longest=0.00 analytic=0.1211% mc=0.1245% (|d|/se=0.44) over3=0.3628% positions={'b': 1, 'a': 1, 'c': 1, 'd': 1}
```
All six files: 4 single + 2 multiple, 4 options, key sizes per rule, single positions a/b/c/d once each,
correct option uniquely longest in 0 questions; empty 0, key 1.0, always-x 1/6, always-longest <= 0.67
(below 0.8); random pass 0.1211% per attempt, 0.3628% over 3 (design 2.1). The scorer's 4th-submission
refusal and the adaptive strategy are platform items not re-run here.

## Rubric blind sets

Built under `checks/reference/rubric-demo/` (L3: weak, borderline, injection, keyword-stuffed-circular;
L4: weak, borderline, injection, horizontal-slices, non-qualifying-adr; README per set lists the
blinding steps and expectations). Every set passes its structure check (`glossary-structure`,
`sdd-artifacts`), which is the point. The blind grading itself (student acting as mentor, shuffled
artifact-1..N with the empty starter and the reference) is not run by the author: pending for the
student phase.

## Deviations and notes

1. Frontmatter key rule accepts `_` (`[a-z][a-z0-9_-]*`) so `when_to_use` passes (orchestrator decision);
   near-miss `when_to_use` recorded. No other design rule depends on keys without `_`.
2. Frontmatter messages start with the English keys task.md quotes ("quote the value", "remove the
   trailing comment", "write the value on one line", "write the boolean unquoted", "one space after the
   colon", "outside this exercise"), followed by Russian detail.
3. L2 release: a typo key that also trips the typed rule (`disable-model-invokation: true`) is reported as
   an unknown field first. `background` is not read as a boolean (design scope: two fields), so
   `background: false` gets "quote the value"; quoting yields a string in CC (undocumented). Rare; noted.
4. L2 references: a Markdown link target resolves relative to the file that contains it, falling back to
   the skill root (needed for `references/a.md` -> `../SKILL.md`); bare and `${CLAUDE_SKILL_DIR}` paths
   are skill-root relative.
5. L3: "at least one sentence" = at least 3 words and ending with `.`, `!`, `?` or `…`; code markers are
   code-only (`def name(`, `class Name`), so "a class of balances" passes; SQL list: SELECT, INSERT,
   UPDATE, DELETE, CREATE TABLE, ALTER TABLE, JOIN (case-sensitive).
6. L4: list lines in `## Requirements` not in the form do not count (the count message names their lines);
   each required spec heading must appear exactly once; C6 covers spec and tasks only (no test names).
7. Follow-up (orchestrator): the `verify_glossary.py:84` sentence message now names `. ! ? или …`, matching
   the code. Re-ran the L3 cases: 30 cases, 0 mismatches. The untouched starter fails, the reference
   passes, and the two-word definition fails with the new message. The SQL list in L3 task.md:56-57
   (SELECT, INSERT, UPDATE, DELETE, CREATE TABLE, ALTER TABLE, JOIN, upper case) equals
   `checks/data/impl_markers.json`.

## Round 2 (fixes after student run B, 2026-10-29)

Changes: L2 `verify_skills.py` (word budget 250 over the memory set; overlap = shared 6-word sequences
with `procedures.orig`, <= 20, test command left out; imports leaving the workspace (`@~/`, absolute,
`../`) rejected by name through `memory_set()`; step markers per skill, HTML comments removed; script
reference outside comments; a copy of the old script anywhere outside the release skill fails by content
against `checks/data/release.py.orig`). L3/L4 rubrics: any criterion at 0 fails. L4 `verify_sdd.py`:
closed `Check:` form; look-alike letters, NFKC and format characters folded before the avoided-word scan
(L4 only; `sdd_grammar.py` unchanged, sha256 as above). L3 reference: polyseme reason as the second Ledger
description line (copied to the 5 identical glossary copies in L4, L5, L7). L4 starter: question 7
(Dispute ignored in this feature) and question 8 / brief (`paid_cents` = every Payment and Credit Note)
made explicit (copied to the identical L5 and L7 starters).

Command cases: 197, 0 mismatches (50 new `R2` cases: 36 must-fail, 14 near-miss; all earlier cases re-run).
Student cheats and honest copies (`scratchpad/cheats/*`, `scratchpad/student-B/*`), current verdicts:

```
cheats/L2-absimport           exit=1 | CLAUDE.md: импорт `@/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-zea
cheats/L2-fm-TRUEcase         exit=0 | Пройдено: скиллы и память проекта по правилам упражнения. Срабаты�
cheats/L2-fm-anchor           exit=1 | .claude/skills/release/SKILL.md: frontmatter, строка 3: quote the value: значение начинается со
cheats/L2-fm-bom              exit=1 | .claude/skills/release/SKILL.md: frontmatter, строка 2: outside this exercise: строка не вида `ключ
cheats/L2-fm-dup              exit=1 | .claude/skills/release/SKILL.md: frontmatter, строка 5: outside this exercise: повторный ключ `disable
cheats/L2-fm-flow             exit=1 | .claude/skills/release/SKILL.md: frontmatter, строка 5: quote the value: значение начинается со
cheats/L2-fm-indentmeta       exit=1 | .claude/skills/release/SKILL.md: frontmatter, строка 5: quote the value: без кавычек YAML читает е
cheats/L2-fm-namecaps         exit=1 | .claude/skills/release/SKILL.md: `name` вне этого упражнения: 1-64 символов из a-z, 0-9 и о
cheats/L2-fm-quoted           exit=1 | .claude/skills/release/SKILL.md: frontmatter, строка 4: `disable-model-invocation`: outside this exercise: write th
cheats/L2-fm-trailingspace    exit=0 | Пройдено: скиллы и память проекта по правилам упражнения. Срабаты�
cheats/L2-fm-typo             exit=1 | .claude/skills/release/SKILL.md: неизвестное поле `disable-model-invokation`: Claude Code молча иг�
cheats/L2-fm-uifalse          exit=1 | .claude/skills/release/SKILL.md: `user-invocable` ложно: тогда вызвать скилл не можете вы
cheats/L2-fm-y                exit=1 | .claude/skills/release/SKILL.md: `disable-model-invocation: y` - не документированное написани
cheats/L2-giantline           exit=1 | память проекта (CLAUDE.md): 761 слов вместе, допускается не больше 250
cheats/L2-homeimport          exit=1 | CLAUDE.md: импорт `@~/.claude/procedures.md` ведёт за пределы репозитория; такой фа
cheats/L2-import              exit=1 | память проекта (CLAUDE.md, docs/procedures.md): 103 непустых строк вместе, допуска
cheats/L2-keepscript          exit=1 | scripts/release_tool.py: копия старого `scripts/release.py` вне скилла (25 из 25 его значи
cheats/L2-realbom             exit=1 | .claude/skills/release/SKILL.md: frontmatter, строка 1: первая строка файла должна быть 
cheats/L2-rules               exit=1 | память проекта (.claude/rules/procedures.md, CLAUDE.md): 102 непустых строк вместе, до�
cheats/L2-stub                exit=1 | .claude/skills/verify/SKILL.md: скилл не несёт старую процедуру: в теле и файлах, 
cheats/L2-symlink             exit=0 | Пройдено: скиллы и память проекта по правилам упражнения. Срабаты�
cheats/L3-avoidgame           exit=1 | docs/ledger/GLOSSARY.md:13: `account` в `_Avoid_` - это термин этого же контекста; термин
cheats/L3-guess               exit=0 | Пройдено: структура глоссария верна. Качество определений и связе
cheats/L3-guess2              exit=1 | GLOSSARY-MAP.md не найден в корне рабочей папки
cheats/L3-impl                exit=0 | Пройдено: структура глоссария верна. Качество определений и связе
cheats/L3-stuff               exit=0 | Пройдено: структура глоссария верна. Качество определений и связе
cheats/L3-termvariant         exit=1 | docs/billing/GLOSSARY.md:8: `account` в `_Avoid_` - это термин этого же контекста; термин
cheats/L4-adr-lower           exit=1 | docs/adr: файлов ADR вида NNNN-<slug>.md 0, нужен ровно один. ADR пишут для решени�
cheats/L4-checkline-vocab     exit=1 | docs/tasks.md:6: в T-01 строка не в форме `Check:` и ровно одна команда в обратны
cheats/L4-fence-vocab         exit=0 | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает мен
cheats/L4-heading-vocab       exit=0 | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает мен
cheats/L4-homoglyph           exit=1 | docs/spec.md:59: слово `client` (написано с похожими буквами другого алфавита
cheats/L4-madr                exit=0 | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает мен
cheats/L4-min                 exit=1 | docs/tasks.md:4: в T-01 команда `Check:` не запуск тестов: `[ИМЯ=значение ...] python3 -
cheats/L4-reqfield-comment    exit=1 | docs/tasks.md:6: в T-01 команда `Check:` не запуск тестов: `[ИМЯ=значение ...] python3 -
cheats/L4-reqheading          exit=1 | docs/tasks.md:6: в T-01 команда `Check:` не запуск тестов: `[ИМЯ=значение ...] python3 -
cheats/L4-twoadr              exit=1 | docs/adr: файлов ADR вида NNNN-<slug>.md 2 (docs/adr/0001-another.md, docs/adr/0001-derive-next-reminder-from-h
cheats/L4-twocmds             exit=1 | docs/tasks.md:6: в T-01 команда `Check:` не запуск тестов: `[ИМЯ=значение ...] python3 -
student-B/02-skills              exit=0 | Пройдено: скиллы и память проекта по правилам упражнения. Срабат
student-B/03-domain-ontology     exit=0 | Пройдено: структура глоссария верна. Качество определений и свя�
student-B/04-spec-adr-tasks      exit=0 | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает м�
```

R2 command cases:
```
ok  | 02 | reference | R2 both procedures pasted into CLAUDE.md as one line each | FAIL(exit 1) | память проекта (CLAUDE.md): 822 слов вместе, до
ok  | 02 | reference | R2 140 words of the release procedure packed into one CLAUDE.md line (under the word budget) | FAIL(exit 1) | память проекта (CLAUDE.m
ok  | 02 | reference | R2 stub skills: verify = command only, release = <!-- scripts/release.py --> | FAIL(exit 1) | .claude/skills/verify/SKILL.md: скилл не не�
ok  | 02 | reference | R2 release: script referenced only inside an HTML comment, markers present | FAIL(exit 1) | .claude/skills/release/SKILL.md: тело не ссыл
ok  | 02 | reference | R2 release: multi-line HTML comment hides the script and the push | FAIL(exit 1) | .claude/skills/release/SKILL.md: тело не ссылаетс�
ok  | 02 | reference | R2 release without `git push origin main --follow-tags` | FAIL(exit 1) | .claude/skills/release/SKILL.md: скилл не несёт старую �
ok  | 02 | reference | R2 release without `pyproject.toml` | FAIL(exit 1) | .claude/skills/release/SKILL.md: скилл не несёт старую процедуру: �
ok  | 02 | reference | R2 verify without `Ran 0 tests` | FAIL(exit 1) | .claude/skills/verify/SKILL.md: скилл не несёт старую процедуру: в т�
ok  | 02 | reference | R2 verify: `expectedFailure` only inside an HTML comment | FAIL(exit 1) | .claude/skills/verify/SKILL.md: скилл не несёт старую �
ok  | 02 | reference | R2 @~/ home import of the procedures | FAIL(exit 1) | CLAUDE.md: импорт `@~/.claude/procedures.md` ведёт за пределы репоз�
ok  | 02 | reference | R2 @~/ home import of a file that does not exist | FAIL(exit 1) | CLAUDE.md: импорт `@~/.claude/missing.md` ведёт за пределы р
ok  | 02 | reference | R2 absolute import outside the workspace | FAIL(exit 1) | CLAUDE.md: импорт `@/etc/hosts` ведёт за пределы репозитори
ok  | 02 | reference | R2 relative import climbing out of the workspace (@../../x.md) | FAIL(exit 1) | CLAUDE.md: импорт `@../../outside-procedures.md` ведёт �
ok  | 02 | reference | R2 copy of the script at root as scripts/release_tool.py + commands/ship.md | FAIL(exit 1) | scripts/release_tool.py: копия старого `sc
ok  | 02 | reference | R2 copy of the script renamed, comments and blank lines changed (tools/bump.py) | FAIL(exit 1) | tools/bump.py: копия старого `scripts/
ok  | 02 | reference | R2 memory of 251 words | FAIL(exit 1) | память проекта (CLAUDE.md): 251 слов вместе, допускается не больш�
ok  | 02 | reference | R2 near-miss memory of exactly 250 words | PASS | Пройдено: скиллы и память проекта по правилам упражн�
ok  | 02 | reference | R2 near-miss memory paraphrasing one old line verbatim (one line of overlap) | PASS | Пройдено: скиллы и память проекта
ok  | 02 | reference | R2 near-miss release markers in references/checklist.md linked from SKILL.md | PASS | Пройдено: скиллы и память проекта
ok  | 02 | reference | R2 near-miss skills written in Russian, markers kept | PASS | Пройдено: скиллы и память проекта по правилам �
ok  | 02 | reference | R2 near-miss short @docs/style.md import inside the workspace | PASS | Пройдено: скиллы и память проекта по прав�
ok  | 02 | reference | R2 near-miss prose mention '@release-manager' (no such file) | PASS | Пройдено: скиллы и память проекта по прави
ok  | 02 | reference | R2 near-miss script edited inside the skill (still one copy) | PASS | Пройдено: скиллы и память проекта по прави
ok  | 04 | reference | R2 Check: `true` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` не запуск тестов: `[ИМЯ=значение ...] 
ok  | 04 | reference | R2 Check: `:` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` не запуск тестов: `[ИМЯ=значение ...] pyt
ok  | 04 | reference | R2 Check: `exit 0` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` не запуск тестов: `[ИМЯ=значение ...
ok  | 04 | reference | R2 Check: `echo ok` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` не запуск тестов: `[ИМЯ=значение ..
ok  | 04 | reference | R2 Check: `rm -rf build && true; echo ok` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` не запуск тестов: `[ИМ
ok  | 04 | reference | R2 Check: `PYTHONPATH=src python3 -m unittest discover -s tests -t . || true` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` н
ok  | 04 | reference | R2 Check: `PYTHONPATH=src python3 -m unittest discover -s tests -t . ; true` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` н�
ok  | 04 | reference | R2 Check: `PYTHONPATH=src python3 -m unittest discover -s tests -t . | tail -1` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` 
ok  | 04 | reference | R2 Check: `PYTHONPATH=src python3 -m unittest discover -s tests -t . > /dev/null` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:
ok  | 04 | reference | R2 Check: `PYTHONPATH=src python3 -m unittest $(echo discover)` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` не запус�
ok  | 04 | reference | R2 Check: `python3 -c 'import sys'` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` не запуск тестов: `[ИМЯ=з�
ok  | 04 | reference | R2 Check: `pytest -k test_req_05` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` не запуск тестов: `[ИМЯ=зн�
ok  | 04 | reference | R2 Check: `make lint` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` не запуск тестов: `[ИМЯ=значение 
ok  | 04 | reference | R2 near-miss Check: `python3 -m unittest tests.test_reminders` | PASS | Пройдено: форма спецификации, ADR и задач в
ok  | 04 | reference | R2 near-miss Check: `python -m unittest discover -s tests` | PASS | Пройдено: форма спецификации, ADR и задач вер
ok  | 04 | reference | R2 near-miss Check: `make test` | PASS | Пройдено: форма спецификации, ADR и задач верна. Смысл оцени
ok  | 04 | reference | R2 near-miss Check: `PYTHONPATH=src python3 -m unittest -k test_req_05 discover -s tests -t .` | PASS | Пройдено: форма специфи
ok  | 04 | reference | R2 near-miss Check: `PYTHONPATH=src LC_ALL=C.UTF-8 python3 -m unittest discover -s tests -t . -k 'test_req_05*'` | PASS | Пройдено: фор�
ok  | 04 | reference | R2 Cyrillic с in client in a requirement | FAIL(exit 1) | docs/spec.md:27: слово `client` (написано с похожими буквам�
ok  | 04 | reference | R2 Cyrillic а in account in a requirement | FAIL(exit 1) | docs/spec.md:27: слово `account` (написано с похожими буква�
ok  | 04 | reference | R2 Cyrillic е in debt in a requirement | FAIL(exit 1) | docs/spec.md:27: слово `debt` (написано с похожими буквами д
ok  | 04 | reference | R2 Greek ο in complaint in a requirement | FAIL(exit 1) | docs/spec.md:27: слово `complaint` (написано с похожими буква
ok  | 04 | reference | R2 zero-width space in client in a requirement | FAIL(exit 1) | docs/spec.md:27: слово `client` (написано с похожими букв
ok  | 04 | reference | R2 soft hyphen in refund in a requirement | FAIL(exit 1) | docs/spec.md:27: слово `refund` (написано с похожими буквам�
ok  | 04 | reference | R2 fullwidth client in a requirement | FAIL(exit 1) | docs/spec.md:27: слово `client` (написано с похожими буквами д�
ok  | 04 | reference | R2 near-miss Russian prose with Cyrillic look-alike letters (сор, рос, ехо, ТОКЕН) | PASS | Пройдено: форма специф
ok  | 04 | reference | R2 near-miss Russian clarification 'клиент не используем' in prose | PASS | Пройдено: форма спецификации
```

Passing cheats by design (form filters, rubric-graded): L2 `fm-TRUEcase`, `fm-trailingspace`, `symlink`
(a valid layout); L3 `guess`, `impl`, `stuff` (rubric criterion 1 or 2 at 0 now fails the rubric); L4
`fence-vocab`, `heading-vocab` (documented exclusions), `madr` (rubric criterion 4 at 0). Rubric demo
sets re-graded in the two README files; every set still passes its structure check (9/9). 00 2.4 probes
(4a), (4b), (4d) and the 3.11 run re-run: unchanged. `pnpm content:validate`: 0 issues.

## Round 3 (fixes after student run B round 2, 2026-10-30)

Stepan's decision: close findings 1, 5, 7 cheaply; findings 2, 3, 4, 6 go to mentor rubrics.

Changes:
- L2 `verify_skills.py`: words (budget and 6-word overlap, one tokenizer `split_words`) are `\w+` runs
  split at `_`, lower-to-upper case changes, capital runs before a lower-case letter and letter/digit
  boundaries. Any memory file line with U+115F, U+1160, U+3164, U+FFA0, U+034F, a variation selector
  (U+FE00-FE0F, U+E0100-E01EF) or any Cf character fails by line and code point.
- L2 new `checks/rubric-skills.md` (4 criteria, sum / 8, pass >= 0.7 and no 0): steps carried (V1-V8,
  R1-R10 counted), no copy of the release script in any form, nothing loads the procedures every
  session (memory, imports, rules, hooks, model-visible descriptions), invocation fits side effects.
  Blind set `checks/reference/rubric-demo/` (README with assembly steps and expected grades).
- L4 `verify_sdd.py`: `Check:` rejects help options (`--h`, `--he`, `--hel`, `--help`, a short group
  with `h` before `k`/`s`/`p`/`t`, quotes stripped); probed on 3.12: these print usage and exit 0,
  `-kh`/`-vkh` run tests (filter `h`).
- L4 `rubric-sdd.md`: criteria 1, 2, 4 read off counts or Q1-Q3 answers (mutually exclusive); C5:
  obfuscated spellings of avoided words count as the word and score 0. README re-graded (weak C4 now
  0; borderline 1, 2, 2, 1, 2 = 8/10 pass); new set `obfuscated-vocab` (2, 2, 2, 2, 0, fails).

Command cases: 236, 0 mismatches (all earlier cases re-run; the R2 250/251-word cases rebuilt with
letter-only words, since `w0x1` is now 4 words). Untouched starter fails and reference passes for L2,
L3, L4 on 3.12 and 3.11. `pnpm content:validate`: 0 issues.

```
ok  | 02 | reference | R3 both procedures glued with `_` (student L2-underscore) | FAIL(exit 1) | память проекта (CLAUDE.md): 834 слов вместе, допускается не бол
ok  | 02 | reference | R3 both procedures in CamelCase (student L2-camel) | FAIL(exit 1) | память проекта (CLAUDE.md): 831 слов вместе, допускается не больше 
ok  | 02 | reference | R3 both procedures glued with U+3164 HANGUL FILLER (student L2-hangulfiller) | FAIL(exit 1) | CLAUDE.md:8: невидимый или пустой на вид символ (U+316
ok  | 02 | reference | R3 release procedure glued with letters/digits (`step1check2tree`) | FAIL(exit 1) | память проекта (CLAUDE.md): 876 слов вместе, допускается н
ok  | 02 | reference | R3 one U+115F HANGUL CHOSEONG FILLER inside a word of CLAUDE.md | FAIL(exit 1) | CLAUDE.md:7: невидимый или пустой на вид символ (U+115F HANGUL CHOS
ok  | 02 | reference | R3 one U+1160 HANGUL JUNGSEONG FILLER inside a word of CLAUDE.md | FAIL(exit 1) | CLAUDE.md:7: невидимый или пустой на вид символ (U+1160 HANGUL JUN
ok  | 02 | reference | R3 one U+FFA0 HALFWIDTH HANGUL FILLER inside a word of CLAUDE.md | FAIL(exit 1) | CLAUDE.md:7: невидимый или пустой на вид символ (U+FFA0 HALFWIDTH 
ok  | 02 | reference | R3 one U+034F COMBINING GRAPHEME JOINER inside a word of CLAUDE.md | FAIL(exit 1) | CLAUDE.md:7: невидимый или пустой на вид символ (U+034F COMBININ
ok  | 02 | reference | R3 one U+FE0F VARIATION SELECTOR-16 inside a word of CLAUDE.md | FAIL(exit 1) | CLAUDE.md:7: невидимый или пустой на вид символ (U+FE0F VARIATION SE
ok  | 02 | reference | R3 one U+E0101 VARIATION SELECTOR-18 inside a word of CLAUDE.md | FAIL(exit 1) | CLAUDE.md:7: невидимый или пустой на вид символ (U+E0101 VARIATION 
ok  | 02 | reference | R3 one U+200B ZERO WIDTH SPACE inside a word of CLAUDE.md | FAIL(exit 1) | CLAUDE.md:7: невидимый или пустой на вид символ (U+200B ZERO WIDTH SPACE)
ok  | 02 | reference | R3 one U+00AD SOFT HYPHEN inside a word of CLAUDE.md | FAIL(exit 1) | CLAUDE.md:7: невидимый или пустой на вид символ (U+00AD SOFT HYPHEN); он с�
ok  | 02 | reference | R3 one U+FEFF BOM mid-line inside a word of CLAUDE.md | FAIL(exit 1) | CLAUDE.md:7: невидимый или пустой на вид символ (U+FEFF ZERO WIDTH NO-BREAK S
ok  | 02 | reference | R3 invisible character in an imported memory file | FAIL(exit 1) | docs/style.md:1: невидимый или пустой на вид символ (U+3164 HANGUL FILLER); он 
ok  | 02 | reference | R3 near-miss memory with snake_case, CamelCase and Russian (honest facts) | PASS | Пройдено: скиллы и память проекта по правилам упраж
ok  | 02 | reference | R3 near-miss invisible character in a skill body (memory only is scanned) | PASS | Пройдено: скиллы и память проекта по правилам упраж
ok  | 04 | reference | R3 Check: `python3 -m unittest -h` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` с ключом справки `-h`: unittest печатает справк
ok  | 04 | reference | R3 Check: `python3 -m unittest --help` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` с ключом справки `--help`: unittest печатает сп
ok  | 04 | reference | R3 Check: `python3 -m unittest --he` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` с ключом справки `--he`: unittest печатает спра
ok  | 04 | reference | R3 Check: `python3 -m unittest --h` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` с ключом справки `--h`: unittest печатает справ
ok  | 04 | reference | R3 Check: `python3 -m unittest -vh` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` с ключом справки `-vh`: unittest печатает справ
ok  | 04 | reference | R3 Check: `python3 -m unittest -hv` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` с ключом справки `-hv`: unittest печатает справ
ok  | 04 | reference | R3 Check: `PYTHONPATH=src python3 -m unittest discover -s tests -t . -h` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` с ключом справки `-h`: 
ok  | 04 | reference | R3 Check: `PYTHONPATH=src python3 -m unittest discover --help` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` с ключом справки `--help`: unitte
ok  | 04 | reference | R3 Check: `python3 -m unittest "-h"` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` с ключом справки `"-h"`: unittest печатает спра
ok  | 04 | reference | R3 Check: `python3 -m unittest '--help'` | FAIL(exit 1) | docs/tasks.md:18: в T-03 команда `Check:` с ключом справки `'--help'`: unittest печатает 
ok  | 04 | reference | R3 near-miss Check: `python3 -m unittest -v` | PASS | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает мент
ok  | 04 | reference | R3 near-miss Check: `python3 -m unittest -kh` | PASS | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает мен�
ok  | 04 | reference | R3 near-miss Check: `python3 -m unittest -k hello` | PASS | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает м
ok  | 04 | reference | R3 near-miss Check: `PYTHONPATH=src python3 -m unittest discover -s tests -t . -v -b` | PASS | Пройдено: форма спецификации, ADR и задач верн�
ok  | 04 | reference | R3 rubric-only (command passes by design): dotless i clıent in a requirement | PASS | Пройдено: форма спецификации, ADR и задач верна. См�
ok  | 04 | reference | R3 rubric-only (command passes by design): Latin alpha ɑccount in a requirement | PASS | Пройдено: форма спецификации, ADR и задач верна. С
ok  | 04 | reference | R3 rubric-only (command passes by design): palochka bӏll in a requirement | PASS | Пройдено: форма спецификации, ADR и задач верна. Смыс
ok  | 04 | reference | R3 rubric-only (command passes by design): small capital ʙill in a requirement | PASS | Пройдено: форма спецификации, ADR и задач верна. С�
ok  | 04 | reference | R3 rubric-only (command passes by design): iota clɩent in a requirement | PASS | Пройдено: форма спецификации, ADR и задач верна. Смысл
ok  | 04 | reference | R3 rubric-only (command passes by design): turned i clᴉent in a requirement | PASS | Пройдено: форма спецификации, ADR и задач верна. См�
ok  | 04 | reference | R3 rubric-only (command passes by design): Cyrillic te debт in a requirement | PASS | Пройдено: форма спецификации, ADR и задач верна. См�
ok  | 04 | reference | R3 rubric-only (command passes by design): combining grapheme joiner cli+CGJ+ent in a requirement | PASS | Пройдено: форма спецификации, ADR и зада
ok  | 04 | reference | R3 rubric-only (command passes by design): variation selector cli+VS1+ent in a requirement | PASS | Пройдено: форма спецификации, ADR и задач ве
```

Student round-2 cheats and honest copies (`scratchpad/student-B2/`), current verdicts:

```
cheats/L2-camel                   exit=1 | память проекта (CLAUDE.md): 885 слов вместе, допускается не больше 250
cheats/L2-description-proc        exit=0 | Пройдено: скиллы и память проекта по правилам упражнения. Срабатыван�
cheats/L2-fence                   exit=0 | Пройдено: скиллы и память проекта по правилам упражнения. Срабатыван�
cheats/L2-hangulfiller            exit=1 | CLAUDE.md:23: невидимый или пустой на вид символ (U+3164 HANGUL FILLER); он склеивает �
cheats/L2-hyphen                  exit=1 | память проекта (CLAUDE.md): 888 слов вместе, допускается не больше 250
cheats/L2-ignored-ref             exit=0 | Пройдено: скиллы и память проекта по правилам упражнения. Срабатыван�
cheats/L2-linktext                exit=0 | Пройдено: скиллы и память проекта по правилам упражнения. Срабатыван�
cheats/L2-mdcomment-markers       exit=0 | Пройдено: скиллы и память проекта по правилам упражнения. Срабатыван�
cheats/L2-onlydelete              exit=1 | память проекта (CLAUDE.md): 31 непустых строк вместе, допускается не больше 
cheats/L2-punct                   exit=1 | память проекта (CLAUDE.md): 2248 слов вместе, допускается не больше 250
cheats/L2-script-renamed          exit=0 | Пройдено: скиллы и память проекта по правилам упражнения. Срабатыван�
cheats/L2-script-trailcomment     exit=0 | Пройдено: скиллы и память проекта по правилам упражнения. Срабатыван�
cheats/L2-sessionhook             exit=0 | Пройдено: скиллы и память проекта по правилам упражнения. Срабатыван�
cheats/L2-stub-markers            exit=0 | Пройдено: скиллы и память проекта по правилам упражнения. Срабатыван�
cheats/L2-synonym-condensed       exit=0 | Пройдено: скиллы и память проекта по правилам упражнения. Срабатыван�
cheats/L2-underscore              exit=1 | память проекта (CLAUDE.md): 888 слов вместе, допускается не больше 250
cheats/L2-zwsp                    exit=1 | CLAUDE.md:23: невидимый или пустой на вид символ (U+200B ZERO WIDTH SPACE); он склеивае�
cheats/L3-3desc                   exit=0 | Пройдено: структура глоссария верна. Качество определений и связей о�
cheats/L4-var                     exit=1 | docs/spec.md:17: слово `client` (написано с похожими буквами другого алфавита ил�
cheats/r1-L2-absimport            exit=1 | CLAUDE.md: импорт `@/private/tmp/claude-501/-Users-stepankorshukov-Documents-Projects-academy--claude-worktrees-zealous-b
cheats/r1-L2-fm-TRUEcase          exit=0 | Пройдено: скиллы и память проекта по правилам упражнения. Срабатыван�
cheats/r1-L2-fm-anchor            exit=1 | .claude/skills/release/SKILL.md: frontmatter, строка 3: quote the value: значение начинается со сл�
cheats/r1-L2-fm-bom               exit=1 | .claude/skills/release/SKILL.md: frontmatter, строка 2: outside this exercise: строка не вида `ключ: зн
cheats/r1-L2-fm-dup               exit=1 | .claude/skills/release/SKILL.md: frontmatter, строка 5: outside this exercise: повторный ключ `disable-model
cheats/r1-L2-fm-flow              exit=1 | .claude/skills/release/SKILL.md: frontmatter, строка 5: quote the value: значение начинается со сл�
cheats/r1-L2-fm-indentmeta        exit=1 | .claude/skills/release/SKILL.md: frontmatter, строка 5: quote the value: без кавычек YAML читает его �
cheats/r1-L2-fm-namecaps          exit=1 | .claude/skills/release/SKILL.md: `name` вне этого упражнения: 1-64 символов из a-z, 0-9 и один
cheats/r1-L2-fm-quoted            exit=1 | .claude/skills/release/SKILL.md: frontmatter, строка 4: `disable-model-invocation`: outside this exercise: write the bool
cheats/r1-L2-fm-trailingspace     exit=0 | Пройдено: скиллы и память проекта по правилам упражнения. Срабатыван�
cheats/r1-L2-fm-typo              exit=1 | .claude/skills/release/SKILL.md: неизвестное поле `disable-model-invokation`: Claude Code молча игнор�
cheats/r1-L2-fm-uifalse           exit=1 | .claude/skills/release/SKILL.md: `user-invocable` ложно: тогда вызвать скилл не можете вы, а C
cheats/r1-L2-fm-y                 exit=1 | .claude/skills/release/SKILL.md: `disable-model-invocation: y` - не документированное написание б�
cheats/r1-L2-giantline            exit=1 | память проекта (CLAUDE.md): 768 слов вместе, допускается не больше 250
cheats/r1-L2-homeimport           exit=1 | CLAUDE.md: импорт `@~/.claude/procedures.md` ведёт за пределы репозитория; такой файл �
cheats/r1-L2-import               exit=1 | память проекта (CLAUDE.md, docs/procedures.md): 103 непустых строк вместе, допускаетс
cheats/r1-L2-keepscript           exit=1 | scripts/release_tool.py: копия старого `scripts/release.py` вне скилла (25 из 25 его значимых
cheats/r1-L2-realbom              exit=1 | .claude/skills/release/SKILL.md: frontmatter, строка 1: первая строка файла должна быть ров
cheats/r1-L2-rules                exit=1 | память проекта (.claude/rules/procedures.md, CLAUDE.md): 102 непустых строк вместе, допус�
cheats/r1-L2-stub                 exit=1 | .claude/skills/verify/SKILL.md: скилл не несёт старую процедуру: в теле и файлах, на �
cheats/r1-L2-symlink              exit=0 | Пройдено: скиллы и память проекта по правилам упражнения. Срабатыван�
cheats/r1-L3-avoidgame            exit=1 | docs/ledger/GLOSSARY.md:13: `account` в `_Avoid_` - это термин этого же контекста; термин не�
cheats/r1-L3-guess                exit=0 | Пройдено: структура глоссария верна. Качество определений и связей о�
cheats/r1-L3-guess2               exit=1 | GLOSSARY-MAP.md не найден в корне рабочей папки
cheats/r1-L3-impl                 exit=0 | Пройдено: структура глоссария верна. Качество определений и связей о�
cheats/r1-L3-stuff                exit=0 | Пройдено: структура глоссария верна. Качество определений и связей о�
cheats/r1-L3-termvariant          exit=1 | docs/billing/GLOSSARY.md:8: `account` в `_Avoid_` - это термин этого же контекста; термин не�
cheats/r1-L4-adr-lower            exit=1 | docs/adr: файлов ADR вида NNNN-<slug>.md 0, нужен ровно один. ADR пишут для решения, к�
cheats/r1-L4-checkline-vocab      exit=1 | docs/tasks.md:6: в T-01 строка не в форме `Check:` и ровно одна команда в обратных к�
cheats/r1-L4-fence-vocab          exit=0 | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает ментор
cheats/r1-L4-heading-vocab        exit=0 | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает ментор
cheats/r1-L4-homoglyph            exit=1 | docs/spec.md:59: слово `client` (написано с похожими буквами другого алфавита ил�
cheats/r1-L4-madr                 exit=0 | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает ментор
cheats/r1-L4-min                  exit=1 | docs/tasks.md:4: в T-01 команда `Check:` не запуск тестов: `[ИМЯ=значение ...] python3 -m unit
cheats/r1-L4-reqfield-comment     exit=1 | docs/tasks.md:6: в T-01 команда `Check:` не запуск тестов: `[ИМЯ=значение ...] python3 -m unit
cheats/r1-L4-reqheading           exit=1 | docs/tasks.md:6: в T-01 команда `Check:` не запуск тестов: `[ИМЯ=значение ...] python3 -m unit
cheats/r1-L4-twoadr               exit=1 | docs/adr: файлов ADR вида NNNN-<slug>.md 2 (docs/adr/0001-another.md, docs/adr/0001-derive-next-reminder-from-history
cheats/r1-L4-twocmds              exit=1 | docs/tasks.md:6: в T-01 команда `Check:` не запуск тестов: `[ИМЯ=значение ...] python3 -m unit
student-B2/02-skills                  exit=0 | Пройдено: скиллы и память проекта по правилам упражнения. Срабатыв�
student-B2/03-domain-ontology         exit=0 | Пройдено: структура глоссария верна. Качество определений и связей
student-B2/04-spec-adr-tasks          exit=0 | Пройдено: форма спецификации, ADR и задач верна. Смысл оценивает мент
```

Where each student round-2 cheat is caught:
- command check (now FAIL): L2-underscore, L2-camel, L2-hyphen, L2-punct (word budget), L2-hangulfiller,
  L2-zwsp (invisible character); L4 `-h` / `--help` (R3 cases above).
- rubric-skills (command PASS by design): L2-stub-markers, L2-mdcomment-markers, L2-ignored-ref,
  L2-fence, L2-linktext (criterion 1: 3+ steps missing); L2-script-renamed, L2-script-trailcomment
  (criterion 2: copy); L2-sessionhook (criterion 3: hook); L2-synonym-condensed (criterion 3: 3+ leaked
  steps in CLAUDE.md). L2-description-proc is byte-identical to the honest copy in the student's
  scratch (no procedure in the description), so it passes both, correctly.
- rubric-sdd criterion 5: L4 look-alikes outside the fold table and CGJ / variation selectors
  (R3 "rubric-only" cases; demo set `obfuscated-vocab`).
- unchanged by design: `fm-TRUEcase`, `fm-trailingspace`, `symlink`, L3 `guess`/`impl`/`stuff`/`3desc`,
  L4 `fence-vocab`, `heading-vocab`, `madr` (rubric C4 0).

Rubric demo sets, structure checks (every set except the empty starter passes, as intended):

```
02 session-hook               exit=0 | Пройдено: скиллы и память проекта по правила
02 honest                     exit=0 | Пройдено: скиллы и память проекта по правила
02 script-copy                exit=0 | Пройдено: скиллы и память проекта по правила
02 borderline                 exit=0 | Пройдено: скиллы и память проекта по правила
02 marker-only                exit=0 | Пройдено: скиллы и память проекта по правила
02 empty-starter              exit=1 | .claude/skills/verify/SKILL.md: не найден
02 reference                  exit=0 | Пройдено: скиллы и память проекта по правила
02 weak                       exit=0 | Пройдено: скиллы и память проекта по правила
03 borderline                 exit=0 | Пройдено: структура глоссария верна. Качест�
03 injection                  exit=0 | Пройдено: структура глоссария верна. Качест�
03 keyword-stuffed-circular   exit=0 | Пройдено: структура глоссария верна. Качест�
03 weak                       exit=0 | Пройдено: структура глоссария верна. Качест�
04 borderline                 exit=0 | Пройдено: форма спецификации, ADR и задач верн
04 horizontal-slices          exit=0 | Пройдено: форма спецификации, ADR и задач верн
04 injection                  exit=0 | Пройдено: форма спецификации, ADR и задач верн
04 non-qualifying-adr         exit=0 | Пройдено: форма спецификации, ADR и задач верн
04 obfuscated-vocab           exit=0 | Пройдено: форма спецификации, ADR и задач верн
04 weak                       exit=0 | Пройдено: форма спецификации, ADR и задач верн
```

L2 blind grading (author-built, so not truly blind: the sets were shuffled to artifact-1..8 with seed
413 and graded from the files against `rubric-skills.md` before reading `blind-L2.key`):

```
artifact-1 2,1,0,2 = 5/8 fail   key: session-hook   (README: 2,1,0,2)
artifact-2 2,2,2,2 = 8/8 pass   key: honest         (README: 2,2,2,2)
artifact-3 2,0,2,2 = 6/8 fail   key: script-copy    (README: 2,0,2,2)
artifact-4 1,2,1,2 = 6/8 pass   key: borderline     (README: 1,2,1,2)
artifact-5 0,2,2,1 = 5/8 fail   key: marker-only    (README: 0,2,2,1)
artifact-6 0,0,0,0 = 0/8 fail   key: empty-starter  (README: 0,0,0,0)
artifact-7 2,2,2,2 = 8/8 pass   key: reference      (README: 2,2,2,2)
artifact-8 0,2,1,1 = 4/8 fail   key: weak           (README: 0,2,1,1)
```
8/8 match. An independent blind grading by the student agent is still due.

## Round 3b (student round 3 on `rubric-skills.md`, 2026-10-30)

Changes: criterion 3 is judged by intent (anything that puts procedure text into every session's
context, by any mechanism, if it reaches every session; memory, imports, rules, hooks, skill and
subagent descriptions, a selected output style are places to look, not a closed list); short project
facts, the test command, the no-`-I` note and one pointer line per skill are stated exemptions.
Criterion 4 Q2: nothing in any artifact may tell the model or a subagent to run a release, the skill
or the script on its own. Demo: `script-copy/tools/bump.py` fixed (patch, minor, major all bump
correctly on a scratch `pyproject.toml`); new sets `subagent` and `output-style` (base `honest/`);
README states every set's base.

Command check: 236 cases, 0 mismatches; all 10 assembled L2 sets except the empty starter pass
`skills-structure` (as do the 9 L3/L4 sets); the student's `L2-subagent` and `L2-outputstyle` pass it
too (rubric-only by design).

Blind re-grade (reshuffled, seed 4132; graded from the files, key read afterwards):

```
artifact-1  1,2,1,2 = 6/8 pass   borderline     (README 1,2,1,2)
artifact-2  2,1,0,2 = 5/8 fail   session-hook   (README 2,1,0,2)
artifact-3  2,1,0,2 = 5/8 fail   output-style   (README 2,1,0,2)
artifact-4  2,0,2,2 = 6/8 fail   script-copy    (README 2,0,2,2)
artifact-5  0,0,0,0 = 0/8 fail   empty-starter  (README 0,0,0,0)
artifact-6  2,2,2,2 = 8/8 pass   reference      (README 2,2,2,2)
artifact-7  0,2,1,1 = 4/8 fail   weak           (README 0,2,1,1)
artifact-8  2,2,2,2 = 8/8 pass   honest         (README 2,2,2,2)
artifact-9  2,2,0,0 = 4/8 fail   subagent       (README 2,2,0,0)
artifact-10 0,2,2,1 = 5/8 fail   marker-only    (README 0,2,2,1)
```
10/10 match (author-graded; the student's independent round-3 grading matched the earlier 6 sets).

## Round 4 (judge_content round 1, 2026-10-30)

Source of the tokenizer: Claude Code **2.1.267** (`/opt/homebrew/Caskroom/claude-code/2.1.267/claude`,
`strings`; `claude --version` = 2.1.267, no newer binary or npm package on this machine, so the pinned
2.1.312 is not re-checked). The loader function: regex `/(?:^|\s)@((?:[^\s\\]|\\ )+)/g`, cut at the first
`#`, `replaceAll("\\ "," ")`, keep the token only if it starts with `./`, `~/`, `/` (not `/` alone) or
`[a-zA-Z0-9._-]` (not `@`, not a `#%^&*()` run), resolve against the importing file's directory. It walks
Markdown text tokens, skipping code spans, fenced code and HTML comments.

Changes:
- L2 `verify_skills.py`: `IMPORT_TOKEN` is that regex; new `import_path()` applies the cut, the unescape
  and the start filter; `imports_of()` resolves relative to the importing file and still reports `~/`,
  absolute and climbing imports outside the workspace; `memory_set()` stays the one resolver. Extra over
  Claude Code (stricter only): a token is also tried without trailing `.,;:)`; HTML comments in memory
  are not stripped.
- L2 `quiz.yaml`: `skill-choice` explanation and `skill-fired-proves-little` explanation no longer use
  " - " as a dash; `third-party-skill-risks` option c = "Хуки из поля `hooks` регистрируются при вызове
  скилла и работают до конца сессии" (theory.md:132 quote: registered on invocation, kept for the rest of
  the session), explanation updated; key [a, c, d] unchanged.
- L6 `checks/bugs.yaml` header: rules 1 and 4 in the task.md wording; mentor note for 340-345 ("Начать?",
  no range, no decoy). Key data unchanged (JSON of the key equal to round 3; `gen.py` header synced and
  regenerating reproduces every shipped L6 file byte for byte).

Command cases: 244 (236 earlier + 8 new), 0 mismatches. Student round-2 cheats and rubric-demo sets: same
verdicts as round 3. L2-L4 starter fails / reference passes on 3.12 and 3.11. `pnpm content:validate`:
0 issues.

```
ok  | 02 | reference | R4 @docs/procedures.md#steps (fragment cut, whole file loads) | FAIL(exit 1) | память проекта (CLAUDE.md, docs/procedures.md): 69 непустых строк
ok  | 02 | reference | R4 @docs/proc\ edures.md (escaped space) | FAIL(exit 1) | память проекта (CLAUDE.md, docs/proc edures.md): 69 непустых строк
ok  | 02 | reference | R4 @./docs/procedures.md | FAIL(exit 1) | память проекта (CLAUDE.md, docs/procedures.md): 69 непустых строк
ok  | 02 | reference | R4 second hop relative to the importing file (docs/index.md -> @procedures.md#a) | FAIL(exit 1) | память проекта (CLAUDE.md, docs/index.md, docs/procedures.md): 70 непустых строк
ok  | 02 | reference | R4 control: plain @docs/procedures.md | FAIL(exit 1) | память проекта (CLAUDE.md, docs/procedures.md): 69 непустых строк
ok  | 02 | reference | R4 near-miss short @docs/style.md#intro | PASS
ok  | 02 | reference | R4 near-miss email user@example.com in prose, root file example.com = procedures | PASS
ok  | 02 | reference | R4 near-miss @@docs/procedures.md (token starts with @, loader skips it) | PASS
```

Open (outside L2): module 00 L5 `verify_memory.py:43` has the same old `IMPORT_TOKEN`; this copy was
fixed only in L2.

## Round 5 (judge_content round 2, B2, 2026-10-30)

Stepan's decision: strict by construction. Claude Code 2.1.267 runs its import regex on marked `text`
tokens (and on HTML-comment blocks after removing the comments), so a token can start right after
Markdown glued to `@`. The check no longer models marked.

Changes, L2 `verify_skills.py` (`memory_set()` still the one resolver):
- `IMPORT_TOKEN = (?<![A-Za-z0-9])@(?=((?:[^\s\\]|\\ )+))` over the whole file, code spans and fences
  included. The capture sits in a lookahead so matches overlap: the judge's prototype consumed
  `a**y**@docs/procedures.md` as one token after `**x**@` and missed the second `@` (prototype output `[]`
  on `**x**@a**y**@docs/procedures.md`; Claude Code imports it). The per-line fence and code-span logic
  and the round-4 start filter are gone.
- `import_candidates()`: cut at `#`, `\ ` to a space, then the path and every prefix that ends before one of
  `` *_~`<>[]()!\.,;: ``. Each candidate that is an existing workspace file relative to the importing
  file's directory is counted. `leaves_workspace()` on the full path: `~/`, absolute outside, climbing
  `../` are reported as before.

Corpus (judge's `ja/r2/cmp.py` against the `sim.mjs` model of Claude Code's extractor on marked 17.0.6,
run with the workspace path resolved): `cases1.json` 36 forms: 34 equal, 2 stricter (`&amp;@`, indented
code), 0 missed. Three judge forms added (`@docs/procedures.md**now**`, `@docs/procedures.md[x](y)`,
`user@example.com`): equal. Extra: `**x**@a**y**@docs/procedures.md` and `@foo<b>@docs/procedures.md`
equal; `@@docs/procedures.md`, `See @docs/procedures.md.` and `(see @docs/procedures.md)` stricter.
The judge's overlays `ja/r2/ov/*.md` through the full grader: all eight forms and the plain control exit 1;
`nm_anchor`, `nm_email`, `nm_esc` exit 0; `nm_codespan` (procedures named in a code span) now exit 1, by
design.

Command cases: 258 (244 + 14), 0 mismatches. Two old near-misses flip to must-fail, stricter than Claude
Code by decision: `@docs/release.md` in a code span with the release procedure in that file, and
`@@docs/procedures.md`. New must-fail: the judge's 8 forms, chained glue, `**now**` and link after the path,
a fenced block. New near-misses (pass): `user@example.com` next to a full `docs/procedures.md`, a code
span naming a short honest `docs/style.md`. Honest solutions: L2 reference (3.12 and 3.11), student B's
L2 solution and the student round-2 honest copies pass; the 10 rubric-demo sets give the same verdicts as
round 3b; later starters (L3, L4, L5, L7) show no memory or import error. `pnpm content:validate`: 0
issues.

Open for lesson-author: task.md:137-138, the parenthesis "`@` внутри обратных кавычек или блока кода
импортом не считается" is now false (the check counts them).
