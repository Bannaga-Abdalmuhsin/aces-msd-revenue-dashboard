import { Router, type IRouter } from "express";
import { eq, sql, desc, and, like } from "drizzle-orm";
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

interface ProjectFilter {
  project?: string | null;
  revenueYear?: number | null;
  revenueMonth?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

async function buildProjectSummaries(filterProjectId?: number, filter?: ProjectFilter) {
  const today = new Date();

  // Date/range conditions applied to the LEFT JOIN ON clause so that projects
  // with no matching revenue records still appear with zero totals (not excluded).
  const joinConds: ReturnType<typeof sql>[] = [];
  if (filter?.revenueYear) {
    joinConds.push(sql`EXTRACT(YEAR FROM ${revenueRecordsTable.revenueMonth}) = ${filter.revenueYear}`);
  }
  if (filter?.revenueMonth) {
    joinConds.push(sql`EXTRACT(MONTH FROM ${revenueRecordsTable.revenueMonth}) = ${filter.revenueMonth}`);
  }
  if (filter?.dateFrom) {
    const from = `${filter.dateFrom}-01`;
    joinConds.push(sql`${revenueRecordsTable.revenueMonth} >= ${from}::date`);
  }
  if (filter?.dateTo) {
    const to = `${filter.dateTo}-01`;
    joinConds.push(sql`${revenueRecordsTable.revenueMonth} <= (DATE_TRUNC('month', ${to}::date) + INTERVAL '1 month - 1 day')::date`);
  }

  const joinCondition = and(
    eq(revenueRecordsTable.projectId, projectsTable.id),
    ...(joinConds as any[]),
  );

  // WHERE conditions: filter project rows by id or exact name
  const whereParts = [];
  if (filterProjectId != null) whereParts.push(eq(projectsTable.id, filterProjectId));
  if (filter?.project) whereParts.push(eq(projectsTable.name, filter.project));

  const rows = await db
    .select({
      id: projectsTable.id,
      name: projectsTable.name,
      status: projectsTable.status,
      contractStart: projectsTable.contractStart,
      contractEnd: projectsTable.contractEnd,
      poValueOverride: projectsTable.poValue,
      expectedMonthlyRevenueOverride: projectsTable.expectedMonthlyRevenue,
      totalWorkOrder: sql<string>`COALESCE(SUM(${revenueRecordsTable.workOrder}), 0)`,
      totalRevenue: sql<string>`COALESCE(SUM(${revenueRecordsTable.revenue}), 0)`,
      totalDeductible: sql<string>`COALESCE(SUM(${revenueRecordsTable.deductible}), 0)`,
      totalInvoiced: sql<string>`COALESCE(SUM(${revenueRecordsTable.invoiced}), 0)`,
      totalCollected: sql<string>`COALESCE(SUM(${revenueRecordsTable.collected}), 0)`,
      totalPenalties: sql<string>`COALESCE(SUM(${revenueRecordsTable.penalties}), 0)`,
      totalNetRevenue: sql<string>`COALESCE(SUM(${revenueRecordsTable.netRevenue}), 0)`,
      latestRevenueMonth: sql<string | null>`MAX(${revenueRecordsTable.revenueMonth})`,
      latestInvoiceDate: sql<string | null>`MAX(${revenueRecordsTable.invoiceDate})`,
      avgDays: sql<string | null>`AVG(CASE WHEN ${revenueRecordsTable.days} IS NOT NULL AND ${revenueRecordsTable.collected} > 0 THEN ${revenueRecordsTable.days} END)`,
    })
    .from(projectsTable)
    .leftJoin(revenueRecordsTable, joinCondition)
    .where(whereParts.length ? and(...whereParts) : undefined)
    .groupBy(
      projectsTable.id, projectsTable.name, projectsTable.status,
      projectsTable.contractStart, projectsTable.contractEnd,
      projectsTable.poValue, projectsTable.expectedMonthlyRevenue,
    )
    .orderBy(projectsTable.name);

  // For outstanding/overdue computation fetch filtered records individually
  const recordsConds = [];
  if (filterProjectId != null) recordsConds.push(eq(revenueRecordsTable.projectId, filterProjectId));
  if (filter?.project) recordsConds.push(eq(revenueRecordsTable.projectName, filter.project));
  if (filter?.revenueYear) {
    recordsConds.push(sql`EXTRACT(YEAR FROM ${revenueRecordsTable.revenueMonth}) = ${filter.revenueYear}`);
  }
  if (filter?.revenueMonth) {
    recordsConds.push(sql`EXTRACT(MONTH FROM ${revenueRecordsTable.revenueMonth}) = ${filter.revenueMonth}`);
  }
  if (filter?.dateFrom) {
    const from = `${filter.dateFrom}-01`;
    recordsConds.push(sql`${revenueRecordsTable.revenueMonth} >= ${from}::date`);
  }
  if (filter?.dateTo) {
    const to = `${filter.dateTo}-01`;
    recordsConds.push(sql`${revenueRecordsTable.revenueMonth} <= (DATE_TRUNC('month', ${to}::date) + INTERVAL '1 month - 1 day')::date`);
  }

  const allRecords = await db.select({
    projectId: revenueRecordsTable.projectId,
    invoiced: revenueRecordsTable.invoiced,
    collected: revenueRecordsTable.collected,
    dueDate: revenueRecordsTable.dueDate,
  }).from(revenueRecordsTable)
    .where(recordsConds.length ? and(...recordsConds) : undefined);

  const recordsByProject = new Map<number, Array<{ invoiced: number; collected: number; dueDate: string | null }>>();
  for (const r of allRecords) {
    if (r.projectId == null) continue;
    if (!recordsByProject.has(r.projectId)) recordsByProject.set(r.projectId, []);
    recordsByProject.get(r.projectId)!.push({
      invoiced: toNum(r.invoiced), collected: toNum(r.collected), dueDate: r.dueDate ?? null,
    });
  }

  return rows.map((row) => {
    const totalRevenue = toNum(row.totalRevenue);
    const totalInvoiced = toNum(row.totalInvoiced);
    const totalCollected = toNum(row.totalCollected);
    // poValue = total work order from revenue records (all-time contracted amount)
    const poValue = toNum(row.totalWorkOrder);
    // totalExpectedRevenue = same as poValue (all work orders = expected revenue to date)
    const totalExpectedRevenue = poValue;
    // expectedMonthlyRevenue = keep user-editable override if set, else not shown
    const expectedMonthlyRevenue = toNum(row.expectedMonthlyRevenueOverride ?? '0');

    const recs = recordsByProject.get(row.id) ?? [];
    let totalOutstanding = 0, totalOverdue = 0;
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
      poValue,
      expectedMonthlyRevenue,
      totalExpectedRevenue,
      remainingPO: Math.max(poValue - totalRevenue, 0),
      totalWorkOrder: toNum(row.totalWorkOrder),
      totalRevenue,
      totalDeductible: toNum(row.totalDeductible),
      totalInvoiced,
      totalCollected,
      totalOutstanding,
      totalOverdue,
      totalPenalties: toNum(row.totalPenalties),
      totalNetRevenue: toNum(row.totalNetRevenue),
      revenueAchievementPct: safeDiv(totalRevenue, totalExpectedRevenue || toNum(row.totalWorkOrder)) * 100,
      collectionPct: safeDiv(totalCollected, totalInvoiced) * 100,
      avgCollectionDays: row.avgDays ? toNum(row.avgDays) : 0,
      latestRevenueMonth: row.latestRevenueMonth ?? null,
      latestInvoiceDate: row.latestInvoiceDate ?? null,
    };
  });
}

