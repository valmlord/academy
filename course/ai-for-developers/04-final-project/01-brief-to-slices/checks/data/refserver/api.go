package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Problem codes of the contract (decision 1); daily_limit_reached exists from contract v3 on.
const (
	codeValidationFailed      = "validation_failed"
	codeNotFound              = "not_found"
	codeUnknownReference      = "unknown_reference"
	codeSlotUnavailable       = "slot_unavailable"
	codeIdempotencyMismatch   = "idempotency_mismatch"
	codeSlotTaken             = "slot_taken"
	codeIdempotencyInProgress = "idempotency_in_progress"
	codeDailyLimitReached     = "daily_limit_reached"
)

// maxSlotRange is the longest [from, to) of GET .../slots and GET /bookings.
const maxSlotRange = 31 * 24 * time.Hour

// maxBodyBytes bounds a request body; the largest valid schedule is far below it.
const maxBodyBytes = 1 << 20

type api struct {
	now     time.Time
	delay   time.Duration
	version int
	b       behaviour
	cos     *cosmeticState
	store   *store
	keys    *idempotencyKeys
}

func newAPI(config Config) (*api, error) {
	b, err := lookupVariant(config.Variant)
	if err != nil {
		return nil, err
	}
	version := map[string]int{"": 1, "v1": 1, "v2": 2, "v3": 3}[config.API]
	if version == 0 {
		return nil, fmt.Errorf("unknown api %q", config.API)
	}
	cosmetics := defaultCosmetics()
	if config.Cosmetics != nil {
		cosmetics = *config.Cosmetics
	}
	s := newStore()
	if err := s.preload(config.Schedules, config.EventTypes); err != nil {
		return nil, err
	}
	return &api{now: config.Now, delay: time.Duration(config.DelayMs) * time.Millisecond, version: version, b: b,
		cos: newCosmeticState(cosmetics), store: s, keys: newIdempotencyKeys()}, nil
}

// routes lists the contract's operations of the served version; httpserve.go matches paths and methods.
func (a *api) routes() []route {
	result := []route{
		{"/schedules", map[string]http.HandlerFunc{"POST": a.createSchedule}},
		{"/event-types", map[string]http.HandlerFunc{"GET": a.listEventTypes, "POST": a.createEventType}},
		{"/event-types/{}", map[string]http.HandlerFunc{"GET": a.getEventType}},
		{"/event-types/{}/slots", map[string]http.HandlerFunc{"GET": a.listSlots}},
		{"/bookings", map[string]http.HandlerFunc{"GET": a.listBookings, "POST": a.createBooking}},
		{"/bookings/{}/cancel", map[string]http.HandlerFunc{"POST": a.cancelBooking}},
	}
	if a.version >= 2 {
		result = append(result, route{"/bookings/{}", map[string]http.HandlerFunc{"GET": a.getBooking}})
	}
	return result
}

// ---------------------------------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------------------------------

func (a *api) writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json"+a.cos.MediaParam)
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

type problem struct {
	Type   string `json:"type"`
	Title  string `json:"title"`
	Status int    `json:"status"`
	Code   string `json:"code"`
	Detail string `json:"detail,omitempty"`
}

func (a *api) writeProblem(w http.ResponseWriter, status int, code string) {
	if a.b.conflictStatusSwapped {
		switch status {
		case http.StatusConflict:
			status = http.StatusUnprocessableEntity
		case http.StatusUnprocessableEntity:
			status = http.StatusConflict
		}
	}
	title := a.cos.problemTitle(code)
	if a.b.textPlainErrors {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(status)
		_, _ = fmt.Fprintf(w, "%d %s: %s\n", status, code, title)
		return
	}
	w.Header().Set("Content-Type", "application/problem+json"+a.cos.MediaParam)
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(problem{Type: "about:blank", Title: title, Status: status, Code: code,
		Detail: a.cos.problemDetail(code)})
}

// answer is the outcome of a booking request, kept under its Idempotency-Key for a replay.
type answer struct {
	status  int
	code    string
	booking bookingModel
}

func (a *api) writeAnswer(w http.ResponseWriter, result answer) {
	if result.status == http.StatusCreated {
		a.writeJSON(w, result.status, result.booking)
		return
	}
	a.writeProblem(w, result.status, result.code)
}

// ---------------------------------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------------------------------

// decode reads exactly one JSON value into target and refuses unknown fields, unless the variant
// accepts them.
func (a *api) decode(r *http.Request, target any) error {
	body, err := io.ReadAll(io.LimitReader(r.Body, maxBodyBytes+1))
	if err != nil || len(body) > maxBodyBytes {
		return errors.New("body: unreadable or too large")
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	if !a.b.extraFieldsAccepted {
		decoder.DisallowUnknownFields()
	}
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("body: %w", err)
	}
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		return errors.New("body: more than one JSON value")
	}
	return nil
}

