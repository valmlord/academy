package api

import (
	"encoding/json"
	"net/http"
)

// Problem codes of the contract (decision 1): a closed set.
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

const problemMediaType = "application/problem+json"

var problemTitles = map[string]string{
	codeValidationFailed:      "The request does not match the contract",
	codeNotFound:              "The resource does not exist",
	codeUnknownReference:      "The request refers to something that does not exist",
	codeSlotUnavailable:       "The start is not a bookable slot of the event type",
	codeIdempotencyMismatch:   "The Idempotency-Key was used with another request body",
	codeSlotTaken:             "The slot is taken by another booking",
	codeIdempotencyInProgress: "A request with this Idempotency-Key is still running",
	codeDailyLimitReached:     "The event type is fully booked on this date",
}

// problem is the RFC 9457 body of every error answer; status repeats the HTTP status.
type problem struct {
	Type   string `json:"type"`
	Title  string `json:"title"`
	Status int    `json:"status"`
	Code   string `json:"code"`
	Detail string `json:"detail,omitempty"`
}

func writeProblem(w http.ResponseWriter, status int, code, detail string) {
	w.Header().Set("Content-Type", problemMediaType)
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(problem{Type: "about:blank", Title: problemTitles[code], Status: status, Code: code, Detail: detail})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// problemBytes is the body writeProblem would send, for answers kept under an Idempotency-Key.
func problemBytes(status int, code, detail string) []byte {
	data, _ := json.Marshal(problem{Type: "about:blank", Title: problemTitles[code], Status: status, Code: code, Detail: detail})
	return data
}

// writeStored sends an answer kept under an Idempotency-Key: a 201 booking or a problem.
func writeStored(w http.ResponseWriter, answer storedAnswer) {
	mediaType := "application/json"
	if answer.status >= 400 {
		mediaType = problemMediaType
	}
	w.Header().Set("Content-Type", mediaType)
	w.WriteHeader(answer.status)
	_, _ = w.Write(answer.body)
}
