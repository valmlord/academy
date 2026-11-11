// Command server is the HTTP API of the booking calendar (the contract in contract/).
//
// Environment (task.md): HOST and PORT to listen on, CALENDAR_NOW as the current moment in RFC 3339,
// CALENDAR_DATA_DIR for any files the server keeps (this in-memory store keeps none), and
// CALENDAR_BOOKING_DELAY_MS, the pause a booking takes between its successful check and its write.
package main

import (
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"time"

	"calendar/internal/api"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	host, port := os.Getenv("HOST"), os.Getenv("PORT")
	if port == "" {
		return errors.New("PORT is not set")
	}
	now, err := clock(os.Getenv("CALENDAR_NOW"))
	if err != nil {
		return err
	}
	delay, err := bookingDelay(os.Getenv("CALENDAR_BOOKING_DELAY_MS"))
	if err != nil {
		return err
	}
	server := api.NewServer(api.NewStore(), now, delay)
	address := net.JoinHostPort(host, port)
	log.Printf("listening on %s, now %s", address, now.Format(time.RFC3339))
	return http.ListenAndServe(address, server.Handler())
}

// clock is the fixed moment the checks pass in CALENDAR_NOW; without it the server uses the real time.
func clock(text string) (time.Time, error) {
	if text == "" {
		return time.Now(), nil
	}
	now, err := time.Parse(time.RFC3339, text)
	if err != nil {
		return time.Time{}, fmt.Errorf("CALENDAR_NOW %q: %w", text, err)
	}
	return now, nil
}

// bookingDelay reads CALENDAR_BOOKING_DELAY_MS: whole milliseconds, 0 when unset.
func bookingDelay(text string) (time.Duration, error) {
	if text == "" {
		return 0, nil
	}
	ms, err := strconv.Atoi(text)
	if err != nil || ms < 0 {
		return 0, fmt.Errorf("CALENDAR_BOOKING_DELAY_MS %q: want a whole number of milliseconds", text)
	}
	return time.Duration(ms) * time.Millisecond, nil
}
