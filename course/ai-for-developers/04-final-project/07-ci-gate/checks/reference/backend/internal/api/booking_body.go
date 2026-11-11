package api

import (
	"regexp"
	"strings"
	"time"
)

// bookingBody is the wire shape of POST /bookings; pointers tell a missing (or null) field from a zero value.
type bookingBody struct {
	EventTypeID     *string `json:"eventTypeId"`
	Start           *string `json:"start"`
	InviteeName     *string `json:"inviteeName"`
	InviteeEmail    *string `json:"inviteeEmail"`
	InviteeTimeZone *string `json:"inviteeTimeZone"`
}

// bookingRequest is a validated POST /bookings body.
type bookingRequest struct {
	EventTypeID     string
	Start           time.Time
	InviteeName     string
	InviteeEmail    string
	InviteeTimeZone string
}

// fingerprint identifies the request for idempotency: two bodies with the same fields and the same start
// instant are the same request, whatever offset the start was written with.
func (r bookingRequest) fingerprint() string {
	return strings.Join([]string{r.EventTypeID, r.Start.UTC().Format(time.RFC3339Nano), r.InviteeName, r.InviteeEmail, r.InviteeTimeZone}, "\x00")
}

// emailPattern is the contract's `format: email` read loosely: one @, no spaces, a dot in the domain.
var emailPattern = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

func (b bookingBody) validate() (bookingRequest, error) {
	var request bookingRequest
	if b.EventTypeID == nil {
		return request, invalid("eventTypeId", "is required")
	}
	request.EventTypeID = *b.EventTypeID
	if b.Start == nil {
		return request, invalid("start", "is required")
	}
	start, err := time.Parse(time.RFC3339, *b.Start)
	if err != nil {
		return request, invalid("start", "%q is not an RFC 3339 date-time with an offset", *b.Start)
	}
	request.Start = start
	if request.InviteeName, err = displayText("inviteeName", b.InviteeName); err != nil {
		return request, err
	}
	if b.InviteeEmail == nil {
		return request, invalid("inviteeEmail", "is required")
	}
	if !emailPattern.MatchString(*b.InviteeEmail) {
		return request, invalid("inviteeEmail", "%q is not an email address", *b.InviteeEmail)
	}
	request.InviteeEmail = *b.InviteeEmail
	if b.InviteeTimeZone == nil {
		return request, invalid("inviteeTimeZone", "is required")
	}
	if _, err := loadZone(*b.InviteeTimeZone); err != nil {
		return request, invalid("inviteeTimeZone", "unknown time zone %q", *b.InviteeTimeZone)
	}
	request.InviteeTimeZone = *b.InviteeTimeZone
	return request, nil
}

// idempotencyKeyPattern is the course's key syntax (task.md); the IETF draft's quoted sf-string is refused.
var idempotencyKeyPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)
