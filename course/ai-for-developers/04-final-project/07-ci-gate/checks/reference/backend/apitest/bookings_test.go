package apitest

import (
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"
)

// host is one schedule open 09:00-17:00 UTC every day with a 30-minute event type on a 30-minute grid.
type host struct {
	eventTypeID string
}

func newHost(t *testing.T) host {
	t.Helper()
	scheduleID := createSchedule(t, map[string]any{"name": "Host", "timeZone": "UTC", "weekly": everyDay("09:00", "17:00"),
		"overrides": []any{}})
	return host{createEventType(t, map[string]any{"title": "Intro", "durationMinutes": 30, "slotIncrementMinutes": 30,
		"bufferBeforeMinutes": 0, "bufferAfterMinutes": 0, "minimumNoticeMinutes": 0, "bookingWindowDays": 365,
		"scheduleId": scheduleID})}
}

// day is a UTC date of its own for each test, far from the replayed cases (March-May 2026).
func day(offsetDays int) time.Time {
	return time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC).AddDate(0, 0, offsetDays)
}

func at(date time.Time, hour, minute int) time.Time {
	return date.Add(time.Duration(hour)*time.Hour + time.Duration(minute)*time.Minute)
}

func TestTakenSlotIs409AndOffGridIs422(t *testing.T) {
	h := newHost(t)
	start := at(day(0), 10, 0)
	first := book(t, h.eventTypeID, start)

	again := send(t, "POST", "/bookings", bookingBody(h.eventTypeID, start))
	offGrid := send(t, "POST", "/bookings", bookingBody(h.eventTypeID, at(day(0), 10, 10)))
	unknown := send(t, "POST", "/bookings", bookingBody("no-such-event-type", start))

	again.expectProblem(t, http.StatusConflict, "slot_taken")
	offGrid.expectProblem(t, http.StatusUnprocessableEntity, "slot_unavailable")
	unknown.expectProblem(t, http.StatusUnprocessableEntity, "unknown_reference")
	cancel(t, first.ID)
}

func TestCancelFreesTheSlotAndRepeatsItsAnswer(t *testing.T) {
	h := newHost(t)
	start := at(day(1), 11, 0)
	created := book(t, h.eventTypeID, start)

	first := cancel(t, created.ID)
	second := cancel(t, created.ID)
	free := slotsOf(t, h.eventTypeID, start, start.Add(time.Minute))

	if first.Status != "cancelled" || first.ID != created.ID {
		t.Errorf("cancel gave %+v, want the booking with status cancelled", first)
	}
	if !sameBooking(second, first) {
		t.Errorf("a repeated cancel gave %+v, want the first answer %+v", second, first)
	}
	if len(free) != 1 || !free[0].Start.Equal(start) {
		t.Errorf("after the cancel the slot is not offered again: %v", free)
	}
	send(t, "POST", "/bookings/no-such-booking/cancel", nil).expectProblem(t, http.StatusNotFound, "not_found")
}

func TestIdempotencyKeyReplaysAndRefusesAnotherBody(t *testing.T) {
	h := newHost(t)
	start := at(day(2), 12, 0)
	key := "Idempotency-Key"

	first := book(t, h.eventTypeID, start, key, "replay-key-0001")
	replayed := book(t, h.eventTypeID, start, key, "replay-key-0001")
	mismatch := send(t, "POST", "/bookings", bookingBody(h.eventTypeID, at(day(2), 13, 0)), key, "replay-key-0001")
	badKey := send(t, "POST", "/bookings", bookingBody(h.eventTypeID, at(day(2), 14, 0)), key, "short")

	if replayed.ID != first.ID {
		t.Errorf("the same key and body created booking %s, want the replay of %s", replayed.ID, first.ID)
	}
	mismatch.expectProblem(t, http.StatusUnprocessableEntity, "idempotency_mismatch")
	badKey.expectProblem(t, http.StatusBadRequest, "validation_failed")
	cancel(t, first.ID)
}

func TestConcurrentBookingsOfOneSlotCreateOne(t *testing.T) {
	h := newHost(t)
	for round := 0; round < 2; round++ {
		start := at(day(3+round), 9, 0)
		const parallel = 6
		statuses := make([]int, parallel)
		codes := make([]string, parallel)
		var wg sync.WaitGroup
		release := make(chan struct{})
		for i := range parallel {
			wg.Add(1)
			go func() {
				defer wg.Done()
				<-release
				answer, err := try("POST", "/bookings", bookingBody(h.eventTypeID, start))
				if err != nil {
					codes[i] = err.Error()
					return
				}
				statuses[i] = answer.status
				codes[i] = string(answer.body)
			}()
		}
		close(release)
		wg.Wait()

		var listed list[booking]
		send(t, "GET", "/bookings?from="+queryTime(start)+"&to="+queryTime(start.Add(time.Hour)), nil).decode(t, http.StatusOK, &listed)

		created, taken := 0, 0
		for i, status := range statuses {
			switch {
			case status == http.StatusCreated:
				created++
			case status == http.StatusConflict && strings.Contains(codes[i], "slot_taken"):
				taken++
			}
		}
		if created != 1 || taken != parallel-1 {
			t.Errorf("round %d: %d of %d parallel bookings got 201 and %d got 409 slot_taken, want exactly one 201: %v",
				round+1, created, parallel, taken, statuses)
		}
		confirmed := 0
		for _, b := range listed.Items {
			if b.Status == "confirmed" {
				confirmed++
				cancel(t, b.ID)
			}
		}
		if confirmed != 1 {
			t.Errorf("round %d: GET /bookings shows %d confirmed bookings of the slot, want 1", round+1, confirmed)
		}
	}
}
