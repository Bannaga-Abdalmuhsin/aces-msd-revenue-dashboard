import { pgTable, serial, text, date, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const revenueRecordsTable = pgTable("revenue_records", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projectsTable.id, {
    onDelete: "set null",
  }),
  projectName: text("project_name").notNull(),
  revenueMonth: date("revenue_month", { mode: "string" }).notNull(),
  workOrder: numeric("work_order", { precision: 20, scale: 4 }).notNull().default("0"),
  revenue: numeric("revenue", { precision: 20, scale: 4 }).notNull().default("0"),
  deductible: numeric("deductible", { precision: 20, scale: 4 }).notNull().default("0"),
  invoiced: numeric("invoiced", { precision: 20, scale: 4 }).notNull().default("0"),
  invoiceDate: date("invoice_date", { mode: "string" }),
  invoiceNo: text("invoice_no"),
  dueDate: date("due_date", { mode: "string" }),
  collected: numeric("collected", { precision: 20, scale: 4 }).notNull().default("0"),
  collectedDate: date("collected_date", { mode: "string" }),
  days: integer("days"),
  penalties: numeric("penalties", { precision: 20, scale: 4 }).notNull().default("0"),
  netRevenue: numeric("net_revenue", { precision: 20, scale: 4 }).notNull().default("0"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const projectsRelations = relations(projectsTable, ({ many }) => ({
  records: many(revenueRecordsTable),
}));

export const revenueRecordsRelations = relations(revenueRecordsTable, ({ one }) => ({
  project: one(projectsTable, {
    fields: [revenueRecordsTable.projectId],
    references: [projectsTable.id],
  }),
}));

export const insertRevenueRecordSchema = createInsertSchema(revenueRecordsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRevenueRecord = z.infer<typeof insertRevenueRecordSchema>;
export type RevenueRecord = typeof revenueRecordsTable.$inferSelect;