// GET /projects
router.get("/projects", async (req, res): Promise<void> => {
  const q = req.query as Record<string, string>;
  const filter: ProjectFilter = {
    project: q.project || null,
    revenueYear: q.revenueYear ? Number(q.revenueYear) : null,
    revenueMonth: q.revenueMonth ? Number(q.revenueMonth) : null,
    dateFrom: q.dateFrom || null,
    dateTo: q.dateTo || null,
  };
  const summaries = await buildProjectSummaries(undefined, filter);
  res.json(summaries);
});

// POST /projects
router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const b = parsed.data as any;
  const [project] = await db.insert(projectsTable).values({
    name: b.name, status: b.status,
    contractStart: b.contractStart ?? null, contractEnd: b.contractEnd ?? null,
    poValue: String(b.poValue ?? 0),
    expectedMonthlyRevenue: String(b.expectedMonthlyRevenue ?? 0),
  }).returning();
  await logAudit("create", "projects", project.id, null, project);
  res.status(201).json(serializeProject(project));
});

// GET /projects/:id
router.get("/projects/:id", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const summaries = await buildProjectSummaries(params.data.id);
  if (!summaries.length) { res.status(404).json({ error: "Project not found" }); return; }
  const project = summaries[0];

  const monthlyRows = await db.select({
    month: sql<string>`TO_CHAR(${revenueRecordsTable.revenueMonth}::date, 'YYYY-MM')`,
    workOrder: sql<string>`SUM(${revenueRecordsTable.workOrder}::numeric)`,
    revenue: sql<string>`SUM(${revenueRecordsTable.revenue}::numeric)`,
    invoiced: sql<string>`SUM(${revenueRecordsTable.invoiced}::numeric)`,
    collected: sql<string>`SUM(${revenueRecordsTable.collected}::numeric)`,
    netRevenue: sql<string>`SUM(${revenueRecordsTable.netRevenue}::numeric)`,
  }).from(revenueRecordsTable)
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
  const records = await db.select().from(revenueRecordsTable)
    .where(eq(revenueRecordsTable.projectId, params.data.id))
    .orderBy(desc(revenueRecordsTable.revenueMonth));

  res.json({ project, monthlyTrend, records: records.map((r) => enrichRecord(r, today)) });
});

