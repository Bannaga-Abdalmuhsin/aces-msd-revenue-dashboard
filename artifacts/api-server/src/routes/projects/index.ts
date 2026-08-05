import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, projectsTable, revenueRecordsTable } from "@workspace/db";
import {
  CreateProjectBody,
  GetProjectParams,
  UpdateProjectParams,
  UpdateProjectBody,
  DeleteProjectParams,
} from "@workspace/api-zod";
import {
  toNum,
  safeDiv,
  enrichRecord,
  computeOutstanding,
  computeOverdue,
} from "../../lib/businessLogic";
import { logAudit } from "../../lib/audit";

const router: IRouter = Router();

async function buildProjectSummaries(filterProjectId?: number) {
  const today = new Date();

  const rows = await db
    .select({
      id: projectsTable.id,
      name: projectsTable.name,
      status: projectsTable.status,
      contractStart: projectsTable.contractStart,
      contractEnd: projectsTable.contractEnd,
      totalWorkOrder: sql<string>`COALESCE(SUM(${revenueRecordsTable.workOrder}::numeric), 0)`,
      totalRevenue: sql<string>`COALESCE(SUM(${revenueRecordsTable.revenue}::numeric), 0)`,
      totalDeductible: sql<string>`COALESCE(SUM(${revenueRecordsTable.deductible}::numeric), 0)`,
      totalInvoiced: sql<string>`COALESCE(SUM(${revenueRecordsTable.invoiced}::numeric), 0)`,
      totalCollected: sql<string>`COALESCE(SUM(${revenueRecordsTable.collected}::numeric), 0)`,
      totalPenalties: sql<string>`COALESCE(SUM(${revenueRecordsTable.penalties}::numeric), 0)`,
      totalNetRevenue: sql<string>`COALESCE(SUM(${revenueRecordsTable.netRevenue}::numeric), 0)`,
      latestRevenueMonth: sql<string | null>`MAX(${revenueRecordsTable.revenueMonth})`,
      latestInvoiceDate: sql<string | null>`MAX(${revenueRecordsTable.invoiceDate})`,
      avgDays: sql<string | null>`AVG(CASE WHEN ${revenueRecordsTable.days} IS NOT NULL AND ${revenueRecordsTable.collected}::numeric > 0 THEN ${revenueRecordsTable.days} END)`,
    })
    .from(projectsTable)
    .leftJoin(revenueRecordsTable, eq(revenueRecordsTable.projectId, projectsTable.id))
    .where(filterProjectId != null ? eq(projectsTable.id, filterProjectId) : undefined)
    .groupBy(
      projectsTable.id,
      projectsTable.name,
      projectsTable.status,
      projectsTable.contractStart,
      projectsTable.contractEnd,
    )
    .orderBy(projectsTable.name);

  // Per-record aggregates (outstanding, overdue)
  const allRecords = await db
    .select({
      projectId: revenueRecordsTable.projectId,
      invoiced: revenueRecordsTable.invoiced,
      collected: revenueRecordsTable.collected,
      dueDate: revenueRecordsTable.dueDate,
    })
    .from(revenueRecordsTable)
    .where(filterProjectId != null ? eq(revenueRecordsTable.projectId, filterProjectId) : undefined);

  type RecAgg = { invoiced: number; collected: number; dueDate: string | null };
  const recordsByProject = new Map<number, RecAgg[]>();
  for (const r of allRecords) {
    if (r.projectId == null) continue;
    if (!recordsByProject.has(r.projectId)) recordsByProject.set(r.projectId, []);
    recordsByProject.get(r.projectId)!.push({
      invoiced: toNum(r.invoiced),
      collected: toNum(r.collected),
      dueDate: r.dueDate ?? null,
    });
  }

  return rows.map((row) => {
    const totalWorkOrder = toNum(row.totalWorkOrder);
    const totalRevenue = toNum(row.totalRevenue);
    const totalDeductible = toNum(row.totalDeductible);
    const totalInvoiced = toNum(row.totalInvoiced);
    const totalCollected = toNum(row.totalCollected);
    const totalPenalties = toNum(row.totalPenalties);
    const totalNetRevenue = toNum(row.totalNetRevenue);
    const avgDays = row.avgDays ? toNum(row.avgDays) : 0;

    const recs = recordsByProject.get(row.id) ?? [];
    let totalOutstanding = 0;
    let totalOverdue = 0;

    for (const r of recs) {
      totalOutstanding += computeOutstanding(r.invoiced, r.collected);
      totalOverdue += computeOverdue(r.invoiced, r.collected, r.dueDate, today);
    }

    return {
      id: row.id,
      name: row.name,
      status: row.status,
      contractStart: row.contractStart ?? null,
      contractEnd: row.contractEnd ?? null,
      totalWorkOrder,
      totalRevenue,
      totalDeductible,
      totalInvoiced,
      totalCollected,
      totalOutstanding,
      totalOverdue,
      totalPenalties,
      totalNetRevenue,
      revenueAchievementPct: safeDiv(totalRevenue, totalWorkOrder) * 100,
      collectionPct: safeDiv(totalCollected, totalInvoiced) * 100,
      avgCollectionDays: avgDays,
      latestRevenueMonth: row.latestRevenueMonth ?? null,
      latestInvoiceDate: row.latestInvoiceDate ?? null,
    };
  });
}

