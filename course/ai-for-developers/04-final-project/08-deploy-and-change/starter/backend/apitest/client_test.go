package apitest

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"regexp"
	"strings"
	"testing"
	"time"
)

// response is one answer with its body read.
type response struct {
	status    int
	mediaType string // type/subtype, lower-case, parameters dropped
	header    http.Header
	body      []byte
}

var client = &http.Client{Timeout: 10 * time.Second}

func send(t *testing.T, method, path string, body any, headers ...string) response {
	t.Helper()
	answer, err := try(method, path, body, headers...)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	return answer
}

// try is send for goroutines, which must not call t.Fatal.
func try(method, path string, body any, headers ...string) (response, error) {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return response{}, err
		}
		reader = bytes.NewReader(data)
	}
	request, err := http.NewRequest(method, baseURL+path, reader)
	if err != nil {
		return response{}, err
	}
	request.Header.Set("Accept", "application/json")
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	for i := 0; i+1 < len(headers); i += 2 {
		request.Header.Set(headers[i], headers[i+1])
	}
	answer, err := client.Do(request)
	if err != nil {
		return response{}, err
	}
	defer answer.Body.Close()
	data, err := io.ReadAll(answer.Body)
	if err != nil {
		return response{}, fmt.Errorf("reading the body: %w", err)
	}
	mediaType, _, _ := mime.ParseMediaType(answer.Header.Get("Content-Type"))
	return response{answer.StatusCode, strings.ToLower(mediaType), answer.Header, data}, nil
}

// decode reads a 2xx JSON answer into target, failing the test on any other answer.
func (r response) decode(t *testing.T, wantStatus int, target any) {
	t.Helper()
	if r.status != wantStatus {
		t.Fatalf("status %d, want %d: %s", r.status, wantStatus, r.body)
	}
	if r.mediaType != "application/json" {
		t.Fatalf("Content-Type %q, want application/json", r.mediaType)
	}
	if err := json.Unmarshal(r.body, target); err != nil {
		t.Fatalf("body is not the expected JSON: %v: %s", err, r.body)
	}
}

// expectProblem asserts an RFC 9457 answer with the status, the code and `status` repeated in the body.
func (r response) expectProblem(t *testing.T, wantStatus int, wantCode string) {
	t.Helper()
	if r.status != wantStatus {
		t.Errorf("status %d, want %d %s: %s", r.status, wantStatus, wantCode, r.body)
		return
	}
	if r.mediaType != "application/problem+json" {
		t.Errorf("Content-Type %q, want application/problem+json", r.mediaType)
		return
	}
	var body struct {
		Type   string `json:"type"`
		Title  string `json:"title"`
		Status int    `json:"status"`
		Code   string `json:"code"`
	}
	if err := json.Unmarshal(r.body, &body); err != nil {
		t.Errorf("problem body is not JSON: %v", err)
		return
	}
	if body.Code != wantCode || body.Status != wantStatus || body.Type == "" || body.Title == "" {
		t.Errorf("problem %+v, want code %s and status %d with a type and a title", body, wantCode, wantStatus)
	}
}

var idPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

func checkID(t *testing.T, id string) {
	t.Helper()
	if !idPattern.MatchString(id) {
		t.Errorf("id %q does not match [A-Za-z0-9_-]{1,64}", id)
	}
}

type schedule struct {
	ID string `json:"id"`
}

type eventType struct {
	ID string `json:"id"`
}

type booking struct {
	ID          string    `json:"id"`
	EventTypeID string    `json:"eventTypeId"`
	Start       time.Time `json:"start"`
	End         time.Time `json:"end"`
	Status      string    `json:"status"`
}

type slot struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}

type list[T any] struct {
	Items []T `json:"items"`
}

func createSchedule(t *testing.T, body map[string]any) string {
	t.Helper()
	var created schedule
	send(t, "POST", "/schedules", body).decode(t, http.StatusCreated, &created)
	checkID(t, created.ID)
	return created.ID
}

func createEventType(t *testing.T, body map[string]any) string {
	t.Helper()
	var created eventType
	send(t, "POST", "/event-types", body).decode(t, http.StatusCreated, &created)
	checkID(t, created.ID)
	return created.ID
}

func bookingBody(eventTypeID string, start time.Time) map[string]any {
	return map[string]any{"eventTypeId": eventTypeID, "start": start.Format(time.RFC3339), "inviteeName": "Anna",
		"inviteeEmail": "anna@example.com", "inviteeTimeZone": "Europe/Berlin"}
}

func book(t *testing.T, eventTypeID string, start time.Time, headers ...string) booking {
	t.Helper()
	var created booking
	send(t, "POST", "/bookings", bookingBody(eventTypeID, start), headers...).decode(t, http.StatusCreated, &created)
	checkID(t, created.ID)
	return created
}

func cancel(t *testing.T, id string) booking {
	t.Helper()
	var cancelled booking
	send(t, "POST", "/bookings/"+id+"/cancel", nil).decode(t, http.StatusOK, &cancelled)
	return cancelled
}

func slotsOf(t *testing.T, eventTypeID string, from, to time.Time) []slot {
	t.Helper()
	var answer list[slot]
	path := "/event-types/" + eventTypeID + "/slots?from=" + queryTime(from) + "&to=" + queryTime(to)
	send(t, "GET", path, nil).decode(t, http.StatusOK, &answer)
	return answer.Items
}

// queryTime is RFC 3339 for a query string: `+` in an offset must be sent as %2B.
func queryTime(instant time.Time) string {
	return strings.ReplaceAll(instant.Format(time.RFC3339), "+", "%2B")
}

func sameBooking(a, b booking) bool {
	return a.ID == b.ID && a.EventTypeID == b.EventTypeID && a.Start.Equal(b.Start) && a.End.Equal(b.End) && a.Status == b.Status
}

func sameSlots(got, want []slot) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if !got[i].Start.Equal(want[i].Start) || !got[i].End.Equal(want[i].End) {
			return false
		}
	}
	return true
}

// everyDay is a weekly rule list with one window on all seven weekdays.
func everyDay(start, end string) []map[string]any {
	rules := make([]map[string]any, 0, 7)
	for weekday := 1; weekday <= 7; weekday++ {
		rules = append(rules, map[string]any{"weekday": weekday, "start": start, "end": end})
	}
	return rules
}
