import { Router, type IRouter } from "express";
import { eq, and, like, gte, lte, sql, desc, isNull, not } from "drizzle-orm";
import { db, revenueRecordsTable, projectsTable, auditLogsTable } from "@workspace/db";
import {
  ListRecordsQueryParams,
  CreateRecordBody,
  GetRecordParams,
  UpdateRecordParams,
  UpdateRecordBody,
  DeleteRecordParams,
  ImportRecordsBody,
  ClearDemoDataResponse,
} from "@workspace/api-zod";
import { enrichRecord, toNum } from "../../lib/businessLogic";
import { logAudit } from "../../lib/audit";

const router: IRouter = Router();

function buildFilters(params: Record<string, unknown>) {
  const conditions = [];
  if (params.project && typeof params.project === "string") {
    conditions.push(like(revenueRecordsTable.projectName, `%${params.project}%`));
  }
  if (params.revenueYear) {
    const yr = String(params.revenueYear);
    conditions.push(
      sql`EXTRACT(YEAR FROM ${revenueRecordsTable.revenueMonth}::date) = ${yr}`,
    );
  }
  if (params.revenueMonth) {
    const mo = String(params.revenueMonth);
    conditions.push(
      sql`EXTRACT(MONTH FROM ${revenueRecordsTable.revenueMonth}::date) = ${mo}`,
    );
  }
  if (params.invoiceNo && typeof params.invoiceNo === "string") {
    conditions.push(like(revenueRecordsTable.invoiceNo, `%${params.invoiceNo}%`));
  }
  if (params.dateFrom && typeof params.dateFrom === "string") {
    conditions.push(gte(revenueRecordsTable.revenueMonth, params.dateFrom));
  }
  if (params.dateTo && typeof params.dateTo === "string") {
    conditions.push(lte(revenueRecordsTable.revenueMonth, params.dateTo));
  }
  return conditions;
}

// GET /records
router.get("/records", async (req, res): Promise<void> => {
  const parsed = ListRecordsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const q = parsed.data;
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 50;
  const offset = (page - 1) * pageSize;
  const conditions = buildFilters(q as Record<string, unknown>);
  const today = new Date();

  const [allRows, countResult] = await Promise.all([
    db
      .select()
      .from(revenueRecordsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(revenueRecordsTable.revenueMonth), desc(revenueRecordsTable.id))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(revenueRecordsTable)
      .where(conditions.length ? and(...conditions) : undefined),
  ]);

  let records = allRows.map((r) => enrichRecord(r, today));

  if (q.invoiceStatus) {
    records = records.filter((r) => r.paymentStatus === q.invoiceStatus);
  }
  if (q.overdue != null) {
    if (q.overdue) {
      records = records.filter((r) => r.overdueAmount > 0);
    } else {
      records = records.filter((r) => r.overdueAmount === 0);
    }
  }

  res.json({
    data: records,
    total: countResult[0]?.count ?? 0,
    page,
    pageSize,
  });
});

// POST /records
router.post("/records", async (req, res): Promise<void> => {
  const parsed = CreateRecordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;

  let projectId: number | null = null;
  const existing = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(eq(projectsTable.name, data.projectName))
    .limit(1);
  if (existing.length) {
    projectId = existing[0].id;
  } else {
    const [newProject] = await db
      .insert(projectsTable)
      .values({ name: data.projectName, status: "ongoing" })
      .returning({ id: projectsTable.id });
    projectId = newProject?.id ?? null;
  }

  const [record] = await db
    .insert(revenueRecordsTable)
    .values({
      projectId,
      projectName: data.projectName,
      revenueMonth: data.revenueMonth,
      workOrder: String(data.workOrder ?? 0),
      revenue: String(data.revenue ?? 0),
      deductible: String(data.deductible ?? 0),
      invoiced: String(data.invoiced ?? 0),
      invoiceDate: data.invoiceDate ?? null,
      invoiceNo: data.invoiceNo ?? null,
      dueDate: data.dueDate ?? null,
      collected: String(data.collected ?? 0),
      collectedDate: data.collectedDate ?? null,
      days: data.days ?? null,
      penalties: String(data.penalties ?? 0),
      netRevenue: String(data.netRevenue ?? 0),
      isDemo: data.isDemo ?? false,
    })
    .returning();

  await logAudit("create", "revenue_records", record.id, null, record);
  res.status(201).json(enrichRecord(record, new Date()));
});

// DELETE /records/demo/clear — must be before /:id
router.delete("/records/demo/clear", async (_req, res): Promise<void> => {
  const result = await db
    .delete(revenueRecordsTable)
    .where(eq(revenueRecordsTable.isDemo, true))
    .returning({ id: revenueRecordsTable.id });

  await logAudit("clear_demo", "revenue_records", null, null, { deleted: result.length });
  const response = ClearDemoDataResponse.parse({ deleted: result.length });
  res.json(response);
});

