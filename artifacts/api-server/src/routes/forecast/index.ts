import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, revenueRecordsTable } from "@workspace/db";
import { toNum, computeOutstanding } from "../../lib/businessLogic";

const router: IRouter = Router();

router.get("/forecast", async (_req, res): Promise<void> => {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const records = await db.select().from(revenueRecordsTable);

  // Build monthly data: group by revenue month for actuals
  // Group by due date month for expected collections
  const monthlyActuals = new Map<string, { workOrder: number; revenue: number; collected: number }>();
  const monthlyExpected = new Map<string, { expected: number; outstanding: number }>();

  let next30 = 0, next60 = 0, next90 = 0;
  const msPerDay = 1000 * 60 * 60 * 24;

  for (const r of records) {
    const workOrder = toNum(r.workOrder);
    const revenue = toNum(r.revenue);
    const invoiced = toNum(r.invoiced);
    const collected = toNum(r.collected);
    const outstanding = computeOutstanding(invoiced, collected);

    // Actuals by revenue month
    const revMonth = r.revenueMonth.substring(0, 7); // YYYY-MM
    if (!monthlyActuals.has(revMonth)) {
      monthlyActuals.set(revMonth, { workOrder: 0, revenue: 0, collected: 0 });
    }
    const ma = monthlyActuals.get(revMonth)!;
    ma.workOrder += workOrder;
    ma.revenue += revenue;
    ma.collected += collected;

    // Expected collections by due date month
    if (outstanding > 0 && r.dueDate) {
      const dueMonth = r.dueDate.substring(0, 7);
      if (!monthlyExpected.has(dueMonth)) {
        monthlyExpected.set(dueMonth, { expected: 0, outstanding: 0 });
      }
      const me = monthlyExpected.get(dueMonth)!;
      me.expected += outstanding;
      me.outstanding += outstanding;

      // Count for next 30/60/90 days
      if (r.dueDate >= todayStr) {
        const daysUntil = Math.ceil(
          (new Date(r.dueDate).getTime() - today.getTime()) / msPerDay,
        );
        if (daysUntil <= 30) next30 += outstanding;
        if (daysUntil <= 60) next60 += outstanding;
        if (daysUntil <= 90) next90 += outstanding;
      }
    }
  }

  // Build combined months list (all unique months from both actual and expected)
  const allMonths = new Set([
    ...monthlyActuals.keys(),
    ...monthlyExpected.keys(),
  ]);
  const sortedMonths = [...allMonths].sort();

  const months = sortedMonths.map((month) => {
    const actual = monthlyActuals.get(month);
    const expected = monthlyExpected.get(month);
    const isActual = month < todayStr.substring(0, 7);

    return {
      month,
      expectedCollection: expected?.expected ?? 0,
      outstanding: expected?.outstanding ?? 0,
      workOrder: actual?.workOrder ?? 0,
      revenue: isActual ? (actual?.revenue ?? null) : null,
      isActual,
    };
  });

  res.json({ months, next30, next60, next90 });
});

export default router;
