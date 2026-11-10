package api

import (
	"fmt"
	"regexp"
	"sort"
	"time"
	"unicode/utf8"
)

// Wire shapes of the request bodies. Pointers tell a missing (or null) field from a zero value.
type intervalBody struct {
	Start *string `json:"start"`
	End   *string `json:"end"`
}

type weeklyRuleBody struct {
	Weekday *int    `json:"weekday"`
	Start   *string `json:"start"`
	End     *string `json:"end"`
}

type overrideBody struct {
	Date      *string         `json:"date"`
	Intervals *[]intervalBody `json:"intervals"`
}

type scheduleBody struct {
	Name      *string           `json:"name"`
	TimeZone  *string           `json:"timeZone"`
	Weekly    *[]weeklyRuleBody `json:"weekly"`
	Overrides *[]overrideBody   `json:"overrides"`
}

type eventTypeBody struct {
	Title                *string `json:"title"`
	DurationMinutes      *int    `json:"durationMinutes"`
	SlotIncrementMinutes *int    `json:"slotIncrementMinutes"`
	BufferBeforeMinutes  *int    `json:"bufferBeforeMinutes"`
	BufferAfterMinutes   *int    `json:"bufferAfterMinutes"`
	MinimumNoticeMinutes *int    `json:"minimumNoticeMinutes"`
	BookingWindowDays    *int    `json:"bookingWindowDays"`
	ScheduleID           *string `json:"scheduleId"`
}

// validationError is a 400 validation_failed with the field it is about.
type validationError struct{ field, reason string }

func (e validationError) Error() string { return e.field + ": " + e.reason }

func invalid(field, format string, args ...any) error {
	return validationError{field, fmt.Sprintf(format, args...)}
}

var localTimePattern = regexp.MustCompile(`^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$`)

// displayText is 1-120 characters; JSON Schema counts code points, not bytes.
func displayText(field string, value *string) (string, error) {
	if value == nil {
		return "", invalid(field, "is required")
	}
	if n := utf8.RuneCountInString(*value); n < 1 || n > 120 {
		return "", invalid(field, "must be 1-120 characters, got %d", n)
	}
	return *value, nil
}

func boundedInt(field string, value *int, low, high int) (int, error) {
	if value == nil {
		return 0, invalid(field, "is required")
	}
	if *value < low || *value > high {
		return 0, invalid(field, "must be %d..%d, got %d", low, high, *value)
	}
	return *value, nil
}

func minuteOf(text string) int {
	if text == "24:00" {
		return 24 * 60
	}
	return int(text[0]-'0')*600 + int(text[1]-'0')*60 + int(text[3]-'0')*10 + int(text[4]-'0')
}

type span struct{ start, end int }

func window(field string, start, end *string) (span, error) {
	if start == nil || end == nil {
		return span{}, invalid(field, "start and end are required")
	}
	for _, text := range []string{*start, *end} {
		if !localTimePattern.MatchString(text) {
			return span{}, invalid(field, "%q is not HH:MM", text)
		}
	}
	if *start == "24:00" {
		return span{}, invalid(field+".start", "24:00 is allowed only as an end")
	}
	s, e := minuteOf(*start), minuteOf(*end)
	if s >= e {
		return span{}, invalid(field, "start %s must be before end %s", *start, *end)
	}
	return span{s, e}, nil
}

func noOverlaps(field string, spans []span) error {
	sort.Slice(spans, func(i, j int) bool { return spans[i].start < spans[j].start })
	for i := 1; i < len(spans); i++ {
		if spans[i].start < spans[i-1].end {
			return invalid(field, "intervals of one day overlap")
		}
	}
	return nil
}

// loadZone accepts IANA names only: time.LoadLocation also maps "" to UTC and "Local" to the process zone.
func loadZone(name string) (*time.Location, error) {
	if name == "" || name == "Local" {
		return nil, fmt.Errorf("not an IANA time zone")
	}
	return time.LoadLocation(name)
}

