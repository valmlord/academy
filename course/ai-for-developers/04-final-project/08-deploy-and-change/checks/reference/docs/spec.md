# Spec: booking calendar

## Problem Statement

Ирина согласует каждую встречу в переписке; бывают двойные записи и сдвиг на час после перевода часов.

## Solution

Invitee видит свободные Slot одного Event Type в своём часовом поясе и бронирует Slot сам; Host один, и
каждый Booking занимает его время для всех Event Type.

## Requirements

- **REQ-01** WHEN Slot are computed for a local date of a Schedule THE SYSTEM SHALL pick the Weekly Rule by the ISO weekday of that local date in the Schedule's time zone and step from one local date to the next by the calendar date
- **REQ-02** WHEN a Date Override exists for a local date THE SYSTEM SHALL use only its windows for that date instead of the Weekly Rules, and no Slot at all when it has no windows
- **REQ-03** WHEN a window bound falls into a local time that does not exist because clocks moved forward THE SYSTEM SHALL read it with the offset in force before the transition, so the bound moves forward by the length of the gap
- **REQ-04** WHEN a window bound falls into a local time that occurs twice because clocks moved back THE SYSTEM SHALL use the earlier of the two instants
- **REQ-05** WHEN candidate starts are generated in an Availability Window `[start, end)` THE SYSTEM SHALL start at the window start, step by the slot increment in elapsed minutes, and keep a Slot that ends exactly at the window end
- **REQ-06** WHEN a candidate Slot is checked against a confirmed Booking THE SYSTEM SHALL reject it if the Slot overlaps the Booking with the Booking's Buffers, or the Slot with its own Buffers overlaps the Booking; Buffers may extend outside the Availability Window
- **REQ-07** WHEN two intervals only touch (one ends where the other starts) THE SYSTEM SHALL treat them as not overlapping
- **REQ-08** WHEN Slot are offered THE SYSTEM SHALL offer only starts at or after the current moment plus the Minimum Notice
- **REQ-09** WHEN Slot are offered THE SYSTEM SHALL offer only starts strictly before the current moment plus the Booking Window in days of 24 hours
- **REQ-10** WHEN a Booking is cancelled THE SYSTEM SHALL stop counting it as busy time, so its Slot is offered again
- **REQ-11** WHEN a Booking of any Event Type exists THE SYSTEM SHALL count it as busy time for every Event Type of the Host
- **REQ-12** WHEN a Schedule is created THE SYSTEM SHALL accept windows `HH:MM-HH:MM` with start before end, `24:00` only as an end, no window across midnight and no overlapping windows on one day, and answer 400 validation_failed otherwise
- **REQ-13** WHEN free Slot of an Event Type are requested for `[from, to)` THE SYSTEM SHALL return the Slot whose start lies in the range, sorted by start, for a range of at most 31 days, and 400 for a longer or reversed range
- **REQ-14** WHEN any request fails THE SYSTEM SHALL answer with `application/problem+json` and one code from validation_failed, not_found, unknown_reference, slot_unavailable, idempotency_mismatch, slot_taken, idempotency_in_progress
- **REQ-15** WHEN a request has a missing field, an unknown field, a value out of bounds, a timestamp without an offset or an unknown time zone THE SYSTEM SHALL answer 400 validation_failed
- **REQ-16** WHEN a Booking is requested for a start that is off the grid, outside availability, too soon or too far, or for an unknown Event Type THE SYSTEM SHALL answer 422; WHEN the start is free in principle but taken by another Booking or its Buffers THE SYSTEM SHALL answer 409 slot_taken
- **REQ-17** WHEN a Booking request carries an Idempotency Key of 8-64 characters `A-Z a-z 0-9 _ -` THE SYSTEM SHALL replay the first answer for the same key and body, answer 422 idempotency_mismatch for the same key with another body, and 409 idempotency_in_progress while the first request runs
- **REQ-18** WHEN several requests book overlapping Slot at the same time THE SYSTEM SHALL create exactly one Booking and answer the others 409 slot_taken
- **REQ-19** WHEN a cancelled Booking is cancelled again THE SYSTEM SHALL answer with the same body as the first cancellation
- **REQ-20** WHEN an Invitee opens the booking page for a date and a time zone THE SYSTEM SHALL show the free Slot of that local date as `HH:MM` in the Invitee's time zone
- **REQ-21** WHEN the Host starts the service on one machine THE SYSTEM SHALL bring up the API and the booking page with one command
- **REQ-22** WHEN a Booking is requested by its id THE SYSTEM SHALL return it with its current status, and answer 404 not_found for an unknown id

## Examples

Каждый пример исполняемый: `now` = 2026-03-01T08:00:00Z, у каждого примера свои даты, бронирования
создаются через POST /bookings в порядке списка (рекомендация повтора в уроке 7).

