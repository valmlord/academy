# Glossary map

## Contexts

- [Booking](docs/booking/GLOSSARY.md): расписание хоста, виды встреч, свободные слоты и бронирования.

## Relationships

- Event Type ссылается на один Schedule; Booking ссылается на один Event Type.
- Все Booking одного Host конфликтуют между собой, какого бы Event Type они ни были.
