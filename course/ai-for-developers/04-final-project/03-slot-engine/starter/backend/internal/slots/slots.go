// Package slots computes the free slots of one event type: the engine behind bin/slots.
//
// The types mirror the request of the case format in docs/spec.md and task.md: a schedule with weekly
// rules and date overrides in one IANA time zone, an event type, the bookings that may block time, the
// moment "now" and the range [From, To).
package slots

import (
	"errors"
	"time"
)

// Request is one slot question: which slots of EventType on Schedule start in [From, To) at Now.
type Request struct {
	Now       time.Time `json:"now"`
	Schedule  Schedule  `json:"schedule"`
	EventType EventType `json:"eventType"`
	Bookings  []Booking `json:"bookings"`
	From      time.Time `json:"from"`
	To        time.Time `json:"to"`
}

// Schedule is the host's availability in one time zone.
type Schedule struct {
	Name      string         `json:"name"`
	TimeZone  string         `json:"timeZone"`
	Weekly    []WeeklyRule   `json:"weekly"`
	Overrides []DateOverride `json:"overrides"`
}

// WeeklyRule is one window [Start, End) on an ISO weekday (Monday = 1), times as local "HH:MM".
type WeeklyRule struct {
	Weekday int    `json:"weekday"`
	Start   string `json:"start"`
	End     string `json:"end"`
}

// DateOverride replaces the weekly rules of one local date ("YYYY-MM-DD"); no intervals is a day off.
type DateOverride struct {
	Date      string         `json:"date"`
	Intervals []TimeInterval `json:"intervals"`
}

// TimeInterval is a window [Start, End) in local "HH:MM"; "24:00" is allowed only as End.
type TimeInterval struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

// EventType holds the parameters of a kind of meeting that the engine needs.
type EventType struct {
	Title                string `json:"title"`
	DurationMinutes      int    `json:"durationMinutes"`
	SlotIncrementMinutes int    `json:"slotIncrementMinutes"`
	BufferBeforeMinutes  int    `json:"bufferBeforeMinutes"`
	BufferAfterMinutes   int    `json:"bufferAfterMinutes"`
	MinimumNoticeMinutes int    `json:"minimumNoticeMinutes"`
	BookingWindowDays    int    `json:"bookingWindowDays"`
}

// Booking is an existing meeting with the buffers of its own event type.
type Booking struct {
	Start               time.Time `json:"start"`
	End                 time.Time `json:"end"`
	BufferBeforeMinutes int       `json:"bufferBeforeMinutes"`
	BufferAfterMinutes  int       `json:"bufferAfterMinutes"`
	Status              string    `json:"status"`
}

// Slot is a free meeting interval [Start, End).
type Slot struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}

// ErrNotImplemented is what the engine answers until it is written.
var ErrNotImplemented = errors.New("slots.Available is not implemented yet")

// Available returns the free slots of the request, sorted by start.
func Available(req Request) ([]Slot, error) {
	return nil, ErrNotImplemented
}
