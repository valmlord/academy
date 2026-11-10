// Package api serves the read side of the contract: schedules, event types and their free slots.
package api

import (
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
	now   time.Time
}

func NewServer(store *Store, now time.Time) *Server {
	return &Server{store: store, now: now}
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
	items, err := slots.Available(engineRequest(s.now, schedule, et, from, to))
	if err != nil {
		// Unreachable for a stored schedule: it was validated when it was created.
		writeProblem(w, http.StatusInternalServerError, codeValidationFailed, err.Error())
		return
	}
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
