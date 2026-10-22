CREATE TABLE "leader_roles" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "leader_roles" ("id", "name") VALUES
  ('role-gsl', 'Group Lead Volunteer'),
  ('role-sl', 'Section Leader'),
  ('role-asl', 'Assistant Section Leader'),
  ('role-ya', 'Young Leader'),
  ('role-helper', 'Parent Helper'),
  ('role-treasurer', 'Treasurer'),
  ('role-qm', 'Quartermaster')
ON CONFLICT DO NOTHING;
