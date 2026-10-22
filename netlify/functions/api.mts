import type { Config } from "@netlify/functions";
import { getUser, admin, verifyRequestOrigin, type User } from "@netlify/identity";
import { and, asc, desc, eq, inArray, or, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  activities,
  attendance,
  events,
  groups,
  leaderRoles,
  members,
  messages,
  profiles,
  programme,
  sections,
} from "../../db/schema.js";

type Profile = typeof profiles.$inferSelect;
type Member = typeof members.$inferSelect;

type Session = {
  user: User;
  profile: Profile;
  isAdmin: boolean;
  isLeader: boolean; // approved leader
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};

// --- Input helpers ---

const str = (v: unknown, max = 500): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const reqStr = (v: unknown, field: string, max = 500): string => str(v, max) || fail(422, `${field} is required.`);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 50) : []);
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// --- Session & access rules ---

async function loadSession(): Promise<Session> {
  const user = await getUser();
  if (!user) fail(401, "Please sign in.");
  const u = user!;
  const isAdmin = (u.roles ?? []).includes("admin");

  let [profile] = await db.select().from(profiles).where(eq(profiles.userId, u.id));
  if (!profile) profile = await createProfileFromSignup(u);

  return { user: u, profile, isAdmin, isLeader: profile.accountType === "leader" && profile.leaderApproved };
}

// Registration details are stored on the Identity user at sign-up, so the profile can be
// created on first sign-in even when the person had to confirm their email first.
async function createProfileFromSignup(user: User): Promise<Profile> {
  const meta = user.userMetadata ?? {};
  const [firstGroup] = await db.select({ id: groups.id }).from(groups).orderBy(asc(groups.createdAt)).limit(1);
  const [firstSection] = await db.select({ id: sections.id }).from(sections).orderBy(asc(sections.createdAt)).limit(1);

  const groupId = (await groupExists(str(meta.group_id))) ? str(meta.group_id) : firstGroup?.id ?? null;
  const section = (await sectionExists(str(meta.section))) ? str(meta.section) : firstSection?.id ?? null;
  const accountType = meta.account_type === "leader" ? "leader" : "parent";

  const [created] = await db
    .insert(profiles)
    .values({
      userId: user.id,
      email: user.email ?? "",
      firstName: str(meta.first_name, 100),
      lastName: str(meta.last_name, 100),
      accountType,
      groupId,
      section,
      leaderSections: section ? [section] : [],
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;
  const [existing] = await db.select().from(profiles).where(eq(profiles.userId, user.id));
  return existing;
}

async function groupExists(id: string) {
  if (!id) return false;
  const [g] = await db.select({ id: groups.id }).from(groups).where(eq(groups.id, id));
  return !!g;
}

async function sectionExists(id: string) {
  if (!id) return false;
  const [s] = await db.select({ id: sections.id }).from(sections).where(eq(sections.id, id));
  return !!s;
}

const requireAdmin = (s: Session) => {
  if (!s.isAdmin) fail(403, "Only Super Admins can do this.");
};

const requireStaff = (s: Session) => {
  if (!s.isAdmin && !s.isLeader) fail(403, "Only approved leaders can do this.");
};

// Group the request acts on: admins pick any group, everyone else is pinned to their own.
async function resolveGroup(s: Session, requested: string | null): Promise<string> {
  if (s.isAdmin && requested && (await groupExists(requested))) return requested;
  if (s.profile.groupId) return s.profile.groupId;
  if (s.isAdmin) {
    const [g] = await db.select({ id: groups.id }).from(groups).orderBy(asc(groups.createdAt)).limit(1);
    if (g) return g.id;
  }
  return fail(403, "Your account is not linked to a Scout Group.");
}

// Sections a leader may see; null means every section.
function leaderSectionScope(s: Session): string[] | null {
  if (s.isAdmin || s.profile.allSectionsAccess) return null;
  return s.profile.leaderSections;
}

function canManageMember(s: Session, m: Member): boolean {
  if (s.isAdmin) return true;
  if (!s.isLeader || m.groupId !== s.profile.groupId) return false;
  const scope = leaderSectionScope(s);
  return scope === null || scope.includes(m.section);
}

async function getManagedMember(s: Session, id: string): Promise<Member> {
  const [m] = await db.select().from(members).where(eq(members.id, id));
  if (!m || !canManageMember(s, m)) fail(404, "Member not found.");
  return m!;
}

// --- Response shaping (matches the shapes the front end already uses) ---

const toLeader = (p: Profile) => ({
  id: p.userId,
  groupId: p.groupId,
  name: `${p.firstName} ${p.lastName}`.trim() || p.email,
  role: p.leaderTitle,
  email: p.email,
  phone: p.phone,
  approved: p.leaderApproved,
  allSectionsAccess: p.allSectionsAccess,
  sections: p.leaderSections,
});

const toMember = (m: Member) => {
  const { createdAt, parentUserId, leftReason, ...rest } = m;
  return { ...rest, reason: leftReason };
};

const toProfile = (s: Session) => ({
  userId: s.user.id,
  email: s.profile.email,
  firstName: s.profile.firstName,
  lastName: s.profile.lastName,
  phone: s.profile.phone,
  userType: s.profile.accountType,
  groupId: s.profile.groupId,
  section: s.profile.section,
  leaderTitle: s.profile.leaderTitle,
  leaderApproved: s.profile.leaderApproved,
  allSectionsAccess: s.profile.allSectionsAccess,
  sections: s.profile.leaderSections,
  isAdmin: s.isAdmin,
});

// Everyone with an account (leaders and parents), as shown in Super Admin Settings.
const toPerson = (p: Profile, childCount: number) => ({
  ...toLeader(p),
  firstName: p.firstName,
  lastName: p.lastName,
  accountType: p.accountType,
  childCount,
});

const parsePrice = (v: unknown): string => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 100000) fail(422, "Please enter a valid price.");
  return `£${n.toFixed(2)}`;
};