```slots-example
{
  "id": "ny-gap-window-moves-forward",
  "req": [
    "REQ-03"
  ],
  "request": {
    "now": "2026-03-01T08:00:00Z",
    "schedule": {
      "name": "Ирина",
      "timeZone": "America/New_York",
      "weekly": [
        {
          "weekday": 7,
          "start": "02:30",
          "end": "04:00"
        }
      ],
      "overrides": []
    },
    "eventType": {
      "title": "Знакомство",
      "durationMinutes": 30,
      "slotIncrementMinutes": 30,
      "bufferBeforeMinutes": 0,
      "bufferAfterMinutes": 0,
      "minimumNoticeMinutes": 0,
      "bookingWindowDays": 60
    },
    "bookings": [],
    "from": "2026-03-08T00:00:00-05:00",
    "to": "2026-03-09T00:00:00-04:00"
  },
  "expected": [
    {
      "start": "2026-03-08T03:30:00-04:00",
      "end": "2026-03-08T04:00:00-04:00"
    }
  ]
}
```

```slots-example
{
  "id": "sydney-overlap-first-occurrence",
  "req": [
    "REQ-04"
  ],
  "request": {
    "now": "2026-03-01T08:00:00Z",
    "schedule": {
      "name": "Ирина",
      "timeZone": "Australia/Sydney",
      "weekly": [
        {
          "weekday": 7,
          "start": "02:30",
          "end": "03:30"
        }
      ],
      "overrides": []
    },
    "eventType": {
      "title": "Знакомство",
      "durationMinutes": 30,
      "slotIncrementMinutes": 30,
      "bufferBeforeMinutes": 0,
      "bufferAfterMinutes": 0,
      "minimumNoticeMinutes": 0,
      "bookingWindowDays": 60
    },
    "bookings": [],
    "from": "2026-04-05T00:00:00+11:00",
    "to": "2026-04-06T00:00:00+10:00"
  },
  "expected": [
    {
      "start": "2026-04-05T02:30:00+11:00",
      "end": "2026-04-05T02:00:00+10:00"
    },
    {
      "start": "2026-04-05T02:00:00+10:00",
      "end": "2026-04-05T02:30:00+10:00"
    },
    {
      "start": "2026-04-05T02:30:00+10:00",
      "end": "2026-04-05T03:00:00+10:00"
    },
    {
      "start": "2026-04-05T03:00:00+10:00",
      "end": "2026-04-05T03:30:00+10:00"
    }
  ]
}
```

```slots-example
{
  "id": "berlin-adjacent-meetings",
  "req": [
    "REQ-07"
  ],
  "request": {
    "now": "2026-03-01T08:00:00Z",
    "schedule": {
      "name": "Ирина",
      "timeZone": "Europe/Berlin",
      "weekly": [
        {
          "weekday": 1,
          "start": "09:00",
          "end": "12:00"
        }
      ],
      "overrides": []
    },
    "eventType": {
      "title": "Знакомство",
      "durationMinutes": 60,
      "slotIncrementMinutes": 60,
      "bufferBeforeMinutes": 0,
      "bufferAfterMinutes": 0,
      "minimumNoticeMinutes": 0,
      "bookingWindowDays": 60
    },
    "bookings": [
      {
        "start": "2026-03-16T10:00:00+01:00",
        "end": "2026-03-16T11:00:00+01:00",
        "bufferBeforeMinutes": 0,
        "bufferAfterMinutes": 0,
        "status": "confirmed"
      }
    ],
    "from": "2026-03-16T00:00:00+01:00",
    "to": "2026-03-17T00:00:00+01:00"
  },
  "expected": [
    {
      "start": "2026-03-16T09:00:00+01:00",
      "end": "2026-03-16T10:00:00+01:00"
    },
    {
      "start": "2026-03-16T11:00:00+01:00",
      "end": "2026-03-16T12:00:00+01:00"
    }
  ]
}
```

```slots-example
{
  "id": "berlin-buffers-of-new-slot",
  "req": [
    "REQ-06"
  ],
  "request": {
    "now": "2026-03-01T08:00:00Z",
    "schedule": {
      "name": "Ирина",
      "timeZone": "Europe/Berlin",
      "weekly": [
        {
          "weekday": 2,
          "start": "09:00",
          "end": "12:00"
        }
      ],
      "overrides": []
    },
    "eventType": {
      "title": "Знакомство",
      "durationMinutes": 60,
      "slotIncrementMinutes": 60,
      "bufferBeforeMinutes": 0,
      "bufferAfterMinutes": 30,
      "minimumNoticeMinutes": 0,
      "bookingWindowDays": 60
    },
    "bookings": [
      {
        "start": "2026-03-17T11:00:00+01:00",
        "end": "2026-03-17T12:00:00+01:00",
        "bufferBeforeMinutes": 0,
        "bufferAfterMinutes": 0,
        "status": "confirmed"
      }
    ],
    "from": "2026-03-17T00:00:00+01:00",
    "to": "2026-03-18T00:00:00+01:00"
  },
  "expected": [
    {
      "start": "2026-03-17T09:00:00+01:00",
      "end": "2026-03-17T10:00:00+01:00"
    }
  ]
}
```