func (b scheduleBody) validate() (Schedule, error) {
	name, err := displayText("name", b.Name)
	if err != nil {
		return Schedule{}, err
	}
	if b.TimeZone == nil {
		return Schedule{}, invalid("timeZone", "is required")
	}
	if _, err := loadZone(*b.TimeZone); err != nil {
		return Schedule{}, invalid("timeZone", "unknown time zone %q", *b.TimeZone)
	}
	if b.Weekly == nil || b.Overrides == nil {
		return Schedule{}, invalid("weekly, overrides", "are required")
	}
	schedule := Schedule{Name: name, TimeZone: *b.TimeZone, Weekly: []WeeklyRule{}, Overrides: []DateOverride{}}
	byWeekday := map[int][]span{}
	for i, rule := range *b.Weekly {
		field := fmt.Sprintf("weekly[%d]", i)
		weekday, err := boundedInt(field+".weekday", rule.Weekday, 1, 7)
		if err != nil {
			return Schedule{}, err
		}
		s, err := window(field, rule.Start, rule.End)
		if err != nil {
			return Schedule{}, err
		}
		byWeekday[weekday] = append(byWeekday[weekday], s)
		schedule.Weekly = append(schedule.Weekly, WeeklyRule{Weekday: weekday, Start: *rule.Start, End: *rule.End})
	}
	for weekday, spans := range byWeekday {
		if err := noOverlaps(fmt.Sprintf("weekly (weekday %d)", weekday), spans); err != nil {
			return Schedule{}, err
		}
	}
	seen := map[string]bool{}
	for i, override := range *b.Overrides {
		field := fmt.Sprintf("overrides[%d]", i)
		if override.Date == nil || override.Intervals == nil {
			return Schedule{}, invalid(field, "date and intervals are required")
		}
		if _, err := time.Parse(time.DateOnly, *override.Date); err != nil {
			return Schedule{}, invalid(field+".date", "%q is not a date YYYY-MM-DD", *override.Date)
		}
		if seen[*override.Date] {
			return Schedule{}, invalid(field+".date", "%s has another override", *override.Date)
		}
		seen[*override.Date] = true
		var spans []span
		intervals := []TimeInterval{}
		for j, interval := range *override.Intervals {
			s, err := window(fmt.Sprintf("%s.intervals[%d]", field, j), interval.Start, interval.End)
			if err != nil {
				return Schedule{}, err
			}
			spans = append(spans, s)
			intervals = append(intervals, TimeInterval{Start: *interval.Start, End: *interval.End})
		}
		if err := noOverlaps(field+".intervals", spans); err != nil {
			return Schedule{}, err
		}
		schedule.Overrides = append(schedule.Overrides, DateOverride{Date: *override.Date, Intervals: intervals})
	}
	return schedule, nil
}

func (b eventTypeBody) validate() (EventType, error) {
	var et EventType
	var err error
	if et.Title, err = displayText("title", b.Title); err != nil {
		return EventType{}, err
	}
	fields := []struct {
		name      string
		value     *int
		low, high int
		target    *int
	}{
		{"durationMinutes", b.DurationMinutes, 5, 480, &et.DurationMinutes},
		{"slotIncrementMinutes", b.SlotIncrementMinutes, 5, 240, &et.SlotIncrementMinutes},
		{"bufferBeforeMinutes", b.BufferBeforeMinutes, 0, 240, &et.BufferBeforeMinutes},
		{"bufferAfterMinutes", b.BufferAfterMinutes, 0, 240, &et.BufferAfterMinutes},
		{"minimumNoticeMinutes", b.MinimumNoticeMinutes, 0, 43200, &et.MinimumNoticeMinutes},
		{"bookingWindowDays", b.BookingWindowDays, 1, 365, &et.BookingWindowDays},
	}
	for _, f := range fields {
		if *f.target, err = boundedInt(f.name, f.value, f.low, f.high); err != nil {
			return EventType{}, err
		}
	}
	if b.ScheduleID == nil {
		return EventType{}, invalid("scheduleId", "is required")
	}
	et.ScheduleID = *b.ScheduleID
	return et, nil
}
