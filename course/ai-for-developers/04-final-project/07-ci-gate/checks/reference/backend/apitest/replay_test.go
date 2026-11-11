package apitest

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"calendar/internal/slots"
)

// casesGlob is the engine's case files (task.md format), replayed here through HTTP.
const casesGlob = "../../testdata/slots/*.json"

type caseFile struct {
	ID       string        `json:"id"`
	Req      []string      `json:"req"`
	Request  slots.Request `json:"request"`
	Expected []slot        `json:"expected"`
}

// TestReplayEngineCasesOverHTTP creates each case's schedule, event types and bookings through the API,
// compares GET .../slots with the case's expected list, and cancels the case's bookings afterwards. A case
// written for another `now`, or with a booking that is not a free slot at CALENDAR_NOW in listed order,
// stays engine-only (internal/slots runs it) and is skipped here with the reason.
func TestReplayEngineCasesOverHTTP(t *testing.T) {
	paths, err := filepath.Glob(casesGlob)
	if err != nil || len(paths) == 0 {
		t.Fatalf("no case files match %s", casesGlob)
	}
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		var c caseFile
		if err := json.Unmarshal(data, &c); err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		t.Run(c.ID, func(t *testing.T) {
			if reason := notReplayable(c); reason != "" {
				t.Skipf("engine-only case %s (%v): %s", c.ID, c.Req, reason)
			}
			replay(t, c)
		})
	}
}

// bookingEventType is the event type a case booking is created with: the case's own when the duration
// and buffers match, otherwise one with the booking's duration and buffers (task.md, replay
// recommendation).
func bookingEventType(c caseFile, b slots.Booking) slots.EventType {
	et := c.Request.EventType
	et.DurationMinutes = int(b.End.Sub(b.Start) / time.Minute)
	et.BufferBeforeMinutes = b.BufferBeforeMinutes
	et.BufferAfterMinutes = b.BufferAfterMinutes
	return et
}

// notReplayable says why the case cannot be replayed at CALENDAR_NOW, or "" when it can. It asks this
// repository's own engine, never the server under test.
func notReplayable(c caseFile) string {
	if !c.Request.Now.Equal(now) {
		return fmt.Sprintf("its now is %s, the API runs at CALENDAR_NOW %s", c.Request.Now.Format(time.RFC3339), now.Format(time.RFC3339))
	}
	var earlier []slots.Booking
	for i, b := range c.Request.Bookings {
		length := b.End.Sub(b.Start)
		if length%time.Minute != 0 || length < 5*time.Minute || length > 480*time.Minute {
			return fmt.Sprintf("booking %d lasts %s, not 5-480 whole minutes", i+1, length)
		}
		probe := slots.Request{Now: now, Schedule: c.Request.Schedule, EventType: bookingEventType(c, b),
			Bookings: earlier, From: b.Start, To: b.Start.Add(time.Minute)}
		free, err := slots.Available(probe)
		if err != nil || len(free) != 1 || !free[0].Start.Equal(b.Start) || !free[0].End.Equal(b.End) {
			return fmt.Sprintf("booking %d (%s) is not a free slot at CALENDAR_NOW in listed order", i+1, b.Start.Format(time.RFC3339))
		}
		if b.Status == "confirmed" {
			earlier = append(earlier, b)
		}
	}
	return ""
}

func replay(t *testing.T, c caseFile) {
	schedule := c.Request.Schedule
	scheduleID := createSchedule(t, map[string]any{"name": schedule.Name, "timeZone": schedule.TimeZone,
		"weekly": nonNil(schedule.Weekly), "overrides": nonNil(schedule.Overrides)})
	eventTypeIDs := map[slots.EventType]string{}
	eventTypeOf := func(et slots.EventType) string {
		if id, ok := eventTypeIDs[et]; ok {
			return id
		}
		id := createEventType(t, map[string]any{"title": et.Title, "durationMinutes": et.DurationMinutes,
			"slotIncrementMinutes": et.SlotIncrementMinutes, "bufferBeforeMinutes": et.BufferBeforeMinutes,
			"bufferAfterMinutes": et.BufferAfterMinutes, "minimumNoticeMinutes": et.MinimumNoticeMinutes,
			"bookingWindowDays": et.BookingWindowDays, "scheduleId": scheduleID})
		eventTypeIDs[et] = id
		return id
	}
	mainID := eventTypeOf(c.Request.EventType)

	var confirmed []string
	t.Cleanup(func() {
		for _, id := range confirmed {
			send(t, "POST", "/bookings/"+id+"/cancel", nil)
		}
	})
	for _, b := range c.Request.Bookings {
		created := book(t, eventTypeOf(bookingEventType(c, b)), b.Start)
		if !created.Start.Equal(b.Start) || !created.End.Equal(b.End) {
			t.Fatalf("booking %s..%s came back as %s..%s", b.Start, b.End, created.Start, created.End)
		}
		if b.Status == "cancelled" {
			cancel(t, created.ID)
		} else {
			confirmed = append(confirmed, created.ID)
		}
	}

	got := slotsOf(t, mainID, c.Request.From, c.Request.To)

	if !sameSlots(got, c.Expected) {
		t.Errorf("%s (%v): GET slots gave %v, the case expects %v", c.ID, c.Req, got, c.Expected)
	}
}

func nonNil[T any](items []T) []T {
	if items == nil {
		return []T{}
	}
	return items
}
