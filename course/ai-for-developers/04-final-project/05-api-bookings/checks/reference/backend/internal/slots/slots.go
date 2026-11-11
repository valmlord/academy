// Package slots computes the free slots of one event type: the engine behind bin/slots.
//
// The types mirror the request of the case format in docs/spec.md and task.md: a schedule with weekly
// rules and date overrides in one IANA time zone, an event type, the bookings that may block time, the
// moment "now" and the range [From, To).
package slots

import (
	"fmt"
	"sort"
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

// Available returns the free slots of the request whose start lies in [From, To), sorted by start, one
// per start. Days are local calendar dates in the schedule's zone; local times resolve to instants by
// resolveLocal; every comparison is between instants.
func Available(req Request) ([]Slot, error) {
	loc, err := time.LoadLocation(req.Schedule.TimeZone)
	if err != nil {
		return nil, fmt.Errorf("schedule.timeZone %q: %w", req.Schedule.TimeZone, err)
	}
	weekly, overrides, err := parseSchedule(req.Schedule)
	if err != nil {
		return nil, err
	}
	et := req.EventType
	duration := minutes(et.DurationMinutes)
	increment := minutes(et.SlotIncrementMinutes)
	if duration <= 0 || increment <= 0 {
		return nil, fmt.Errorf("eventType: duration %d and increment %d must be positive", et.DurationMinutes, et.SlotIncrementMinutes)
	}
	earliest := req.Now.Add(minutes(et.MinimumNoticeMinutes))
	latestExclusive := req.Now.Add(time.Duration(et.BookingWindowDays) * 24 * time.Hour)
	blocking := confirmed(req.Bookings)

	found := map[int64]Slot{}
	// One local date before and after the range: a window of a neighbouring date can start inside it.
	last := civilDateOf(req.To.In(loc)).next()
	for day := civilDateOf(req.From.In(loc)).previous(); !day.after(last); day = day.next() {
		windows, isOverridden := overrides[day]
		if !isOverridden {
			windows = weekly[day.isoWeekday()]
		}
		for _, window := range windows {
			windowStart := resolveLocal(day, window.startMinute, loc)
			windowEnd := resolveLocal(day, window.endMinute, loc)
			for start := windowStart; !start.Add(duration).After(windowEnd); start = start.Add(increment) {
				if start.Before(req.From) || !start.Before(req.To) {
					continue
				}
				if start.Before(earliest) || !start.Before(latestExclusive) {
					continue
				}
				end := start.Add(duration)
				if conflictsWithAny(start, end, et, blocking) {
					continue
				}
				found[start.UnixNano()] = Slot{Start: start.UTC(), End: end.UTC()}
			}
		}
	}
	result := make([]Slot, 0, len(found))
	for _, slot := range found {
		result = append(result, slot)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Start.Before(result[j].Start) })
	return result, nil
}

func minutes(n int) time.Duration { return time.Duration(n) * time.Minute }

func confirmed(bookings []Booking) []Booking {
	var result []Booking
	for _, booking := range bookings {
		if booking.Status == "confirmed" {
			result = append(result, booking)
		}
	}
	return result
}

// conflictsWithAny applies both sides of the conflict rule with half-open intervals: the candidate
// meeting against each booking with that booking's buffers, and the candidate with its own buffers
// against each booking's meeting.
func conflictsWithAny(start, end time.Time, et EventType, bookings []Booking) bool {
	bufferedStart := start.Add(-minutes(et.BufferBeforeMinutes))
	bufferedEnd := end.Add(minutes(et.BufferAfterMinutes))
	for _, b := range bookings {
		if overlaps(start, end, b.Start.Add(-minutes(b.BufferBeforeMinutes)), b.End.Add(minutes(b.BufferAfterMinutes))) {
			return true
		}
		if overlaps(bufferedStart, bufferedEnd, b.Start, b.End) {
			return true
		}
	}
	return false
}

func overlaps(aStart, aEnd, bStart, bEnd time.Time) bool {
	return aStart.Before(bEnd) && bStart.Before(aEnd)
}
