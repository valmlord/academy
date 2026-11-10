package main

import (
	"fmt"
	"regexp"
	"strconv"
	"time"
)

// civilDate is a local calendar date with no zone. Dates step by the calendar, never by 24 hours: a
// day with a clock change is 23 or 25 hours long.
type civilDate struct {
	year  int
	month time.Month
	day   int
}

func civilDateOf(t time.Time) civilDate {
	year, month, day := t.Date()
	return civilDate{year, month, day}
}

// asUTC carries the date as midnight UTC, only for calendar arithmetic and the weekday.
func (d civilDate) asUTC() time.Time { return time.Date(d.year, d.month, d.day, 0, 0, 0, 0, time.UTC) }

func (d civilDate) next() civilDate        { return civilDateOf(d.asUTC().AddDate(0, 0, 1)) }
func (d civilDate) previous() civilDate    { return civilDateOf(d.asUTC().AddDate(0, 0, -1)) }
func (d civilDate) after(o civilDate) bool { return d.asUTC().After(o.asUTC()) }

// daysSince is the number of calendar dates from o to d.
func (d civilDate) daysSince(o civilDate) int {
	return int(d.asUTC().Sub(o.asUTC()) / (24 * time.Hour))
}

// isoWeekday is Monday = 1 ... Sunday = 7 of the local date itself.
func (d civilDate) isoWeekday() int { return isoWeekdayOf(d.asUTC()) }

func isoWeekdayOf(t time.Time) int {
	if weekday := int(t.Weekday()); weekday != 0 {
		return weekday
	}
	return 7
}

// resolveLocal maps local date + minutes after midnight (1440 = 24:00, i.e. 00:00 of the next date) to
// an instant: a time that exists once is that instant; a repeated time is the earlier instant; a time
// inside a gap is read with the offset in force before the transition, so it moves forward by the gap
// length. time.Date does not guarantee which instant it picks in these two cases, so the offsets are
// tried explicitly. The gap and overlap mutants take the other instant.
func resolveLocal(d civilDate, minute int, loc *time.Location, dec Decisions) time.Time {
	wall := time.Date(d.year, d.month, d.day, 0, minute, 0, 0, time.UTC)
	// The zones of the course change their offset at most once within a day either side of any time.
	offsetBefore := offsetAt(wall.Add(-24*time.Hour), loc)
	offsetAfter := offsetAt(wall.Add(24*time.Hour), loc)
	var valid []time.Time
	for _, offset := range []time.Duration{offsetBefore, offsetAfter} {
		candidate := wall.Add(-offset)
		if offsetAt(candidate, loc) == offset {
			valid = append(valid, candidate)
		}
	}
	switch {
	case len(valid) == 2 && !valid[0].Equal(valid[1]):
		earlier, later := valid[0], valid[1]
		if later.Before(earlier) {
			earlier, later = later, earlier
		}
		if dec.OverlapTakesLaterInstant {
			return later
		}
		return earlier
	case len(valid) > 0:
		return valid[0]
	case dec.GapUsesLaterOffset:
		return wall.Add(-offsetAfter)
	default:
		return wall.Add(-offsetBefore)
	}
}

func offsetAt(instant time.Time, loc *time.Location) time.Duration {
	_, seconds := instant.In(loc).Zone()
	return time.Duration(seconds) * time.Second
}

type window struct {
	startMinute int
	endMinute   int
}

var localTime = regexp.MustCompile(`^([01][0-9]|2[0-3]):([0-5][0-9])$|^24:00$`)

func parseMinute(text string, isEnd bool) (int, error) {
	if !localTime.MatchString(text) {
		return 0, fmt.Errorf("local time %q is not HH:MM", text)
	}
	if text == "24:00" {
		if !isEnd {
			return 0, fmt.Errorf("24:00 is allowed only as an end")
		}
		return 24 * 60, nil
	}
	hours, _ := strconv.Atoi(text[:2])
	mins, _ := strconv.Atoi(text[3:])
	return hours*60 + mins, nil
}

func parseWindow(start, end string) (window, error) {
	s, err := parseMinute(start, false)
	if err != nil {
		return window{}, err
	}
	e, err := parseMinute(end, true)
	if err != nil {
		return window{}, err
	}
	if s >= e {
		return window{}, fmt.Errorf("window %s-%s: start must be before end", start, end)
	}
	return window{s, e}, nil
}

func parseSchedule(s Schedule) (map[int][]window, map[civilDate][]window, error) {
	weekly := map[int][]window{}
	for _, rule := range s.Weekly {
		w, err := parseWindow(rule.Start, rule.End)
		if err != nil {
			return nil, nil, err
		}
		weekly[rule.Weekday] = append(weekly[rule.Weekday], w)
	}
	overrides := map[civilDate][]window{}
	for _, override := range s.Overrides {
		day, err := time.Parse(time.DateOnly, override.Date)
		if err != nil {
			return nil, nil, fmt.Errorf("override date %q: %w", override.Date, err)
		}
		windows := []window{}
		for _, interval := range override.Intervals {
			w, err := parseWindow(interval.Start, interval.End)
			if err != nil {
				return nil, nil, err
			}
			windows = append(windows, w)
		}
		overrides[civilDateOf(day)] = windows
	}
	return weekly, overrides, nil
}
