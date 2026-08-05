import { db, auditLogsTable } from "@workspace/db";

export async function logAudit(
  action: string,
  tableName: string,
  recordId: number | null,
  previousValue?: unknown,
  newValue?: unknown,
  user?: string,
) {
  try {
    await db.insert(auditLogsTable).values({
      user: user ?? "system",
      action,
      tableName,
      recordId,
      previousValue: previousValue != null ? JSON.stringify(previousValue) : null,
      newValue: newValue != null ? JSON.stringify(newValue) : null,
    });
  } catch {
    // Non-critical – don't let audit failures block the main operation
  }
}
