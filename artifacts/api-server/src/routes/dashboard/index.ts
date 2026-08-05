import { Router, type IRouter } from "express";
import { sql, and, like } from "drizzle-orm";
import { db, revenueRecordsTable, projectsTable } from "@workspace/db";
import {
  GetDashboardSummaryQueryParams,
  GetMonthlyTrendQueryParams,
  GetProjectPerformanceQueryParams,
  GetAgingReportQueryParams,
  GetCollectionTrendQueryParams,
  GetRevenueHeatmapQueryParams,
  GetPaymentStatusDistributionQueryParams,
} from "@workspace/api-zod";
import {
  toNum,
  safeDiv,
  computePaymentStatus,
  computeOutstanding,
  computeOverdue,
  getAgingDays,
  agingBucket,
} from "../../lib/businessLogic";

const router: IRouter = Router();

type ProjectBaseline = {
  id: number;
  name: string;
  contractStart: string | null;
  contractEnd: string | null;
  expectedMonthlyRevenue: string;
  poValue: string;
};

/** Load all project baselines for expected-revenue calculations */
async function loadBaselines(): Promise<ProjectBaseline[]> {
  return db.select({
    id: projectsTable.id,
    name: projectsTable.name,
    contractStart: projectsTable.contractStart,
    contractEnd: projectsTable.contractEnd,
    expectedMonthlyRevenue: projectsTable.expectedMonthlyRevenue,
    poValue: projectsTable.poValue,
  }).from(projectsTable);
}

/** Compute expected revenue for a given period based on project baselines */
function computeExpectedRevenue(
  baselines: ProjectBaseline[],
  filterYear?: number | null,
  filterMonth?: number | null,
  filterProjectName?: string | null,
): number {
  const today = new Date();
  let total = 0;

  for (const p of baselines) {
    if (filterProjectName && !p.name.toLowerCase().includes(filterProjectName.toLowerCase())) continue;
    if (!p.contractStart) continue;
    const monthlyRev = toNum(p.expectedMonthlyRevenue);
    if (monthlyRev === 0) continue;

    const startDate = new Date(p.contractStart);
    const endDate = p.contractEnd ? new Date(p.contractEnd) : new Date("2099-12-31");

    if (filterYear && filterMonth) {
      const mStart = new Date(filterYear, filterMonth - 1, 1);
      const mEnd = new Date(filterYear, filterMonth, 0);
      if (startDate <= mEnd && endDate >= mStart) total += monthlyRev;
    } else if (filterYear) {
      for (let mo = 0; mo < 12; mo++) {
        const mStart = new Date(filterYear, mo, 1);
        const mEnd = new Date(filterYear, mo + 1, 0);
        if (startDate <= mEnd && endDate >= mStart && mStart <= today) total += monthlyRev;
      }
    } else {
      // All time up to today
      let d = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const cap = endDate < today ? endDate : today;
      while (d <= cap) {
        total += monthlyRev;
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      }
    }
  }
  return total;
}

/** Expected revenue for a specific month string "YYYY-MM" */
function expectedRevForMonth(baselines: ProjectBaseline[], monthStr: string): number {
  const [yr, mo] = monthStr.split("-").map(Number);
  const mStart = new Date(yr, mo - 1, 1);
  const mEnd = new Date(yr, mo, 0);
  let total = 0;
  for (const p of baselines) {
    if (!p.contractStart) continue;
    const startDate = new Date(p.contractStart);
    const endDate = p.contractEnd ? new Date(p.contractEnd) : new Date("2099-12-31");
    if (startDate <= mEnd && endDate >= mStart) {
      total += toNum(p.expectedMonthlyRevenue);
    }
  }
  return total;
}

