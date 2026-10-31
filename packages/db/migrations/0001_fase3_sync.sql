ALTER TYPE "analytics"."message_category" ADD VALUE 'inbound';--> statement-breakpoint
ALTER TYPE "analytics"."message_category" ADD VALUE 'free_entry_point';--> statement-breakpoint
ALTER TABLE "analytics"."contact_tag_history" ADD COLUMN "added_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "analytics"."contact_tag_history" ADD COLUMN "removed_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "analytics"."message_charges" ADD COLUMN "charge_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics"."sync_runs" ADD COLUMN "params" jsonb;--> statement-breakpoint
CREATE INDEX "sync_runs_status_idx" ON "analytics"."sync_runs" USING btree ("status","id");