// Command refserver is the grader-owned reference server of module 04 (design #44, section 7.5).
//
// The grader builds it once per check run, execs it from a memfd with the same argv, env and bytes
// for every variant, and hands it the variant config only through the AF_UNIX handshake:
//  1. the process makes itself non-dumpable, then connects to the socket path in argv[1] and sends
//     {"hello":1};
//  2. the grader checks SO_PEERCRED and TracerPid, and only then writes one config line;
//  3. the process binds 127.0.0.1:0, reports {"port":N} and serves until it is killed.
//
// It serves the whole contract (api.go) with the L3 reference engine (engine_*.go):
//   - L6 page-ssr preloads schedules and event types and reads the slots;
//   - the L7/L8 gates start it empty, with one variant (a correct server or one mutant, variants.go) and
//     the cosmetic values the grader drew for that run (cosmetics.go), so that variants differ only in
//     behaviour.
package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"time"
)

// Config is the variant config the grader sends after the handshake.
type Config struct {
	// Now is the fixed current moment (the CALENDAR_NOW of the learner's suite).
	Now time.Time `json:"now"`
	// Schedules and EventTypes are preloaded entities as the contract's response bodies (with ids).
	Schedules  []json.RawMessage `json:"schedules"`
	EventTypes []json.RawMessage `json:"eventTypes"`
	// DelayMs is the CALENDAR_BOOKING_DELAY_MS seam: the pause between a successful check and the write.
	DelayMs int `json:"delayMs"`
	// API is the contract version served: "v1" (default), "v2" (+ GET /bookings/{bookingId}) or "v3"
	// (+ maxBookingsPerDay on event types).
	API string `json:"api"`
	// Variant is "" for the correct server, otherwise one id of variants.go.
	Variant string `json:"variant"`
	// Cosmetics are the K1-K7 values of design 4.L7; absent means the plain defaults.
	Cosmetics *Cosmetics `json:"cosmetics"`
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "refserver:", err)
		os.Exit(1)
	}
}

func run() error {
	if err := makeNonDumpable(); err != nil {
		return fmt.Errorf("prctl: %w", err)
	}
	if len(os.Args) != 2 {
		return errors.New("usage: refserver <handshake socket>")
	}
	control, err := net.Dial("unix", os.Args[1])
	if err != nil {
		return fmt.Errorf("handshake connect: %w", err)
	}
	if _, err := control.Write([]byte("{\"hello\":1}\n")); err != nil {
		return fmt.Errorf("handshake hello: %w", err)
	}
	line, err := bufio.NewReader(control).ReadBytes('\n')
	if err != nil {
		return fmt.Errorf("handshake config: %w", err)
	}
	var config Config
	if err := json.Unmarshal(line, &config); err != nil {
		return fmt.Errorf("config: %w", err)
	}
	api, err := newAPI(config)
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	if _, err := fmt.Fprintf(control, "{\"port\":%d}\n", port); err != nil {
		return fmt.Errorf("handshake port: %w", err)
	}
	return serve(listener, api)
}