function buildBaseConditions(params: {
  project?: string | null;
  revenueYear?: number | null;
  revenueMonth?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}) {
  const conditions = [];
  if (params.project) conditions.push(like(revenueRecordsTable.projectName, `%${params.project}%`));
  if (params.revenueYear) {
    conditions.push(sql`EXTRACT(YEAR FROM ${revenueRecordsTable.revenueMonth}::date) = ${params.revenueYear}`);
  }
  if (params.revenueMonth) {
    conditions.push(sql`EXTRACT(MONTH FROM ${revenueRecordsTable.revenueMonth}::date) = ${params.revenueMonth}`);
  }
  // dateFrom / dateTo override year/month when provided (YYYY-MM format)
  if (params.dateFrom) {
    const from = `${params.dateFrom}-01`;
    conditions.push(sql`${revenueRecordsTable.revenueMonth}::date >= ${from}::date`);
  }
  if (params.dateTo) {
    // last day of the given month
    const to = `${params.dateTo}-01`;
    conditions.push(sql`${revenueRecordsTable.revenueMonth}::date <= (DATE_TRUNC('month', ${to}::date) + INTERVAL '1 month - 1 day')::date`);
  }
  return conditions;
}

// GET /dashboard/summary
router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const parsed = GetDashboardSummaryQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const q = parsed.data;
  const conditions = buildBaseConditions(q as Parameters<typeof buildBaseConditions>[0]);
  const today = new Date();

  const [records, baselines, lastUpdate] = await Promise.all([
    db.select().from(revenueRecordsTable).where(conditions.length ? and(...conditions) : undefined),
    loadBaselines(),
    db.select({ maxDate: sql<string | null>`MAX(${revenueRecordsTable.updatedAt})` }).from(revenueRecordsTable),
  ]);

  let totalWorkOrder = 0, totalRevenue = 0, totalDeductible = 0;
  let totalInvoiced = 0, totalCollected = 0, totalOutstanding = 0;
  let totalOverdue = 0, totalPenalties = 0, totalNetRevenue = 0;
  let totalDays = 0, daysCount = 0;

  for (const r of records) {
    const invoiced = toNum(r.invoiced);
    const collected = toNum(r.collected);
    totalWorkOrder += toNum(r.workOrder);
    totalRevenue += toNum(r.revenue);
    totalDeductible += toNum(r.deductible);
    totalInvoiced += invoiced;
    totalCollected += collected;
    totalPenalties += toNum(r.penalties);
    totalNetRevenue += toNum(r.netRevenue);
    totalOutstanding += computeOutstanding(invoiced, collected);
    totalOverdue += computeOverdue(invoiced, collected, r.dueDate, today);
    if (r.days != null && collected > 0) { totalDays += r.days; daysCount++; }
  }

  const totalPoValue = baselines
    .filter(p => !q.project || p.name.toLowerCase().includes((q.project as string).toLowerCase()))
    .reduce((s, p) => s + toNum(p.poValue), 0);

  const totalExpectedRevenue = computeExpectedRevenue(
    baselines,
    q.revenueYear as number | null,
    q.revenueMonth as number | null,
    q.project as string | null,
  );

  res.json({
    totalWorkOrder,
    totalRevenue,
    totalDeductible,
    totalInvoiced,
    totalCollected,
    totalOutstanding,
    totalOverdue,
    totalPenalties,
    totalNetRevenue,
    totalPoValue,
    totalExpectedRevenue,
    collectionRate: safeDiv(totalCollected, totalInvoiced) * 100,
    revenueAchievementRate: safeDiv(totalRevenue, totalExpectedRevenue) * 100,
    invoiceConversionRate: safeDiv(totalInvoiced, totalRevenue) * 100,
    avgCollectionDays: daysCount > 0 ? totalDays / daysCount : 0,
    lastDataUpdate: lastUpdate[0]?.maxDate ?? null,
  });
});

