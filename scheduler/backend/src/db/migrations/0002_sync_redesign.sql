DROP TABLE "sync_queue" CASCADE;--> statement-breakpoint
ALTER TABLE "sync_mapping" ADD COLUMN "content_hash" text;