// POST /records/import
router.post("/records/import", async (req, res): Promise<void> => {
  const parsed = ImportRecordsBody.safeParse(req.body);
  if (!parsed.success) {
    // Build a human-readable list of field validation errors
    const issues = parsed.error.errors.map((e) => {
      const field = e.path.length ? e.path.join('.') : 'body';
      return `${field}: ${e.message}`;
    });
    res.status(400).json({ error: issues.slice(0, 5).join(' | ') });
    return;
  }
  const { records, allowDuplicateInvoices } = parsed.data;
  const warnings: Array<{ row: number; field: string; message: string; severity: "warning" | "error" }> = [];
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  const existingInvoices = await db
    .select({ invoiceNo: revenueRecordsTable.invoiceNo })
    .from(revenueRecordsTable)
    .where(not(isNull(revenueRecordsTable.invoiceNo)));
  const existingInvoiceNos = new Set(
    existingInvoices.map((r) => r.invoiceNo).filter(Boolean) as string[],
  );

  const projectRows = await db.select().from(projectsTable);
  const projectMap = new Map(projectRows.map((p) => [p.name, p.id]));

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const rowNum = i + 1;

    if (rec.invoiceNo && existingInvoiceNos.has(rec.invoiceNo) && !allowDuplicateInvoices) {
      warnings.push({ row: rowNum, field: "invoiceNo", message: `Duplicate invoice number: ${rec.invoiceNo}`, severity: "warning" });
      skipped++;
      continue;
    }

    let projectId = rec.projectName ? projectMap.get(rec.projectName) ?? null : null;
    if (rec.projectName && !projectId) {
      const [newProj] = await db
        .insert(projectsTable)
        .values({ name: rec.projectName, status: "ongoing" })
        .returning({ id: projectsTable.id });
      projectId = newProj?.id ?? null;
      if (projectId) projectMap.set(rec.projectName, projectId);
    }

    const workOrder = rec.workOrder ?? 0;
    const revenue = rec.revenue ?? 0;
    const deductible = rec.deductible ?? 0;
    const calculatedDeductible = workOrder - revenue;
    if (Math.abs(deductible - calculatedDeductible) > workOrder * 0.05 && workOrder > 0) {
      warnings.push({ row: rowNum, field: "deductible", message: `Imported deductible (${deductible.toFixed(2)}) differs materially from Work Order − Revenue (${calculatedDeductible.toFixed(2)})`, severity: "warning" });
    }

    try {
      const [record] = await db
        .insert(revenueRecordsTable)
        .values({
          projectId,
          projectName: rec.projectName,
          revenueMonth: rec.revenueMonth,
          workOrder: String(rec.workOrder ?? 0),
          revenue: String(rec.revenue ?? 0),
          deductible: String(rec.deductible ?? 0),
          invoiced: String(rec.invoiced ?? 0),
          invoiceDate: rec.invoiceDate ?? null,
          invoiceNo: rec.invoiceNo ?? null,
          dueDate: rec.dueDate ?? null,
          collected: String(rec.collected ?? 0),
          collectedDate: rec.collectedDate ?? null,
          days: rec.days ?? null,
          penalties: String(rec.penalties ?? 0),
          netRevenue: String(rec.netRevenue ?? 0),
          isDemo: rec.isDemo ?? false,
        })
        .returning();
      if (rec.invoiceNo) existingInvoiceNos.add(rec.invoiceNo);
      imported++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Row ${rowNum}: ${msg}`);
      skipped++;
    }
  }

  await logAudit("import", "revenue_records", null, null, { imported, skipped });
  res.json({ imported, skipped, warnings, errors });
});

// GET /records/:id
router.get("/records/:id", async (req, res): Promise<void> => {
  const params = GetRecordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [record] = await db
    .select()
    .from(revenueRecordsTable)
    .where(eq(revenueRecordsTable.id, params.data.id))
    .limit(1);
  if (!record) {
    res.status(404).json({ error: "Record not found" });
    return;
  }
  res.json(enrichRecord(record, new Date()));
});

// PATCH /records/:id
router.patch("/records/:id", async (req, res): Promise<void> => {
  const params = UpdateRecordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateRecordBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(revenueRecordsTable)
    .where(eq(revenueRecordsTable.id, params.data.id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Record not found" });
    return;
  }

  const updates: Partial<typeof revenueRecordsTable.$inferInsert> = {};
  const b = body.data as any;
  if (b.projectName != null) updates.projectName = b.projectName;
  if (b.revenueMonth != null) updates.revenueMonth = b.revenueMonth;
  if (b.workOrder != null) updates.workOrder = String(b.workOrder);
  if (b.revenue != null) updates.revenue = String(b.revenue);
  if (b.deductible != null) updates.deductible = String(b.deductible);
  if (b.invoiced != null) updates.invoiced = String(b.invoiced);
  if ("invoiceDate" in b) updates.invoiceDate = b.invoiceDate ?? null;
  if ("invoiceNo" in b) updates.invoiceNo = b.invoiceNo ?? null;
  if ("dueDate" in b) updates.dueDate = b.dueDate ?? null;
  if (b.collected != null) updates.collected = String(b.collected);
  if ("collectedDate" in b) updates.collectedDate = b.collectedDate ?? null;
  if ("days" in b) updates.days = b.days ?? null;
  if (b.penalties != null) updates.penalties = String(b.penalties);
  if (b.netRevenue != null) updates.netRevenue = String(b.netRevenue);

  const [updated] = await db
    .update(revenueRecordsTable)
    .set(updates)
    .where(eq(revenueRecordsTable.id, params.data.id))
    .returning();

  await logAudit("update", "revenue_records", params.data.id, existing, updated);
  res.json(enrichRecord(updated, new Date()));
});

// DELETE /records/:id
router.delete("/records/:id", async (req, res): Promise<void> => {
  const params = DeleteRecordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(revenueRecordsTable)
    .where(eq(revenueRecordsTable.id, params.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Record not found" });
    return;
  }
  await logAudit("delete", "revenue_records", params.data.id, deleted, null);
  res.sendStatus(204);
});

export default router;
