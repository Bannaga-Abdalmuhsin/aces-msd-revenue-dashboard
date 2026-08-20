# ACES MSD Revenue Dashboard

A comprehensive financial dashboard for the ACES Managed Services Department. Tracks project revenue, invoicing, collections, outstanding payments, deductibles, and penalties across telecom infrastructure projects (STC COW, STC IBS, STC WiFi, Diesel Compensation, NHP O&M).

## Run & Operate

- `pnpm --filter @workspace/aces-dashboard run dev` — run the frontend dashboard (port auto-assigned)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — for session management

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 18, Vite, Tailwind CSS v4, Recharts, Framer Motion, Wouter (routing)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM (numeric columns for money precision)
- Validation: Zod (v3), drizzle-zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- File import: xlsx (client-side Excel/CSV parsing)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/` — DB schema: projects.ts, revenueRecords.ts, auditLogs.ts
- `artifacts/api-server/src/routes/` — API route handlers
- `artifacts/api-server/src/lib/businessLogic.ts` — payment status, outstanding, aging calculations
- `artifacts/api-server/src/lib/seed.ts` — demo data from the ACES MSD Excel file (86 records, 8 projects)
- `artifacts/aces-dashboard/src/` — React frontend

## Architecture decisions

- Money stored as PostgreSQL NUMERIC(20,4) to avoid floating-point errors (requirement: SAR precision)
- Payment status computed at API query time (not stored) — depends on today's date
- projectName is denormalized on revenue_records for simpler querying alongside the projectId FK
- Client-side Excel parsing: xlsx package in the browser sends JSON to /api/records/import (keeps server stateless for file ops)
- Demo data seeded on first server startup from hardcoded ACES MSD Excel data; can be cleared via UI

## Product

**10 pages:**
1. Executive Overview — 13 KPI cards + 5 charts + management insights
2. Project Performance — all projects with aggregated metrics, clickable for detail
3. Project Detail — monthly trend + invoice list per project
4. Revenue Analysis — monthly chart, waterfall, heatmap (projects × months)
5. Invoice & Collections — full register with color-coded payment status
6. Outstanding Aging — aging buckets (Not Due / 1-30d / 31-60d / 61-90d / 90d+)
7. Deductibles & Penalties — breakdown by project
8. Monthly Forecast — expected collections by due date month, next 30/60/90 days
9. Data Validation — data quality issues (errors/warnings with imported vs calculated values)
10. Import & Export — drag-and-drop Excel/CSV import with preview; Export; Clear demo data
11. Administration — paginated audit log

**Currency:** SAR, formatted as SAR 36.0M / SAR 2.4K / SAR 950

## User preferences

_Populate as needed._

## Gotchas

- All `integer` types in openapi.yaml are written as `number` (not `integer`) because Orval generates `zod.int()` for integer types, which is a Zod v4 API not available in the installed Zod v3. Using `number` generates `zod.number()` which works.
- After any OpenAPI spec change, re-run `pnpm --filter @workspace/api-spec run codegen` before touching routes or frontend hooks.
- Demo data is seeded with `isDemo: true`. The "Clear Demo Data" button on the Import page deletes only demo records.
- The `DELETE /api/records/demo/clear` route must be registered before `DELETE /api/records/:id` in the router to avoid Express matching "demo" as an :id parameter.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
