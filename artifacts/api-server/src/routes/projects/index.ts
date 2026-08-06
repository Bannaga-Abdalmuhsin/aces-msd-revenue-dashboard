import { Router, type IRouter } from "express";
import { eq, sql, desc, and, like, inArray } from "drizzle-orm";
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
  makeMetricFilters,
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
  const mf = makeMetricFilters({
    dateFrom: filter?.dateFrom,
    dateTo: filter?.dateTo,
    revenueYear: filter?.revenueYear,
    revenueMonth: filter?.revenueMonth,
  });

  // Fetch all projects (metadata only — no revenue aggregation in SQL so we can
  // apply per-metric date filtering in JS)
  const whereParts = [];
  if (filterProjectId != null) whereParts.push(eq(projectsTable.id, filterProjectId));
  if (filter?.project) whereParts.push(eq(projectsTable.name, filter.project));

  const projectRows = await db
    .select({
      id: projectsTable.id,
      name: projectsTable.name,
      status: projectsTable.status,
      contractStart: projectsTable.contractStart,
      contractEnd: projectsTable.contractEnd,
      poValueOverride: projectsTable.poValue,
      expectedMonthlyRevenueOverride: projectsTable.expectedMonthlyRevenue,
    })
    .from(projectsTable)
    .where(whereParts.length ? and(...whereParts) : undefined)
    .orderBy(projectsTable.name);

  if (!projectRows.length) return [];

  // Fetch all revenue records for the matching projects — date filtering happens in JS
  const projectIds = projectRows.map(p => p.id);

  const allRecords = await db.select({
    projectId:     revenueRecordsTable.projectId,
    revenueMonth:  revenueRecordsTable.revenueMonth,
    invoiceDate:   revenueRecordsTable.invoiceDate,
    collectedDate: revenueRecordsTable.collectedDate,
    dueDate:       revenueRecordsTable.dueDate,
    workOrder:     revenueRecordsTable.workOrder,
    revenue:       revenueRecordsTable.revenue,
    deductible:    revenueRecordsTable.deductible,
    invoiced:      revenueRecordsTable.invoiced,
    collected:     revenueRecordsTable.collected,
    penalties:     revenueRecordsTable.penalties,
    netRevenue:    revenueRecordsTable.netRevenue,
    days:          revenueRecordsTable.days,
  }).from(revenueRecordsTable)
    .where(inArray(revenueRecordsTable.projectId, projectIds));

  // Aggregate per project with per-metric date filtering
  type ProjectAgg = {
    workOrder: number; revenue: number; deductible: number;
    invoiced: number; collected: number; outstanding: number; overdue: number;
    penalties: number; netRevenue: number;
    totalDays: number; daysCount: number;
    latestRevenueMonth: string | null; latestInvoiceDate: string | null;
  };
  const agg = new Map<number, ProjectAgg>();
  for (const pid of projectIds) {
    agg.set(pid, {
      workOrder: 0, revenue: 0, deductible: 0,
      invoiced: 0, collected: 0, outstanding: 0, overdue: 0,
      penalties: 0, netRevenue: 0,
      totalDays: 0, daysCount: 0,
      latestRevenueMonth: null, latestInvoiceDate: null,
    });
  }

  for (const r of allRecords) {
    if (r.projectId == null) continue;
    const a = agg.get(r.projectId);
    if (!a) continue;

    // Revenue / Work Order / Deductible / Penalties / NetRevenue → revenue_month
    if (mf.revenueOk(r.revenueMonth)) {
      a.workOrder  += toNum(r.workOrder);
      a.revenue    += toNum(r.revenue);
      a.deductible += toNum(r.deductible);
      a.penalties  += toNum(r.penalties);
      a.netRevenue += toNum(r.netRevenue);
      if (r.revenueMonth && (!a.latestRevenueMonth || r.revenueMonth > a.latestRevenueMonth))
        a.latestRevenueMonth = r.revenueMonth;
    }

    // Invoiced → invoice_date when range active
    if (mf.invoicedOk(r.revenueMonth, r.invoiceDate)) {
      a.invoiced += toNum(r.invoiced);
      if (r.invoiceDate && (!a.latestInvoiceDate || r.invoiceDate > a.latestInvoiceDate))
        a.latestInvoiceDate = r.invoiceDate;
    }

    // Collected → collected_date when range active
    if (mf.collectedOk(r.revenueMonth, r.collectedDate)) {
      const collected = toNum(r.collected);
      a.collected += collected;
      a.overdue   += computeOverdue(toNum(r.invoiced), collected, r.dueDate, today);
      if (r.days != null && collected > 0) { a.totalDays += r.days; a.daysCount++; }
    }
  }

  // Recompute outstanding after all rows are tallied (invoiced and collected may
  // filter by different date columns so we can't do it per-row)
  for (const a of agg.values()) {
    a.outstanding = computeOutstanding(a.invoiced, a.collected);
  }

  return projectRows.map((row) => {
    const a = agg.get(row.id) ?? {
      workOrder: 0, revenue: 0, deductible: 0, invoiced: 0, collected: 0,
      outstanding: 0, overdue: 0, penalties: 0, netRevenue: 0,
      totalDays: 0, daysCount: 0, latestRevenueMonth: null, latestInvoiceDate: null,
    };
    const expectedMonthlyRevenue = toNum(row.expectedMonthlyRevenueOverride ?? '0');

    return {
      id: row.id,
      name: row.name,
      status: row.status,
      contractStart: row.contractStart ?? null,
      contractEnd: row.contractEnd ?? null,
      poValue: a.workOrder,
      expectedMonthlyRevenue,
      totalExpectedRevenue: a.workOrder,
      remainingPO: Math.max(a.workOrder - a.revenue, 0),
      totalWorkOrder: a.workOrder,
      totalRevenue: a.revenue,
      totalDeductible: a.deductible,
      totalInvoiced: a.invoiced,
      totalCollected: a.collected,
      totalOutstanding: a.outstanding,
      totalOverdue: a.overdue,
      totalPenalties: a.penalties,
      totalNetRevenue: a.netRevenue,
      revenueAchievementPct: safeDiv(a.revenue, a.workOrder || 1) * 100,
      collectionPct: safeDiv(a.collected, a.invoiced) * 100,
      avgCollectionDays: a.daysCount > 0 ? a.totalDays / a.daysCount : 0,
      latestRevenueMonth: a.latestRevenueMonth,
      latestInvoiceDate: a.latestInvoiceDate,
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
