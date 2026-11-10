// Package apitest is the API integration suite of `make ci`. It talks HTTP only, so it runs against any
// server that follows the contract:
//   - with CALENDAR_API_URL set (the ci-gate check sets it), against that server;
//   - otherwise against ../../bin/server, which it starts itself with HOST, PORT, CALENDAR_NOW,
//     CALENDAR_BOOKING_DELAY_MS and CALENDAR_DATA_DIR.
//
// CALENDAR_NOW and CALENDAR_BOOKING_DELAY_MS are read from the environment either way: the server under
// test was started with the same values. The tests run one after another and use their own dates, because
// every booking of the host blocks every event type.
package apitest

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

// defaultNow is the CALENDAR_NOW of the ci-gate check and of the replay recommendation for case files.
const defaultNow = "2026-03-01T08:00:00Z"

// defaultDelayMs is used only when the suite starts its own server and no delay is given.
const defaultDelayMs = 200

// readinessTimeout bounds the wait for the suite's own server.
const readinessTimeout = 20 * time.Second

var (
	baseURL string
	now     time.Time
	delay   time.Duration
)

func TestMain(m *testing.M) {
	os.Exit(run(m))
}

func run(m *testing.M) int {
	nowText := envOr("CALENDAR_NOW", defaultNow)
	parsed, err := time.Parse(time.RFC3339, nowText)
	if err != nil {
		fmt.Fprintf(os.Stderr, "CALENDAR_NOW %q: %v\n", nowText, err)
		return 2
	}
	now = parsed
	delayMs, err := strconv.Atoi(envOr("CALENDAR_BOOKING_DELAY_MS", strconv.Itoa(defaultDelayMs)))
	if err != nil {
		fmt.Fprintf(os.Stderr, "CALENDAR_BOOKING_DELAY_MS: %v\n", err)
		return 2
	}
	delay = time.Duration(delayMs) * time.Millisecond

	baseURL = os.Getenv("CALENDAR_API_URL")
	if baseURL == "" {
		stop, err := startOwnServer(nowText, delayMs)
		if err != nil {
			fmt.Fprintln(os.Stderr, "own server:", err)
			return 2
		}
		defer stop()
	}
	return m.Run()
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

// startOwnServer runs ../../bin/server (built by `make build`) on a free loopback port.
func startOwnServer(nowText string, delayMs int) (func(), error) {
	port, err := freePort()
	if err != nil {
		return nil, err
	}
	dataDir, err := os.MkdirTemp("", "calendar-data-")
	if err != nil {
		return nil, err
	}
	binary, err := filepath.Abs("../../bin/server")
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	server := exec.CommandContext(ctx, binary)
	server.Env = append(os.Environ(), "HOST=127.0.0.1", "PORT="+strconv.Itoa(port), "CALENDAR_NOW="+nowText,
		"CALENDAR_BOOKING_DELAY_MS="+strconv.Itoa(delayMs), "CALENDAR_DATA_DIR="+dataDir)
	server.Stdout, server.Stderr = os.Stderr, os.Stderr
	if err := server.Start(); err != nil {
		cancel()
		return nil, fmt.Errorf("%s: %w (run make build first)", binary, err)
	}
	stop := func() {
		cancel()
		_ = server.Wait()
		_ = os.RemoveAll(dataDir)
	}
	baseURL = "http://127.0.0.1:" + strconv.Itoa(port)
	deadline := time.Now().Add(readinessTimeout)
	for time.Now().Before(deadline) {
		if response, err := http.Get(baseURL + "/event-types"); err == nil {
			response.Body.Close()
			if response.StatusCode == http.StatusOK {
				return stop, nil
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	stop()
	return nil, fmt.Errorf("no 200 on GET /event-types within %s", readinessTimeout)
}

func freePort() (int, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port, nil
}