const formatTimestamp = (d: Date) => d.toISOString().replace("T", " ").substring(0, 16);

// --- Handlers ---

async function getPublicDirectory() {
  const [g, sec] = await Promise.all([
    db.select({ id: groups.id, name: groups.name }).from(groups).orderBy(asc(groups.createdAt)),
    db.select().from(sections).orderBy(asc(sections.createdAt)),
  ]);
  return { groups: g, sections: sec.map(({ createdAt, ...rest }) => rest) };
}

async function getData(s: Session, url: URL) {
  const pendingLeader = s.profile.accountType === "leader" && !s.isLeader && !s.isAdmin;
  if (pendingLeader) return { profile: toProfile(s), pending: true };

  const groupId = await resolveGroup(s, url.searchParams.get("group"));
  const today = isDate(url.searchParams.get("date")) ? url.searchParams.get("date")! : new Date().toISOString().slice(0, 10);

  const allGroups = s.isAdmin
    ? await db.select().from(groups).orderBy(asc(groups.createdAt))
    : await db.select().from(groups).where(eq(groups.id, groupId));
  const sectionRows = await db.select().from(sections).orderBy(asc(sections.createdAt));

  // Members visible to this person
  let memberFilter;
  if (s.isAdmin) memberFilter = eq(members.groupId, groupId);
  else if (s.isLeader) {
    const scope = leaderSectionScope(s);
    memberFilter = scope === null
      ? eq(members.groupId, groupId)
      : and(eq(members.groupId, groupId), inArray(members.section, scope.length ? scope : ["__none__"]));
  } else memberFilter = eq(members.parentUserId, s.user.id);

  const memberRows = await db.select().from(members).where(memberFilter).orderBy(asc(members.createdAt));
  const active = memberRows.filter((m) => m.status !== "Left");
  const left = memberRows.filter((m) => m.status === "Left");
  const memberIds = memberRows.map((m) => m.id);

  const staff = s.isAdmin || s.isLeader;
  const leaderScope = leaderSectionScope(s);

  // Messages visible to this person
  let messageFilter;
  if (s.isAdmin) messageFilter = eq(messages.groupId, groupId);
  else if (s.isLeader) {
    messageFilter = and(
      eq(messages.groupId, groupId),
      leaderScope === null
        ? undefined
        : or(
            isNull(messages.section),
            inArray(messages.section, leaderScope.length ? leaderScope : ["__none__"]),
            eq(messages.senderUserId, s.user.id),
          ),
    );
  } else {
    const kidSections = [...new Set([...active.map((m) => m.section), s.profile.section ?? "__none__"])];
    messageFilter = and(
      eq(messages.groupId, groupId),
      or(
        eq(messages.senderUserId, s.user.id),
        and(eq(messages.audience, "parents"), or(isNull(messages.section), inArray(messages.section, kidSections))),
        memberIds.length ? and(eq(messages.audience, "member"), inArray(messages.memberId, memberIds)) : undefined,
      ),
    );
  }

  // Leaders only see activities and programme entries for the sections they've been given.
  const scopeList = leaderScope === null ? null : leaderScope.length ? leaderScope : ["__none__"];
  const activityFilter = s.isLeader && scopeList ? and(eq(activities.groupId, groupId), inArray(activities.section, scopeList)) : eq(activities.groupId, groupId);
  const programmeFilter = s.isLeader && scopeList ? and(eq(programme.groupId, groupId), inArray(programme.section, scopeList)) : eq(programme.groupId, groupId);

  const [activityRows, programmeRows, eventRows, messageRows, attendanceRows, peopleRows, roleRows] = await Promise.all([
    staff ? db.select().from(activities).where(activityFilter).orderBy(desc(activities.createdAt)) : [],
    db.select().from(programme).where(programmeFilter).orderBy(desc(programme.createdAt)),
    db.select().from(events).where(eq(events.groupId, groupId)).orderBy(desc(events.createdAt)),
    db.select().from(messages).where(messageFilter).orderBy(desc(messages.createdAt)),
    staff && memberIds.length
      ? db.select().from(attendance).where(and(eq(attendance.date, today), inArray(attendance.memberId, memberIds)))
      : [],
    s.isAdmin
      ? db.select().from(profiles).where(or(eq(profiles.groupId, groupId), isNull(profiles.groupId))).orderBy(asc(profiles.createdAt))
      : [],
    s.isAdmin ? db.select().from(leaderRoles).orderBy(asc(leaderRoles.name)) : [],
  ]);

  const childCounts = new Map<string, number>();
  if (s.isAdmin) {
    const linked = await db.select({ parentUserId: members.parentUserId }).from(members).where(eq(members.groupId, groupId));
    for (const r of linked) if (r.parentUserId) childCounts.set(r.parentUserId, (childCounts.get(r.parentUserId) ?? 0) + 1);
  }

  return {
    profile: toProfile(s),
    pending: false,
    currentGroupId: groupId,
    groups: allGroups.map((g) => ({
      id: g.id,
      name: g.name,
      charityNo: g.charityNo,
      hq: g.hq,
      gsl: g.gsl,
    })),
    sections: sectionRows.map(({ createdAt, price, ...rest }) => (s.isAdmin ? { ...rest, price } : rest)),
    sectionPricing: Object.fromEntries(sectionRows.map((sec) => [sec.id, sec.price])),
    bankDetails: (() => {
      const g = allGroups.find((x) => x.id === groupId);
      if (!s.isAdmin || !g) return null;
      return {
        bankName: g.bankName,
        accountName: g.accountName,
        sortCode: g.sortCode,
        accountNumber: g.accountNumber,
        settlementNotes: g.settlementNotes,
      };
    })(),
    leaders: peopleRows.filter((p) => p.accountType === "leader").map(toLeader),
    people: peopleRows.map((p) => toPerson(p, childCounts.get(p.userId) ?? 0)),
    leaderRoles: roleRows.map((r) => ({ id: r.id, name: r.name })),
    members: active.map(toMember),
    leftMembers: left.map(toMember),
    activities: activityRows.map(({ createdAt, groupId, ...rest }) => rest),
    programme: programmeRows.map(({ createdAt, groupId, ...rest }) => rest),
    events: eventRows.map(({ createdAt, ...rest }) => ({ ...rest, attendees: [] })),
    messages: messageRows.map((m) => ({
      id: m.id,
      sender: m.sender,
      recipient: m.recipient,
      subject: m.subject,
      body: m.body,
      timestamp: formatTimestamp(m.createdAt),
    })),
    attendance: Object.fromEntries(attendanceRows.map((a) => [a.memberId, a.status])),
    attendanceDate: today,
  };
}

