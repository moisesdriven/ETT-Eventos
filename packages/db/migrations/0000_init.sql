CREATE SCHEMA "app";
--> statement-breakpoint
CREATE SCHEMA "analytics";
--> statement-breakpoint
CREATE TYPE "app"."user_role" AS ENUM('admin', 'analista', 'lectura');--> statement-breakpoint
CREATE TYPE "analytics"."attribution_basis" AS ENUM('historial_etiqueta', 'primer_mensaje', 'ventana');--> statement-breakpoint
CREATE TYPE "analytics"."charge_source" AS ENUM('ghl_wallet', 'meta');--> statement-breakpoint
CREATE TYPE "analytics"."credential_kind" AS ENUM('agency_pit', 'location_pit', 'agency_oauth', 'location_oauth');--> statement-breakpoint
CREATE TYPE "analytics"."event_status" AS ENUM('activo', 'archivado');--> statement-breakpoint
CREATE TYPE "analytics"."message_category" AS ENUM('marketing', 'utility', 'service', 'authentication', 'other');--> statement-breakpoint
CREATE TYPE "analytics"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "analytics"."resolution_status" AS ENUM('pendiente', 'resuelto', 'sin_resolver');--> statement-breakpoint
CREATE TYPE "analytics"."sync_status" AS ENUM('en_cola', 'en_proceso', 'ok', 'error');--> statement-breakpoint
CREATE TYPE "analytics"."tag_evidence_source" AS ENUM('webhook', 'snapshot', 'primer_mensaje', 'alta_contacto');--> statement-breakpoint
CREATE TABLE "app"."audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"metadata" jsonb,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."login_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"ip" "inet",
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."sessions" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" "inet",
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "app"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "app"."user_role" DEFAULT 'lectura' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics"."charge_attributions" (
	"charge_id" bigint NOT NULL,
	"event_id" uuid NOT NULL,
	"share" numeric(7, 6) NOT NULL,
	"amount_usd" numeric(14, 6) NOT NULL,
	"basis" "analytics"."attribution_basis" NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "charge_attributions_charge_id_event_id_pk" PRIMARY KEY("charge_id","event_id"),
	CONSTRAINT "charge_attributions_share_chk" CHECK ("analytics"."charge_attributions"."share" > 0 AND "analytics"."charge_attributions"."share" <= 1)
);
--> statement-breakpoint
CREATE TABLE "analytics"."contact_tag_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"tag_name_normalized" text NOT NULL,
	"added_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"source" "analytics"."tag_evidence_source" NOT NULL,
	"evidence" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics"."contacts_cache" (
	"location_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"name" text,
	"phone_e164" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"ghl_date_added" timestamp with time zone,
	"ghl_date_updated" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_cache_location_id_contact_id_pk" PRIMARY KEY("location_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "analytics"."conversations_cache" (
	"conversation_id" text PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"contact_id" text,
	"sender_phone_id" integer,
	"last_message_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics"."event_phones" (
	"event_id" uuid NOT NULL,
	"phone_number_id" integer NOT NULL,
	CONSTRAINT "event_phones_event_id_phone_number_id_pk" PRIMARY KEY("event_id","phone_number_id")
);
--> statement-breakpoint
CREATE TABLE "analytics"."event_tags" (
	"event_id" uuid NOT NULL,
	"location_id" text NOT NULL,
	"tag_name_normalized" text NOT NULL,
	CONSTRAINT "event_tags_event_id_tag_name_normalized_pk" PRIMARY KEY("event_id","tag_name_normalized")
);
--> statement-breakpoint
CREATE TABLE "analytics"."events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" text NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"budget_usd" numeric(14, 6),
	"notes" text,
	"status" "analytics"."event_status" DEFAULT 'activo' NOT NULL,
	"last_calculated_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_window_chk" CHECK ("analytics"."events"."ends_at" > "analytics"."events"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "analytics"."ghl_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "analytics"."credential_kind" NOT NULL,
	"location_id" text,
	"company_id" text,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text,
	"expires_at" timestamp with time zone,
	"scopes" text[],
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics"."locations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"company_id" text,
	"timezone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics"."message_charges" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"source" "analytics"."charge_source" NOT NULL,
	"external_id" text NOT NULL,
	"settled_at" timestamp with time zone NOT NULL,
	"day_lima" date GENERATED ALWAYS AS (((settled_at AT TIME ZONE 'America/Lima')::date)) STORED,
	"category" "analytics"."message_category" NOT NULL,
	"amount_usd" numeric(14, 6) NOT NULL,
	"message_ref" text,
	"message_id" text,
	"conversation_id" text,
	"contact_id" text,
	"sender_phone_id" integer,
	"resolution" "analytics"."resolution_status" DEFAULT 'pendiente' NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics"."messages_cache" (
	"message_id" text PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"alt_id" text,
	"conversation_id" text,
	"contact_id" text,
	"sender_phone_id" integer,
	"direction" "analytics"."message_direction" NOT NULL,
	"source" text,
	"status" text,
	"sent_at" timestamp with time zone NOT NULL,
	"day_lima" date GENERATED ALWAYS AS (((sent_at AT TIME ZONE 'America/Lima')::date)) STORED,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics"."phone_numbers" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" text NOT NULL,
	"phone_e164" text NOT NULL,
	"label" text,
	"active" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics"."sync_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"location_id" text,
	"kind" text NOT NULL,
	"status" "analytics"."sync_status" DEFAULT 'en_cola' NOT NULL,
	"range_from" timestamp with time zone,
	"range_to" timestamp with time zone,
	"requested_by" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"stats" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics"."tags" (
	"location_id" text NOT NULL,
	"ghl_tag_id" text NOT NULL,
	"name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"contacts_count" integer,
	"exists_in_ghl" boolean DEFAULT true NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_location_id_ghl_tag_id_pk" PRIMARY KEY("location_id","ghl_tag_id")
);
--> statement-breakpoint
ALTER TABLE "app"."audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."charge_attributions" ADD CONSTRAINT "charge_attributions_charge_id_message_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "analytics"."message_charges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."charge_attributions" ADD CONSTRAINT "charge_attributions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "analytics"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."contacts_cache" ADD CONSTRAINT "contacts_cache_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "analytics"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."conversations_cache" ADD CONSTRAINT "conversations_cache_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "analytics"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."conversations_cache" ADD CONSTRAINT "conversations_cache_sender_phone_id_phone_numbers_id_fk" FOREIGN KEY ("sender_phone_id") REFERENCES "analytics"."phone_numbers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."event_phones" ADD CONSTRAINT "event_phones_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "analytics"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."event_phones" ADD CONSTRAINT "event_phones_phone_number_id_phone_numbers_id_fk" FOREIGN KEY ("phone_number_id") REFERENCES "analytics"."phone_numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."event_tags" ADD CONSTRAINT "event_tags_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "analytics"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."events" ADD CONSTRAINT "events_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "analytics"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."ghl_credentials" ADD CONSTRAINT "ghl_credentials_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "analytics"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."message_charges" ADD CONSTRAINT "message_charges_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "analytics"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."message_charges" ADD CONSTRAINT "message_charges_sender_phone_id_phone_numbers_id_fk" FOREIGN KEY ("sender_phone_id") REFERENCES "analytics"."phone_numbers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."messages_cache" ADD CONSTRAINT "messages_cache_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "analytics"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."messages_cache" ADD CONSTRAINT "messages_cache_sender_phone_id_phone_numbers_id_fk" FOREIGN KEY ("sender_phone_id") REFERENCES "analytics"."phone_numbers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."phone_numbers" ADD CONSTRAINT "phone_numbers_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "analytics"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."sync_runs" ADD CONSTRAINT "sync_runs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "analytics"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."sync_runs" ADD CONSTRAINT "sync_runs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."tags" ADD CONSTRAINT "tags_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "analytics"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "app"."audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "app"."audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_attempts_email_idx" ON "app"."login_attempts" USING btree (lower("email"),"created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_idx" ON "app"."login_attempts" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "app"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "app"."sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "app"."users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "charge_attributions_event_idx" ON "analytics"."charge_attributions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "contact_tag_history_lookup_idx" ON "analytics"."contact_tag_history" USING btree ("location_id","contact_id","tag_name_normalized");--> statement-breakpoint
CREATE INDEX "contacts_cache_tags_gin" ON "analytics"."contacts_cache" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "conversations_cache_contact_idx" ON "analytics"."conversations_cache" USING btree ("location_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_tags_location_tag_uq" ON "analytics"."event_tags" USING btree ("location_id","tag_name_normalized");--> statement-breakpoint
CREATE INDEX "events_location_window_idx" ON "analytics"."events" USING btree ("location_id","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_credentials_kind_location_uq" ON "analytics"."ghl_credentials" USING btree ("kind",coalesce("location_id", ''));--> statement-breakpoint
CREATE UNIQUE INDEX "message_charges_source_external_uq" ON "analytics"."message_charges" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "message_charges_day_idx" ON "analytics"."message_charges" USING btree ("location_id","day_lima");--> statement-breakpoint
CREATE INDEX "message_charges_contact_idx" ON "analytics"."message_charges" USING btree ("location_id","contact_id","settled_at");--> statement-breakpoint
CREATE INDEX "message_charges_resolution_idx" ON "analytics"."message_charges" USING btree ("resolution");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_cache_alt_id_uq" ON "analytics"."messages_cache" USING btree ("alt_id");--> statement-breakpoint
CREATE INDEX "messages_cache_conversation_idx" ON "analytics"."messages_cache" USING btree ("conversation_id","sent_at");--> statement-breakpoint
CREATE INDEX "messages_cache_contact_idx" ON "analytics"."messages_cache" USING btree ("location_id","contact_id","sent_at");--> statement-breakpoint
CREATE INDEX "messages_cache_day_idx" ON "analytics"."messages_cache" USING btree ("location_id","day_lima");--> statement-breakpoint
CREATE UNIQUE INDEX "phone_numbers_location_phone_uq" ON "analytics"."phone_numbers" USING btree ("location_id","phone_e164");--> statement-breakpoint
CREATE INDEX "sync_runs_kind_created_idx" ON "analytics"."sync_runs" USING btree ("kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_location_name_uq" ON "analytics"."tags" USING btree ("location_id","name_normalized");