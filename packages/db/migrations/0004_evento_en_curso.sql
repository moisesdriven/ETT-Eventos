ALTER TABLE "analytics"."events" DROP CONSTRAINT "events_window_chk";--> statement-breakpoint
ALTER TABLE "analytics"."events" ALTER COLUMN "ends_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics"."events" ADD CONSTRAINT "events_window_chk" CHECK ("analytics"."events"."ends_at" IS NULL OR "analytics"."events"."ends_at" > "analytics"."events"."starts_at");