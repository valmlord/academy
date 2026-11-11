package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"time"
	"unicode/utf8"
)

// Wire shapes of the request bodies (the R5 reference's rules). Pointers tell a missing (or null)
// field from a zero value.
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
	// MaxBookingsPerDay is a field of contract v3 only; raw, so that null is told from absent.
	MaxBookingsPerDay json.RawMessage `json:"maxBookingsPerDay"`
}

type bookingBody struct {
	EventTypeID     *string `json:"eventTypeId"`
	Start           *string `json:"start"`
	InviteeName     *string `json:"inviteeName"`
	InviteeEmail    *string `json:"inviteeEmail"`
	InviteeTimeZone *string `json:"inviteeTimeZone"`
}

type bookingRequest struct {
	EventTypeID     string
	Start           time.Time
	startText       string // set only when the offsetless-accepted variant reads Start later, in the schedule's zone
	InviteeName     string
	InviteeEmail    string
	InviteeTimeZone string
}

var errInvalid = errors.New("validation failed")

var localTimePattern = regexp.MustCompile(`^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$`)

// emailPattern is the contract's `format: email` read loosely: one @, no spaces, a dot in the domain.
var emailPattern = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

// displayText is 1-120 characters; JSON Schema counts code points, not bytes.
func displayText(value *string) (string, error) {
	if value == nil {
		return "", errInvalid
	}
	if n := utf8.RuneCountInString(*value); n < 1 || n > 120 {
		return "", errInvalid
	}
	return *value, nil
}

func boundedInt(value *int, low, high int) (int, error) {
	if value == nil || *value < low || *value > high {
		return 0, errInvalid
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

func windowSpan(start, end *string) (span, error) {
	if start == nil || end == nil {
		return span{}, errInvalid
	}
	for _, text := range []string{*start, *end} {
		if !localTimePattern.MatchString(text) {
			return span{}, errInvalid
		}
	}
	if *start == "24:00" {
		return span{}, errInvalid
	}
	s, e := minuteOf(*start), minuteOf(*end)
	if s >= e {
		return span{}, errInvalid
	}
	return span{s, e}, nil
}

func noOverlaps(spans []span) error {
	sort.Slice(spans, func(i, j int) bool { return spans[i].start < spans[j].start })
	for i := 1; i < len(spans); i++ {
		if spans[i].start < spans[i-1].end {
			return errInvalid
		}
	}
	return nil
}

// loadZone accepts IANA names only: time.LoadLocation also maps "" to UTC and "Local" to the process zone.
func loadZone(name string) error {
	if name == "" || name == "Local" {
		return errInvalid
	}
	_, err := time.LoadLocation(name)
	return err
}

func (b scheduleBody) validate() (Schedule, error) {
	name, err := displayText(b.Name)
	if err != nil {
		return Schedule{}, err
	}
	if b.TimeZone == nil || loadZone(*b.TimeZone) != nil || b.Weekly == nil || b.Overrides == nil {
		return Schedule{}, errInvalid
	}
	schedule := Schedule{Name: name, TimeZone: *b.TimeZone, Weekly: []WeeklyRule{}, Overrides: []DateOverride{}}
	byWeekday := map[int][]span{}
	for _, rule := range *b.Weekly {
		weekday, err := boundedInt(rule.Weekday, 1, 7)
		if err != nil {
			return Schedule{}, err
		}
		s, err := windowSpan(rule.Start, rule.End)
		if err != nil {
			return Schedule{}, err
		}
		byWeekday[weekday] = append(byWeekday[weekday], s)
		schedule.Weekly = append(schedule.Weekly, WeeklyRule{Weekday: weekday, Start: *rule.Start, End: *rule.End})
	}
	for _, spans := range byWeekday {
		if err := noOverlaps(spans); err != nil {
			return Schedule{}, err
		}
	}
	seen := map[string]bool{}
	for _, override := range *b.Overrides {
		if override.Date == nil || override.Intervals == nil {
			return Schedule{}, errInvalid
		}
		if _, err := time.Parse(time.DateOnly, *override.Date); err != nil || seen[*override.Date] {
			return Schedule{}, errInvalid
		}
		seen[*override.Date] = true
		var spans []span
		intervals := []TimeInterval{}
		for _, interval := range *override.Intervals {
			s, err := windowSpan(interval.Start, interval.End)
			if err != nil {
				return Schedule{}, err
			}
			spans = append(spans, s)
			intervals = append(intervals, TimeInterval{Start: *interval.Start, End: *interval.End})
		}
		if err := noOverlaps(spans); err != nil {
			return Schedule{}, err
		}
		schedule.Overrides = append(schedule.Overrides, DateOverride{Date: *override.Date, Intervals: intervals})
	}
	return schedule, nil
}

// validate reads an event type; maxBookingsPerDay is accepted only when hasLimitField (contract v3, or a
// variant that ignores unknown fields).
func (b eventTypeBody) validate(hasLimitField bool) (eventTypeModel, error) {
	var et eventTypeModel
	var err error
	if et.Title, err = displayText(b.Title); err != nil {
		return eventTypeModel{}, err
	}
	fields := []struct {
		value     *int
		low, high int
		target    *int
	}{
		{b.DurationMinutes, 5, 480, &et.DurationMinutes},
		{b.SlotIncrementMinutes, 5, 240, &et.SlotIncrementMinutes},
		{b.BufferBeforeMinutes, 0, 240, &et.BufferBeforeMinutes},
		{b.BufferAfterMinutes, 0, 240, &et.BufferAfterMinutes},
		{b.MinimumNoticeMinutes, 0, 43200, &et.MinimumNoticeMinutes},
		{b.BookingWindowDays, 1, 365, &et.BookingWindowDays},
	}
	for _, f := range fields {
		if *f.target, err = boundedInt(f.value, f.low, f.high); err != nil {
			return eventTypeModel{}, err
		}
	}
	if b.ScheduleID == nil {
		return eventTypeModel{}, errInvalid
	}
	et.ScheduleID = *b.ScheduleID
	if b.MaxBookingsPerDay == nil {
		return et, nil
	}
	if !hasLimitField {
		return eventTypeModel{}, errInvalid
	}
	var limit int
	if err := json.Unmarshal(b.MaxBookingsPerDay, &limit); err != nil || string(b.MaxBookingsPerDay) == "null" {
		return eventTypeModel{}, errInvalid
	}
	if limit < 1 || limit > 100 {
		return eventTypeModel{}, errInvalid
	}
	et.MaxBookingsPerDay = &limit
	return et, nil
}

func (b bookingBody) validate(a *api) (bookingRequest, error) {
	var request bookingRequest
	if b.EventTypeID == nil || b.Start == nil {
		return request, errInvalid
	}
	request.EventTypeID = *b.EventTypeID
	if a.isOffsetLess(*b.Start) {
		request.startText = *b.Start
	} else {
		start, err := time.Parse(time.RFC3339, *b.Start)
		if err != nil {
			return request, fmt.Errorf("start: %w", errInvalid)
		}
		request.Start = start
	}
	var err error
	if request.InviteeName, err = displayText(b.InviteeName); err != nil {
		return request, err
	}
	if b.InviteeEmail == nil || !emailPattern.MatchString(*b.InviteeEmail) {
		return request, errInvalid
	}
	request.InviteeEmail = *b.InviteeEmail
	if b.InviteeTimeZone == nil || loadZone(*b.InviteeTimeZone) != nil {
		return request, errInvalid
	}
	request.InviteeTimeZone = *b.InviteeTimeZone
	return request, nil
}
