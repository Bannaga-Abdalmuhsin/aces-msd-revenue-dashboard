import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  user: text("user"),
  action: text("action").notNull(),
  tableName: text("table_name").notNull(),
  recordId: integer("record_id"),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
