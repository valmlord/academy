package main

// Decisions has one switch per decision of design 3.1, named as in checks/data/model.py `Decisions`.
// The zero value is the customer's model.
type Decisions struct {
	GapUsesLaterOffset           bool `json:"gap_uses_later_offset"`
	OverlapTakesLaterInstant     bool `json:"overlap_takes_later_instant"`
	AdjacentIntervalsConflict    bool `json:"adjacent_intervals_conflict"`
	CandidateBuffersIgnored      bool `json:"candidate_buffers_ignored"`
	NoticeFromStartOfDay         bool `json:"notice_from_start_of_day"`
	WindowOneDayLonger           bool `json:"window_one_day_longer"`
	OverrideMergedWithWeekly     bool `json:"override_merged_with_weekly"`
	WeekdayOfUTCDate             bool `json:"weekday_of_utc_date"`
	DayStepIs24Hours             bool `json:"day_step_is_24_hours"`
	SlotEndingAtWindowEndDropped bool `json:"slot_ending_at_window_end_dropped"`
	CancelledBookingBlocks       bool `json:"cancelled_booking_blocks"`
	IncrementCountedFromHour     bool `json:"increment_counted_from_hour"`
}
