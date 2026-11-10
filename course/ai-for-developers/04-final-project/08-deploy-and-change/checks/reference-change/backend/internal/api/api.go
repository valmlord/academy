// Package api serves the contract: schedules, event types, their free slots and bookings.
package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"calendar/internal/slots"
)

// maxSlotRange is the longest [from, to) GET .../slots accepts (REQ-13).
const maxSlotRange = 31 * 24 * time.Hour

type Server struct {
	store *Store
	keys  *idempotencyKeys
	now   time.Time
	// bookingDelay is the CALENDAR_BOOKING_DELAY_MS seam: how long a booking waits between its successful
	// check and its write, inside the booking lock.
	bookingDelay time.Duration
}

func NewServer(store *Store, now time.Time, bookingDelay time.Duration) *Server {
	return &Server{store: store, keys: newIdempotencyKeys(), now: now, bookingDelay: bookingDelay}
}

// Handler routes the contract's operations. ServeMux answers unmatched paths with 404 and wrong methods
// with 405 and an Allow header by itself.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /schedules", s.createSchedule)
	mux.HandleFunc("POST /event-types", s.createEventType)
	mux.HandleFunc("GET /event-types", s.listEventTypes)
	mux.HandleFunc("GET /event-types/{eventTypeId}", s.getEventType)
	mux.HandleFunc("GET /event-types/{eventTypeId}/slots", s.listSlots)
	mux.HandleFunc("POST /bookings", s.createBooking)
	mux.HandleFunc("GET /bookings", s.listBookings)
	mux.HandleFunc("GET /bookings/{bookingId}", s.getBooking)
	mux.HandleFunc("POST /bookings/{bookingId}/cancel", s.cancelBooking)
	return mux
}

func (s *Server) createSchedule(w http.ResponseWriter, r *http.Request) {
	var body scheduleBody
	if err := decodeStrict(r, &body); err != nil {
		writeProblem(w, http.StatusBadRequest, codeValidationFailed, err.Error())
		return
	}
	schedule, err := body.validate()
	if err != nil {
		writeProblem(w, http.StatusBadRequest, codeValidationFailed, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, s.store.AddSchedule(schedule))
}

func (s *Server) createEventType(w http.ResponseWriter, r *http.Request) {
	var body eventTypeBody
	if err := decodeStrict(r, &body); err != nil {
		writeProblem(w, http.StatusBadRequest, codeValidationFailed, err.Error())
		return
	}
	et, err := body.validate()
	if err != nil {
		writeProblem(w, http.StatusBadRequest, codeValidationFailed, err.Error())
		return
	}
	created, ok := s.store.AddEventType(et)
	if !ok {
		writeProblem(w, http.StatusUnprocessableEntity, codeUnknownReference, fmt.Sprintf("schedule %q does not exist", et.ScheduleID))
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) listEventTypes(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string][]EventType{"items": s.store.EventTypes()})
}

func (s *Server) getEventType(w http.ResponseWriter, r *http.Request) {
	et, _, ok := s.store.EventTypeWithSchedule(r.PathValue("eventTypeId"))
	if !ok {
		writeProblem(w, http.StatusNotFound, codeNotFound, "event type not found")
		return
	}
	writeJSON(w, http.StatusOK, et)
}

func (s *Server) listSlots(w http.ResponseWriter, r *http.Request) {
	from, to, err := slotRange(r)
	if err != nil {
		writeProblem(w, http.StatusBadRequest, codeValidationFailed, err.Error())
		return
	}
	et, schedule, ok := s.store.EventTypeWithSchedule(r.PathValue("eventTypeId"))
	if !ok {
		writeProblem(w, http.StatusNotFound, codeNotFound, "event type not found")
		return
	}
	request := engineRequest(s.now, schedule, et, from, to)
	request.Bookings = s.store.EngineBookings()
	items, err := slots.Available(request)
	if err != nil {
		// Unreachable for a stored schedule: it was validated when it was created.
		writeProblem(w, http.StatusInternalServerError, codeValidationFailed, err.Error())
		return
	}
	items = s.store.WithinDailyLimit(et, items)
	if items == nil {
		items = []slots.Slot{}
	}
	writeJSON(w, http.StatusOK, map[string][]slots.Slot{"items": items})
}

// slotRange reads from and to: RFC 3339 with an offset, to after from, at most 31 days apart.
func slotRange(r *http.Request) (time.Time, time.Time, error) {
	query := r.URL.Query()
	var bounds [2]time.Time
	for i, name := range []string{"from", "to"} {
		text := query.Get(name)
		if text == "" {
			return time.Time{}, time.Time{}, fmt.Errorf("%s is required", name)
		}
		parsed, err := time.Parse(time.RFC3339, text)
		if err != nil {
			return time.Time{}, time.Time{}, fmt.Errorf("%s %q is not an RFC 3339 date-time with an offset", name, text)
		}
		bounds[i] = parsed
	}
	from, to := bounds[0], bounds[1]
	if !to.After(from) {
		return time.Time{}, time.Time{}, errors.New("to must be after from")
	}
	if to.Sub(from) > maxSlotRange {
		return time.Time{}, time.Time{}, errors.New("the range from..to is longer than 31 days")
	}
	return from, to, nil
}

