import { Router, type IRouter } from "express";
import { desc, sql } from "drizzle-orm";
import { db, auditLogsTable } from "@workspace/db";
import { ListAuditLogsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/audit-logs", async (req, res): Promise<void> => {
  const parsed = ListAuditLogsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const q = parsed.data;
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 50;
  const offset = (page - 1) * pageSize;

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(auditLogsTable)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogsTable),
  ]);

  res.json({
    data: rows.map((r) => ({
      id: r.id,
      user: r.user ?? null,
      action: r.action,
      tableName: r.tableName,
      recordId: r.recordId ?? null,
      previousValue: r.previousValue ?? null,
      newValue: r.newValue ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total: countResult[0]?.count ?? 0,
    page,
    pageSize,
  });
});

export default router;