```slots-example
{
  "id": "kolkata-notice-from-now",
  "req": [
    "REQ-08"
  ],
  "request": {
    "now": "2026-03-01T08:00:00Z",
    "schedule": {
      "name": "Ирина",
      "timeZone": "Asia/Kolkata",
      "weekly": [
        {
          "weekday": 7,
          "start": "14:00",
          "end": "18:00"
        }
      ],
      "overrides": []
    },
    "eventType": {
      "title": "Знакомство",
      "durationMinutes": 60,
      "slotIncrementMinutes": 60,
      "bufferBeforeMinutes": 0,
      "bufferAfterMinutes": 0,
      "minimumNoticeMinutes": 120,
      "bookingWindowDays": 60
    },
    "bookings": [],
    "from": "2026-03-01T00:00:00+05:30",
    "to": "2026-03-02T00:00:00+05:30"
  },
  "expected": [
    {
      "start": "2026-03-01T16:00:00+05:30",
      "end": "2026-03-01T17:00:00+05:30"
    },
    {
      "start": "2026-03-01T17:00:00+05:30",
      "end": "2026-03-01T18:00:00+05:30"
    }
  ]
}
```

```slots-example
{
  "id": "kathmandu-booking-window-edge",
  "req": [
    "REQ-09"
  ],
  "request": {
    "now": "2026-03-01T08:00:00Z",
    "schedule": {
      "name": "Ирина",
      "timeZone": "Asia/Kathmandu",
      "weekly": [
        {
          "weekday": 7,
          "start": "10:00",
          "end": "16:00"
        }
      ],
      "overrides": []
    },
    "eventType": {
      "title": "Знакомство",
      "durationMinutes": 60,
      "slotIncrementMinutes": 60,
      "bufferBeforeMinutes": 0,
      "bufferAfterMinutes": 0,
      "minimumNoticeMinutes": 0,
      "bookingWindowDays": 7
    },
    "bookings": [],
    "from": "2026-03-08T00:00:00+05:45",
    "to": "2026-03-09T00:00:00+05:45"
  },
  "expected": [
    {
      "start": "2026-03-08T10:00:00+05:45",
      "end": "2026-03-08T11:00:00+05:45"
    },
    {
      "start": "2026-03-08T11:00:00+05:45",
      "end": "2026-03-08T12:00:00+05:45"
    },
    {
      "start": "2026-03-08T12:00:00+05:45",
      "end": "2026-03-08T13:00:00+05:45"
    },
    {
      "start": "2026-03-08T13:00:00+05:45",
      "end": "2026-03-08T14:00:00+05:45"
    }
  ]
}
```

```slots-example
{
  "id": "moscow-override-replaces-day",
  "req": [
    "REQ-02"
  ],
  "request": {
    "now": "2026-03-01T08:00:00Z",
    "schedule": {
      "name": "Ирина",
      "timeZone": "Europe/Moscow",
      "weekly": [
        {
          "weekday": 1,
          "start": "09:00",
          "end": "12:00"
        }
      ],
      "overrides": [
        {
          "date": "2026-03-23",
          "intervals": [
            {
              "start": "14:00",
              "end": "15:00"
            }
          ]
        }
      ]
    },
    "eventType": {
      "title": "Знакомство",
      "durationMinutes": 60,
      "slotIncrementMinutes": 60,
      "bufferBeforeMinutes": 0,
      "bufferAfterMinutes": 0,
      "minimumNoticeMinutes": 0,
      "bookingWindowDays": 60
    },
    "bookings": [],
    "from": "2026-03-23T00:00:00+03:00",
    "to": "2026-03-24T00:00:00+03:00"
  },
  "expected": [
    {
      "start": "2026-03-23T14:00:00+03:00",
      "end": "2026-03-23T15:00:00+03:00"
    }
  ]
}
```

```slots-example
{
  "id": "sydney-weekday-of-local-date",
  "req": [
    "REQ-01"
  ],
  "request": {
    "now": "2026-03-01T08:00:00Z",
    "schedule": {
      "name": "Ирина",
      "timeZone": "Australia/Sydney",
      "weekly": [
        {
          "weekday": 1,
          "start": "08:00",
          "end": "10:00"
        }
      ],
      "overrides": []
    },
    "eventType": {
      "title": "Знакомство",
      "durationMinutes": 60,
      "slotIncrementMinutes": 60,
      "bufferBeforeMinutes": 0,
      "bufferAfterMinutes": 0,
      "minimumNoticeMinutes": 0,
      "bookingWindowDays": 60
    },
    "bookings": [],
    "from": "2026-03-09T00:00:00+11:00",
    "to": "2026-03-10T00:00:00+11:00"
  },
  "expected": [
    {
      "start": "2026-03-09T08:00:00+11:00",
      "end": "2026-03-09T09:00:00+11:00"
    },
    {
      "start": "2026-03-09T09:00:00+11:00",
      "end": "2026-03-09T10:00:00+11:00"
    }
  ]
}
```