// GET /projects
router.get("/projects", async (_req, res): Promise<void> => {
  const summaries = await buildProjectSummaries();
  res.json(summaries);
});

// POST /projects
router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const b = parsed.data as any;
  const [project] = await db
    .insert(projectsTable)
    .values({
      name: b.name,
      status: b.status,
      contractStart: b.contractStart ?? null,
      contractEnd: b.contractEnd ?? null,
    })
    .returning();
  await logAudit("create", "projects", project.id, null, project);
  res.status(201).json(serializeProject(project));
});

// GET /projects/:id
router.get("/projects/:id", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const summaries = await buildProjectSummaries(params.data.id);
  if (!summaries.length) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const project = summaries[0];

  const monthlyRows = await db
    .select({
      month: sql<string>`TO_CHAR(${revenueRecordsTable.revenueMonth}::date, 'YYYY-MM')`,
      workOrder: sql<string>`SUM(${revenueRecordsTable.workOrder}::numeric)`,
      revenue: sql<string>`SUM(${revenueRecordsTable.revenue}::numeric)`,
      invoiced: sql<string>`SUM(${revenueRecordsTable.invoiced}::numeric)`,
      collected: sql<string>`SUM(${revenueRecordsTable.collected}::numeric)`,
      netRevenue: sql<string>`SUM(${revenueRecordsTable.netRevenue}::numeric)`,
    })
    .from(revenueRecordsTable)
    .where(eq(revenueRecordsTable.projectId, params.data.id))
    .groupBy(sql`TO_CHAR(${revenueRecordsTable.revenueMonth}::date, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${revenueRecordsTable.revenueMonth}::date, 'YYYY-MM')`);

  const monthlyTrend = monthlyRows.map((r) => ({
    month: r.month,
    workOrder: toNum(r.workOrder),
    revenue: toNum(r.revenue),
    invoiced: toNum(r.invoiced),
    collected: toNum(r.collected),
    netRevenue: toNum(r.netRevenue),
  }));

  const today = new Date();
  const records = await db
    .select()
    .from(revenueRecordsTable)
    .where(eq(revenueRecordsTable.projectId, params.data.id))
    .orderBy(desc(revenueRecordsTable.revenueMonth));

  res.json({
    project,
    monthlyTrend,
    records: records.map((r) => enrichRecord(r, today)),
  });
});

// PATCH /projects/:id
router.patch("/projects/:id", async (req, res): Promise<void> => {
  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateProjectBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const updates: Partial<typeof projectsTable.$inferInsert> = {};
  const b = body.data as any;
  if (b.name != null) updates.name = b.name;
  if (b.status != null) updates.status = b.status;
  if ("contractStart" in b) updates.contractStart = b.contractStart ?? null;
  if ("contractEnd" in b) updates.contractEnd = b.contractEnd ?? null;

  const [updated] = await db
    .update(projectsTable)
    .set(updates)
    .where(eq(projectsTable.id, params.data.id))
    .returning();

  await logAudit("update", "projects", params.data.id, existing, updated);
  res.json(serializeProject(updated));
});

// DELETE /projects/:id
router.delete("/projects/:id", async (req, res): Promise<void> => {
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(projectsTable)
    .where(eq(projectsTable.id, params.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  await logAudit("delete", "projects", params.data.id, deleted, null);
  res.sendStatus(204);
});

function serializeProject(p: typeof projectsTable.$inferSelect) {
  return {
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export default router;
