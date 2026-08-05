import { useCallback, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  UploadCloud,
  FileSpreadsheet,
  FileDown,
  Printer,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useImportRecords,
  useClearDemoData,
  useListRecords,
  getListRecordsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetMonthlyTrendQueryKey,
  getGetProjectPerformanceQueryKey,
  getListProjectsQueryKey,
  getListInvoicesQueryKey,
  type RecordInput,
} from '@workspace/api-client-react';
import { AppLayout } from '@/components/app-layout';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { formatSAR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface ParsedRow extends RecordInput {
  _rowIndex: number;
  _warnings: string[];
}

const REQUIRED_FIELDS: (keyof RecordInput)[] = ['projectName', 'revenueMonth', 'workOrder', 'revenue'];

function normalizeDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') {
    // Excel serial date
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const mm = String(parsed.m).padStart(2, '0');
      const dd = String(parsed.d).padStart(2, '0');
      return `${parsed.y}-${mm}-${dd}`;
    }
  }
  const str = String(value).trim();
  const d = new Date(str);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return str || undefined;
}

function toNumber(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

function parseRows(raw: Record<string, unknown>[]): ParsedRow[] {
  return raw.map((row, i) => {
    const warnings: string[] = [];
    const get = (...keys: string[]) => {
      for (const k of keys) {
        for (const rowKey of Object.keys(row)) {
          if (rowKey.trim().toLowerCase() === k.toLowerCase()) return row[rowKey];
        }
      }
      return undefined;
    };

    const projectName = String(get('projectName', 'Project', 'Project Name') ?? '').trim();
    const revenueMonthRaw = get('revenueMonth', 'Revenue Month');
    const revenueMonth = normalizeDate(revenueMonthRaw) ?? '';
    const workOrder = toNumber(get('workOrder', 'Work Order'));
    const revenue = toNumber(get('revenue', 'Revenue'));

    if (!projectName) warnings.push('Missing project name');
    if (!revenueMonth) warnings.push('Missing or invalid revenue month');
    if (workOrder === 0) warnings.push('Work order is zero or missing');
    if (revenue === 0) warnings.push('Revenue is zero or missing');

    const parsed: ParsedRow = {
      _rowIndex: i + 2,
      _warnings: warnings,
      projectName,
      revenueMonth,
      workOrder,
      revenue,
      deductible: toNumber(get('deductible', 'Deductible')),
      invoiced: toNumber(get('invoiced', 'Invoiced')),
      invoiceDate: normalizeDate(get('invoiceDate', 'Invoice Date')) ?? null,
      invoiceNo: (get('invoiceNo', 'Invoice No', 'Invoice Number') as string) ?? null,
      dueDate: normalizeDate(get('dueDate', 'Due Date')) ?? null,
      collected: toNumber(get('collected', 'Collected')),
      collectedDate: normalizeDate(get('collectedDate', 'Collected Date')) ?? null,
      days: get('days', 'Days') ? toNumber(get('days', 'Days')) : null,
      penalties: toNumber(get('penalties', 'Penalties')),
      netRevenue: toNumber(get('netRevenue', 'Net Revenue')),
      isDemo: false,
    };

    return parsed;
  });
}

export default function ImportPage() {
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const importMutation = useImportRecords();
  const clearDemoMutation = useClearDemoData();
  const recordsQ = useListRecords({ pageSize: 5000, page: 1 }, { query: { queryKey: getListRecordsQueryKey({ pageSize: 5000, page: 1 }) } });

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListRecordsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMonthlyTrendQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetProjectPerformanceQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
  }, [queryClient]);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: false });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        setParsedRows(parseRows(json));
      } catch (err) {
        toast({ title: 'Failed to parse file', description: String(err), variant: 'destructive' });
      }
    };
    reader.readAsBinaryString(file);
  }, [toast]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const warningCount = useMemo(() => parsedRows.filter((r) => r._warnings.length > 0).length, [parsedRows]);
  const duplicateInvoiceNos = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of parsedRows) {
      if (r.invoiceNo) seen.set(r.invoiceNo, (seen.get(r.invoiceNo) ?? 0) + 1);
    }
    return new Set(Array.from(seen.entries()).filter(([, count]) => count > 1).map(([no]) => no));
  }, [parsedRows]);

  function handleImport() {
    const records: RecordInput[] = parsedRows.map(({ _rowIndex, _warnings, ...rest }) => rest);
    importMutation.mutate(
      { data: { records, allowDuplicateInvoices: allowDuplicates } },
      {
        onSuccess: (result) => {
          toast({
            title: 'Import complete',
            description: `${result.imported} records imported, ${result.skipped} skipped.`,
          });
          invalidateAll();
          setParsedRows([]);
          setFileName(null);
        },
        onError: (err) => {
          toast({ title: 'Import failed', description: String(err), variant: 'destructive' });
        },
      },
    );
  }

  function handleClearDemo() {
    clearDemoMutation.mutate(
      undefined,
      {
        onSuccess: (result) => {
          toast({ title: 'Demo data cleared', description: `${result.deleted} records removed.` });
          invalidateAll();
        },
        onError: (err) => {
          toast({ title: 'Failed to clear demo data', description: String(err), variant: 'destructive' });
        },
      },
    );
  }

  function handleExportExcel() {
    const rows = recordsQ.data?.data ?? [];
    if (rows.length === 0) {
      toast({ title: 'Nothing to export', description: 'No records are currently available.' });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(
      rows.map((r) => ({
        Project: r.projectName,
        'Revenue Month': r.revenueMonth,
        'Work Order': r.workOrder,
        Revenue: r.revenue,
        Deductible: r.deductible,
        Invoiced: r.invoiced,
        'Invoice No': r.invoiceNo,
        'Invoice Date': r.invoiceDate,
        'Due Date': r.dueDate,
        Collected: r.collected,
        'Collected Date': r.collectedDate,
        Days: r.days,
        Penalties: r.penalties,
        'Net Revenue': r.netRevenue,
        'Payment Status': r.paymentStatus,
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Revenue Records');
    XLSX.writeFile(wb, `aces-msd-revenue-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function handleExportPdf() {
    window.print();
  }

  return (
    <AppLayout title="Import & Export" description="Client-side Excel/CSV import with validation preview, plus data export">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors',
              dragActive ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/30',
            )}
            data-testid="dropzone-import"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
              data-testid="input-file-upload"
            />
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <UploadCloud className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-display text-sm font-semibold text-foreground">
                {fileName ? fileName : 'Drop Excel or CSV file here, or click to browse'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Supports .xlsx, .xls, and .csv — parsed entirely in your browser
              </p>
            </div>
          </div>

          {parsedRows.length > 0 && (
            <div className="rounded-lg border border-card-border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-sm font-semibold text-foreground">
                  Import Preview — {parsedRows.length} records
                </h3>
                <div className="flex items-center gap-2">
                  {warningCount > 0 && (
                    <span className="flex items-center gap-1 rounded-full border border-[hsl(var(--chart-1)/0.3)] bg-[hsl(var(--chart-1)/0.1)] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--chart-1))]">
                      <AlertTriangle className="h-3 w-3" />
                      {warningCount} rows with warnings
                    </span>
                  )}
                  {duplicateInvoiceNos.size > 0 && (
                    <span className="flex items-center gap-1 rounded-full border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                      {duplicateInvoiceNos.size} duplicate invoice no(s)
                    </span>
                  )}
                  <button onClick={() => { setParsedRows([]); setFileName(null); }} data-testid="button-clear-preview">
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              </div>

              <div className="max-h-96 overflow-auto rounded-md border border-border">
                <table className="w-full min-w-[900px] text-left text-[11px]" data-testid="table-import-preview">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-2 py-2 font-medium">Row</th>
                      <th className="px-2 py-2 font-medium">Project</th>
                      <th className="px-2 py-2 font-medium">Revenue Month</th>
                      <th className="px-2 py-2 text-right font-medium">Work Order</th>
                      <th className="px-2 py-2 text-right font-medium">Revenue</th>
                      <th className="px-2 py-2 font-medium">Invoice No</th>
                      <th className="px-2 py-2 font-medium">Warnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((r) => (
                      <tr
                        key={r._rowIndex}
                        className={cn('border-b border-border/50 last:border-0', r._warnings.length > 0 && 'bg-[hsl(var(--chart-1)/0.06)]')}
                        data-testid={`row-preview-${r._rowIndex}`}
                      >
                        <td className="px-2 py-1.5 font-mono-num text-muted-foreground">{r._rowIndex}</td>
                        <td className="px-2 py-1.5 font-medium text-foreground">{r.projectName || '—'}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.revenueMonth || '—'}</td>
                        <td className="px-2 py-1.5 text-right font-mono-num">{formatSAR(r.workOrder)}</td>
                        <td className="px-2 py-1.5 text-right font-mono-num">{formatSAR(r.revenue)}</td>
                        <td className={cn('px-2 py-1.5 font-mono-num', r.invoiceNo && duplicateInvoiceNos.has(r.invoiceNo) && 'text-destructive font-semibold')}>
                          {r.invoiceNo || '—'}
                        </td>
                        <td className="px-2 py-1.5">
                          {r._warnings.length === 0 ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                          ) : (
                            <span className="text-[10px] text-[hsl(var(--chart-1))]">{r._warnings.join('; ')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={allowDuplicates}
                    onCheckedChange={setAllowDuplicates}
                    data-testid="switch-allow-duplicates"
                  />
                  <span className="text-xs text-muted-foreground">Allow duplicate invoice numbers</span>
                </div>
                <Button onClick={handleImport} disabled={importMutation.isPending} data-testid="button-run-import">
                  {importMutation.isPending ? 'Importing…' : `Import ${parsedRows.length} Records`}
                </Button>
              </div>
            </div>
          )}

          {parsedRows.length === 0 && (
            <EmptyState
              icon={FileSpreadsheet}
              title="No file loaded yet"
              description="Upload an Excel or CSV file above to preview and validate records before importing."
            />
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-card-border bg-card p-4">
            <h3 className="mb-3 font-display text-sm font-semibold text-foreground">Export Data</h3>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={handleExportExcel} data-testid="button-export-excel">
                <FileDown className="mr-2 h-4 w-4" />
                Export to Excel
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={handleExportPdf} data-testid="button-export-pdf">
                <Printer className="mr-2 h-4 w-4" />
                Export to PDF
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-4">
            <h3 className="mb-1 font-display text-sm font-semibold text-destructive">Danger Zone</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Permanently removes all records flagged as demo data. This cannot be undone.
            </p>
            <Button
              variant="destructive"
              className="w-full justify-start"
              onClick={handleClearDemo}
              disabled={clearDemoMutation.isPending}
              data-testid="button-clear-demo"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {clearDemoMutation.isPending ? 'Clearing…' : 'Clear Demo Data'}
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
