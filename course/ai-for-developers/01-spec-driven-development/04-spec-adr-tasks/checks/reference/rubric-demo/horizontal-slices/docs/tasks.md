# Tasks: payment reminders

## T-01: Модели и перечисления для Reminder
Requirements: REQ-07
Blocked by: none
Check: `PYTHONPATH=src python3 -m unittest discover -s tests -t .`
Status: todo

## T-02: Слой хранения истории отправленных Reminder
Requirements: REQ-01, REQ-02, REQ-03, REQ-04
Blocked by: T-01
Check: `PYTHONPATH=src python3 -m unittest discover -s tests -t .`
Status: todo

## T-03: Вся логика plan_reminders
Requirements: REQ-05, REQ-06, REQ-08
Blocked by: T-02
Check: `PYTHONPATH=src python3 -m unittest discover -s tests -t .`
Status: todo

## T-04: Все тесты для plan_reminders
Requirements: REQ-01, REQ-02, REQ-03, REQ-04, REQ-05, REQ-06, REQ-07, REQ-08
Blocked by: T-03
Check: `PYTHONPATH=src python3 -m unittest discover -s tests -t .`
Status: todo