// GET /dashboard/monthly
router.get("/dashboard/monthly", async (req, res): Promise<void> => {
  const parsed = GetMonthlyTrendQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const q = parsed.data;
  const conditions = buildBaseConditions(q as Parameters<typeof buildBaseConditions>[0]);

  const [rows, baselines] = await Promise.all([
    db.select({
      month: sql<string>`TO_CHAR(${revenueRecordsTable.revenueMonth}::date, 'YYYY-MM')`,
      workOrder: sql<string>`SUM(${revenueRecordsTable.workOrder}::numeric)`,
      revenue: sql<string>`SUM(${revenueRecordsTable.revenue}::numeric)`,
      invoiced: sql<string>`SUM(${revenueRecordsTable.invoiced}::numeric)`,
      collected: sql<string>`SUM(${revenueRecordsTable.collected}::numeric)`,
      netRevenue: sql<string>`SUM(${revenueRecordsTable.netRevenue}::numeric)`,
    })
    .from(revenueRecordsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(sql`TO_CHAR(${revenueRecordsTable.revenueMonth}::date, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${revenueRecordsTable.revenueMonth}::date, 'YYYY-MM')`),
    loadBaselines(),
  ]);

  const filteredBaselines = q.project
    ? baselines.filter(p => p.name.toLowerCase().includes((q.project as string).toLowerCase()))
    : baselines;

  res.json(rows.map((r) => ({
    month: r.month,
    workOrder: toNum(r.workOrder),
    revenue: toNum(r.revenue),
    invoiced: toNum(r.invoiced),
    collected: toNum(r.collected),
    netRevenue: toNum(r.netRevenue),
    expectedRevenue: expectedRevForMonth(filteredBaselines, r.month),
  })));
});

// GET /dashboard/project-performance
router.get("/dashboard/project-performance", async (req, res): Promise<void> => {
  const parsed = GetProjectPerformanceQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const q = parsed.data;
  const conditions = [];
  if (q.revenueYear) conditions.push(sql`EXTRACT(YEAR FROM ${revenueRecordsTable.revenueMonth}::date) = ${q.revenueYear}`);

  const [records, baselines] = await Promise.all([
    db.select().from(revenueRecordsTable).where(conditions.length ? and(...conditions) : undefined),
    loadBaselines(),
  ]);

  const projectMap = new Map<string, { workOrder: number; revenue: number; invoiced: number; collected: number }>();
  for (const r of records) {
    const name = r.projectName;
    if (!projectMap.has(name)) projectMap.set(name, { workOrder: 0, revenue: 0, invoiced: 0, collected: 0 });
    const p = projectMap.get(name)!;
    p.workOrder += toNum(r.workOrder);
    p.revenue += toNum(r.revenue);
    p.invoiced += toNum(r.invoiced);
    p.collected += toNum(r.collected);
  }

  const baselineMap = new Map(baselines.map(b => [b.name, b]));

  res.json(Array.from(projectMap.entries()).map(([name, vals]) => {
    const bl = baselineMap.get(name);
    const expectedRevenue = bl
      ? computeExpectedRevenue([bl], q.revenueYear as number | null, null, null)
      : vals.workOrder;
    return {
      projectName: name,
      workOrder: vals.workOrder,
      revenue: vals.revenue,
      revenueAchievementPct: safeDiv(vals.revenue, expectedRevenue || vals.workOrder) * 100,
      invoiced: vals.invoiced,
      collected: vals.collected,
      outstanding: computeOutstanding(vals.invoiced, vals.collected),
      expectedRevenue,
      poValue: bl ? toNum(bl.poValue) : 0,
    };
  }));
});

// GET /dashboard/aging
router.get("/dashboard/aging", async (req, res): Promise<void> => {
  const parsed = GetAgingReportQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const q = parsed.data;
  const conditions = [];
  if (q.project) conditions.push(like(revenueRecordsTable.projectName, `%${q.project}%`));

  const today = new Date();
  const records = await db.select().from(revenueRecordsTable).where(conditions.length ? and(...conditions) : undefined);

  const buckets: Record<string, { count: number; amount: number }> = {
    "Not Due": { count: 0, amount: 0 },
    "1–30 days": { count: 0, amount: 0 },
    "31–60 days": { count: 0, amount: 0 },
    "61–90 days": { count: 0, amount: 0 },
    "90+ days": { count: 0, amount: 0 },
  };
  let totalOutstanding = 0;

  for (const r of records) {
    const outstanding = computeOutstanding(toNum(r.invoiced), toNum(r.collected));
    if (outstanding <= 0) continue;
    const days = r.dueDate ? getAgingDays(r.dueDate, today) : 0;
    const bucket = agingBucket(days, outstanding, r.dueDate, today);
    buckets[bucket].count++;
    buckets[bucket].amount += outstanding;
    totalOutstanding += outstanding;
  }

  res.json({
    buckets: Object.entries(buckets).map(([label, v]) => ({ label, count: v.count, amount: v.amount })),
    totalOutstanding,
  });
});

// GET /dashboard/insights
router.get("/dashboard/insights", async (_req, res): Promise<void> => {
  const today = new Date();
  const days60Ago = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const records = await db.select().from(revenueRecordsTable);

  const insights: Array<{ type: string; severity: "critical" | "warning" | "info"; message: string; projectName: string | null; amount: number | null }> = [];
  const projectData = new Map<string, { workOrder: number; revenue: number; invoiced: number; collected: number; overdue: number; overdue60: number; penalties: number; unbilled: number; totalDays: number; daysCount: number }>();

  for (const r of records) {
    const name = r.projectName;
    if (!projectData.has(name)) projectData.set(name, { workOrder: 0, revenue: 0, invoiced: 0, collected: 0, overdue: 0, overdue60: 0, penalties: 0, unbilled: 0, totalDays: 0, daysCount: 0 });
    const p = projectData.get(name)!;
    const revenue = toNum(r.revenue);
    const invoiced = toNum(r.invoiced);
    const collected = toNum(r.collected);
    p.workOrder += toNum(r.workOrder); p.revenue += revenue; p.invoiced += invoiced; p.collected += collected; p.penalties += toNum(r.penalties);
    const od = computeOverdue(invoiced, collected, r.dueDate, today);
    p.overdue += od;
    if (r.dueDate && r.dueDate < days60Ago && od > 0) p.overdue60 += od;
    if (revenue > invoiced + 1) p.unbilled += revenue - invoiced;
    if (r.days != null && collected > 0) { p.totalDays += r.days; p.daysCount++; }
  }

  for (const [name, p] of projectData.entries()) {
    if (p.overdue60 > 0) insights.push({ type: "overdue_60", severity: "critical", message: `${name} has SAR ${fmt(p.overdue60)} outstanding, overdue by more than 60 days.`, projectName: name, amount: p.overdue60 });
    else if (p.overdue > 0) insights.push({ type: "overdue", severity: "warning", message: `${name} has SAR ${fmt(p.overdue)} overdue.`, projectName: name, amount: p.overdue });
    if (p.unbilled > 1000) insights.push({ type: "unbilled", severity: "warning", message: `${name} has SAR ${fmt(p.unbilled)} in recognized revenue not yet invoiced.`, projectName: name, amount: p.unbilled });
    const penaltyRate = safeDiv(p.penalties, p.invoiced) * 100;
    if (penaltyRate > 5 && p.invoiced > 0) insights.push({ type: "high_penalties", severity: "warning", message: `${name} has high penalties: SAR ${fmt(p.penalties)} (${penaltyRate.toFixed(1)}% of invoiced).`, projectName: name, amount: p.penalties });
    const avgDays = p.daysCount > 0 ? p.totalDays / p.daysCount : 0;
    if (avgDays > 90 && p.daysCount > 0) insights.push({ type: "slow_collection", severity: "info", message: `${name} average ${Math.round(avgDays)} days to collect.`, projectName: name, amount: avgDays });
  }

  insights.sort((a, b) => ({ critical: 0, warning: 1, info: 2 }[a.severity] - ({ critical: 0, warning: 1, info: 2 }[b.severity])));
  res.json(insights);
});

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

// GET /dashboard/collection-trend
router.get("/dashboard/collection-trend", async (req, res): Promise<void> => {
  const parsed = GetCollectionTrendQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const q = parsed.data;
  const conditions = [];
  if (q.project) conditions.push(like(revenueRecordsTable.projectName, `%${q.project}%`));
  if (q.revenueYear) conditions.push(sql`EXTRACT(YEAR FROM ${revenueRecordsTable.collectedDate}::date) = ${q.revenueYear}`);

  const rows = await db.select({
    month: sql<string>`TO_CHAR(${revenueRecordsTable.collectedDate}::date, 'YYYY-MM')`,
    collected: sql<string>`SUM(${revenueRecordsTable.collected}::numeric)`,
    count: sql<number>`COUNT(*)::int`,
  }).from(revenueRecordsTable)
    .where(and(sql`${revenueRecordsTable.collectedDate} IS NOT NULL`, sql`${revenueRecordsTable.collected}::numeric > 0`, ...(conditions.length ? conditions : [])))
    .groupBy(sql`TO_CHAR(${revenueRecordsTable.collectedDate}::date, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${revenueRecordsTable.collectedDate}::date, 'YYYY-MM')`);

  res.json(rows.map((r) => ({ month: r.month, collected: toNum(r.collected), count: r.count })));
});

// GET /dashboard/heatmap
router.get("/dashboard/heatmap", async (req, res): Promise<void> => {
  const parsed = GetRevenueHeatmapQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const q = parsed.data;
  const conditions = [];
  if (q.revenueYear) conditions.push(sql`EXTRACT(YEAR FROM ${revenueRecordsTable.revenueMonth}::date) = ${q.revenueYear}`);

  const records = await db.select({
    projectName: revenueRecordsTable.projectName,
    month: sql<string>`TO_CHAR(${revenueRecordsTable.revenueMonth}::date, 'YYYY-MM')`,
    workOrder: sql<string>`SUM(${revenueRecordsTable.workOrder}::numeric)`,
    revenue: sql<string>`SUM(${revenueRecordsTable.revenue}::numeric)`,
  }).from(revenueRecordsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(revenueRecordsTable.projectName, sql`TO_CHAR(${revenueRecordsTable.revenueMonth}::date, 'YYYY-MM')`)
    .orderBy(revenueRecordsTable.projectName, sql`TO_CHAR(${revenueRecordsTable.revenueMonth}::date, 'YYYY-MM')`);

  const months = [...new Set(records.map((r) => r.month))].sort();
  const projectNames = [...new Set(records.map((r) => r.projectName))].sort();
  const lookup = new Map(records.map((r) => [`${r.projectName}:${r.month}`, safeDiv(toNum(r.revenue), toNum(r.workOrder)) * 100]));

  res.json({
    months,
    rows: projectNames.map((name) => ({
      projectName: name,
      cells: months.map((month) => ({ month, achievementPct: lookup.get(`${name}:${month}`) ?? null })),
    })),
  });
});

// GET /dashboard/payment-status
router.get("/dashboard/payment-status", async (req, res): Promise<void> => {
  const parsed = GetPaymentStatusDistributionQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const q = parsed.data;
  const conditions = [];
  if (q.project) conditions.push(like(revenueRecordsTable.projectName, `%${q.project}%`));

  const today = new Date();
  const records = await db.select().from(revenueRecordsTable).where(conditions.length ? and(...conditions) : undefined);
  const statusMap = new Map<string, { count: number; amount: number }>();

  for (const r of records) {
    const invoiced = toNum(r.invoiced);
    const collected = toNum(r.collected);
    const status = computePaymentStatus(invoiced, collected, r.dueDate, r.collectedDate, today);
    if (!statusMap.has(status)) statusMap.set(status, { count: 0, amount: 0 });
    const s = statusMap.get(status)!;
    s.count++;
    s.amount += invoiced;
  }

  res.json(Array.from(statusMap.entries()).map(([status, v]) => ({ status, count: v.count, amount: v.amount })));
});

export default router;
