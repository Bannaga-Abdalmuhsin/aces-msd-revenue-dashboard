/**
 * OData v4 feed — consumed by Power BI "Get Data → OData feed"
 *
 * Endpoints:
 *   GET /odata/                  Service document
 *   GET /odata/$metadata         CSDL XML (entity definitions)
 *   GET /odata/RevenueRecords    Data — supports $top, $skip, $count, $select, $filter
 *   GET /odata/Projects          Project list
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { db, revenueRecordsTable, projectsTable } from "@workspace/db";
import { enrichRecord, toNum } from "../../lib/businessLogic";

const router: IRouter = Router();

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Build the public base URL for OData context links.
 * Priority:
 *   1. ODATA_BASE_URL env var (explicit override for production)
 *   2. x-forwarded-proto / x-forwarded-host headers (Replit proxy)
 *   3. Fallback to req.protocol + req.hostname
 *
 * Result includes the /api mount prefix so context URLs resolve correctly,
 * e.g. https://myapp.replit.app/api
 */
function baseUrl(req: Request): string {
  if (process.env.ODATA_BASE_URL) return process.env.ODATA_BASE_URL.replace(/\/$/, "");

  // x-forwarded-proto may be a comma-list; take the first value
  const rawProto = req.headers["x-forwarded-proto"];
  const proto = (Array.isArray(rawProto) ? rawProto[0] : rawProto)?.split(",")[0]?.trim() ?? req.protocol ?? "https";

  const rawHost = req.headers["x-forwarded-host"];
  const host = (Array.isArray(rawHost) ? rawHost[0] : rawHost)?.trim() ?? req.headers.host ?? req.hostname;

  const mountPath = req.baseUrl || ""; // e.g. "/api"
  return `${proto}://${host}${mountPath}`;
}

/** OData Content-Type required by Power BI and strict OData clients */
const ODATA_CT = "application/json;odata.metadata=minimal;odata.streaming=true;IEEE754Compatible=false;charset=utf-8";

function sendOData(res: Response, body: unknown): void {
  res.set("Content-Type", ODATA_CT).json(body);
}

function odataContext(req: Request, entity: string): string {
  return `${baseUrl(req)}/odata/$metadata#${entity}`;
}

// Map enriched record keys → OData property names (PascalCase for Power BI)
function toODataRecord(r: ReturnType<typeof enrichRecord>) {
  return {
    Id: r.id,
    ProjectId: r.projectId ?? null,
    ProjectName: r.projectName,
    RevenueMonth: r.revenueMonth,
    WorkOrder: r.workOrder,
    Revenue: r.revenue,
    Deductible: r.deductible,
    Invoiced: r.invoiced,
    InvoiceDate: r.invoiceDate ?? null,
    InvoiceNo: r.invoiceNo ?? null,
    DueDate: r.dueDate ?? null,
    Collected: r.collected,
    CollectedDate: r.collectedDate ?? null,
    Days: r.days ?? null,
    Penalties: r.penalties,
    NetRevenue: r.netRevenue,
    PaymentStatus: r.paymentStatus,
    OutstandingAmount: r.outstandingAmount,
    OverdueAmount: r.overdueAmount,
    OutstandingAgeDays: r.outstandingAgeDays ?? null,
    DeductibleVariance: r.deductibleVariance ?? null,
    NetRevenueVariance: r.netRevenueVariance ?? null,
    CreatedAt: r.createdAt,
    UpdatedAt: r.updatedAt,
  };
}

// Apply OData $select to filter down the returned properties
function applySelect(record: Record<string, unknown>, select?: string): Record<string, unknown> {
  if (!select) return record;
  const fields = new Set(select.split(",").map((s) => s.trim()));
  return Object.fromEntries(Object.entries(record).filter(([k]) => fields.has(k)));
}

// Very basic $filter parser — handles simple "Field eq 'value'" / "Field eq number"
// Power BI often sends more complex queries; unsupported clauses are silently ignored.
function applyFilter(
  rows: Record<string, unknown>[],
  filter?: string,
): Record<string, unknown>[] {
  if (!filter) return rows;
  // Match patterns like: ProjectName eq 'STC COW'  |  Revenue gt 1000000
  const eqStr = filter.match(/^(\w+)\s+eq\s+'([^']*)'$/);
  const eqNum = filter.match(/^(\w+)\s+eq\s+([\d.]+)$/);
  const gtNum = filter.match(/^(\w+)\s+gt\s+([\d.]+)$/);
  const ltNum = filter.match(/^(\w+)\s+lt\s+([\d.]+)$/);
  if (eqStr) {
    const [, field, value] = eqStr;
    return rows.filter((r) => String(r[field] ?? "") === value);
  }
  if (eqNum) {
    const [, field, value] = eqNum;
    return rows.filter((r) => Number(r[field]) === Number(value));
  }
  if (gtNum) {
    const [, field, value] = gtNum;
    return rows.filter((r) => Number(r[field]) > Number(value));
  }
  if (ltNum) {
    const [, field, value] = ltNum;
    return rows.filter((r) => Number(r[field]) < Number(value));
  }
  return rows;
}

// ── Service document ─────────────────────────────────────────────────────────

router.get(["/odata", "/odata/"], (req: Request, res: Response) => {
  sendOData(res, {
    "@odata.context": `${baseUrl(req)}/odata/$metadata`,
    value: [
      { name: "RevenueRecords", kind: "EntitySet", url: "RevenueRecords" },
      { name: "Projects", kind: "EntitySet", url: "Projects" },
    ],
  });
});

// ── $metadata (CSDL XML) ─────────────────────────────────────────────────────