async function updateOwnProfile(s: Session, body: any) {
  const updates: Partial<Profile> = {};
  if ("firstName" in body) updates.firstName = str(body.firstName, 100);
  if ("lastName" in body) updates.lastName = str(body.lastName, 100);
  if ("phone" in body) updates.phone = str(body.phone, 50) || "TBC";
  if ("leaderTitle" in body && s.profile.accountType === "leader") updates.leaderTitle = str(body.leaderTitle, 100) || "Section Leader";
  if (Object.keys(updates).length) await db.update(profiles).set(updates).where(eq(profiles.userId, s.user.id));
  return { ok: true };
}

async function createMember(s: Session, body: any) {
  const section = reqStr(body.section, "Section", 100);
  if (!(await sectionExists(section))) fail(422, "Unknown section.");

  const staff = s.isAdmin || s.isLeader;
  const groupId = staff ? await resolveGroup(s, str(body.groupId)) : s.profile.groupId ?? fail(403, "Your account is not linked to a Scout Group.");
  if (staff && !s.isAdmin) {
    const scope = leaderSectionScope(s);
    if (scope !== null && !scope.includes(section)) fail(403, "You don't have access to that section.");
  }

  const medical = str(body.medical, 2000);
  const giftAid = body.giftAid === true;
  const [m] = await db
    .insert(members)
    .values({
      groupId,
      section,
      // Enrolments from a parent account are linked to that parent so they can see their own child.
      parentUserId: staff ? null : s.user.id,
      parentEmail: staff ? str(body.parentEmail, 200) || null : s.profile.email,
      firstName: reqStr(body.firstName, "First name", 100),
      lastName: reqStr(body.lastName, "Last name", 100),
      patrol: str(body.patrol, 100),
      dob: str(body.dob, 20),
      school: str(body.school, 200) || "Not specified",
      parent: reqStr(body.parent, "Parent name", 200),
      phone: reqStr(body.phone, "Phone", 50),
      address: str(body.address, 500) || "Recorded on file",
      giftAid,
      giftAidDate: giftAid ? new Date().toISOString().split("T")[0] : "No",
      medical: medical || "None",
      alert: medical.length > 3 && medical.toLowerCase() !== "none",
    })
    .returning();
  return toMember(m);
}

