DROP INDEX "analytics"."messages_cache_alt_id_uq";--> statement-breakpoint
CREATE INDEX "messages_cache_alt_id_idx" ON "analytics"."messages_cache" USING btree ("alt_id");