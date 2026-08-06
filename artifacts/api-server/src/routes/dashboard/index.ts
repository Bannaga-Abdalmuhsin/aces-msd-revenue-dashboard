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
  // dateFrom / dateTo (YYYY-MM format) override year/month when provided
  if (params.dateFrom) {
    const from = `${params.dateFrom}-01`;
    conditions.push(sql`${revenueRecordsTable.revenueMonth}::date >= ${from}::date`);
  }
  if (params.dateTo) {
    const to = `${params.dateTo}-01`;
    conditions.push(sql`${revenueRecordsTable.revenueMonth}::date <= (DATE_TRUNC('month', ${to}::date) + INTERVAL '1 month - 1 day')::date`);
  }
  return conditions;
}

/**
 * Per-metric date filter helpers used when a From→To date range is active.
 * Each metric is filtered against its own date column (revenue_month, invoice_date,
 * or collected_date). When no date range is provided the helpers always return true
 * so that the SQL-level year/month conditions still apply unmodified.
 *
 * Date strings are stored as YYYY-MM-DD; from/to are YYYY-MM.
 * Comparison is done on the YYYY-MM prefix (string sort is correct for ISO dates).
 */
function makeMetricFilters(params: {
  dateFrom?: string | null;
  dateTo?: string | null;
  revenueYear?: number | null;
  revenueMonth?: number | null;
}) {
  const { dateFrom, dateTo, revenueYear, revenueMonth } = params;
  const usingRange = !!(dateFrom || dateTo);

  // YYYY-MM-DD (or YYYY-MM-01) → "YYYY-MM" prefix check
  const inRange = (dateStr: string | null | undefined): boolean => {
    if (!dateStr) return false;
    const ym = dateStr.slice(0, 7);
    if (dateFrom && ym < dateFrom) return false;
    if (dateTo   && ym > dateTo)   return false;
    return true;
  };

  // Single year/month filter (used when no range is active)
  const matchesYearMonth = (dateStr: string | null | undefined): boolean => {
    if (!dateStr) return false;
    if (revenueYear  && parseInt(dateStr.slice(0, 4)) !== revenueYear)  return false;
    if (revenueMonth && parseInt(dateStr.slice(5, 7)) !== revenueMonth) return false;
    return true;
  };

  return {
    usingRange,
    /** Revenue + Work Order are always gated on revenue_month */
    revenueOk: (revenueMonthCol: string | null | undefined) =>
      usingRange ? inRange(revenueMonthCol) : matchesYearMonth(revenueMonthCol),
    /** Invoiced is gated on invoice_date when a range is active */
    invoicedOk: (revenueMonthCol: string | null | undefined, invoiceDateCol: string | null | undefined) =>
      usingRange ? inRange(invoiceDateCol) : matchesYearMonth(revenueMonthCol),
    /** Collected is gated on collected_date when a range is active */
    collectedOk: (revenueMonthCol: string | null | undefined, collectedDateCol: string | null | undefined) =>
      usingRange ? inRange(collectedDateCol) : matchesYearMonth(revenueMonthCol),
  };
}

