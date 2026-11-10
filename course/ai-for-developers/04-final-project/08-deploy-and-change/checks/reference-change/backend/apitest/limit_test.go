package apitest

import (
	"net/http"
	"testing"
	"time"
)

// limitHost is a New York schedule open 18:00-23:00 local every day: its evenings cross the UTC date line, so a
// limit counted by UTC date differs from one counted by the local date.
func limitHost(t *testing.T, limit int) (string, string) {
	t.Helper()
	scheduleID := createSchedule(t, map[string]any{"name": "Evening host", "timeZone": "America/New_York",
		"weekly": everyDay("18:00", "23:00"), "overrides": []any{}})
	limited := createEventType(t, map[string]any{"title": "Limited", "durationMinutes": 30, "slotIncrementMinutes": 30,
		"bufferBeforeMinutes": 0, "bufferAfterMinutes": 0, "minimumNoticeMinutes": 0, "bookingWindowDays": 365,
		"maxBookingsPerDay": limit, "scheduleId": scheduleID})
	open := createEventType(t, map[string]any{"title": "Open", "durationMinutes": 30, "slotIncrementMinutes": 30,
		"bufferBeforeMinutes": 0, "bufferAfterMinutes": 0, "minimumNoticeMinutes": 0, "bookingWindowDays": 365,
		"scheduleId": scheduleID})
	return limited, open
}

// evening is 18:00 local on a December 2026 date in New York (EST, UTC-5).
func evening(offsetDays, minutesAfter18 int) time.Time {
	return time.Date(2026, 12, 1, 23, 0, 0, 0, time.UTC).AddDate(0, 0, offsetDays).Add(time.Duration(minutesAfter18) * time.Minute)
}

func TestDailyLimitCountsLocalDateOfThisEventType(t *testing.T) {
	limited, open := limitHost(t, 2)
	day := evening(0, 0)
	first := book(t, limited, day)             // 18:00 local, 23:00Z
	second := book(t, limited, evening(0, 90)) // 19:30 local, 00:30Z the next UTC date
	other := book(t, open, evening(0, 240))    // another event type, same local date

	full := slotsOf(t, limited, day, day.Add(5*time.Hour))
	third := send(t, "POST", "/bookings", bookingBody(limited, evening(0, 180)))
	offGrid := send(t, "POST", "/bookings", bookingBody(limited, evening(0, 185)))
	stillOpen := slotsOf(t, open, day, day.Add(5*time.Hour))

	if len(full) != 0 {
		t.Errorf("two bookings reach maxBookingsPerDay 2, yet the date still offers %d slots", len(full))
	}
	third.expectProblem(t, http.StatusConflict, "daily_limit_reached")
	offGrid.expectProblem(t, http.StatusUnprocessableEntity, "slot_unavailable")
	if len(stillOpen) == 0 {
		t.Errorf("the limit of one event type closed the date for another event type")
	}
	for _, id := range []string{first.ID, second.ID, other.ID} {
		cancel(t, id)
	}
}

func TestCancelledBookingsDoNotCountTowardsTheLimit(t *testing.T) {
	limited, _ := limitHost(t, 1)
	day := evening(3, 0)
	created := book(t, limited, day)
	cancel(t, created.ID)

	offered := slotsOf(t, limited, day, day.Add(5*time.Hour))
	again := book(t, limited, evening(3, 60))

	if len(offered) == 0 {
		t.Errorf("a cancelled booking still counts towards maxBookingsPerDay")
	}
	cancel(t, again.ID)
}

func TestOtherEventTypesDoNotCountTowardsTheLimit(t *testing.T) {
	limited, open := limitHost(t, 1)
	day := evening(6, 0)
	other := book(t, open, day)

	offered := slotsOf(t, limited, day.Add(time.Hour), day.Add(5*time.Hour))
	created := book(t, limited, evening(6, 120))

	if len(offered) == 0 {
		t.Errorf("a booking of another event type closed the date for the limited one")
	}
	cancel(t, created.ID)
	cancel(t, other.ID)
}

func TestLimitOutsideBoundsIs400(t *testing.T) {
	scheduleID := createSchedule(t, map[string]any{"name": "Host", "timeZone": "UTC", "weekly": everyDay("09:00", "17:00"),
		"overrides": []any{}})
	for _, limit := range []any{0, 101, "5"} {
		answer := send(t, "POST", "/event-types", map[string]any{"title": "Bad", "durationMinutes": 30,
			"slotIncrementMinutes": 30, "bufferBeforeMinutes": 0, "bufferAfterMinutes": 0, "minimumNoticeMinutes": 0,
			"bookingWindowDays": 30, "maxBookingsPerDay": limit, "scheduleId": scheduleID})
		answer.expectProblem(t, http.StatusBadRequest, "validation_failed")
	}
}
