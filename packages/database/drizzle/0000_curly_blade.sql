CREATE TYPE "public"."attempt_status" AS ENUM('IN_PROGRESS', 'SUBMITTED', 'GRADING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('TAB_LEAVE', 'TAB_RETURN', 'FULLSCREEN_EXIT', 'FULLSCREEN_ENTER', 'PASTE_ATTEMPT');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ADMIN', 'CANDIDATE', 'REVIEWER');--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"starter_files" json NOT NULL,
	"public_tests" text NOT NULL,
	"hidden_tests" text NOT NULL,
	"dependencies" json NOT NULL,
	"node_version" text DEFAULT '20' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "exam_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"exam_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"status" "attempt_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"submitted_at" timestamp,
	"files" json,
	"public_score" integer,
	"hidden_score" integer,
	"total_public" integer,
	"total_hidden" integer,
	"grading_logs" text,
	"graded_at" timestamp,
	"tab_exits" integer DEFAULT 0 NOT NULL,
	"total_out_of_window_seconds" integer DEFAULT 0 NOT NULL,
	"fullscreen_exits" integer DEFAULT 0 NOT NULL,
	"paste_attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"exam_id" text NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"used_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exam_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"challenge_id" text NOT NULL,
	"time_limit" integer NOT NULL,
	"max_attempts" integer DEFAULT 1 NOT NULL,
	"pass_threshold" real DEFAULT 0.6 NOT NULL,
	"fullscreen_required" boolean DEFAULT true NOT NULL,
	"tab_switch_logging" boolean DEFAULT true NOT NULL,
	"paste_disabled" boolean DEFAULT true NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proctor_events" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"event_type" "event_type" NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"duration" integer,
	"paste_length" integer,
	"is_multiline" boolean
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"name" text,
	"role" "role" DEFAULT 'CANDIDATE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_candidate_id_users_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_invitations" ADD CONSTRAINT "exam_invitations_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proctor_events" ADD CONSTRAINT "proctor_events_attempt_id_exam_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."exam_attempts"("id") ON DELETE no action ON UPDATE no action;