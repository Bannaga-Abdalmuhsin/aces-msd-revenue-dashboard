import { useMemo, useState } from 'react';
import { ClipboardCheck, Search } from 'lucide-react';
import { useGetValidationIssues } from '@workspace/api-client-react';
import { AppLayout } from '@/components/app-layout';
import { ErrorState, EmptyState } from '@/components/empty-state';
import { TableSkeleton } from '@/components/table-skeleton';
import { SeverityBadge } from '@/components/status-badge';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/format';

export default function ValidationPage() {
  const { data, isLoading, isError, refetch } = useGetValidationIssues();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const rows = data ?? [];
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.projectName?.toLowerCase().includes(q) ||
        r.invoiceNo?.toLowerCase().includes(q) ||
        r.field.toLowerCase().includes(q) ||
        r.message.toLowerCase().includes(q),
    );
  }, [data, search]);

  const errorCount = useMemo(() => (data ?? []).filter((i) => i.severity === 'error').length, [data]);
  const warningCount = useMemo(() => (data ?? []).filter((i) => i.severity === 'warning').length, [data]);

  return (
    <AppLayout title="Data Validation" description="Automated data quality checks across missing fields, duplicates, and calculation mismatches">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-card-border bg-card p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Issues</p>
          <p className="mt-2 font-mono-num font-display text-lg font-semibold text-foreground">{data?.length ?? 0}</p>
        </div>
        <div className="rounded-lg border border-card-border bg-card p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Errors</p>
          <p className="mt-2 font-mono-num font-display text-lg font-semibold text-destructive">{errorCount}</p>
        </div>
        <div className="rounded-lg border border-card-border bg-card p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Warnings</p>
          <p className="mt-2 font-mono-num font-display text-lg font-semibold text-[hsl(var(--chart-1))]">{warningCount}</p>
        </div>
      </div>

      <div className="mb-4 relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by project, invoice, or field..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 text-xs"
          data-testid="input-search-validation"
        />
      </div>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <TableSkeleton rows={8} cols={7} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No data quality issues" description="All revenue records passed validation checks." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-card-border bg-card">
          <table className="w-full min-w-[1100px] text-left text-xs" data-testid="table-validation-issues">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-3 font-medium">Severity</th>
                <th className="px-3 py-3 font-medium">Project</th>
                <th className="px-3 py-3 font-medium">Revenue Month</th>
                <th className="px-3 py-3 font-medium">Invoice No</th>
                <th className="px-3 py-3 font-medium">Field</th>
                <th className="px-3 py-3 font-medium">Message</th>
                <th className="px-3 py-3 font-medium">Imported</th>
                <th className="px-3 py-3 font-medium">Calculated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((issue, i) => (
                <tr key={`${issue.recordId}-${issue.field}-${i}`} className="border-b border-border/60 last:border-0" data-testid={`row-validation-${issue.recordId}-${i}`}>
                  <td className="px-3 py-2.5"><SeverityBadge severity={issue.severity} /></td>
                  <td className="px-3 py-2.5 font-medium text-foreground">{issue.projectName ?? '—'}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{issue.revenueMonth ? formatDate(issue.revenueMonth) : '—'}</td>
                  <td className="px-3 py-2.5 font-mono-num text-muted-foreground">{issue.invoiceNo ?? '—'}</td>
                  <td className="px-3 py-2.5 font-mono-num text-muted-foreground">{issue.field}</td>
                  <td className="px-3 py-2.5 text-foreground">{issue.message}</td>
                  <td className="px-3 py-2.5 font-mono-num text-muted-foreground">{issue.importedValue ?? '—'}</td>
                  <td className="px-3 py-2.5 font-mono-num text-muted-foreground">{issue.calculatedValue ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
