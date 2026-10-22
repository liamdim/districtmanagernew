CREATE TABLE "activities" (
	"id" text PRIMARY KEY,
	"group_id" text NOT NULL,
	"section" text NOT NULL,
	"title" text NOT NULL,
	"duration" text DEFAULT '' NOT NULL,
	"badge" text DEFAULT 'Scout Skill' NOT NULL,
	"equip" text DEFAULT 'Standard gear' NOT NULL,
	"desc" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"member_id" text,
	"date" date,
	"status" text NOT NULL,
	CONSTRAINT "attendance_pkey" PRIMARY KEY("member_id","date")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY,
	"group_id" text NOT NULL,
	"title" text NOT NULL,
	"date" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"cost" text DEFAULT '' NOT NULL,
	"leader" text DEFAULT '' NOT NULL,
	"permit" text DEFAULT 'Nights Away Permit Approved' NOT NULL,
	"desc" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"charity_no" text DEFAULT 'Pending' NOT NULL,
	"hq" text DEFAULT '' NOT NULL,
	"gsl" text DEFAULT '' NOT NULL,
	"bank_name" text DEFAULT '' NOT NULL,
	"account_name" text DEFAULT '' NOT NULL,
	"sort_code" text DEFAULT '' NOT NULL,
	"account_number" text DEFAULT '' NOT NULL,
	"settlement_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY,
	"group_id" text NOT NULL,
	"section" text NOT NULL,
	"parent_user_id" text,
	"parent_email" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"patrol" text DEFAULT '' NOT NULL,
	"dob" text DEFAULT '' NOT NULL,
	"school" text DEFAULT 'Not specified' NOT NULL,
	"parent" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"address" text DEFAULT 'Recorded on file' NOT NULL,
	"gift_aid" boolean DEFAULT false NOT NULL,
	"gift_aid_date" text DEFAULT 'No' NOT NULL,
	"nhs" text DEFAULT 'Pending' NOT NULL,
	"gp" text DEFAULT 'Local Health Centre' NOT NULL,
	"medical" text DEFAULT 'None' NOT NULL,
	"allergies" text DEFAULT 'None reported' NOT NULL,
	"alert" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"left_date" text,
	"left_reason" text,
	"badge_progress" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY,
	"group_id" text NOT NULL,
	"section" text,
	"sender_user_id" text NOT NULL,
	"sender" text NOT NULL,
	"audience" text NOT NULL,
	"member_id" text,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY,
	"email" text NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT 'TBC' NOT NULL,
	"account_type" text DEFAULT 'parent' NOT NULL,
	"group_id" text,
	"section" text,
	"leader_title" text DEFAULT 'Section Leader' NOT NULL,
	"leader_approved" boolean DEFAULT false NOT NULL,
	"all_sections_access" boolean DEFAULT false NOT NULL,
	"leader_sections" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programme" (
	"id" text PRIMARY KEY,
	"group_id" text NOT NULL,
	"section" text NOT NULL,
	"date" text NOT NULL,
	"title" text NOT NULL,
	"lead" text DEFAULT 'Section Leader' NOT NULL,
	"activities_linked" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"age" text DEFAULT '' NOT NULL,
	"unit_term" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '#059669' NOT NULL,
	"price" text DEFAULT '£40.00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_member_id_members_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_section_sections_id_fkey" FOREIGN KEY ("section") REFERENCES "sections"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_member_id_members_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_section_sections_id_fkey" FOREIGN KEY ("section") REFERENCES "sections"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "programme" ADD CONSTRAINT "programme_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;