router.get("/odata/\\$metadata", (_req: Request, res: Response) => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="ACES.MSD" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="RevenueRecord">
        <Key><PropertyRef Name="Id"/></Key>
        <Property Name="Id"                 Type="Edm.Int32"     Nullable="false"/>
        <Property Name="ProjectId"          Type="Edm.Int32"/>
        <Property Name="ProjectName"        Type="Edm.String"    Nullable="false"/>
        <Property Name="RevenueMonth"       Type="Edm.Date"      Nullable="false"/>
        <Property Name="WorkOrder"          Type="Edm.Decimal"   Nullable="false"/>
        <Property Name="Revenue"            Type="Edm.Decimal"   Nullable="false"/>
        <Property Name="Deductible"         Type="Edm.Decimal"   Nullable="false"/>
        <Property Name="Invoiced"           Type="Edm.Decimal"   Nullable="false"/>
        <Property Name="InvoiceDate"        Type="Edm.Date"/>
        <Property Name="InvoiceNo"          Type="Edm.String"/>
        <Property Name="DueDate"            Type="Edm.Date"/>
        <Property Name="Collected"          Type="Edm.Decimal"   Nullable="false"/>
        <Property Name="CollectedDate"      Type="Edm.Date"/>
        <Property Name="Days"               Type="Edm.Int32"/>
        <Property Name="Penalties"          Type="Edm.Decimal"   Nullable="false"/>
        <Property Name="NetRevenue"         Type="Edm.Decimal"   Nullable="false"/>
        <Property Name="PaymentStatus"      Type="Edm.String"    Nullable="false"/>
        <Property Name="OutstandingAmount"  Type="Edm.Decimal"   Nullable="false"/>
        <Property Name="OverdueAmount"      Type="Edm.Decimal"   Nullable="false"/>
        <Property Name="OutstandingAgeDays" Type="Edm.Int32"/>
        <Property Name="DeductibleVariance" Type="Edm.Decimal"/>
        <Property Name="NetRevenueVariance" Type="Edm.Decimal"/>
        <Property Name="CreatedAt"          Type="Edm.DateTimeOffset" Nullable="false"/>
        <Property Name="UpdatedAt"          Type="Edm.DateTimeOffset" Nullable="false"/>
      </EntityType>
      <EntityType Name="Project">
        <Key><PropertyRef Name="Id"/></Key>
        <Property Name="Id"                     Type="Edm.Int32"   Nullable="false"/>
        <Property Name="Name"                   Type="Edm.String"  Nullable="false"/>
        <Property Name="Status"                 Type="Edm.String"/>
        <Property Name="ContractStart"          Type="Edm.Date"/>
        <Property Name="ContractEnd"            Type="Edm.Date"/>
        <Property Name="PoValue"                Type="Edm.Decimal"/>
        <Property Name="ExpectedMonthlyRevenue" Type="Edm.Decimal"/>
      </EntityType>
      <EntityContainer Name="Container">
        <EntitySet Name="RevenueRecords" EntityType="ACES.MSD.RevenueRecord"/>
        <EntitySet Name="Projects"       EntityType="ACES.MSD.Project"/>
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

  res.set("Content-Type", "application/xml; charset=utf-8");
  res.send(xml);
});

// ── RevenueRecords entity set ────────────────────────────────────────────────

router.get("/odata/RevenueRecords", async (req: Request, res: Response): Promise<void> => {
  const q = req.query as Record<string, string>;
  const top    = q["$top"]    ? Math.min(parseInt(q["$top"],    10), 10000) : undefined;
  const skip   = q["$skip"]   ? Math.max(parseInt(q["$skip"],   10), 0)    : undefined;
  const count  = q["$count"]  === "true";
  const select = q["$select"] || undefined;
  const filter = q["$filter"] || undefined;

  const today = new Date();
  const allRows = await db.select().from(revenueRecordsTable);
  let records = allRows.map((r) => toODataRecord(enrichRecord(r, today)));

  // $filter
  if (filter) {
    records = applyFilter(records as Record<string, unknown>[], filter) as typeof records;
  }

  const totalCount = records.length;

  // $skip then $top
  if (skip)  records = records.slice(skip);
  if (top)   records = records.slice(0, top);

  // $select
  const value = select
    ? records.map((r) => applySelect(r as Record<string, unknown>, select))
    : records;

  const response: Record<string, unknown> = {
    "@odata.context": odataContext(req, "RevenueRecords"),
    value,
  };
  if (count) response["@odata.count"] = totalCount;

  sendOData(res, response);
});

// ── Projects entity set ──────────────────────────────────────────────────────

router.get("/odata/Projects", async (req: Request, res: Response): Promise<void> => {
  const q = req.query as Record<string, string>;
  const top    = q["$top"]  ? Math.min(parseInt(q["$top"],  10), 1000) : undefined;
  const skip   = q["$skip"] ? Math.max(parseInt(q["$skip"], 10), 0)    : undefined;
  const count  = q["$count"] === "true";
  const select = q["$select"] || undefined;

  let projects = (await db.select().from(projectsTable)).map((p) => ({
    Id: p.id,
    Name: p.name,
    Status: p.status ?? null,
    ContractStart: p.contractStart ?? null,
    ContractEnd: p.contractEnd ?? null,
    PoValue: toNum(p.poValue),
    ExpectedMonthlyRevenue: toNum(p.expectedMonthlyRevenue),
  }));

  const totalCount = projects.length;
  if (skip) projects = projects.slice(skip);
  if (top)  projects = projects.slice(0, top);

  const value = select
    ? projects.map((p) => applySelect(p as Record<string, unknown>, select))
    : projects;

  const response: Record<string, unknown> = {
    "@odata.context": odataContext(req, "Projects"),
    value,
  };
  if (count) response["@odata.count"] = totalCount;

  sendOData(res, response);
});

export default router;
