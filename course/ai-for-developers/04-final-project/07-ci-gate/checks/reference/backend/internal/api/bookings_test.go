package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func postJSON(t *testing.T, handler http.Handler, path string, body any, headers ...string) *httptest.ResponseRecorder {
	t.Helper()
	data, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(data))
	for i := 0; i+1 < len(headers); i += 2 {
		request.Header.Set(headers[i], headers[i+1])
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

// newBookableServer has one schedule open 09:00-17:00 UTC every day and a 30-minute event type.
func newBookableServer(t *testing.T, delay time.Duration) (http.Handler, string) {
	t.Helper()
	now := time.Date(2026, 3, 1, 8, 0, 0, 0, time.UTC)
	handler := NewServer(NewStore(), now, delay).Handler()
	var weekly []map[string]any
	for day := 1; day <= 7; day++ {
		weekly = append(weekly, map[string]any{"weekday": day, "start": "09:00", "end": "17:00"})
	}
	created := postJSON(t, handler, "/schedules", map[string]any{"name": "Host", "timeZone": "UTC", "weekly": weekly, "overrides": []any{}})
	var schedule Schedule
	_ = json.Unmarshal(created.Body.Bytes(), &schedule)
	created = postJSON(t, handler, "/event-types", map[string]any{"title": "Intro", "durationMinutes": 30, "slotIncrementMinutes": 30,
		"bufferBeforeMinutes": 0, "bufferAfterMinutes": 0, "minimumNoticeMinutes": 0, "bookingWindowDays": 30, "scheduleId": schedule.ID})
	var et EventType
	_ = json.Unmarshal(created.Body.Bytes(), &et)
	return handler, et.ID
}

func bookingFor(eventTypeID string) map[string]any {
	return map[string]any{"eventTypeId": eventTypeID, "start": "2026-03-02T10:00:00Z", "inviteeName": "Анна",
		"inviteeEmail": "anna@example.com", "inviteeTimeZone": "Europe/Berlin"}
}

func TestConcurrentRequestsForOneSlotCreateExactlyOneBooking(t *testing.T) {
	handler, eventTypeID := newBookableServer(t, 20*time.Millisecond)
	statuses := make([]int, 8)
	var wg sync.WaitGroup
	for i := range statuses {
		wg.Add(1)
		go func() {
			defer wg.Done()
			statuses[i] = postJSON(t, handler, "/bookings", bookingFor(eventTypeID)).Code
		}()
	}
	wg.Wait()

	created := 0
	for _, status := range statuses {
		switch status {
		case http.StatusCreated:
			created++
		case http.StatusConflict:
		default:
			t.Fatalf("unexpected status %d", status)
		}
	}
	if created != 1 {
		t.Fatalf("created %d bookings, want 1 (statuses %v)", created, statuses)
	}
}

func TestRetryWithTheSameKeyReplaysTheFirstAnswer(t *testing.T) {
	handler, eventTypeID := newBookableServer(t, 0)

	first := postJSON(t, handler, "/bookings", bookingFor(eventTypeID), "Idempotency-Key", "retry-key-1")
	again := postJSON(t, handler, "/bookings", bookingFor(eventTypeID), "Idempotency-Key", "retry-key-1")

	if first.Code != http.StatusCreated || again.Code != http.StatusCreated || first.Body.String() != again.Body.String() {
		t.Fatalf("first %d %s, retry %d %s", first.Code, first.Body, again.Code, again.Body)
	}
}

func TestCancelledBookingFreesItsSlot(t *testing.T) {
	handler, eventTypeID := newBookableServer(t, 0)
	created := postJSON(t, handler, "/bookings", bookingFor(eventTypeID))
	var booking Booking
	_ = json.Unmarshal(created.Body.Bytes(), &booking)

	cancelled := postJSON(t, handler, "/bookings/"+booking.ID+"/cancel", nil)
	rebooked := postJSON(t, handler, "/bookings", bookingFor(eventTypeID))

	if cancelled.Code != http.StatusOK || rebooked.Code != http.StatusCreated {
		t.Fatalf("cancel %d, rebook %d %s", cancelled.Code, rebooked.Code, rebooked.Body)
	}
}
