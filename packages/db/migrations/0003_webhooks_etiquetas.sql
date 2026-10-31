CREATE TABLE "analytics"."webhook_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"contact_id" text,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "webhook_events_pending_idx" ON "analytics"."webhook_events" USING btree ("id") WHERE "analytics"."webhook_events"."processed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "webhook_events_received_idx" ON "analytics"."webhook_events" USING btree ("received_at");