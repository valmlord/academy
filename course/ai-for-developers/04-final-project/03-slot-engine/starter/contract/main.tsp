import "@typespec/http";
import "./models.tsp";

using Http;

@doc("Booking calendar: a host's schedules and event types, free slots, and bookings.")
@service(#{ title: "Booking calendar" })
namespace Calendar;

@doc("A client-chosen key that makes POST /bookings safe to retry.")
@pattern("^[A-Za-z0-9_-]{8,64}$")
scalar IdempotencyKey extends string;

@doc("Schedules of the host.")
@route("/schedules")
namespace Schedules {
  @doc("Create a schedule.")
  @post
  op create(@body schedule: ScheduleFields): {
    @statusCode statusCode: 201;
    @body schedule: Schedule;
  } | BadRequest;
}

@doc("Event types of the host.")
@route("/event-types")
namespace EventTypes {
  @doc("Create an event type on an existing schedule.")
  @post
  op create(@body eventType: EventTypeFields): {
    @statusCode statusCode: 201;
    @body eventType: EventType;
  } | BadRequest | Unprocessable;

  @doc("List all event types.")
  @get
  op list(): ItemList<EventType>;

  @doc("Read one event type.")
  @get
  @route("/{eventTypeId}")
  op read(@path eventTypeId: string): EventType | NotFound;

  @doc("Free slots of an event type whose start lies in [from, to), sorted by start.")
  @get
  @route("/{eventTypeId}/slots")
  op slots(
    @path eventTypeId: string,
    @doc("Range start, inclusive.") @query from: utcDateTime,
    @doc("Range end, exclusive; at most 31 days after from.") @query to: utcDateTime,
  ): ItemList<Slot> | BadRequest | NotFound;
}

@doc("Bookings of the host.")
@route("/bookings")
namespace Bookings {
  @doc("Book a free slot.")
  @post
  op create(
    @doc("Optional retry key.") @header("Idempotency-Key") idempotencyKey?: IdempotencyKey,
    @body booking: BookingRequest,
  ): {
    @statusCode statusCode: 201;
    @body booking: Booking;
  } | BadRequest | Unprocessable | Conflict;

  @doc("Bookings whose start lies in [from, to), sorted by start.")
  @get
  op list(
    @doc("Range start, inclusive.") @query from: utcDateTime,
    @doc("Range end, exclusive; at most 31 days after from.") @query to: utcDateTime,
  ): ItemList<Booking> | BadRequest;

  @doc("Cancel a booking; a repeated cancel returns the same body.")
  @post
  @route("/{bookingId}/cancel")
  op cancel(@path bookingId: string): Booking | NotFound;
}