// GET /dashboard/summary
router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const parsed = GetDashboardSummaryQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const q = parsed.data;

  // Project filter only in SQL — date filtering is done per-metric in JS
  const projectCond = q.project ? [like(revenueRecordsTable.projectName, `%${q.project}%`)] : [];

  const today = new Date();
  const mf = makeMetricFilters(q as Parameters<typeof makeMetricFilters>[0]);

  const [records, lastUpdate] = await Promise.all([
    db.select().from(revenueRecordsTable).where(projectCond.length ? and(...projectCond) : undefined),
    db.select({ maxDate: sql<string | null>`MAX(${revenueRecordsTable.updatedAt})` }).from(revenueRecordsTable),
  ]);

  let totalWorkOrder = 0, totalRevenue = 0, totalDeductible = 0;
  let totalInvoiced = 0, totalCollected = 0;
  let totalOverdue = 0, totalPenalties = 0, totalNetRevenue = 0;
  let totalDays = 0, daysCount = 0;

  for (const r of records) {
    // Revenue, Work Order, Deductible, Penalties, Net Revenue → revenue_month
    if (mf.revenueOk(r.revenueMonth)) {
      totalWorkOrder  += toNum(r.workOrder);
      totalRevenue    += toNum(r.revenue);
      totalDeductible += toNum(r.deductible);
      totalPenalties  += toNum(r.penalties);
      totalNetRevenue += toNum(r.netRevenue);
    }
    // Invoiced → invoice_date when range active, else revenue_month
    if (mf.invoicedOk(r.revenueMonth, r.invoiceDate)) {
      totalInvoiced += toNum(r.invoiced);
    }
    // Collected → collected_date when range active, else revenue_month
    if (mf.collectedOk(r.revenueMonth, r.collectedDate)) {
      const collected = toNum(r.collected);
      totalCollected += collected;
      totalOverdue   += computeOverdue(toNum(r.invoiced), collected, r.dueDate, today);
      if (r.days != null && collected > 0) { totalDays += r.days; daysCount++; }
    }
  }

  const totalOutstanding = computeOutstanding(totalInvoiced, totalCollected);
  const totalExpectedRevenue = totalWorkOrder;

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
    totalPoValue: totalWorkOrder,
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

  const rows = await db.select({
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
  .orderBy(sql`TO_CHAR(${revenueRecordsTable.revenueMonth}::date, 'YYYY-MM')`);

  res.json(rows.map((r) => ({
    month: r.month,
    workOrder: toNum(r.workOrder),
    revenue: toNum(r.revenue),
    invoiced: toNum(r.invoiced),
    collected: toNum(r.collected),
    netRevenue: toNum(r.netRevenue),
    // expectedRevenue = work order value for that month (from Excel data)
    expectedRevenue: toNum(r.workOrder),
  })));
});

// GET /dashboard/project-performance
router.get("/dashboard/project-performance", async (req, res): Promise<void> => {
  const parsed = GetProjectPerformanceQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const q = parsed.data;

  // Project filter only in SQL — date filtering is done per-metric in JS
  const projectCond = q.project ? [like(revenueRecordsTable.projectName, `%${q.project}%`)] : [];
  const mf = makeMetricFilters(q as Parameters<typeof makeMetricFilters>[0]);

  const records = await db.select().from(revenueRecordsTable)
    .where(projectCond.length ? and(...projectCond) : undefined);

  const projectMap = new Map<string, {
    workOrder: number; revenue: number;
    invoiced: number; collected: number;
  }>();

  for (const r of records) {
    const name = r.projectName;
    if (!projectMap.has(name)) projectMap.set(name, { workOrder: 0, revenue: 0, invoiced: 0, collected: 0 });
    const p = projectMap.get(name)!;
    if (mf.revenueOk(r.revenueMonth)) {
      p.workOrder += toNum(r.workOrder);
      p.revenue   += toNum(r.revenue);
    }
    if (mf.invoicedOk(r.revenueMonth, r.invoiceDate))   p.invoiced   += toNum(r.invoiced);
    if (mf.collectedOk(r.revenueMonth, r.collectedDate)) p.collected  += toNum(r.collected);
  }

  res.json(Array.from(projectMap.entries()).map(([name, vals]) => ({
    projectName: name,
    workOrder: vals.workOrder,
    revenue: vals.revenue,
    revenueAchievementPct: safeDiv(vals.revenue, vals.workOrder || 1) * 100,
    invoiced: vals.invoiced,
    collected: vals.collected,
    outstanding: computeOutstanding(vals.invoiced, vals.collected),
    expectedRevenue: vals.workOrder,
    poValue: vals.workOrder,
  })));
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
