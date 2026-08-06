import type { RevenueRecord } from "@workspace/db";

/**
 * Per-metric date filter helpers.
 *
 * When a From→To date range is active each metric is compared against its own
 * date column using the appropriate granularity:
 *   - revenue_month  → YYYY-MM prefix comparison (entire month is in or out)
 *   - invoice_date   → full YYYY-MM-DD comparison (exact day precision)
 *   - collected_date → full YYYY-MM-DD comparison (exact day precision)
 *
 * When no range is active (year/month dropdowns) all helpers fall back to the
 * same YYYY-MM matching so SQL-level conditions still apply unmodified.
 */
export function makeMetricFilters(params: {
  dateFrom?: string | null;
  dateTo?: string | null;
  revenueYear?: number | null;
  revenueMonth?: number | null;
}) {
  const { dateFrom, dateTo, revenueYear, revenueMonth } = params;
  const usingRange = !!(dateFrom || dateTo);

  // Revenue month stored as YYYY-MM-DD (first of month) → compare at YYYY-MM level
  const inRangeMonth = (dateStr: string | null | undefined): boolean => {
    if (!dateStr) return false;
    const ym = dateStr.slice(0, 7);
    const from = dateFrom ? dateFrom.slice(0, 7) : null;
    const to   = dateTo   ? dateTo.slice(0, 7)   : null;
    if (from && ym < from) return false;
    if (to   && ym > to)   return false;
    return true;
  };

  // Invoice / collected date stored as YYYY-MM-DD → compare at full day level
  const inRangeDate = (dateStr: string | null | undefined): boolean => {
    if (!dateStr) return false;
    const d = dateStr.slice(0, 10);
    if (dateFrom && d < dateFrom.slice(0, 10)) return false;
    if (dateTo   && d > dateTo.slice(0, 10))   return false;
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
    /** Revenue + Work Order → always gated on revenue_month (month-level) */
    revenueOk: (revenueMonthCol: string | null | undefined) =>
      usingRange ? inRangeMonth(revenueMonthCol) : matchesYearMonth(revenueMonthCol),
    /** Invoiced → invoice_date when range active (day-level); else revenue_month */
    invoicedOk: (revenueMonthCol: string | null | undefined, invoiceDateCol: string | null | undefined) =>
      usingRange ? inRangeDate(invoiceDateCol) : matchesYearMonth(revenueMonthCol),
    /** Collected → collected_date when range active (day-level); else revenue_month */
    collectedOk: (revenueMonthCol: string | null | undefined, collectedDateCol: string | null | undefined) =>
      usingRange ? inRangeDate(collectedDateCol) : matchesYearMonth(revenueMonthCol),
  };
}

export function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return parseFloat(String(v)) || 0;
}

export function safeDiv(numerator: number, denominator: number): number {
  if (denominator === 0 || !isFinite(denominator)) return 0;
  const result = numerator / denominator;
  return isFinite(result) ? result : 0;
}

const TOLERANCE = 1; // SAR 1

export function computePaymentStatus(
  invoiced: number,
  collected: number,
  dueDate: string | null | undefined,
  collectedDate: string | null | undefined,
  today: Date = new Date(),
): string {
  if (invoiced <= 0) return "Not Invoiced";

  const outstanding = Math.max(invoiced - collected, 0);

  // Fully collected
  if (outstanding <= TOLERANCE) {
    if (collectedDate && dueDate && collectedDate > dueDate) return "Collected Late";
    return "Collected on Time";
  }

  // Partially collected
  if (collected > 0) return "Partially Collected";

  if (!dueDate) return "Invoiced – Not Due";

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysUntilDue = Math.ceil(
    (new Date(dueDate).getTime() - today.getTime()) / msPerDay,
  );

  if (daysUntilDue < 0) return "Overdue";
  if (daysUntilDue <= 15) return "Due Soon";
  return "Invoiced – Not Due";
}

export function computeOutstanding(invoiced: number, collected: number): number {
  return Math.max(invoiced - collected, 0);
}

export function computeOverdue(
  invoiced: number,
  collected: number,
  dueDate: string | null | undefined,
  today: Date = new Date(),
): number {
  const outstanding = computeOutstanding(invoiced, collected);
  if (outstanding <= 0) return 0;
  if (!dueDate) return 0;

  const todayStr = today.toISOString().split("T")[0];
  if (dueDate >= todayStr) return 0;

  return outstanding;
}

export function enrichRecord(
  dbRecord: RevenueRecord,
  today: Date = new Date(),
) {
  const invoiced = toNum(dbRecord.invoiced);
  const collected = toNum(dbRecord.collected);
  const workOrder = toNum(dbRecord.workOrder);
  const revenue = toNum(dbRecord.revenue);
  const deductible = toNum(dbRecord.deductible);
  const penalties = toNum(dbRecord.penalties);
  const netRevenue = toNum(dbRecord.netRevenue);

  const outstanding = computeOutstanding(invoiced, collected);
  const overdueAmount = computeOverdue(invoiced, collected, dbRecord.dueDate, today);
  const paymentStatus = computePaymentStatus(
    invoiced,
    collected,
    dbRecord.dueDate,
    dbRecord.collectedDate,
    today,
  );

  let outstandingAgeDays: number | null = null;
  if (outstanding > 0 && dbRecord.invoiceDate) {
    outstandingAgeDays = Math.floor(
      (today.getTime() - new Date(dbRecord.invoiceDate).getTime()) /
        (1000 * 60 * 60 * 24),
    );
  }

  // Validation variance fields
  const calculatedDeductible = workOrder - revenue;
  const deductibleVariance =
    Math.abs(deductible - calculatedDeductible) > TOLERANCE
      ? deductible - calculatedDeductible
      : null;

  const calculatedNetRevenue = collected - penalties;
  const netRevenueVariance =
    Math.abs(netRevenue - calculatedNetRevenue) > TOLERANCE
      ? netRevenue - calculatedNetRevenue
      : null;

  return {
    id: dbRecord.id,
    projectId: dbRecord.projectId,
    projectName: dbRecord.projectName,
    revenueMonth: dbRecord.revenueMonth,
    workOrder,
    revenue,
    deductible,
    invoiced,
    invoiceDate: dbRecord.invoiceDate ?? null,
    invoiceNo: dbRecord.invoiceNo ?? null,
    dueDate: dbRecord.dueDate ?? null,
    collected,
    collectedDate: dbRecord.collectedDate ?? null,
    days: dbRecord.days ?? null,
    penalties,
    netRevenue,
    paymentStatus,
    outstandingAmount: outstanding,
    overdueAmount,
    outstandingAgeDays,
    deductibleVariance,
    netRevenueVariance,
    isDemo: dbRecord.isDemo,
    createdAt: dbRecord.createdAt.toISOString(),
    updatedAt: dbRecord.updatedAt.toISOString(),
  };
}

export function getAgingDays(dueDate: string, today: Date = new Date()): number {
  const todayStr = today.toISOString().split("T")[0];
  if (dueDate >= todayStr) return 0;
  return Math.floor(
    (today.getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24),
  );
}

export function agingBucket(
  daysOverdue: number,
  outstanding: number,
  dueDate: string | null | undefined,
  today: Date = new Date(),
): string {
  if (!dueDate || outstanding <= 0) return "Not Due";
  const todayStr = today.toISOString().split("T")[0];
  if (dueDate >= todayStr) return "Not Due";
  if (daysOverdue <= 30) return "1–30 days";
  if (daysOverdue <= 60) return "31–60 days";
  if (daysOverdue <= 90) return "61–90 days";
  return "90+ days";
}