async function updateMember(s: Session, id: string, body: any) {
  const m = await getManagedMember(s, id);
  const updates: Partial<Member> = {};

  if (body.badgeProgress && typeof body.badgeProgress === "object") {
    const progress: Record<string, boolean[]> = {};
    for (const [badgeId, stages] of Object.entries(body.badgeProgress)) {
      if (Array.isArray(stages)) progress[badgeId.slice(0, 100)] = stages.slice(0, 100).map(Boolean);
    }
    updates.badgeProgress = progress;
  }
  if (body.status === "Left") {
    updates.status = "Left";
    updates.leftDate = new Date().toISOString().split("T")[0];
    updates.leftReason = str(body.reason, 500) || "Not specified";
  } else if (body.status === "Active") {
    updates.status = "Active";
    updates.leftDate = null;
    updates.leftReason = null;
  }

  if (Object.keys(updates).length) await db.update(members).set(updates).where(eq(members.id, m.id));
  return { ok: true };
}

async function deleteMember(s: Session, id: string) {
  requireAdmin(s);
  await db.delete(members).where(eq(members.id, id));
  return { ok: true };
}

async function saveAttendance(s: Session, body: any) {
  requireStaff(s);
  const date = isDate(body.date) ? body.date : new Date().toISOString().slice(0, 10);
  const allowed = new Set(["Present", "Absent", "Late", "Explained"]);
  const entries: { memberId: string; status: string }[] = Array.isArray(body.entries) ? body.entries.slice(0, 500) : [];

  for (const e of entries) {
    if (!allowed.has(e?.status)) continue;
    const m = await getManagedMember(s, str(e.memberId, 100));
    await db
      .insert(attendance)
      .values({ memberId: m.id, date, status: e.status })
      .onConflictDoUpdate({ target: [attendance.memberId, attendance.date], set: { status: e.status } });
  }
  return { ok: true };
}

function requireSectionAccess(s: Session, section: string) {
  const scope = leaderSectionScope(s);
  if (scope !== null && !scope.includes(section)) fail(403, "You don't have access to that section.");
}

async function createActivity(s: Session, body: any) {
  requireStaff(s);
  const groupId = await resolveGroup(s, str(body.groupId));
  const section = reqStr(body.section, "Section", 100);
  requireSectionAccess(s, section);
  const [a] = await db
    .insert(activities)
    .values({
      groupId,
      section,
      title: reqStr(body.title, "Title", 200),
      duration: str(body.duration, 200),
      badge: str(body.badge, 200) || "Scout Skill",
      equip: str(body.equip, 500) || "Standard gear",
      desc: str(body.desc, 4000),
    })
    .returning();
  return a;
}

