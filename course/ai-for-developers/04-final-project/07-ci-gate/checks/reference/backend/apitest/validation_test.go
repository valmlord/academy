package apitest

import (
	"net/http"
	"strings"
	"testing"
)

func TestTimestampWithoutOffsetIs400(t *testing.T) {
	h := newHost(t)
	body := bookingBody(h.eventTypeID, at(day(10), 10, 0))
	body["start"] = at(day(10), 10, 0).Format("2006-01-02T15:04:05")

	answer := send(t, "POST", "/bookings", body)
	slotsAnswer := send(t, "GET", "/event-types/"+h.eventTypeID+"/slots?from=2026-11-12T00:00:00&to=2026-11-13T00:00:00", nil)

	answer.expectProblem(t, http.StatusBadRequest, "validation_failed")
	slotsAnswer.expectProblem(t, http.StatusBadRequest, "validation_failed")
}

func TestUnknownFieldsAre400(t *testing.T) {
	h := newHost(t)
	scheduleBody := map[string]any{"name": "Host", "timeZone": "UTC", "weekly": everyDay("09:00", "17:00"),
		"overrides": []any{}, "color": "red"}
	booking := bookingBody(h.eventTypeID, at(day(11), 10, 0))
	booking["note"] = "extra"

	schedule := send(t, "POST", "/schedules", scheduleBody)
	created := send(t, "POST", "/bookings", booking)

	schedule.expectProblem(t, http.StatusBadRequest, "validation_failed")
	created.expectProblem(t, http.StatusBadRequest, "validation_failed")
}

func TestUnknownEventTypeIs404Problem(t *testing.T) {
	send(t, "GET", "/event-types/no-such-event-type", nil).expectProblem(t, http.StatusNotFound, "not_found")
	send(t, "POST", "/event-types", map[string]any{"title": "Orphan", "durationMinutes": 30, "slotIncrementMinutes": 30,
		"bufferBeforeMinutes": 0, "bufferAfterMinutes": 0, "minimumNoticeMinutes": 0, "bookingWindowDays": 30,
		"scheduleId": "no-such-schedule"}).expectProblem(t, http.StatusUnprocessableEntity, "unknown_reference")
}

func TestWrongMethodIs405WithAllow(t *testing.T) {
	answer := send(t, "DELETE", "/bookings", nil)

	if answer.status != http.StatusMethodNotAllowed {
		t.Fatalf("DELETE /bookings: status %d, want 405", answer.status)
	}
	allow := map[string]bool{}
	for _, method := range strings.Split(answer.header.Get("Allow"), ",") {
		allow[strings.TrimSpace(method)] = true
	}
	if !allow["GET"] || !allow["POST"] {
		t.Errorf("DELETE /bookings: Allow %q must list GET and POST", answer.header.Get("Allow"))
	}
}
