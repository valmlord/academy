# ADR-0001: Use frozen dataclasses for the reminder models

Status: accepted

## Context

Для Reminder и SentReminder нужны классы данных. В сервисе все модели - frozen dataclass.

## Decision

Мы используем frozen dataclass для всех новых моделей фичи.

## Consequences

- Модели неизменяемы и сравниваются по значению.
