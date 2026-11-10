package main

import "fmt"

// behaviour is what one variant changes; the zero value is the correct server.
type behaviour struct {
	// An engine mutant: one decision of 3.1 wrong, everywhere the engine is used (slots and bookings).
	dec Decisions
	// The v1 API mutants of design 4.L7.
	idempotencyIgnored    bool // the key is checked for syntax and otherwise ignored: no replay, mismatch or in-progress
	offsetLessAccepted    bool // a timestamp without an offset is read as local time instead of 400
	extraFieldsAccepted   bool // unknown fields in request bodies are ignored instead of 400
	textPlainErrors       bool // error answers are text/plain instead of application/problem+json
	conflictStatusSwapped bool // 409 and 422 are swapped in every error answer
	racyStore             bool // check, delay and write of a booking are not one atomic section
	// The v2 mutants of design 4.L8 (GET /bookings/{bookingId}).
	unknownBookingFound     bool // an unknown id answers 200
	cancelledShownConfirmed bool // a cancelled booking is returned with status confirmed
	// The v3 mutants of the hidden change (maxBookingsPerDay).
	limitAcrossEventTypes bool // the limit counts the bookings of every event type of the host
	limitCountsCancelled  bool // cancelled bookings count towards the limit
	limitDayInUTC         bool // the day of the limit is the UTC date, not the local date of the schedule
}

// variants maps the variant ids of the grader's tables (checks/ci_gate.py) to behaviours. The engine ids
// are the mutant ids of checks/data/model.py.
var variants = map[string]behaviour{
	"":                          {},
	"gap":                       {dec: Decisions{GapUsesLaterOffset: true}},
	"overlap":                   {dec: Decisions{OverlapTakesLaterInstant: true}},
	"adjacency":                 {dec: Decisions{AdjacentIntervalsConflict: true}},
	"one-side-buffer":           {dec: Decisions{CandidateBuffersIgnored: true}},
	"notice-from-day-start":     {dec: Decisions{NoticeFromStartOfDay: true}},
	"window-extra-day":          {dec: Decisions{WindowOneDayLonger: true}},
	"override-merged":           {dec: Decisions{OverrideMergedWithWeekly: true}},
	"weekday-utc":               {dec: Decisions{WeekdayOfUTCDate: true}},
	"day-step-24h":              {dec: Decisions{DayStepIs24Hours: true}},
	"last-slot-dropped":         {dec: Decisions{SlotEndingAtWindowEndDropped: true}},
	"cancelled-blocks":          {dec: Decisions{CancelledBookingBlocks: true}},
	"increment-from-hour":       {dec: Decisions{IncrementCountedFromHour: true}},
	"idempotency-ignored":       {idempotencyIgnored: true},
	"offsetless-accepted":       {offsetLessAccepted: true},
	"extra-fields-accepted":     {extraFieldsAccepted: true},
	"text-plain-errors":         {textPlainErrors: true},
	"conflict-status-swapped":   {conflictStatusSwapped: true},
	"racy-store":                {racyStore: true},
	"v2-unknown-id-found":       {unknownBookingFound: true},
	"v2-cancelled-as-confirmed": {cancelledShownConfirmed: true},
	"v3-limit-all-event-types":  {limitAcrossEventTypes: true},
	"v3-limit-counts-cancelled": {limitCountsCancelled: true},
	"v3-limit-day-utc":          {limitDayInUTC: true},
}

func lookupVariant(id string) (behaviour, error) {
	b, ok := variants[id]
	if !ok {
		return behaviour{}, fmt.Errorf("unknown variant %q", id)
	}
	return b, nil
}
