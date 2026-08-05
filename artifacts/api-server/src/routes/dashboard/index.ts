import { Router, type IRouter } from "express";
import { eq, sql, and, like, gte, lte, desc } from "drizzle-orm";
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
  enrichRecord,
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
}) {
  const conditions = [];
  if (params.project) {
    conditions.push(like(revenueRecordsTable.projectName, `%${params.project}%`));
  }
  if (params.revenueYear) {
    conditions.push(
      sql`EXTRACT(YEAR FROM ${revenueRecordsTable.revenueMonth}::date) = ${params.revenueYear}`,
    );
  }
  if (params.revenueMonth) {
    conditions.push(
      sql`EXTRACT(MONTH FROM ${revenueRecordsTable.revenueMonth}::date) = ${params.revenueMonth}`,
    );
  }
  return conditions;
}

// GET /dashboard/summary
router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const parsed = GetDashboardSummaryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const q = parsed.data;
  const conditions = buildBaseConditions(q as Parameters<typeof buildBaseConditions>[0]);
  const today = new Date();

  const [records, lastUpdate] = await Promise.all([
    db
      .select()
      .from(revenueRecordsTable)
      .where(conditions.length ? and(...conditions) : undefined),
    db
      .select({ maxDate: sql<string | null>`MAX(${revenueRecordsTable.updatedAt})` })
      .from(revenueRecordsTable),
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

    if (r.days != null && collected > 0) {
      totalDays += r.days;
      daysCount++;
    }
  }

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
    collectionRate: safeDiv(totalCollected, totalInvoiced) * 100,
    revenueAchievementRate: safeDiv(totalRevenue, totalWorkOrder) * 100,
    invoiceConversionRate: safeDiv(totalInvoiced, totalRevenue) * 100,
    avgCollectionDays: daysCount > 0 ? totalDays / daysCount : 0,
    lastDataUpdate: lastUpdate[0]?.maxDate ?? null,
  });
});

