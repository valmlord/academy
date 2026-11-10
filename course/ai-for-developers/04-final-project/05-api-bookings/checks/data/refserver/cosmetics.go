package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	mrand "math/rand/v2"
	"strconv"
	"sync"
	"time"
)

// Cosmetics are the values of design 4.L7 K1-K7 that the grader draws for one gate run. The grader draws
// them with one sampler for every variant, green or red, so nothing here tells a mutant from a correct
// server.
type Cosmetics struct {
	// Seed drives the per-response draws (ids, latency jitter).
	Seed uint64 `json:"seed"`
	// K1: "uuid4", "crockford26", "prefixhex" or "counter".
	IDScheme string `json:"idScheme"`
	// K1: two lowercase letters per entity kind ("schedule", "eventType", "booking") for "prefixhex".
	IDPrefixes map[string]string `json:"idPrefixes"`
	// K1: the first value of "counter".
	IDCounterStart int64 `json:"idCounterStart"`
	// K2: index 0-2 of the problem title per code.
	Titles map[string]int `json:"titles"`
	// K3: -1 for no detail, else index 0-2 of the detail text per code.
	Details map[string]int `json:"details"`
	// K4: "", "; charset=utf-8" or "; charset=UTF-8" after application/json and application/problem+json.
	MediaParam string `json:"mediaParam"`
	// K5: the order of the response header fields (lower-case names).
	HeaderOrder []string `json:"headerOrder"`
	// K6: the order of methods in Allow, and whether HEAD is offered on GET paths.
	MethodOrder []string `json:"methodOrder"`
	AllowHead   bool     `json:"allowHead"`
	// K7: a run-level base latency and the maximum per-response jitter, in milliseconds.
	LatencyBaseMs   int `json:"latencyBaseMs"`
	LatencyJitterMs int `json:"latencyJitterMs"`
}

// defaultCosmetics is what L6 page-ssr gets: the same plain answers every run.
func defaultCosmetics() Cosmetics {
	return Cosmetics{
		IDScheme:    "prefixhex",
		IDPrefixes:  map[string]string{"schedule": "sc", "eventType": "et", "booking": "bk"},
		Titles:      map[string]int{},
		Details:     map[string]int{},
		HeaderOrder: []string{"content-type", "allow", "date", "content-length", "connection"},
		MethodOrder: []string{"GET", "HEAD", "POST"},
		AllowHead:   true,
	}
}

// cosmeticState is the per-process side of Cosmetics: the random stream and the id counter.
type cosmeticState struct {
	Cosmetics
	mu      sync.Mutex
	random  *mrand.Rand
	counter int64
}

func newCosmeticState(c Cosmetics) *cosmeticState {
	return &cosmeticState{Cosmetics: c, random: mrand.New(mrand.NewPCG(c.Seed, c.Seed^0x9e3779b97f4a7c15)), counter: c.IDCounterStart}
}

const crockfordAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

// newID is an opaque id matching [A-Za-z0-9_-]{1,64} in the run's K1 scheme.
func (c *cosmeticState) newID(kind string) string {
	c.mu.Lock()
	defer c.mu.Unlock()
	switch c.IDScheme {
	case "uuid4":
		var raw [16]byte
		_, _ = rand.Read(raw[:])
		raw[6] = raw[6]&0x0f | 0x40
		raw[8] = raw[8]&0x3f | 0x80
		text := hex.EncodeToString(raw[:])
		return fmt.Sprintf("%s-%s-%s-%s-%s", text[0:8], text[8:12], text[12:16], text[16:20], text[20:32])
	case "crockford26":
		out := make([]byte, 26)
		for i := range out {
			out[i] = crockfordAlphabet[c.random.IntN(len(crockfordAlphabet))]
		}
		return string(out)
	case "counter":
		c.counter++
		return strconv.FormatInt(c.counter, 10)
	default:
		var raw [8]byte
		_, _ = rand.Read(raw[:])
		return c.IDPrefixes[kind] + "_" + hex.EncodeToString(raw[:])
	}
}

// latency is K7 for one response: the run's base plus a fresh jitter, never above 40 ms.
func (c *cosmeticState) latency() time.Duration {
	c.mu.Lock()
	defer c.mu.Unlock()
	ms := c.LatencyBaseMs
	if c.LatencyJitterMs > 0 {
		ms += c.random.IntN(c.LatencyJitterMs + 1)
	}
	return time.Duration(min(ms, maxLatencyMs)) * time.Millisecond
}

// maxLatencyMs keeps K7 below half of the shortest booking delay (150 ms), so a suite's own timing
// rules stay valid (design 4.L7).
const maxLatencyMs = 40

var problemTitleChoices = map[string][3]string{
	codeValidationFailed:      {"The request does not match the contract", "Validation failed", "Invalid request"},
	codeNotFound:              {"The resource does not exist", "Not found", "No such resource"},
	codeUnknownReference:      {"The request refers to something that does not exist", "Unknown reference", "Referenced resource is missing"},
	codeSlotUnavailable:       {"The start is not a bookable slot of the event type", "Slot unavailable", "This start cannot be booked"},
	codeIdempotencyMismatch:   {"The Idempotency-Key was used with another request body", "Idempotency key mismatch", "Key reused with a different body"},
	codeSlotTaken:             {"The slot is taken by another booking", "Slot taken", "This time is already booked"},
	codeIdempotencyInProgress: {"A request with this Idempotency-Key is still running", "Request in progress", "Same key is being processed"},
	codeDailyLimitReached:     {"The event type is fully booked on this date", "Daily limit reached", "No more bookings on this day"},
}

var problemDetailChoices = map[string][3]string{
	codeValidationFailed:      {"See the contract for the allowed values.", "One or more fields are invalid.", "The request was rejected by validation."},
	codeNotFound:              {"Check the id in the path.", "Nothing is stored under this id.", "The id is unknown."},
	codeUnknownReference:      {"An id in the body does not exist.", "Create the referenced resource first.", "The reference cannot be resolved."},
	codeSlotUnavailable:       {"Pick a start from GET .../slots.", "The start is outside the offered slots.", "The start is not on the slot grid or outside availability."},
	codeIdempotencyMismatch:   {"Use a new key for a new request.", "The stored request differs from this one.", "Keys cannot be reused for another body."},
	codeSlotTaken:             {"Pick another slot.", "Another booking holds this time.", "The time overlaps a confirmed booking."},
	codeIdempotencyInProgress: {"Retry later with the same key.", "The first request has not finished.", "Wait for the first request to finish."},
	codeDailyLimitReached:     {"Pick another date.", "The daily limit of this event type is reached.", "No slots are left on this date."},
}

func (c *cosmeticState) problemTitle(code string) string {
	return problemTitleChoices[code][c.Titles[code]%3]
}

// problemDetail is "" when the run has no detail for this code.
func (c *cosmeticState) problemDetail(code string) string {
	index, ok := c.Details[code]
	if !ok || index < 0 {
		return ""
	}
	return problemDetailChoices[code][index%3]
}
