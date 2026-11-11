CREATE TABLE "check_closures" (
	"user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"check_id" text NOT NULL,
	"check_kind" text NOT NULL,
	"attempt_limit" integer NOT NULL,
	"failed_count" integer NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "check_closures_pkey" PRIMARY KEY("user_id","course_id","lesson_id","check_id","check_kind"),
	CONSTRAINT "check_closures_check_id_check" CHECK ("check_closures"."check_id" <> ''),
	CONSTRAINT "check_closures_check_kind_check" CHECK ("check_closures"."check_kind" IN ('quiz', 'command', 'rubric', 'hidden-task', 'bug-hunt')),
	CONSTRAINT "check_closures_count_check" CHECK ("check_closures"."attempt_limit" > 0 AND "check_closures"."failed_count" >= "check_closures"."attempt_limit")
);
--> statement-breakpoint
ALTER TABLE "lesson_progress" DROP CONSTRAINT "lesson_progress_status_check";--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "included_check_ids" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "included_check_kinds" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "check_results" ADD COLUMN "is_format_error" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "check_results" ADD COLUMN "is_budget_exhausted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "check_results" ADD COLUMN "message" text;--> statement-breakpoint
ALTER TABLE "check_results" ADD COLUMN "raw_error" text;--> statement-breakpoint
ALTER TABLE "check_closures" ADD CONSTRAINT "check_closures_lesson_progress_fk" FOREIGN KEY ("user_id","course_id","lesson_id") REFERENCES "public"."lesson_progress"("user_id","course_id","lesson_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_one_running_idx" ON "attempts" USING btree ("user_id","course_id","lesson_id") WHERE "attempts"."status" = 'running';--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_included_checks_check" CHECK (cardinality("attempts"."included_check_ids") = cardinality("attempts"."included_check_kinds"));--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_included_check_kinds_check" CHECK ("attempts"."included_check_kinds" <@ ARRAY['quiz', 'command', 'rubric', 'hidden-task', 'bug-hunt']::text[]);--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_format_error_check" CHECK (NOT "check_results"."is_format_error" OR "check_results"."status" = 'failed');--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_budget_check" CHECK (NOT "check_results"."is_budget_exhausted" OR ("check_results"."status" = 'failed' AND "check_results"."check_kind" = 'hidden-task'));--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_flags_check" CHECK (NOT ("check_results"."is_format_error" AND "check_results"."is_budget_exhausted"));--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_raw_error_check" CHECK ("check_results"."raw_error" IS NULL OR "check_results"."status" = 'error');--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_status_check" CHECK ("lesson_progress"."status" IN ('in-progress', 'completed', 'not-passed'));