// PATCH /projects/:id
router.patch("/projects/:id", async (req, res): Promise<void> => {
  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateProjectBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [existing] = await db.select().from(projectsTable).where(eq(projectsTable.id, params.data.id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Project not found" }); return; }

  const updates: Partial<typeof projectsTable.$inferInsert> = {};
  const b = body.data as any;
  if (b.name != null) updates.name = b.name;
  if (b.status != null) updates.status = b.status;
  if ("contractStart" in b) updates.contractStart = b.contractStart ?? null;
  if ("contractEnd" in b) updates.contractEnd = b.contractEnd ?? null;
  if (b.poValue != null) updates.poValue = String(b.poValue);
  if (b.expectedMonthlyRevenue != null) updates.expectedMonthlyRevenue = String(b.expectedMonthlyRevenue);

  const [updated] = await db.update(projectsTable).set(updates).where(eq(projectsTable.id, params.data.id)).returning();
  await logAudit("update", "projects", params.data.id, existing, updated);
  res.json(serializeProject(updated));
});

// DELETE /projects/:id
router.delete("/projects/:id", async (req, res): Promise<void> => {
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [deleted] = await db.delete(projectsTable).where(eq(projectsTable.id, params.data.id)).returning();
  if (!deleted) { res.status(404).json({ error: "Project not found" }); return; }
  await logAudit("delete", "projects", params.data.id, deleted, null);
  res.sendStatus(204);
});

function serializeProject(p: typeof projectsTable.$inferSelect) {
  return {
    ...p,
    poValue: toNum(p.poValue),
    expectedMonthlyRevenue: toNum(p.expectedMonthlyRevenue),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export default router;