async function deleteActivity(s: Session, id: string) {
  requireStaff(s);
  const [a] = await db.select().from(activities).where(eq(activities.id, id));
  if (!a || (!s.isAdmin && a.groupId !== s.profile.groupId)) fail(404, "Activity not found.");
  requireSectionAccess(s, a!.section);
  await db.delete(activities).where(eq(activities.id, id));
  return { ok: true };
}

async function createProgrammeEntry(s: Session, body: any) {
  requireStaff(s);
  const groupId = await resolveGroup(s, str(body.groupId));
  const section = reqStr(body.section, "Section", 100);
  requireSectionAccess(s, section);
  const [p] = await db
    .insert(programme)
    .values({
      groupId,
      section,
      date: reqStr(body.date, "Date", 50),
      title: reqStr(body.title, "Title", 300),
      lead: str(body.lead, 200) || "Section Leader",
      activitiesLinked: strList(body.activitiesLinked),
    })
    .returning();
  return p;
}

async function createEvent(s: Session, body: any) {
  requireStaff(s);
  const groupId = await resolveGroup(s, str(body.groupId));
  const [e] = await db
    .insert(events)
    .values({
      groupId,
      title: reqStr(body.title, "Title", 200),
      date: reqStr(body.date, "Date", 100),
      location: reqStr(body.location, "Location", 300),
      cost: reqStr(body.cost, "Cost", 50),
      leader: reqStr(body.leader, "Leader", 200),
      desc: str(body.desc, 4000) || "Scout camp event.",
    })
    .returning();
  return e;
}

async function createMessage(s: Session, body: any) {
  const staff = s.isAdmin || s.isLeader;
  if (s.profile.accountType === "leader" && !staff) fail(403, "Your leader account is awaiting approval.");

  const groupId = await resolveGroup(s, str(body.groupId));
  let audience: string;
  let memberId: string | null = null;
  let section: string | null = str(body.section, 100) || null;

  if (!staff) {
    // Parents can only message their section leaders.
    audience = "leaders";
    const [kid] = await db.select().from(members).where(eq(members.parentUserId, s.user.id)).limit(1);
    section = kid?.section ?? s.profile.section;
  } else if (body.audience === "member") {
    const m = await getManagedMember(s, reqStr(body.memberId, "Recipient", 100));
    audience = "member";
    memberId = m.id;
    section = m.section;
  } else {
    audience = body.audience === "leaders" ? "leaders" : "parents";
  }

  const name = `${s.profile.firstName} ${s.profile.lastName}`.trim();
  const roleLabel = staff ? (s.isAdmin ? "Super Admin" : s.profile.leaderTitle) : "Parent";
  const [m] = await db
    .insert(messages)
    .values({
      groupId,
      section,
      senderUserId: s.user.id,
      sender: name ? `${name} (${roleLabel})` : roleLabel,
      audience,
      memberId,
      recipient: str(body.recipient, 300) || (audience === "leaders" ? "All Section Leaders" : "All Section Parents"),
      subject: reqStr(body.subject, "Subject", 300),
      body: reqStr(body.body, "Message", 10000),
    })
    .returning();
  return m;
}

async function createGroup(s: Session, body: any) {
  requireAdmin(s);
  const name = reqStr(body.name, "Group name", 200);
  const [g] = await db
    .insert(groups)
    .values({
      name,
      charityNo: str(body.charityNo, 50) || "Pending",
      hq: reqStr(body.hq, "HQ address", 300),
      gsl: reqStr(body.gsl, "GSL name", 200),
      accountName: name,
    })
    .returning();
  return { id: g.id, name: g.name, charityNo: g.charityNo, hq: g.hq, gsl: g.gsl };
}

