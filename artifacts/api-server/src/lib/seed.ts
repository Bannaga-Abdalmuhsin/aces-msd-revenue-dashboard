import { db, projectsTable, revenueRecordsTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { readFileSync } from "fs";
import { resolve } from "path";
import { logger } from "./logger";

// Project metadata: contract dates and status only.
// Financial values (PO, expected monthly) come from revenue_records, not hardcoded here.
const PROJECT_META: Record<string, {
  contractStart: string;
  contractEnd: string;
  status: "ongoing" | "completed" | "closed";
}> = {
  "STC COW":                         { contractStart: "2023-10-01", contractEnd: "2026-10-31", status: "ongoing" },
  "Diesel Compensation 2024":        { contractStart: "2024-01-01", contractEnd: "2024-12-31", status: "completed" },
  "Diesel Compensation 2025":        { contractStart: "2025-01-01", contractEnd: "2025-12-31", status: "completed" },
  "Diesel Compensation 2026":        { contractStart: "2026-01-01", contractEnd: "2026-10-31", status: "ongoing" },
  "STC IBS":                         { contractStart: "2023-10-01", contractEnd: "2026-10-31", status: "ongoing" },
  "STC WiFi":                        { contractStart: "2022-05-01", contractEnd: "2026-04-30", status: "ongoing" },
  "ACES - NHP MS Project  O&M 2025": { contractStart: "2025-01-01", contractEnd: "2025-12-31", status: "ongoing" },
  "ACES - NHP MS Project  O&M 2026": { contractStart: "2026-01-01", contractEnd: "2026-12-31", status: "ongoing" },
};

// The authoritative CSV seed file committed to the repo.
// Used only when the DB is completely empty (e.g. after a wipe).
const CSV_PATH = resolve(
  process.cwd(),
  "../../attached_assets/ACES_MSD_Revenue_SQL_Ready_1786015620064.csv"
);

function str(v: string | undefined): string {
  const t = (v ?? "").trim();
  return t === "" ? "0" : t;
}
function nullable(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}
function intOrNull(v: string | undefined): number | null {
  const t = (v ?? "").trim();
  if (t === "") return null;
  const n = parseInt(t, 10);
  return isNaN(n) ? null : n;
}

async function syncProjectMeta(): Promise<void> {
  for (const [name, meta] of Object.entries(PROJECT_META)) {
    await db
      .update(projectsTable)
      .set({
        status: meta.status,
        contractStart: meta.contractStart,
        contractEnd: meta.contractEnd,
        poValue: "0",
        expectedMonthlyRevenue: "0",
      })
      .where(eq(projectsTable.name, name));
  }
}

export async function seedDemoData() {
  try {
    // Count ALL revenue records (user-uploaded have is_demo=false; seed rows have is_demo=true)
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(revenueRecordsTable);

    if (count > 0) {
      // Records already present — just keep project metadata in sync
      await syncProjectMeta();
      logger.info({ count }, "Revenue records present, synced project metadata");
      return;
    }

    // DB is empty — attempt to seed from the authoritative CSV
    let csvContent: string;
    try {
      csvContent = readFileSync(CSV_PATH, "utf8");
    } catch {
      logger.warn({ CSV_PATH }, "Seed CSV not found — database left empty");
      return;
    }

    const lines = csvContent.trim().split("\n").slice(1); // skip header
    logger.info({ rows: lines.length, CSV_PATH }, "Seeding from CSV...");

    // Upsert projects first
    const projectMap = new Map<string, number>();
    for (const [name, meta] of Object.entries(PROJECT_META)) {
      const [proj] = await db
        .insert(projectsTable)
        .values({
          name,
          status: meta.status,
          contractStart: meta.contractStart,
          contractEnd: meta.contractEnd,
          poValue: "0",
          expectedMonthlyRevenue: "0",
        })
        .onConflictDoUpdate({
          target: projectsTable.name,
          set: {
            status: meta.status,
            contractStart: meta.contractStart,
            contractEnd: meta.contractEnd,
            poValue: "0",
            expectedMonthlyRevenue: "0",
          },
        })
        .returning({ id: projectsTable.id });
      projectMap.set(name, proj.id);
    }

    // Parse and insert CSV rows in batches
    const rows = lines.map((line) => {
      const cols = line.split(",");
      const [
        project, revenue_month, work_order, revenue, deductible,
        invoiced, invoice_date, invoice_no, due_date,
        collected, collected_date, days, penalties, net_revenue,
      ] = cols;

      const projectName = (project ?? "").trim();
      return {
        projectId: projectMap.get(projectName) ?? null,
        projectName,
        revenueMonth: nullable(revenue_month) ?? revenue_month!.trim(),
        workOrder: str(work_order),
        revenue: str(revenue),
        deductible: str(deductible),
        invoiced: str(invoiced),
        invoiceDate: nullable(invoice_date),
        invoiceNo: nullable(invoice_no),
        dueDate: nullable(due_date),
        collected: str(collected),
        collectedDate: nullable(collected_date),
        days: intOrNull(days),
        penalties: str(penalties),
        netRevenue: str(net_revenue),
        isDemo: true as const,
      };
    });

    const batchSize = 20;
    for (let i = 0; i < rows.length; i += batchSize) {
      await db.insert(revenueRecordsTable).values(rows.slice(i, i + batchSize));
    }

    logger.info({ count: rows.length }, "CSV seed complete");
  } catch (err) {
    logger.error({ err }, "Seed failed");
  }
}
