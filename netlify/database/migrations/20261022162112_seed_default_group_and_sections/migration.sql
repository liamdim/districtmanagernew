-- Seed the group and sections the app shipped with, so the sign-up form has options on day one.
INSERT INTO "groups" ("id", "name", "charity_no", "hq", "gsl", "bank_name", "account_name", "sort_code", "account_number", "settlement_notes")
VALUES ('group-1', 'Wollescote Scout Group', '1104802', 'Scout hut Queensway DY99HB', 'Liam Dimmock',
        'Barclays Bank UK PLC', 'Wollescote Scout Group', '20-82-70', '48291048',
        'All direct subs, Gift Aid reclaims & event fees settle into this account.')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "sections" ("id", "name", "age", "unit_term", "color", "price") VALUES
  ('squirrels', 'Squirrels', '4-6', 'Drey', '#ef4444', '£30.00'),
  ('beavers', 'Beavers', '6-8', 'Lodge', '#06b6d4', '£35.00'),
  ('cubs', 'Cubs', '8-10½', 'Six', '#059669', '£40.00'),
  ('scouts', 'Scouts', '10½-14', 'Patrol', '#2563eb', '£45.00'),
  ('explorers', 'Explorers', '14-18', 'Unit', '#d97706', '£45.00')
ON CONFLICT ("id") DO NOTHING;
