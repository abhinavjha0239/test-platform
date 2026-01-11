-- Add scheduled exam window columns
ALTER TABLE "exams" ADD COLUMN "scheduled_start_at" timestamp;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "scheduled_end_at" timestamp;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "timezone" text DEFAULT 'Asia/Kolkata';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exams_scheduled_end_at_idx" ON "exams" ("scheduled_end_at");

