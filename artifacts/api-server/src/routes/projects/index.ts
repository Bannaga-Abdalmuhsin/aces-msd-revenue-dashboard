import { Router, type IRouter } from "express";
import { eq, sql, desc, and, max } from "drizzle-orm";
import { db, projectsTable, revenueRecordsTable } from "@workspace/db";
import {
  CreateProjectBody,
  GetProjectParams,
  UpdateProjectParams,
  UpdateProjectBody,
  DeleteProjectParams,
} from "@workspace/api-zod";
import { enrichRecord, toNum, computeOutstanding, computeOverdue, safeDiv } from "../../lib/businessLogic";
import { logAudit } from "../../lib/audit";

const router: IRouter = Router();

async function buildProjectSummaries(projectId?: number) {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const rows = await db
    .select({
      id: projectsTable.id,
      name: projectsTable.name,
      status: projectsTable.status,
      contractStart: projectsTable.contractStart,
      contractEnd: projectsTable.contractEnd,
      totalWorkOrder: sql<string>`SUM(${revenueRecordsTable.workOrder}::numeric)`,
      totalRevenue: sql<string>`SUM(${revenueRecordsTable.revenue}::numeric)`,
      totalDeductible: sql<string>`SUM(${revenueRecordsTable.deductible}::numeric)`,
      totalInvoiced: sql<string>`SUM(${revenueRecordsTable.invoiced}::numeric)`,
      totalCollected: sql<string>`SUM(${revenueRecordsTable.collected}::numeric)`,
      totalPenalties: sql<string>`SUM(${revenueRecordsTable.penalties}::numeric)`,
      totalNetRevenue: sql<string>`SUM(${revenueRecordsTable.netRevenue}::numeric)`,
      latestRevenueMonth: sql<string | null>`MAX(${revenueRecordsTable.revenueMonth})`,
      latestInvoiceDate: sql<string | null>`MAX(${revenueRecordsTable.invoiceDate})`,
      avgDays: sql<string | null>`AVG(CASE WHEN ${revenueRecordsTable.days} IS NOT NULL AND ${revenueRecordsTable.collected}::numeric > 0 THEN ${revenueRecordsTable.days} END)`,
      // Outstanding: SUM of max(invoiced - collected, 0) - computed in JS since it's complex
      totalInvoicedSum: sql<string>`SUM(${revenueRecordsTable.invoiced}::numeric)`,
      totalCollectedSum: sql<string>`SUM(${revenueRecordsTable.collected}::numeric)`,
    })
    .from(projectsTable)
    .leftJoin(
      revenueRecordsTable,
      eq(revenueRecordsTable.projectId, projectsTable.id),
    )
    .where(projectId != null ? eq(projectsTable.id, projectId) : undefined)
    .groupBy(
      projectsTable.id,
      projectsTable.name,
      projectsTable.status,
      projectsTable.contractStart,
      projectsTable.contractEnd,
    )
    .orderBy(projectsTable.name);

  // For outstanding/overdue, we need per-record computation — fetch records and aggregate
  const recordsByProject = new Map<number, { invoiced: number; collected: number; dueDate: string | null }[]>();

  const allRecords = await db
    .select({
      projectId: revenueRecordsTable.projectId,
      invoiced: revenueRecordsTable.invoiced,
      collected: revenueRecordsTable.collected,
      dueDate: revenueRecordsTable.dueDate,
    })
    .from(revenueRecordsTable)
    .where(projectId != null ? eq(revenueRecordsTable.projectId, projectId) : undefined);

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
    const totalOutstanding = recs.reduce((s, r) => s + computeOutstanding(r.invoiced, r.collected), 0);
    const totalOverdue = recs.reduce((s, r) => s + computeOverdue(r.invoiced, r.collected, r.dueDate, today), 0);

    const revenueAchievementPct = safeDiv(totalRevenue, totalWorkOrder) * 100;
    const collectionPct = safeDiv(totalCollected, totalInvoiced) * 100;

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
      revenueAchievementPct,
      collectionPct,
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
  const [project] = await db
    .insert(projectsTable)
    .values({
      name: parsed.data.name,
      status: parsed.data.status,
      contractStart: parsed.data.contractStart ?? null,
      contractEnd: parsed.data.contractEnd ?? null,
    })
    .returning();
  await logAudit("create", "projects", project.id, null, project);
  res.status(201).json({
    ...project,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  });
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

  // Monthly trend
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
    .groupBy(
      sql`TO_CHAR(${revenueRecordsTable.revenueMonth}::date, 'YYYY-MM')`,
    )
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
  const b = body.data;
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
  res.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
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

export default router;
