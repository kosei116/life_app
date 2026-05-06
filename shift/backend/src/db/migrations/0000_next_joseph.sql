CREATE TABLE IF NOT EXISTS "monthly_targets" (
	"year_month" text PRIMARY KEY NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workplace_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"rate_override" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workplaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"hourly_rate" integer NOT NULL,
	"break_threshold_minutes" integer DEFAULT 360 NOT NULL,
	"break_minutes" integer DEFAULT 60 NOT NULL,
	"night_start_hour" integer DEFAULT 22 NOT NULL,
	"night_end_hour" integer DEFAULT 5 NOT NULL,
	"night_multiplier" numeric(4, 2) DEFAULT '1.25' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shifts" ADD CONSTRAINT "shifts_workplace_id_workplaces_id_fk" FOREIGN KEY ("workplace_id") REFERENCES "public"."workplaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_shifts_start_at" ON "shifts" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_shifts_workplace" ON "shifts" USING btree ("workplace_id");