// GET /dashboard/monthly
router.get("/dashboard/monthly", async (req, res): Promise<void> => {
  const parsed = GetMonthlyTrendQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const q = parsed.data;
  const conditions = buildBaseConditions(q as Parameters<typeof buildBaseConditions>[0]);

  const rows = await db
    .select({
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

  res.json(
    rows.map((r) => ({
      month: r.month,
      workOrder: toNum(r.workOrder),
      revenue: toNum(r.revenue),
      invoiced: toNum(r.invoiced),
      collected: toNum(r.collected),
      netRevenue: toNum(r.netRevenue),
    })),
  );
});

// GET /dashboard/project-performance
router.get("/dashboard/project-performance", async (req, res): Promise<void> => {
  const parsed = GetProjectPerformanceQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const q = parsed.data;
  const conditions = [];
  if (q.revenueYear) {
    conditions.push(
      sql`EXTRACT(YEAR FROM ${revenueRecordsTable.revenueMonth}::date) = ${q.revenueYear}`,
    );
  }

  const records = await db
    .select()
    .from(revenueRecordsTable)
    .where(conditions.length ? and(...conditions) : undefined);

  const projectMap = new Map<
    string,
    { workOrder: number; revenue: number; invoiced: number; collected: number }
  >();

  for (const r of records) {
    const name = r.projectName;
    if (!projectMap.has(name)) {
      projectMap.set(name, { workOrder: 0, revenue: 0, invoiced: 0, collected: 0 });
    }
    const p = projectMap.get(name)!;
    p.workOrder += toNum(r.workOrder);
    p.revenue += toNum(r.revenue);
    p.invoiced += toNum(r.invoiced);
    p.collected += toNum(r.collected);
  }

  res.json(
    Array.from(projectMap.entries()).map(([name, vals]) => ({
      projectName: name,
      workOrder: vals.workOrder,
      revenue: vals.revenue,
      revenueAchievementPct: safeDiv(vals.revenue, vals.workOrder) * 100,
      invoiced: vals.invoiced,
      collected: vals.collected,
      outstanding: computeOutstanding(vals.invoiced, vals.collected),
    })),
  );
});

// GET /dashboard/aging
router.get("/dashboard/aging", async (req, res): Promise<void> => {
  const parsed = GetAgingReportQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const q = parsed.data;
  const conditions = [];
  if (q.project) {
    conditions.push(like(revenueRecordsTable.projectName, `%${q.project}%`));
  }

  const today = new Date();
  const records = await db
    .select()
    .from(revenueRecordsTable)
    .where(conditions.length ? and(...conditions) : undefined);

  const buckets: Record<string, { count: number; amount: number }> = {
    "Not Due": { count: 0, amount: 0 },
    "1–30 days": { count: 0, amount: 0 },
    "31–60 days": { count: 0, amount: 0 },
    "61–90 days": { count: 0, amount: 0 },
    "90+ days": { count: 0, amount: 0 },
  };
  let totalOutstanding = 0;

  for (const r of records) {
    const invoiced = toNum(r.invoiced);
    const collected = toNum(r.collected);
    const outstanding = computeOutstanding(invoiced, collected);
    if (outstanding <= 0) continue;

    const days = r.dueDate ? getAgingDays(r.dueDate, today) : 0;
    const bucket = agingBucket(days, outstanding, r.dueDate, today);
    buckets[bucket].count++;
    buckets[bucket].amount += outstanding;
    totalOutstanding += outstanding;
  }

  res.json({
    buckets: Object.entries(buckets).map(([label, v]) => ({
      label,
      count: v.count,
      amount: v.amount,
    })),
    totalOutstanding,
  });
});

// GET /dashboard/insights
router.get("/dashboard/insights", async (_req, res): Promise<void> => {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const in15Days = new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const days60Ago = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const records = await db.select().from(revenueRecordsTable);

  const insights: Array<{
    type: string;
    severity: "critical" | "warning" | "info";
    message: string;
    projectName: string | null;
    amount: number | null;
  }> = [];

  const projectData = new Map<
    string,
    {
      workOrder: number; revenue: number; invoiced: number; collected: number;
      outstanding: number; overdue: number; overdue60: number; penalties: number;
      unbilled: number; dueSoon: number; totalDays: number; daysCount: number;
    }
  >();

  for (const r of records) {
    const name = r.projectName;
    if (!projectData.has(name)) {
      projectData.set(name, {
        workOrder: 0, revenue: 0, invoiced: 0, collected: 0,
        outstanding: 0, overdue: 0, overdue60: 0, penalties: 0,
        unbilled: 0, dueSoon: 0, totalDays: 0, daysCount: 0,
      });
    }
    const p = projectData.get(name)!;
    const revenue = toNum(r.revenue);
    const invoiced = toNum(r.invoiced);
    const collected = toNum(r.collected);
    const penalties = toNum(r.penalties);
    const outstanding = computeOutstanding(invoiced, collected);

    p.workOrder += toNum(r.workOrder);
    p.revenue += revenue;
    p.invoiced += invoiced;
    p.collected += collected;
    p.outstanding += outstanding;
    p.penalties += penalties;

    const overdueAmount = computeOverdue(invoiced, collected, r.dueDate, today);
    p.overdue += overdueAmount;

    if (r.dueDate && r.dueDate < days60Ago && overdueAmount > 0) {
      p.overdue60 += overdueAmount;
    }

    if (revenue > invoiced + 1) p.unbilled += revenue - invoiced;

    if (outstanding > 0 && r.dueDate && r.dueDate >= todayStr && r.dueDate <= in15Days) {
      p.dueSoon += outstanding;
    }

    if (r.days != null && collected > 0) {
      p.totalDays += r.days;
      p.daysCount++;
    }
  }

  for (const [name, p] of projectData.entries()) {
    const achievementPct = safeDiv(p.revenue, p.workOrder) * 100;
    if (achievementPct < 90 && p.workOrder > 0) {
      insights.push({ type: "low_achievement", severity: "warning", message: `${name} is at ${achievementPct.toFixed(1)}% revenue achievement (below 90% threshold).`, projectName: name, amount: p.revenue });
    }
    if (p.overdue60 > 0) {
      insights.push({ type: "overdue_60", severity: "critical", message: `${name} has SAR ${formatSar(p.overdue60)} outstanding, overdue by more than 60 days.`, projectName: name, amount: p.overdue60 });
    } else if (p.overdue > 0) {
      insights.push({ type: "overdue", severity: "warning", message: `${name} has SAR ${formatSar(p.overdue)} overdue.`, projectName: name, amount: p.overdue });
    }
    if (p.unbilled > 1000) {
      insights.push({ type: "unbilled", severity: "warning", message: `${name} has SAR ${formatSar(p.unbilled)} in recognized revenue not yet invoiced.`, projectName: name, amount: p.unbilled });
    }
    if (p.dueSoon > 0) {
      insights.push({ type: "due_soon", severity: "info", message: `${name} has SAR ${formatSar(p.dueSoon)} due within the next 15 days.`, projectName: name, amount: p.dueSoon });
    }
    const penaltyRate = safeDiv(p.penalties, p.invoiced) * 100;
    if (penaltyRate > 5 && p.invoiced > 0) {
      insights.push({ type: "high_penalties", severity: "warning", message: `${name} has high penalties: SAR ${formatSar(p.penalties)} (${penaltyRate.toFixed(1)}% of invoiced).`, projectName: name, amount: p.penalties });
    }
    const avgDays = p.daysCount > 0 ? p.totalDays / p.daysCount : 0;
    if (avgDays > 90 && p.daysCount > 0) {
      insights.push({ type: "slow_collection", severity: "info", message: `${name} has slow collection: average ${Math.round(avgDays)} days to collect.`, projectName: name, amount: avgDays });
    }
  }

  insights.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  res.json(insights);
});

function formatSar(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return amount.toFixed(0);
}

// GET /dashboard/collection-trend
router.get("/dashboard/collection-trend", async (req, res): Promise<void> => {
  const parsed = GetCollectionTrendQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const q = parsed.data;
  const conditions = [];
  if (q.project) conditions.push(like(revenueRecordsTable.projectName, `%${q.project}%`));
  if (q.revenueYear) {
    conditions.push(sql`EXTRACT(YEAR FROM ${revenueRecordsTable.collectedDate}::date) = ${q.revenueYear}`);
  }

  const rows = await db
    .select({
      month: sql<string>`TO_CHAR(${revenueRecordsTable.collectedDate}::date, 'YYYY-MM')`,
      collected: sql<string>`SUM(${revenueRecordsTable.collected}::numeric)`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(revenueRecordsTable)
    .where(
      and(
        sql`${revenueRecordsTable.collectedDate} IS NOT NULL`,
        sql`${revenueRecordsTable.collected}::numeric > 0`,
        ...(conditions.length ? conditions : []),
      ),
    )
    .groupBy(sql`TO_CHAR(${revenueRecordsTable.collectedDate}::date, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${revenueRecordsTable.collectedDate}::date, 'YYYY-MM')`);

  res.json(rows.map((r) => ({ month: r.month, collected: toNum(r.collected), count: r.count })));
});

// GET /dashboard/heatmap
router.get("/dashboard/heatmap", async (req, res): Promise<void> => {
  const parsed = GetRevenueHeatmapQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const q = parsed.data;
  const conditions = [];
  if (q.revenueYear) {
    conditions.push(sql`EXTRACT(YEAR FROM ${revenueRecordsTable.revenueMonth}::date) = ${q.revenueYear}`);
  }

  const records = await db
    .select({
      projectName: revenueRecordsTable.projectName,
      month: sql<string>`TO_CHAR(${revenueRecordsTable.revenueMonth}::date, 'YYYY-MM')`,
      workOrder: sql<string>`SUM(${revenueRecordsTable.workOrder}::numeric)`,
      revenue: sql<string>`SUM(${revenueRecordsTable.revenue}::numeric)`,
    })
    .from(revenueRecordsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(revenueRecordsTable.projectName, sql`TO_CHAR(${revenueRecordsTable.revenueMonth}::date, 'YYYY-MM')`)
    .orderBy(revenueRecordsTable.projectName, sql`TO_CHAR(${revenueRecordsTable.revenueMonth}::date, 'YYYY-MM')`);

  const months = [...new Set(records.map((r) => r.month))].sort();
  const projectNames = [...new Set(records.map((r) => r.projectName))].sort();
  const lookup = new Map(
    records.map((r) => [`${r.projectName}:${r.month}`, safeDiv(toNum(r.revenue), toNum(r.workOrder)) * 100]),
  );

  res.json({
    months,
    rows: projectNames.map((name) => ({
      projectName: name,
      cells: months.map((month) => ({
        month,
        achievementPct: lookup.get(`${name}:${month}`) ?? null,
      })),
    })),
  });
});

// GET /dashboard/payment-status
router.get("/dashboard/payment-status", async (req, res): Promise<void> => {
  const parsed = GetPaymentStatusDistributionQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const q = parsed.data;
  const conditions = [];
  if (q.project) conditions.push(like(revenueRecordsTable.projectName, `%${q.project}%`));

  const today = new Date();
  const records = await db
    .select()
    .from(revenueRecordsTable)
    .where(conditions.length ? and(...conditions) : undefined);

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

  res.json(
    Array.from(statusMap.entries()).map(([status, v]) => ({ status, count: v.count, amount: v.amount })),
  );
});

export default router;
