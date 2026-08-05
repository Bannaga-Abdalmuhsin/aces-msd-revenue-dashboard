import { Router, type IRouter } from "express";
import { and, sql, like, gte, lte, desc } from "drizzle-orm";
import { db, revenueRecordsTable } from "@workspace/db";
import { ListInvoicesQueryParams } from "@workspace/api-zod";
import {
  toNum,
  computePaymentStatus,
  computeOutstanding,
  computeOverdue,
} from "../../lib/businessLogic";

const router: IRouter = Router();

router.get("/invoices", async (req, res): Promise<void> => {
  const parsed = ListInvoicesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const q = parsed.data;
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 50;
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (q.project) conditions.push(like(revenueRecordsTable.projectName, `%${q.project}%`));
  if (q.invoiceNo) conditions.push(like(revenueRecordsTable.invoiceNo, `%${q.invoiceNo}%`));
  if (q.dateFrom) conditions.push(gte(revenueRecordsTable.invoiceDate, q.dateFrom));
  if (q.dateTo) conditions.push(lte(revenueRecordsTable.invoiceDate, q.dateTo));
  // Only show invoiced records (invoice no or invoiced > 0)
  conditions.push(sql`${revenueRecordsTable.invoiced}::numeric > 0 OR ${revenueRecordsTable.invoiceNo} IS NOT NULL`);

  const today = new Date();

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(revenueRecordsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(revenueRecordsTable.invoiceDate), desc(revenueRecordsTable.id))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(revenueRecordsTable)
      .where(conditions.length ? and(...conditions) : undefined),
  ]);

  let invoices = rows.map((r) => {
    const invoiced = toNum(r.invoiced);
    const collected = toNum(r.collected);
    const outstanding = computeOutstanding(invoiced, collected);
    const paymentStatus = computePaymentStatus(invoiced, collected, r.dueDate, r.collectedDate, today);

    let outstandingAgeDays: number | null = null;
    if (outstanding > 0 && r.invoiceDate) {
      outstandingAgeDays = Math.floor(
        (today.getTime() - new Date(r.invoiceDate).getTime()) / (1000 * 60 * 60 * 24),
      );
    }

    return {
      id: r.id,
      projectName: r.projectName,
      revenueMonth: r.revenueMonth,
      invoiceNo: r.invoiceNo ?? null,
      invoiceDate: r.invoiceDate ?? null,
      dueDate: r.dueDate ?? null,
      invoiced,
      collected,
      outstanding,
      collectedDate: r.collectedDate ?? null,
      days: r.days ?? null,
      outstandingAgeDays,
      penalties: toNum(r.penalties),
      netRevenue: toNum(r.netRevenue),
      paymentStatus,
    };
  });

  // Filter by payment status after enrichment
  if (q.paymentStatus) {
    invoices = invoices.filter((i) => i.paymentStatus === q.paymentStatus);
  }
  if (q.overdue != null) {
    if (q.overdue) {
      invoices = invoices.filter((i) => ["Overdue", "Due Soon"].includes(i.paymentStatus));
    } else {
      invoices = invoices.filter((i) => !["Overdue", "Due Soon"].includes(i.paymentStatus));
    }
  }

  res.json({
    data: invoices,
    total: countResult[0]?.count ?? 0,
    page,
    pageSize,
  });
});

export default router;