async function updateGroup(s: Session, id: string, body: any) {
  requireAdmin(s);
  if (!(await groupExists(id))) fail(404, "Group not found.");
  const updates: Partial<typeof groups.$inferInsert> = {};
  if ("name" in body) updates.name = reqStr(body.name, "Group name", 200);
  if ("charityNo" in body) updates.charityNo = str(body.charityNo, 50) || "Pending";
  if ("hq" in body) updates.hq = str(body.hq, 300);
  if ("gsl" in body) updates.gsl = str(body.gsl, 200);
  if ("bankName" in body) updates.bankName = str(body.bankName, 200);
  if ("accountName" in body) updates.accountName = str(body.accountName, 200);
  if ("sortCode" in body) updates.sortCode = str(body.sortCode, 20);
  if ("accountNumber" in body) updates.accountNumber = str(body.accountNumber, 20);
  if ("settlementNotes" in body) updates.settlementNotes = str(body.settlementNotes, 1000);
  if (Object.keys(updates).length) await db.update(groups).set(updates).where(eq(groups.id, id));
  return { ok: true };
}

async function deleteGroup(s: Session, id: string) {
  requireAdmin(s);
  const all = await db.select({ id: groups.id }).from(groups);
  if (all.length <= 1) fail(422, "You must keep at least one Scout Group in the system.");
  await db.delete(groups).where(eq(groups.id, id));
  return { ok: true };
}

async function createSection(s: Session, body: any) {
  requireAdmin(s);
  const name = reqStr(body.name, "Section name", 100);
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, "") || fail(422, "Section name needs letters or numbers.");
  if (await sectionExists(id)) fail(409, "A section with that name already exists.");
  const [sec] = await db
    .insert(sections)
    .values({
      id,
      name,
      age: reqStr(body.age, "Age range", 50),
      unitTerm: str(body.unitTerm, 50),
      color: str(body.color, 20) || "#059669",
      ...(str(body.price) ? { price: parsePrice(body.price) } : {}),
    })
    .returning();
  return sec;
}

async function updateSection(s: Session, id: string, body: any) {
  requireAdmin(s);
  if (!(await sectionExists(id))) fail(404, "Section not found.");
  const updates: Partial<typeof sections.$inferInsert> = {};
  if ("name" in body) updates.name = reqStr(body.name, "Section name", 100);
  if ("age" in body) updates.age = reqStr(body.age, "Age range", 50);
  if ("unitTerm" in body) updates.unitTerm = str(body.unitTerm, 50);
  if ("color" in body) updates.color = str(body.color, 20) || "#059669";
  if ("price" in body) updates.price = parsePrice(body.price);
  if (Object.keys(updates).length) await db.update(sections).set(updates).where(eq(sections.id, id));
  return { ok: true };
}

async function updateSectionPricing(s: Session, body: any) {
  requireAdmin(s);
  const pricing = body.pricing && typeof body.pricing === "object" ? body.pricing : {};
  for (const [id, price] of Object.entries(pricing)) {
    await db.update(sections).set({ price: parsePrice(price) }).where(eq(sections.id, id));
  }
  return { ok: true };
}

async function deleteSection(s: Session, id: string) {
  requireAdmin(s);
  const all = await db.select({ id: sections.id }).from(sections);
  if (all.length <= 1) fail(422, "You must keep at least one active section.");
  await db.delete(sections).where(eq(sections.id, id));
  return { ok: true };
}

async function updatePerson(s: Session, userId: string, body: any) {
  requireAdmin(s);
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (!p) fail(404, "Account not found.");

  const updates: Partial<Profile> = {};
  if ("firstName" in body) updates.firstName = str(body.firstName, 100);
  if ("lastName" in body) updates.lastName = str(body.lastName, 100);
  if ("phone" in body) updates.phone = str(body.phone, 50) || "TBC";
  if (body.accountType === "leader" || body.accountType === "parent") updates.accountType = body.accountType;
  if ("groupId" in body) {
    const g = str(body.groupId, 100);
    if (g && !(await groupExists(g))) fail(422, "Unknown Scout Group.");
    updates.groupId = g || null;
  }
  if ("name" in body) {
    const [first, ...rest] = str(body.name, 200).split(/\s+/);
    updates.firstName = first ?? "";
    updates.lastName = rest.join(" ");
  }
  if ("role" in body) updates.leaderTitle = str(body.role, 100) || "Section Leader";
  if ("approved" in body) updates.leaderApproved = body.approved === true;
  if ("allSectionsAccess" in body) updates.allSectionsAccess = body.allSectionsAccess === true;
  if ("sections" in body) updates.leaderSections = strList(body.sections);

  const email = str(body.email, 200);
  const password = typeof body.password === "string" ? body.password : "";
  if (password && password.length < 6) fail(422, "Passwords need at least 6 characters.");
  if ((email && email !== p!.email) || password) {
    await admin.updateUser(userId, { ...(email && email !== p!.email ? { email } : {}), ...(password ? { password } : {}) });
    if (email) updates.email = email;
  }

  if (Object.keys(updates).length) await db.update(profiles).set(updates).where(eq(profiles.userId, userId));
  return { ok: true };
}

