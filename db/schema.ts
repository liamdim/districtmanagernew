import { pgTable, text, boolean, jsonb, timestamp, date, primaryKey } from "drizzle-orm/pg-core";

const id = () => text().primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at").defaultNow().notNull();

export const groups = pgTable("groups", {
  id: id(),
  name: text().notNull(),
  charityNo: text("charity_no").notNull().default("Pending"),
  hq: text().notNull().default(""),
  gsl: text().notNull().default(""),
  bankName: text("bank_name").notNull().default(""),
  accountName: text("account_name").notNull().default(""),
  sortCode: text("sort_code").notNull().default(""),
  accountNumber: text("account_number").notNull().default(""),
  settlementNotes: text("settlement_notes").notNull().default(""),
  createdAt: createdAt(),
});

export const sections = pgTable("sections", {
  id: text().primaryKey(),
  name: text().notNull(),
  age: text().notNull().default(""),
  unitTerm: text("unit_term").notNull().default(""),
  color: text().notNull().default("#059669"),
  price: text().notNull().default("£40.00"),
  createdAt: createdAt(),
});

// One row per signed-up person, keyed by their Netlify Identity user id.
// Admin rights come from the Identity "admin" role, not from this table.
export const profiles = pgTable("profiles", {
  userId: text("user_id").primaryKey(),
  email: text().notNull(),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  phone: text().notNull().default("TBC"),
  accountType: text("account_type").notNull().default("parent"), // 'parent' | 'leader'
  groupId: text("group_id").references(() => groups.id, { onDelete: "set null" }),
  section: text().references(() => sections.id, { onDelete: "set null" }),
  leaderTitle: text("leader_title").notNull().default("Section Leader"),
  leaderApproved: boolean("leader_approved").notNull().default(false),
  allSectionsAccess: boolean("all_sections_access").notNull().default(false),
  leaderSections: jsonb("leader_sections").$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
});

export const members = pgTable("members", {
  id: id(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  section: text().notNull().references(() => sections.id, { onDelete: "cascade" }),
  parentUserId: text("parent_user_id"),
  parentEmail: text("parent_email"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  patrol: text().notNull().default(""),
  dob: text().notNull().default(""),
  school: text().notNull().default("Not specified"),
  parent: text().notNull().default(""),
  phone: text().notNull().default(""),
  address: text().notNull().default("Recorded on file"),
  giftAid: boolean("gift_aid").notNull().default(false),
  giftAidDate: text("gift_aid_date").notNull().default("No"),
  nhs: text().notNull().default("Pending"),
  gp: text().notNull().default("Local Health Centre"),
  medical: text().notNull().default("None"),
  allergies: text().notNull().default("None reported"),
  alert: boolean().notNull().default(false),
  status: text().notNull().default("Active"), // 'Active' | 'Left'
  leftDate: text("left_date"),
  leftReason: text("left_reason"),
  badgeProgress: jsonb("badge_progress").$type<Record<string, boolean[]>>().notNull().default({}),
  createdAt: createdAt(),
});

export const attendance = pgTable(
  "attendance",
  {
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    date: date().notNull(),
    status: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.date] })],
);

export const activities = pgTable("activities", {
  id: id(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  section: text().notNull(),
  title: text().notNull(),
  duration: text().notNull().default(""),
  badge: text().notNull().default("Scout Skill"),
  equip: text().notNull().default("Standard gear"),
  desc: text().notNull().default(""),
  createdAt: createdAt(),
});

export const programme = pgTable("programme", {
  id: id(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  section: text().notNull(),
  date: text().notNull(),
  title: text().notNull(),
  lead: text().notNull().default("Section Leader"),
  activitiesLinked: jsonb("activities_linked").$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
});

export const events = pgTable("events", {
  id: id(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  title: text().notNull(),
  date: text().notNull(),
  location: text().notNull().default(""),
  cost: text().notNull().default(""),
  leader: text().notNull().default(""),
  permit: text().notNull().default("Nights Away Permit Approved"),
  desc: text().notNull().default(""),
  createdAt: createdAt(),
});

export const messages = pgTable("messages", {
  id: id(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  section: text(),
  senderUserId: text("sender_user_id").notNull(),
  sender: text().notNull(),
  audience: text().notNull(), // 'parents' | 'leaders' | 'member'
  memberId: text("member_id").references(() => members.id, { onDelete: "cascade" }),
  recipient: text().notNull(),
  subject: text().notNull(),
  body: text().notNull(),
  createdAt: createdAt(),
});
