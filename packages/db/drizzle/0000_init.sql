CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"transcript_path" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "attempts_status_check" CHECK ("attempts"."status" IN ('running', 'passed', 'failed', 'error')),
	CONSTRAINT "attempts_finished_check" CHECK (("attempts"."status" = 'running') = ("attempts"."finished_at" IS NULL)),
	CONSTRAINT "attempts_transcript_path_check" CHECK ("attempts"."transcript_path" ~ '^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*/?$')
);
--> statement-breakpoint
CREATE TABLE "check_results" (
	"attempt_id" uuid NOT NULL,
	"check_id" text NOT NULL,
	"check_kind" text NOT NULL,
	"status" text NOT NULL,
	"score" double precision,
	"details" jsonb,
	"duration_ms" integer,
	"cost_usd" numeric(12, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "check_results_pkey" PRIMARY KEY("attempt_id","check_id"),
	CONSTRAINT "check_results_check_id_check" CHECK ("check_results"."check_id" <> ''),
	CONSTRAINT "check_results_check_kind_check" CHECK ("check_results"."check_kind" IN ('quiz', 'command', 'rubric', 'hidden-task', 'bug-hunt')),
	CONSTRAINT "check_results_status_check" CHECK ("check_results"."status" IN ('passed', 'failed', 'timeout', 'error')),
	CONSTRAINT "check_results_score_check" CHECK ("check_results"."score" >= 0 AND "check_results"."score" <= 1),
	CONSTRAINT "check_results_duration_check" CHECK ("check_results"."duration_ms" >= 0),
	CONSTRAINT "check_results_cost_check" CHECK ("check_results"."cost_usd" >= 0)
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollments_pkey" PRIMARY KEY("user_id","course_id"),
	CONSTRAINT "enrollments_course_id_check" CHECK ("enrollments"."course_id" <> '')
);
--> statement-breakpoint
CREATE TABLE "lesson_progress" (
	"user_id" text NOT NULL,
	"course_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"status" text DEFAULT 'in-progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_progress_pkey" PRIMARY KEY("user_id","course_id","lesson_id"),
	CONSTRAINT "lesson_progress_lesson_id_check" CHECK ("lesson_progress"."lesson_id" <> ''),
	CONSTRAINT "lesson_progress_status_check" CHECK ("lesson_progress"."status" IN ('in-progress', 'completed')),
	CONSTRAINT "lesson_progress_completed_check" CHECK (("lesson_progress"."status" = 'completed') = ("lesson_progress"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "mentor_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"check_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"body" text,
	"cost_usd" numeric(12, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "mentor_reviews_status_check" CHECK ("mentor_reviews"."status" IN ('pending', 'completed', 'error')),
	CONSTRAINT "mentor_reviews_cost_check" CHECK ("mentor_reviews"."cost_usd" >= 0),
	CONSTRAINT "mentor_reviews_completed_check" CHECK (("mentor_reviews"."status" = 'pending') = ("mentor_reviews"."completed_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_id_check" CHECK ("users"."id" <> '')
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_lesson_progress_fk" FOREIGN KEY ("user_id","course_id","lesson_id") REFERENCES "public"."lesson_progress"("user_id","course_id","lesson_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_enrollment_fk" FOREIGN KEY ("user_id","course_id") REFERENCES "public"."enrollments"("user_id","course_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_reviews" ADD CONSTRAINT "mentor_reviews_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempts_lesson_started_idx" ON "attempts" USING btree ("user_id","course_id","lesson_id","started_at");--> statement-breakpoint
CREATE INDEX "mentor_reviews_attempt_created_idx" ON "mentor_reviews" USING btree ("attempt_id","created_at");