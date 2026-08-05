import type { RevenueRecord } from "@workspace/db";

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

  // Fully collected
  if (collected >= invoiced - TOLERANCE) {
    if (collectedDate && dueDate && collectedDate > dueDate) return "Collected Late";
    return "Collected on Time";
  }

  // Partially collected
  if (collected > 0) return "Partially Collected";

  // Not collected at all
  if (!dueDate) return "Invoiced – Not Due";

  const todayStr = today.toISOString().split("T")[0];
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
  return dueDate < todayStr ? outstanding : 0;
}

export function enrichRecord(dbRecord: RevenueRecord, today: Date = new Date()) {
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
