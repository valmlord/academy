# Tasks: booking calendar

## T-00: Contract for Schedule, Event Type, Slot and Booking agreed with the Host
Requirements: REQ-13, REQ-14, REQ-15
Check: `make gen`

## T-01: Invitee sees free Slot of one Event Type on an ordinary day
Requirements: REQ-01, REQ-05, REQ-07, REQ-12, REQ-13, REQ-20
Check: `make ci`

## T-02: Slot on daylight saving days and with a Date Override
Requirements: REQ-02, REQ-03, REQ-04
Check: `make ci`

## T-03: Buffers, Minimum Notice and Booking Window limit the offered Slot
Requirements: REQ-06, REQ-08, REQ-09
Check: `make ci`

## T-04: Invitee books a Slot, and a taken Slot is refused
Requirements: REQ-11, REQ-14, REQ-15, REQ-16
Check: `make ci`

## T-05: Simultaneous and repeated Booking requests create one Booking
Requirements: REQ-17, REQ-18
Check: `make ci`

## T-06: Invitee cancels a Booking and the Slot is offered again
Requirements: REQ-10, REQ-19
Check: `make ci`

## T-07: Host starts the API and the booking page with one command
Requirements: REQ-21
Check: `make build`

## T-08: Host reads one Booking by its id
Requirements: REQ-22
Check: `make ci`
