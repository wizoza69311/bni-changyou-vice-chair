import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const actionItems = sqliteTable("action_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  owner: text("owner").notNull().default(""),
  dueDate: text("due_date").notNull().default(""),
  status: text("status", { enum: ["todo", "doing", "done"] }).notNull().default("todo"),
  meetingTitle: text("meeting_title").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const meetings = sqliteTable("meetings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceId: text("source_id").notNull().unique(),
  title: text("title").notNull(),
  meetingDate: text("meeting_date").notNull(),
  summary: text("summary").notNull(),
  decisions: text("decisions").notNull().default("[]"),
  actionCandidates: text("action_candidates").notNull().default("[]"),
  source: text("source").notNull().default("manual"),
  status: text("status", { enum: ["published"] }).notNull().default("published"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const practiceState = sqliteTable("practice_state", {
  id: integer("id").primaryKey(),
  renewals: text("renewals").notNull().default("[]"),
  tasks: text("tasks").notNull().default("[]"),
  updatedAt: text("updated_at").notNull(),
});

export const weeklyArchives = sqliteTable("weekly_archives", {
  id: integer("id").primaryKey({ autoIncrement:true }),
  meetingDate: text("meeting_date").notNull().unique(),
  title: text("title").notNull(),
  agenda: text("agenda").notNull().default("[]"),
  checked: text("checked").notNull().default("[]"),
  notes: text("notes").notNull().default(""),
  renewals: text("renewals").notNull().default("[]"),
  visitors: text("visitors").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const visitorState = sqliteTable("visitor_state", {
  id: integer("id").primaryKey(),
  visitors: text("visitors").notNull().default("[]"),
  updatedAt: text("updated_at").notNull(),
});

export const qualityState = sqliteTable("quality_state", {
  id: integer("id").primaryKey(),
  cases: text("cases").notNull().default("[]"),
  updatedAt: text("updated_at").notNull(),
});
export const attendanceState=sqliteTable("attendance_state",{id:integer("id").primaryKey(),records:text("records").notNull().default("[]"),updatedAt:text("updated_at").notNull()});

export const memberKpiState = sqliteTable("member_kpi_state", {
  member: text("member").primaryKey(),
  trainingPoints: integer("training_points"),
  visitorCount: integer("visitor_count"),
  oneToOneWeeklyAverage: real("one_to_one_weekly_average"),
  referralWeeklyAverage: real("referral_weekly_average"),
  referralTotal: integer("referral_total"),
  dreamReferralAmount: integer("dream_referral_amount"),
  updatedAt: text("updated_at").notNull(),
});

export const attendanceAlertAckState=sqliteTable("attendance_alert_ack_state",{id:integer("id").primaryKey(),acknowledgements:text("acknowledgements").notNull().default("[]"),updatedAt:text("updated_at").notNull()});
