package api

import (
	"encoding/json"
	"net/http"
)

// Problem codes of the contract (decision 1): a closed set.
const (
	codeValidationFailed = "validation_failed"
	codeNotFound         = "not_found"
	codeUnknownReference = "unknown_reference"
)

const problemMediaType = "application/problem+json"

var problemTitles = map[string]string{
	codeValidationFailed: "The request does not match the contract",
	codeNotFound:         "The resource does not exist",
	codeUnknownReference: "The request refers to something that does not exist",
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
