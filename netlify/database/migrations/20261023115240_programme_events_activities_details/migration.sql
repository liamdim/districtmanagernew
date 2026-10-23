CREATE TABLE "event_attendees" (
	"event_id" text,
	"member_id" text,
	"status" text DEFAULT 'Invited' NOT NULL,
	"consent_by" text DEFAULT '' NOT NULL,
	"consent_at" timestamp,
	"paid" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "event_attendees_pkey" PRIMARY KEY("event_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "location" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "tags" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "prep" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "risk" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "section" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "type" text DEFAULT 'Camp' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "end_date" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "start_time" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "end_time" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "meet_point" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "kit_list" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "capacity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "confirm_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "nights_away" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "published" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "programme" ADD COLUMN "start_time" text DEFAULT '18:30' NOT NULL;--> statement-breakpoint
ALTER TABLE "programme" ADD COLUMN "end_time" text DEFAULT '20:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "programme" ADD COLUMN "location" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "programme" ADD COLUMN "parent_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "programme" ADD COLUMN "leader_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "programme" ADD COLUMN "badges" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "programme" ADD COLUMN "helpers_needed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "programme" ADD COLUMN "visible_to_parents" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_event_id_events_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_member_id_members_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE;