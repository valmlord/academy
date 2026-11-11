package main

import (
	"encoding/json"
	"errors"
	"sort"
	"sync"
	"time"
)

// Response models of the contract.
type scheduleModel struct {
	ID string `json:"id"`
	Schedule
}

type eventTypeModel struct {
	ID string `json:"id"`
	EventType
	// MaxBookingsPerDay exists from contract v3 on; absent means no limit.
	MaxBookingsPerDay *int   `json:"maxBookingsPerDay,omitempty"`
	ScheduleID        string `json:"scheduleId"`
}

type bookingModel struct {
	ID              string    `json:"id"`
	EventTypeID     string    `json:"eventTypeId"`
	Start           time.Time `json:"start"`
	InviteeName     string    `json:"inviteeName"`
	InviteeEmail    string    `json:"inviteeEmail"`
	InviteeTimeZone string    `json:"inviteeTimeZone"`
	End             time.Time `json:"end"`
	Status          string    `json:"status"`
	CreatedAt       time.Time `json:"createdAt"`
}

const (
	statusConfirmed = "confirmed"
	statusCancelled = "cancelled"
)

// storedBooking keeps the buffers of the booking's event type: they block time around it for every
// event type of the host.
type storedBooking struct {
	bookingModel
	bufferBefore, bufferAfter int
}

var errBookingNotFound = errors.New("booking not found")

// store keeps everything in memory behind one mutex; the racy-store variant gives up that mutex across
// the booking delay.
type store struct {
	mu         sync.Mutex
	schedules  map[string]scheduleModel
	eventTypes map[string]eventTypeModel
	order      []string // event type ids in creation order
	bookings   []storedBooking
}

func newStore() *store {
	return &store{schedules: map[string]scheduleModel{}, eventTypes: map[string]eventTypeModel{}}
}

// preload adds the schedules and event types of the config (L6 page-ssr) with their own ids.
func (s *store) preload(schedules, eventTypes []json.RawMessage) error {
	for _, raw := range schedules {
		var schedule scheduleModel
		if err := json.Unmarshal(raw, &schedule); err != nil {
			return err
		}
		if schedule.Weekly == nil {
			schedule.Weekly = []WeeklyRule{}
		}
		if schedule.Overrides == nil {
			schedule.Overrides = []DateOverride{}
		}
		s.schedules[schedule.ID] = schedule
	}
	for _, raw := range eventTypes {
		var et eventTypeModel
		if err := json.Unmarshal(raw, &et); err != nil {
			return err
		}
		s.eventTypes[et.ID] = et
		s.order = append(s.order, et.ID)
	}
	return nil
}

func (s *store) addSchedule(schedule scheduleModel) scheduleModel {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.schedules[schedule.ID] = schedule
	return schedule
}

// addEventType stores the event type if its schedule exists.
func (s *store) addEventType(et eventTypeModel) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.schedules[et.ScheduleID]; !exists {
		return false
	}
	s.eventTypes[et.ID] = et
	s.order = append(s.order, et.ID)
	return true
}

func (s *store) listEventTypes() []eventTypeModel {
	s.mu.Lock()
	defer s.mu.Unlock()
	items := make([]eventTypeModel, 0, len(s.order))
	for _, id := range s.order {
		items = append(items, s.eventTypes[id])
	}
	return items
}

func (s *store) eventTypeWithSchedule(id string) (eventTypeModel, scheduleModel, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	et, exists := s.eventTypes[id]
	if !exists {
		return eventTypeModel{}, scheduleModel{}, false
	}
	return et, s.schedules[et.ScheduleID], true
}

// engineBookingsLocked is every booking in the engine's form; the caller holds s.mu.
func (s *store) engineBookingsLocked() []Booking {
	result := make([]Booking, 0, len(s.bookings))
	for _, b := range s.bookings {
		result = append(result, Booking{Start: b.Start, End: b.End, BufferBeforeMinutes: b.bufferBefore,
			BufferAfterMinutes: b.bufferAfter, Status: b.Status})
	}
	return result
}

func (s *store) engineBookings() []Booking {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.engineBookingsLocked()
}

// bookingsSnapshot is a copy of every stored booking, for the daily limit.
func (s *store) bookingsSnapshotLocked() []storedBooking {
	return append([]storedBooking(nil), s.bookings...)
}

func (s *store) cancel(id string) (bookingModel, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.bookings {
		if s.bookings[i].ID == id {
			s.bookings[i].Status = statusCancelled
			return s.bookings[i].bookingModel, nil
		}
	}
	return bookingModel{}, errBookingNotFound
}

// find returns the booking with the id, and the most recently created booking when there is none.
func (s *store) find(id string) (bookingModel, bool, *bookingModel) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, b := range s.bookings {
		if b.ID == id {
			return b.bookingModel, true, nil
		}
	}
	if len(s.bookings) == 0 {
		return bookingModel{}, false, nil
	}
	latest := s.bookings[len(s.bookings)-1].bookingModel
	return bookingModel{}, false, &latest
}

// bookingsStartingIn is every booking, confirmed or cancelled, whose start lies in [from, to), by start.
func (s *store) bookingsStartingIn(from, to time.Time) []bookingModel {
	s.mu.Lock()
	defer s.mu.Unlock()
	items := []bookingModel{}
	for _, b := range s.bookings {
		if !b.Start.Before(from) && b.Start.Before(to) {
			items = append(items, b.bookingModel)
		}
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].Start.Before(items[j].Start) })
	return items
}
