import "@typespec/http";

using Http;

namespace Calendar;

@doc("A local wall-clock time HH:MM; 24:00 is allowed only as the end of an interval.")
@pattern("^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$")
scalar LocalTime extends string;

@doc("A text field shown to people: a schedule name, an event type title, an invitee name.")
@minLength(1)
@maxLength(120)
scalar DisplayText extends string;

@doc("An availability window [start, end) in the schedule's local time.")
model TimeInterval {
  @doc("Start of the window, inclusive.") start: LocalTime;
  @doc("End of the window, exclusive.") end: LocalTime;
}

@doc("A weekly rule: availability on one ISO weekday.")
model WeeklyRule {
  @doc("ISO weekday, Monday = 1.") @minValue(1) @maxValue(7) weekday: int32;
  ...TimeInterval;
}

@doc("A date override: replaces the weekly rules of its date; no intervals means a day off.")
model DateOverride {
  @doc("The local date the override applies to.") date: plainDate;
  @doc("Availability windows on that date.") intervals: TimeInterval[];
}

@doc("The fields of a schedule that a client sends.")
model ScheduleFields {
  @doc("Name shown to the host.") name: DisplayText;
  @doc("IANA time zone of the schedule.") timeZone: string;
  @doc("Weekly availability rules.") weekly: WeeklyRule[];
  @doc("Date overrides.") overrides: DateOverride[];
}

@doc("A host's availability: weekly rules and date overrides in one time zone.")
model Schedule {
  @doc("Opaque identifier.") id: string;
  ...ScheduleFields;
}

@doc("The fields of an event type that a client sends.")
model EventTypeFields {
  @doc("Title shown to invitees.") title: DisplayText;
  @doc("Meeting length.") @minValue(5) @maxValue(480) durationMinutes: int32;
  @doc("Distance between candidate starts.") @minValue(5) @maxValue(240) slotIncrementMinutes: int32;
  @doc("Free time required before a meeting.") @minValue(0) @maxValue(240) bufferBeforeMinutes: int32;
  @doc("Free time required after a meeting.") @minValue(0) @maxValue(240) bufferAfterMinutes: int32;
  @doc("How long before its start a slot can still be booked.") @minValue(0) @maxValue(43200) minimumNoticeMinutes: int32;
  @doc("How many days ahead slots are offered.") @minValue(1) @maxValue(365) bookingWindowDays: int32;
  @doc("At most this many confirmed bookings of this event type per local date of its schedule; absent means no limit.")
  @minValue(1)
  @maxValue(100)
  maxBookingsPerDay?: int32;
  @doc("The schedule that provides availability.") scheduleId: string;
}

@doc("A kind of meeting an invitee can book.")
model EventType {
  @doc("Opaque identifier.") id: string;
  ...EventTypeFields;
}

@doc("A bookable time slot.")
model Slot {
  @doc("Start instant.") start: utcDateTime;
  @doc("End instant.") end: utcDateTime;
}

@doc("Lifecycle state of a booking.")
union BookingStatus {
  confirmed: "confirmed",
  cancelled: "cancelled",
}

@doc("What an invitee sends to book a slot.")
model BookingRequest {
  @doc("The event type to book.") eventTypeId: string;
  @doc("Start of the chosen slot.") start: utcDateTime;
  @doc("Invitee's name.") inviteeName: DisplayText;
  @doc("Invitee's email address.") @format("email") inviteeEmail: string;
  @doc("Invitee's IANA time zone.") inviteeTimeZone: string;
}

@doc("A booked meeting: what the invitee sent, plus the end, the status and when it was created.")
model Booking {
  @doc("Opaque identifier.") id: string;
  ...BookingRequest;
  @doc("Meeting end.") end: utcDateTime;
  @doc("Confirmed or cancelled.") status: BookingStatus;
  @doc("When the booking was created.") createdAt: utcDateTime;
}

@doc("A list response.")
model ItemList<Item> {
  @doc("The items, sorted as the operation states.") items: Item[];
}

@doc("Machine-readable error codes.")
union ProblemCode {
  validationFailed: "validation_failed",
  notFound: "not_found",
  unknownReference: "unknown_reference",
  slotUnavailable: "slot_unavailable",
  idempotencyMismatch: "idempotency_mismatch",
  slotTaken: "slot_taken",
  idempotencyInProgress: "idempotency_in_progress",
  dailyLimitReached: "daily_limit_reached",
}

@doc("An RFC 9457 problem details body.")
@error
model Problem<Status extends int32> {
  @doc("HTTP status of the response.") @statusCode statusCode: Status;
  @doc("Problem details media type.") @header contentType: "application/problem+json";
  @doc("Problem type URI reference.") type: string;
  @doc("Short summary.") title: string;
  @doc("HTTP status, repeated in the body.") status: int32;
  @doc("Machine-readable code.") code: ProblemCode;
  @doc("Human-readable explanation.") detail?: string;
}

@doc("400: the request does not match the contract.") model BadRequest is Problem<400>;
@doc("404: the resource does not exist.") model NotFound is Problem<404>;
@doc("409: the request conflicts with the current state.") model Conflict is Problem<409>;
@doc("422: the request is well-formed but can never succeed as sent.") model Unprocessable is Problem<422>;