var offsetLessDateTime = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$`)

// parseInstant reads an RFC 3339 date-time with an offset. The offsetless-accepted variant reads a
// date-time without one as wall time in loc.
func (a *api) parseInstant(text string, loc *time.Location) (time.Time, error) {
	if parsed, err := time.Parse(time.RFC3339, text); err == nil {
		return parsed, nil
	}
	if a.b.offsetLessAccepted && offsetLessDateTime.MatchString(text) {
		return time.ParseInLocation("2006-01-02T15:04:05", text, loc)
	}
	return time.Time{}, fmt.Errorf("%q is not an RFC 3339 date-time with an offset", text)
}

// isOffsetLess tells a date-time the offsetless-accepted variant reads later, in the schedule's zone.
func (a *api) isOffsetLess(text string) bool {
	return a.b.offsetLessAccepted && offsetLessDateTime.MatchString(text)
}

func (a *api) rangeOf(r *http.Request, loc *time.Location) (time.Time, time.Time, bool) {
	query := r.URL.Query()
	var bounds [2]time.Time
	for i, name := range []string{"from", "to"} {
		text := query.Get(name)
		if text == "" {
			return time.Time{}, time.Time{}, false
		}
		parsed, err := a.parseInstant(text, loc)
		if err != nil {
			return time.Time{}, time.Time{}, false
		}
		bounds[i] = parsed
	}
	from, to := bounds[0], bounds[1]
	if !to.After(from) || to.Sub(from) > maxSlotRange {
		return time.Time{}, time.Time{}, false
	}
	return from, to, true
}

// ---------------------------------------------------------------------------------------------------
// Schedules and event types
// ---------------------------------------------------------------------------------------------------

func (a *api) createSchedule(w http.ResponseWriter, r *http.Request) {
	var body scheduleBody
	if err := a.decode(r, &body); err != nil {
		a.writeProblem(w, http.StatusBadRequest, codeValidationFailed)
		return
	}
	schedule, err := body.validate()
	if err != nil {
		a.writeProblem(w, http.StatusBadRequest, codeValidationFailed)
		return
	}
	a.writeJSON(w, http.StatusCreated, a.store.addSchedule(scheduleModel{ID: a.cos.newID("schedule"), Schedule: schedule}))
}

func (a *api) createEventType(w http.ResponseWriter, r *http.Request) {
	var body eventTypeBody
	if err := a.decode(r, &body); err != nil {
		a.writeProblem(w, http.StatusBadRequest, codeValidationFailed)
		return
	}
	et, err := body.validate(a.version >= 3 || a.b.extraFieldsAccepted)
	if err != nil {
		a.writeProblem(w, http.StatusBadRequest, codeValidationFailed)
		return
	}
	if a.version < 3 {
		et.MaxBookingsPerDay = nil
	}
	et.ID = a.cos.newID("eventType")
	if !a.store.addEventType(et) {
		a.writeProblem(w, http.StatusUnprocessableEntity, codeUnknownReference)
		return
	}
	a.writeJSON(w, http.StatusCreated, et)
}

func (a *api) listEventTypes(w http.ResponseWriter, _ *http.Request) {
	a.writeJSON(w, http.StatusOK, map[string][]eventTypeModel{"items": a.store.listEventTypes()})
}

func (a *api) getEventType(w http.ResponseWriter, r *http.Request) {
	et, _, ok := a.store.eventTypeWithSchedule(pathParam(r, 0))
	if !ok {
		a.writeProblem(w, http.StatusNotFound, codeNotFound)
		return
	}
	a.writeJSON(w, http.StatusOK, et)
}

func (a *api) listSlots(w http.ResponseWriter, r *http.Request) {
	et, schedule, found := a.store.eventTypeWithSchedule(pathParam(r, 0))
	loc := time.UTC
	if found {
		loc, _ = time.LoadLocation(schedule.TimeZone)
	}
	from, to, ok := a.rangeOf(r, loc)
	if !ok {
		a.writeProblem(w, http.StatusBadRequest, codeValidationFailed)
		return
	}
	if !found {
		a.writeProblem(w, http.StatusNotFound, codeNotFound)
		return
	}
	request := engineRequest(a.now, schedule, et, from, to)
	a.store.mu.Lock()
	request.Bookings = a.store.engineBookingsLocked()
	stored := a.store.bookingsSnapshotLocked()
	a.store.mu.Unlock()
	items, err := AvailableWith(request, a.b.dec)
	if err != nil {
		a.writeProblem(w, http.StatusInternalServerError, codeValidationFailed)
		return
	}
	items = a.withinDailyLimit(items, et, loc, stored)
	if items == nil {
		items = []Slot{}
	}
	a.writeJSON(w, http.StatusOK, map[string][]Slot{"items": items})
}

func engineRequest(now time.Time, schedule scheduleModel, et eventTypeModel, from, to time.Time) Request {
	return Request{Now: now, Schedule: schedule.Schedule, EventType: et.EventType, From: from, To: to}
}

// ---------------------------------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------------------------------

var idempotencyKeyPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)

// createBooking checks in the order of the contract: 400, unknown_reference, the Idempotency-Key
// (replay, mismatch, in progress), slot_unavailable, daily_limit_reached (v3), slot_taken.
func (a *api) createBooking(w http.ResponseWriter, r *http.Request) {
	key, hasKey := r.Header.Get("Idempotency-Key"), len(r.Header.Values("Idempotency-Key")) > 0
	if hasKey && !idempotencyKeyPattern.MatchString(key) {
		a.writeProblem(w, http.StatusBadRequest, codeValidationFailed)
		return
	}
	var body bookingBody
	if err := a.decode(r, &body); err != nil {
		a.writeProblem(w, http.StatusBadRequest, codeValidationFailed)
		return
	}
	request, err := body.validate(a)
	if err != nil {
		a.writeProblem(w, http.StatusBadRequest, codeValidationFailed)
		return
	}
	et, schedule, ok := a.store.eventTypeWithSchedule(request.EventTypeID)
	if !ok {
		a.writeProblem(w, http.StatusUnprocessableEntity, codeUnknownReference)
		return
	}
	loc, _ := time.LoadLocation(schedule.TimeZone)
	if request.startText != "" {
		request.Start, _ = a.parseInstant(request.startText, loc)
	}
	if !hasKey || a.b.idempotencyIgnored {
		a.writeAnswer(w, a.book(request, et, schedule, loc))
		return
	}
	state, stored := a.keys.begin(key, request.fingerprint())
	switch state {
	case keyReplay:
		a.writeAnswer(w, *stored)
	case keyMismatch:
		a.writeProblem(w, http.StatusUnprocessableEntity, codeIdempotencyMismatch)
	case keyInProgress:
		a.writeProblem(w, http.StatusConflict, codeIdempotencyInProgress)
	default:
		result := a.book(request, et, schedule, loc)
		a.keys.finish(key, result)
		a.writeAnswer(w, result)
	}
}

// book answers 422 slot_unavailable when the start is not a slot of the event type even with no
// bookings, 409 daily_limit_reached (v3) when the event type's limit for that date is reached, 409
// slot_taken when a confirmed booking of the host blocks it, and 201 with the booking otherwise. The
// check, the delay and the write are one atomic section, except in the racy-store variant.
func (a *api) book(request bookingRequest, et eventTypeModel, schedule scheduleModel, loc *time.Location) answer {
	duration := minutes(et.DurationMinutes)
	probe := engineRequest(a.now, schedule, et, request.Start, request.Start.Add(time.Minute))
	offered, err := AvailableWith(probe, a.b.dec)
	if err != nil || len(offered) != 1 || !offered[0].Start.Equal(request.Start) {
		return answer{status: http.StatusUnprocessableEntity, code: codeSlotUnavailable}
	}
	booking := bookingModel{EventTypeID: et.ID, Start: request.Start.UTC(), End: request.Start.Add(duration).UTC(),
		InviteeName: request.InviteeName, InviteeEmail: request.InviteeEmail, InviteeTimeZone: request.InviteeTimeZone}

	a.store.mu.Lock()
	probe.Bookings = a.store.engineBookingsLocked()
	stored := a.store.bookingsSnapshotLocked()
	if a.b.racyStore {
		a.store.mu.Unlock()
	}
	if et.MaxBookingsPerDay != nil && a.dailyCount(stored, et, loc, request.Start) >= *et.MaxBookingsPerDay {
		if !a.b.racyStore {
			a.store.mu.Unlock()
		}
		return answer{status: http.StatusConflict, code: codeDailyLimitReached}
	}
	free, _ := AvailableWith(probe, a.b.dec)
	if len(free) != 1 || !free[0].Start.Equal(request.Start) {
		if !a.b.racyStore {
			a.store.mu.Unlock()
		}
		return answer{status: http.StatusConflict, code: codeSlotTaken}
	}
	time.Sleep(a.delay)
	if a.b.racyStore {
		a.store.mu.Lock()
	}
	booking.ID = a.cos.newID("booking")
	booking.Status = statusConfirmed
	booking.CreatedAt = time.Now().UTC().Truncate(time.Second)
	a.store.bookings = append(a.store.bookings, storedBooking{booking, et.BufferBeforeMinutes, et.BufferAfterMinutes})
	a.store.mu.Unlock()
	return answer{status: http.StatusCreated, booking: booking}
}

// limitDate is the date the daily limit counts by: the local date of the schedule, or the UTC date in
// the v3-limit-day-utc variant.
func (a *api) limitDate(instant time.Time, loc *time.Location) civilDate {
	if a.b.limitDayInUTC {
		return civilDateOf(instant.UTC())
	}
	return civilDateOf(instant.In(loc))
}

// dailyCount is the number of bookings that count towards et's limit on the date of start.
func (a *api) dailyCount(stored []storedBooking, et eventTypeModel, loc *time.Location, start time.Time) int {
	day := a.limitDate(start, loc)
	count := 0
	for _, b := range stored {
		if b.Status != statusConfirmed && !a.b.limitCountsCancelled {
			continue
		}
		if b.EventTypeID != et.ID && !a.b.limitAcrossEventTypes {
			continue
		}
		if a.limitDate(b.Start, loc) == day {
			count++
		}
	}
	return count
}

// withinDailyLimit drops the slots on dates where et's limit is reached (v3).
func (a *api) withinDailyLimit(items []Slot, et eventTypeModel, loc *time.Location, stored []storedBooking) []Slot {
	if et.MaxBookingsPerDay == nil {
		return items
	}
	kept := items[:0]
	for _, slot := range items {
		if a.dailyCount(stored, et, loc, slot.Start) < *et.MaxBookingsPerDay {
			kept = append(kept, slot)
		}
	}
	return kept
}

func (a *api) listBookings(w http.ResponseWriter, r *http.Request) {
	from, to, ok := a.rangeOf(r, time.UTC)
	if !ok {
		a.writeProblem(w, http.StatusBadRequest, codeValidationFailed)
		return
	}
	a.writeJSON(w, http.StatusOK, map[string][]bookingModel{"items": a.store.bookingsStartingIn(from, to)})
}

func (a *api) cancelBooking(w http.ResponseWriter, r *http.Request) {
	booking, err := a.store.cancel(pathParam(r, 0))
	if err != nil {
		a.writeProblem(w, http.StatusNotFound, codeNotFound)
		return
	}
	a.writeJSON(w, http.StatusOK, booking)
}

// getBooking is GET /bookings/{bookingId} of contract v2.
func (a *api) getBooking(w http.ResponseWriter, r *http.Request) {
	id := pathParam(r, 0)
	booking, ok, latest := a.store.find(id)
	if !ok && a.b.unknownBookingFound {
		booking = bookingModel{EventTypeID: id, Start: a.now.UTC(), End: a.now.Add(30 * time.Minute).UTC(),
			InviteeName: "Guest", InviteeEmail: "guest@example.com", InviteeTimeZone: "UTC", Status: statusConfirmed,
			CreatedAt: a.now.UTC()}
		if latest != nil {
			booking = *latest
		}
		booking.ID = id
		ok = true
	}
	if !ok {
		a.writeProblem(w, http.StatusNotFound, codeNotFound)
		return
	}
	if a.b.cancelledShownConfirmed {
		booking.Status = statusConfirmed
	}
	a.writeJSON(w, http.StatusOK, booking)
}

// ---------------------------------------------------------------------------------------------------
// Idempotency keys
// ---------------------------------------------------------------------------------------------------

type keyState int

const (
	keyFresh keyState = iota
	keyReplay
	keyMismatch
	keyInProgress
)

type keyEntry struct {
	fingerprint string
	result      *answer // nil while the first request runs
}

// idempotencyKeys has its own mutex: a key lookup never waits for the booking lock.
type idempotencyKeys struct {
	mu      sync.Mutex
	entries map[string]*keyEntry
}

func newIdempotencyKeys() *idempotencyKeys { return &idempotencyKeys{entries: map[string]*keyEntry{}} }

func (k *idempotencyKeys) begin(key, fingerprint string) (keyState, *answer) {
	k.mu.Lock()
	defer k.mu.Unlock()
	entry, exists := k.entries[key]
	if !exists {
		k.entries[key] = &keyEntry{fingerprint: fingerprint}
		return keyFresh, nil
	}
	if entry.fingerprint != fingerprint {
		return keyMismatch, nil
	}
	if entry.result == nil {
		return keyInProgress, nil
	}
	return keyReplay, entry.result
}

func (k *idempotencyKeys) finish(key string, result answer) {
	k.mu.Lock()
	defer k.mu.Unlock()
	k.entries[key].result = &result
}

// fingerprint identifies a booking request for its key: the same fields and the same start instant.
func (r bookingRequest) fingerprint() string {
	return strings.Join([]string{r.EventTypeID, r.Start.UTC().Format(time.RFC3339Nano), r.startText, r.InviteeName,
		r.InviteeEmail, r.InviteeTimeZone}, "\x00")
}
