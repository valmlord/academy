# Tasks: payment reminders

## T-01: First Reminder for an overdue Invoice
Requirements: REQ-01, REQ-07
Blocked by: none
Check: `PYTHONPATH=src python3 -m unittest discover -s tests -t . -k test_req_01 -k test_req_07`
Status: todo

## T-02: Escalation to SECOND and FINAL Reminders
Requirements: REQ-02, REQ-03, REQ-04
Blocked by: T-01
Check: `PYTHONPATH=src python3 -m unittest discover -s tests -t . -k test_req_02 -k test_req_03 -k test_req_04`
Status: todo

## T-03: No Reminder below the minimum Outstanding Balance
Requirements: REQ-05
Blocked by: T-01
Check: `PYTHONPATH=src python3 -m unittest discover -s tests -t . -k test_req_05`
Status: todo

## T-04: Reminders only for issued Invoices
Requirements: REQ-06
Blocked by: T-01
Check: `PYTHONPATH=src python3 -m unittest discover -s tests -t . -k test_req_06`
Status: todo

## T-05: One Reminder per Invoice in a stable order
Requirements: REQ-08
Blocked by: T-02
Check: `PYTHONPATH=src python3 -m unittest discover -s tests -t . -k test_req_08`
Status: todo
