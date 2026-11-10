package api

import (
	"errors"
	"sort"
	"time"

	"calendar/internal/slots"
)

// Booking is the response model of the contract.
type Booking struct {
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
// event type of the host (REQ-06, REQ-11).
type storedBooking struct {
	Booking
	bufferBefore, bufferAfter int
}

var (
	errSlotTaken       = errors.New("the slot is taken by another booking or its buffers")
	errBookingNotFound = errors.New("booking not found")
)

// engineBookingsLocked is every booking in the form the slot engine reads; the caller holds s.mu.
func (s *Store) engineBookingsLocked() []slots.Booking {
	result := make([]slots.Booking, 0, len(s.bookings))
	for _, b := range s.bookings {
		result = append(result, slots.Booking{Start: b.Start, End: b.End, BufferBeforeMinutes: b.bufferBefore,
			BufferAfterMinutes: b.bufferAfter, Status: b.Status})
	}
	return result
}

// EngineBookings is a snapshot of every booking of the host, for GET .../slots.
func (s *Store) EngineBookings() []slots.Booking {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.engineBookingsLocked()
}

// Book checks that the slot is free of every confirmed booking of the host, waits `delay` (the
// CALENDAR_BOOKING_DELAY_MS seam) and stores the booking, all under one lock: no other booking can be
// checked or written between the check and the write (ADR 0001). A taken slot answers without the delay.
func (s *Store) Book(request slots.Request, et EventType, booking Booking, delay time.Duration) (Booking, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	request.Bookings = s.engineBookingsLocked()
	free, err := slots.Available(request)
	if err != nil {
		return Booking{}, err
	}
	if len(free) != 1 || !free[0].Start.Equal(booking.Start) {
		return Booking{}, errSlotTaken
	}
	time.Sleep(delay)
	booking.ID = newID("bkg")
	booking.Status = statusConfirmed
	booking.CreatedAt = time.Now().UTC().Truncate(time.Second)
	s.bookings = append(s.bookings, storedBooking{booking, et.BufferBeforeMinutes, et.BufferAfterMinutes})
	return booking, nil
}

// Cancel marks the booking cancelled; cancelling it again changes nothing and returns the same booking.
func (s *Store) Cancel(id string) (Booking, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.bookings {
		if s.bookings[i].ID == id {
			s.bookings[i].Status = statusCancelled
			return s.bookings[i].Booking, nil
		}
	}
	return Booking{}, errBookingNotFound
}

// BookingsStartingIn returns every booking, confirmed or cancelled, whose start lies in [from, to), by start.
func (s *Store) BookingsStartingIn(from, to time.Time) []Booking {
	s.mu.Lock()
	defer s.mu.Unlock()
	items := []Booking{}
	for _, b := range s.bookings {
		if !b.Start.Before(from) && b.Start.Before(to) {
			items = append(items, b.Booking)
		}
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].Start.Before(items[j].Start) })
	return items
}
