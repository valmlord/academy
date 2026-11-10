package api

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
)

// Schedule, EventType and their parts are the response models of the contract.
type Schedule struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	TimeZone  string         `json:"timeZone"`
	Weekly    []WeeklyRule   `json:"weekly"`
	Overrides []DateOverride `json:"overrides"`
}

type WeeklyRule struct {
	Weekday int    `json:"weekday"`
	Start   string `json:"start"`
	End     string `json:"end"`
}

type DateOverride struct {
	Date      string         `json:"date"`
	Intervals []TimeInterval `json:"intervals"`
}

type TimeInterval struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

type EventType struct {
	ID                   string `json:"id"`
	Title                string `json:"title"`
	DurationMinutes      int    `json:"durationMinutes"`
	SlotIncrementMinutes int    `json:"slotIncrementMinutes"`
	BufferBeforeMinutes  int    `json:"bufferBeforeMinutes"`
	BufferAfterMinutes   int    `json:"bufferAfterMinutes"`
	MinimumNoticeMinutes int    `json:"minimumNoticeMinutes"`
	BookingWindowDays    int    `json:"bookingWindowDays"`
	// MaxBookingsPerDay limits the confirmed bookings of this event type per local date of its schedule.
	MaxBookingsPerDay *int   `json:"maxBookingsPerDay,omitempty"`
	ScheduleID        string `json:"scheduleId"`
}

// Store keeps schedules, event types and bookings in memory behind one mutex (ADR 0001).
type Store struct {
	mu         sync.Mutex
	schedules  map[string]Schedule
	eventTypes map[string]EventType
	order      []string        // event type ids in creation order, for GET /event-types
	bookings   []storedBooking // in creation order
}

func NewStore() *Store {
	return &Store{schedules: map[string]Schedule{}, eventTypes: map[string]EventType{}}
}

// newID is an opaque id matching [A-Za-z0-9_-]{1,64}: a prefix and 16 random hex digits.
func newID(prefix string) string {
	var raw [8]byte
	_, _ = rand.Read(raw[:])
	return prefix + "_" + hex.EncodeToString(raw[:])
}

func (s *Store) AddSchedule(schedule Schedule) Schedule {
	s.mu.Lock()
	defer s.mu.Unlock()
	schedule.ID = newID("sch")
	s.schedules[schedule.ID] = schedule
	return schedule
}

// AddEventType stores the event type if its schedule exists; ok is false otherwise.
func (s *Store) AddEventType(et EventType) (EventType, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.schedules[et.ScheduleID]; !exists {
		return EventType{}, false
	}
	et.ID = newID("evt")
	s.eventTypes[et.ID] = et
	s.order = append(s.order, et.ID)
	return et, true
}

func (s *Store) EventTypes() []EventType {
	s.mu.Lock()
	defer s.mu.Unlock()
	items := make([]EventType, 0, len(s.order))
	for _, id := range s.order {
		items = append(items, s.eventTypes[id])
	}
	return items
}

// EventTypeWithSchedule returns the event type and the schedule it references.
func (s *Store) EventTypeWithSchedule(id string) (EventType, Schedule, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	et, exists := s.eventTypes[id]
	if !exists {
		return EventType{}, Schedule{}, false
	}
	return et, s.schedules[et.ScheduleID], true
}