func engineRequest(now time.Time, schedule Schedule, et EventType, from, to time.Time) slots.Request {
	request := slots.Request{
		Now:      now,
		Schedule: slots.Schedule{Name: schedule.Name, TimeZone: schedule.TimeZone},
		EventType: slots.EventType{
			Title: et.Title, DurationMinutes: et.DurationMinutes, SlotIncrementMinutes: et.SlotIncrementMinutes,
			BufferBeforeMinutes: et.BufferBeforeMinutes, BufferAfterMinutes: et.BufferAfterMinutes,
			MinimumNoticeMinutes: et.MinimumNoticeMinutes, BookingWindowDays: et.BookingWindowDays,
		},
		From: from,
		To:   to,
	}
	for _, rule := range schedule.Weekly {
		request.Schedule.Weekly = append(request.Schedule.Weekly, slots.WeeklyRule(rule))
	}
	for _, override := range schedule.Overrides {
		intervals := make([]slots.TimeInterval, 0, len(override.Intervals))
		for _, interval := range override.Intervals {
			intervals = append(intervals, slots.TimeInterval(interval))
		}
		request.Schedule.Overrides = append(request.Schedule.Overrides, slots.DateOverride{Date: override.Date, Intervals: intervals})
	}
	return request
}

// createBooking checks in the order of task.md: 400, unknown_reference, the Idempotency-Key (replay,
// mismatch, in progress), slot_unavailable, daily_limit_reached, slot_taken.
func (s *Server) createBooking(w http.ResponseWriter, r *http.Request) {
	key, hasKey := r.Header.Get("Idempotency-Key"), len(r.Header.Values("Idempotency-Key")) > 0
	if hasKey && !idempotencyKeyPattern.MatchString(key) {
		writeProblem(w, http.StatusBadRequest, codeValidationFailed, "Idempotency-Key: must match ^[A-Za-z0-9_-]{8,64}$")
		return
	}
	var body bookingBody
	if err := decodeStrict(r, &body); err != nil {
		writeProblem(w, http.StatusBadRequest, codeValidationFailed, err.Error())
		return
	}
	request, err := body.validate()
	if err != nil {
		writeProblem(w, http.StatusBadRequest, codeValidationFailed, err.Error())
		return
	}
	et, schedule, ok := s.store.EventTypeWithSchedule(request.EventTypeID)
	if !ok {
		writeProblem(w, http.StatusUnprocessableEntity, codeUnknownReference, fmt.Sprintf("event type %q does not exist", request.EventTypeID))
		return
	}
	if !hasKey {
		writeStored(w, s.book(request, et, schedule))
		return
	}
	state, stored := s.keys.begin(key, request.fingerprint())
	switch state {
	case keyReplay:
		writeStored(w, *stored)
	case keyMismatch:
		writeProblem(w, http.StatusUnprocessableEntity, codeIdempotencyMismatch, "this Idempotency-Key was used with another request body")
	case keyInProgress:
		writeProblem(w, http.StatusConflict, codeIdempotencyInProgress, "the first request with this Idempotency-Key is still running")
	default:
		answer := s.book(request, et, schedule)
		s.keys.finish(key, answer)
		writeStored(w, answer)
	}
}

// book answers 422 slot_unavailable when the start is not a slot of the event type even with no bookings,
// 409 slot_taken when a confirmed booking of the host blocks it, and 201 with the booking otherwise.
func (s *Server) book(request bookingRequest, et EventType, schedule Schedule) storedAnswer {
	duration := time.Duration(et.DurationMinutes) * time.Minute
	probe := engineRequest(s.now, schedule, et, request.Start, request.Start.Add(time.Minute))
	offered, err := slots.Available(probe)
	if err != nil {
		return storedAnswer{http.StatusInternalServerError, problemBytes(http.StatusInternalServerError, codeValidationFailed, err.Error())}
	}
	if len(offered) != 1 || !offered[0].Start.Equal(request.Start) {
		detail := "the start is off the grid, outside availability, too soon or beyond the booking window"
		return storedAnswer{http.StatusUnprocessableEntity, problemBytes(http.StatusUnprocessableEntity, codeSlotUnavailable, detail)}
	}
	booking := Booking{EventTypeID: et.ID, Start: request.Start.UTC(), End: request.Start.Add(duration).UTC(),
		InviteeName: request.InviteeName, InviteeEmail: request.InviteeEmail, InviteeTimeZone: request.InviteeTimeZone}
	created, err := s.store.Book(probe, et, booking, s.bookingDelay)
	if errors.Is(err, errDailyLimitReached) {
		return storedAnswer{http.StatusConflict, problemBytes(http.StatusConflict, codeDailyLimitReached, err.Error())}
	}
	if errors.Is(err, errSlotTaken) {
		return storedAnswer{http.StatusConflict, problemBytes(http.StatusConflict, codeSlotTaken, err.Error())}
	}
	if err != nil {
		return storedAnswer{http.StatusInternalServerError, problemBytes(http.StatusInternalServerError, codeValidationFailed, err.Error())}
	}
	data, _ := json.Marshal(created)
	return storedAnswer{http.StatusCreated, data}
}

func (s *Server) listBookings(w http.ResponseWriter, r *http.Request) {
	from, to, err := slotRange(r)
	if err != nil {
		writeProblem(w, http.StatusBadRequest, codeValidationFailed, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string][]Booking{"items": s.store.BookingsStartingIn(from, to)})
}

func (s *Server) getBooking(w http.ResponseWriter, r *http.Request) {
	booking, err := s.store.BookingByID(r.PathValue("bookingId"))
	if err != nil {
		writeProblem(w, http.StatusNotFound, codeNotFound, "booking not found")
		return
	}
	writeJSON(w, http.StatusOK, booking)
}

func (s *Server) cancelBooking(w http.ResponseWriter, r *http.Request) {
	booking, err := s.store.Cancel(r.PathValue("bookingId"))
	if err != nil {
		writeProblem(w, http.StatusNotFound, codeNotFound, "booking not found")
		return
	}
	writeJSON(w, http.StatusOK, booking)
}