async function deletePerson(s: Session, userId: string) {
  requireAdmin(s);
  if (userId === s.user.id) fail(422, "You can't delete your own account.");
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (!p) fail(404, "Account not found.");

  // Children stay on the register; they're just no longer linked to this login.
  await db.update(members).set({ parentUserId: null }).where(eq(members.parentUserId, userId));
  await db.delete(profiles).where(eq(profiles.userId, userId));
  try {
    await admin.deleteUser(userId);
  } catch (err: any) {
    if (err?.status !== 404) throw err;
  }
  return { ok: true };
}

async function createLeaderRole(s: Session, body: any) {
  requireAdmin(s);
  const name = reqStr(body.name, "Role name", 100);
  const [existing] = await db.select().from(leaderRoles).where(eq(leaderRoles.name, name));
  if (existing) fail(409, "That role already exists.");
  const [r] = await db.insert(leaderRoles).values({ name }).returning();
  return { id: r.id, name: r.name };
}

async function deleteLeaderRole(s: Session, id: string) {
  requireAdmin(s);
  await db.delete(leaderRoles).where(eq(leaderRoles.id, id));
  return { ok: true };
}

// --- Router ---

export default async (req: Request) => {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const [resource, id] = parts;
  const method = req.method;

  try {
    if (resource === "directory" && method === "GET") return Response.json(await getPublicDirectory());

    if (method !== "GET") verifyRequestOrigin(req);
    const s = await loadSession();
    const body = method === "GET" || method === "DELETE" ? {} : await req.json().catch(() => ({}));

    const route = `${method} ${resource}${id ? "/:id" : ""}`;
    switch (route) {
      case "GET data": return Response.json(await getData(s, url));
      case "PATCH profile": return Response.json(await updateOwnProfile(s, body));
      case "POST members": return Response.json(await createMember(s, body), { status: 201 });
      case "PATCH members/:id": return Response.json(await updateMember(s, id, body));
      case "DELETE members/:id": return Response.json(await deleteMember(s, id));
      case "PUT attendance": return Response.json(await saveAttendance(s, body));
      case "POST activities": return Response.json(await createActivity(s, body), { status: 201 });
      case "DELETE activities/:id": return Response.json(await deleteActivity(s, id));
      case "POST programme": return Response.json(await createProgrammeEntry(s, body), { status: 201 });
      case "POST events": return Response.json(await createEvent(s, body), { status: 201 });
      case "POST messages": return Response.json(await createMessage(s, body), { status: 201 });
      case "POST groups": return Response.json(await createGroup(s, body), { status: 201 });
      case "PATCH groups/:id": return Response.json(await updateGroup(s, id, body));
      case "DELETE groups/:id": return Response.json(await deleteGroup(s, id));
      case "POST sections": return Response.json(await createSection(s, body), { status: 201 });
      case "PATCH sections": return Response.json(await updateSectionPricing(s, body));
      case "PATCH sections/:id": return Response.json(await updateSection(s, id, body));
      case "DELETE sections/:id": return Response.json(await deleteSection(s, id));
      case "PATCH leaders/:id":
      case "PATCH people/:id": return Response.json(await updatePerson(s, id, body));
      case "DELETE people/:id": return Response.json(await deletePerson(s, id));
      case "POST roles": return Response.json(await createLeaderRole(s, body), { status: 201 });
      case "DELETE roles/:id": return Response.json(await deleteLeaderRole(s, id));
      default: return Response.json({ error: "Not found" }, { status: 404 });
    }
  } catch (err: any) {
    const status = err instanceof HttpError ? err.status : typeof err?.status === "number" ? err.status : 500;
    if (status >= 500) console.error(err);
    return Response.json({ error: status >= 500 ? "Something went wrong. Please try again." : err.message }, { status });
  }
};

export const config: Config = {
  path: "/api/*",
};
