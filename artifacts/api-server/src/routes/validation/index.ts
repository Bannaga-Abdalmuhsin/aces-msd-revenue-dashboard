import { Router, type IRouter } from "express";
import { db, revenueRecordsTable } from "@workspace/db";
import { toNum } from "../../lib/businessLogic";

const router: IRouter = Router();

router.get("/validation", async (_req, res): Promise<void> => {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const records = await db.select().from(revenueRecordsTable);

  const issues: Array<{
    recordId: number;
    projectName: string;
    revenueMonth: string;
    invoiceNo: string | null;
    field: string;
    message: string;
    severity: "error" | "warning";
    importedValue: string | null;
    calculatedValue: string | null;
  }> = [];

  const invoiceNoCounts = new Map<string, number[]>();
  for (const r of records) {
    if (r.invoiceNo) {
      if (!invoiceNoCounts.has(r.invoiceNo)) invoiceNoCounts.set(r.invoiceNo, []);
      invoiceNoCounts.get(r.invoiceNo)!.push(r.id);
    }
  }

  for (const r of records) {
    const workOrder = toNum(r.workOrder);
    const revenue = toNum(r.revenue);
    const invoiced = toNum(r.invoiced);
    const collected = toNum(r.collected);
    const penalties = toNum(r.penalties);
    const netRevenue = toNum(r.netRevenue);
    const deductible = toNum(r.deductible);

    const base = {
      recordId: r.id,
      projectName: r.projectName,
      revenueMonth: r.revenueMonth,
      invoiceNo: r.invoiceNo ?? null,
    };

    // Missing project name
    if (!r.projectName?.trim()) {
      issues.push({ ...base, field: "projectName", message: "Missing project name", severity: "error", importedValue: null, calculatedValue: null });
    }

    // Revenue > Work Order
    if (workOrder > 0 && revenue > workOrder * 1.01) {
      issues.push({ ...base, field: "revenue", message: `Revenue (${revenue.toFixed(2)}) exceeds Work Order (${workOrder.toFixed(2)})`, severity: "warning", importedValue: revenue.toFixed(2), calculatedValue: workOrder.toFixed(2) });
    }

    // Negative values
    for (const [field, val] of [["workOrder", workOrder], ["revenue", revenue], ["invoiced", invoiced], ["collected", collected], ["penalties", penalties]] as [string, number][]) {
      if (val < 0) {
        issues.push({ ...base, field, message: `Negative value: ${val.toFixed(2)}`, severity: "error", importedValue: val.toFixed(2), calculatedValue: null });
      }
    }

    // Duplicate invoice numbers
    if (r.invoiceNo && (invoiceNoCounts.get(r.invoiceNo)?.length ?? 0) > 1) {
      issues.push({ ...base, field: "invoiceNo", message: `Duplicate invoice number: ${r.invoiceNo}`, severity: "warning", importedValue: r.invoiceNo, calculatedValue: null });
    }

    // Collected > Invoiced
    if (invoiced > 0 && collected > invoiced + 1) {
      issues.push({ ...base, field: "collected", message: `Collected (${collected.toFixed(2)}) exceeds Invoiced (${invoiced.toFixed(2)})`, severity: "warning", importedValue: collected.toFixed(2), calculatedValue: invoiced.toFixed(2) });
    }

    // Collected without collected date
    if (collected > 0 && !r.collectedDate) {
      issues.push({ ...base, field: "collectedDate", message: "Collected amount entered without a Collected Date", severity: "warning", importedValue: null, calculatedValue: null });
    }

    // Collected date before invoice date
    if (r.collectedDate && r.invoiceDate && r.collectedDate < r.invoiceDate) {
      issues.push({ ...base, field: "collectedDate", message: `Collected Date (${r.collectedDate}) is earlier than Invoice Date (${r.invoiceDate})`, severity: "error", importedValue: r.collectedDate, calculatedValue: r.invoiceDate });
    }

    // Due date before invoice date
    if (r.dueDate && r.invoiceDate && r.dueDate < r.invoiceDate) {
      issues.push({ ...base, field: "dueDate", message: `Due Date (${r.dueDate}) is earlier than Invoice Date (${r.invoiceDate})`, severity: "error", importedValue: r.dueDate, calculatedValue: r.invoiceDate });
    }

    // Invoice date without invoice amount
    if (r.invoiceDate && invoiced <= 0) {
      issues.push({ ...base, field: "invoiced", message: "Invoice Date set but Invoiced amount is zero", severity: "warning", importedValue: "0", calculatedValue: null });
    }

    // Net Revenue mismatch
    const calculatedNetRevenue = collected - penalties;
    if (Math.abs(netRevenue - calculatedNetRevenue) > 1) {
      issues.push({ ...base, field: "netRevenue", message: `Net Revenue mismatch: imported ${netRevenue.toFixed(2)} vs calculated ${calculatedNetRevenue.toFixed(2)}`, severity: "warning", importedValue: netRevenue.toFixed(2), calculatedValue: calculatedNetRevenue.toFixed(2) });
    }

    // Days mismatch
    if (r.days != null && r.invoiceDate && r.collectedDate) {
      const calculatedDays = Math.round(
        (new Date(r.collectedDate).getTime() - new Date(r.invoiceDate).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      if (Math.abs(r.days - calculatedDays) > 1) {
        issues.push({ ...base, field: "days", message: `Days mismatch: imported ${r.days} vs calculated ${calculatedDays}`, severity: "warning", importedValue: String(r.days), calculatedValue: String(calculatedDays) });
      }
    }

    // Outstanding but no due date
    const outstanding = Math.max(invoiced - collected, 0);
    if (outstanding > 0 && invoiced > 0 && !r.dueDate) {
      issues.push({ ...base, field: "dueDate", message: "Invoice not fully collected but Due Date is blank", severity: "warning", importedValue: null, calculatedValue: null });
    }

    // Deductible variance (> 5% of work order)
    if (workOrder > 0) {
      const calculatedDeductible = workOrder - revenue;
      if (Math.abs(deductible - calculatedDeductible) > workOrder * 0.05) {
        issues.push({ ...base, field: "deductible", message: `Deductible (${deductible.toFixed(2)}) differs materially from Work Order − Revenue (${calculatedDeductible.toFixed(2)})`, severity: "warning", importedValue: deductible.toFixed(2), calculatedValue: calculatedDeductible.toFixed(2) });
      }
    }
  }

  res.json(issues);
});

export default router;
