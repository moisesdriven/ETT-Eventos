CREATE TABLE "analytics"."event_month_allocations" (
	"event_id" uuid NOT NULL,
	"month" text NOT NULL,
	"location_id" text NOT NULL,
	"pct" numeric(7, 4) NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_month_allocations_event_id_month_pk" PRIMARY KEY("event_id","month"),
	CONSTRAINT "event_month_allocations_pct_chk" CHECK ("analytics"."event_month_allocations"."pct" >= 0 AND "analytics"."event_month_allocations"."pct" <= 100),
	CONSTRAINT "event_month_allocations_month_chk" CHECK ("analytics"."event_month_allocations"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
ALTER TABLE "analytics"."event_month_allocations" ADD CONSTRAINT "event_month_allocations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "analytics"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."event_month_allocations" ADD CONSTRAINT "event_month_allocations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_month_allocations_month_idx" ON "analytics"."event_month_allocations" USING btree ("location_id","month");