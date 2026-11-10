// The refserver's slot engine: the L3 reference engine (backend/internal/slots/slots.go of R3) plus one
// switch per decision of design 3.1, mirroring `Decisions` in checks/data/model.py. All switches off is the
// customer's model; the L7/L8 gates turn exactly one on for an engine mutant. S6 diffs every setting
// against model.py.
package main

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
func Available(req Request) ([]Slot, error) { return AvailableWith(req, Decisions{}) }

// AvailableWith is Available under the given decisions (one flag on = one engine mutant).
func AvailableWith(req Request, dec Decisions) ([]Slot, error) {
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
	noticeBase := req.Now
	if dec.NoticeFromStartOfDay {
		noticeBase = resolveLocal(civilDateOf(req.Now.In(loc)), 0, loc, Decisions{})
	}
	earliest := noticeBase.Add(minutes(et.MinimumNoticeMinutes))
	windowDays := et.BookingWindowDays
	if dec.WindowOneDayLonger {
		windowDays++
	}
	latestExclusive := req.Now.Add(time.Duration(windowDays) * 24 * time.Hour)
	blocking := req.Bookings
	if !dec.CancelledBookingBlocks {
		blocking = confirmed(req.Bookings)
	}

	found := map[int64]Slot{}
	// One local date before and after the range: a window of a neighbouring date can start inside it.
	anchor := civilDateOf(req.From.In(loc))
	last := civilDateOf(req.To.In(loc)).next()
	for day := anchor.previous(); !day.after(last); day = day.next() {
		for _, window := range dayWindows(weekly, overrides, day, loc, dec) {
			windowStart := resolveLocal(day, window.startMinute, loc, dec)
			windowEnd := resolveLocal(day, window.endMinute, loc, dec)
			if dec.DayStepIs24Hours {
				shift := time.Duration(day.daysSince(anchor)) * 24 * time.Hour
				windowStart = resolveLocal(anchor, window.startMinute, loc, dec).Add(shift)
				windowEnd = resolveLocal(anchor, window.endMinute, loc, dec).Add(shift)
			}
			first := windowStart
			if dec.IncrementCountedFromHour {
				first = windowStart.Add(-minutes(window.startMinute % 60))
				for first.Before(windowStart) {
					first = first.Add(increment)
				}
			}
			for start := first; fits(start.Add(duration), windowEnd, dec); start = start.Add(increment) {
				if start.Before(req.From) || !start.Before(req.To) {
					continue
				}
				if start.Before(earliest) || !start.Before(latestExclusive) {
					continue
				}
				end := start.Add(duration)
				if conflictsWithAny(start, end, et, blocking, dec) {
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

// fits is "the slot ends at or before the window end" (REQ-05); the last-slot mutant drops the slot that
// ends exactly at it.
func fits(end, windowEnd time.Time, dec Decisions) bool {
	if dec.SlotEndingAtWindowEndDropped {
		return end.Before(windowEnd)
	}
	return !end.After(windowEnd)
}

// dayWindows picks the windows of one local date: its override if it has one, otherwise the weekly
// rules of its ISO weekday.
func dayWindows(weekly map[int][]window, overrides map[civilDate][]window, day civilDate, loc *time.Location, dec Decisions) []window {
	weekday := day.isoWeekday()
	if dec.WeekdayOfUTCDate {
		weekday = isoWeekdayOf(resolveLocal(day, 0, loc, dec).UTC())
	}
	windows := weekly[weekday]
	override, isOverridden := overrides[day]
	if !isOverridden {
		return windows
	}
	if dec.OverrideMergedWithWeekly {
		return append(append([]window{}, windows...), override...)
	}
	return override
}

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
func conflictsWithAny(start, end time.Time, et EventType, bookings []Booking, dec Decisions) bool {
	bufferedStart := start.Add(-minutes(et.BufferBeforeMinutes))
	bufferedEnd := end.Add(minutes(et.BufferAfterMinutes))
	for _, b := range bookings {
		if overlaps(start, end, b.Start.Add(-minutes(b.BufferBeforeMinutes)), b.End.Add(minutes(b.BufferAfterMinutes)), dec) {
			return true
		}
		if !dec.CandidateBuffersIgnored && overlaps(bufferedStart, bufferedEnd, b.Start, b.End, dec) {
			return true
		}
	}
	return false
}

// overlaps compares half-open intervals; the adjacency mutant treats touching intervals as overlapping.
func overlaps(aStart, aEnd, bStart, bEnd time.Time, dec Decisions) bool {
	if dec.AdjacentIntervalsConflict {
		return !aStart.After(bEnd) && !bStart.After(aEnd)
	}
	return aStart.Before(bEnd) && bStart.Before(aEnd)
}
