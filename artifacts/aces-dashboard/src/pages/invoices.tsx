import { useMemo, useState } from 'react';
import { Search, Receipt } from 'lucide-react';
import { useListInvoices, getListInvoicesQueryKey } from '@workspace/api-client-react';
import { AppLayout } from '@/components/app-layout';
import { FilterBar } from '@/components/filter-bar';
import { ErrorState, EmptyState } from '@/components/empty-state';
import { TableSkeleton } from '@/components/table-skeleton';
import { StatusBadge } from '@/components/status-badge';
import { useFilters, apiProjectParam, clientFilterByProjects } from '@/lib/filter-context';
import { formatSAR, formatDate, formatDays, statusRowClass } from '@/lib/format';
import { Input } from '@/components/ui/input';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

const PAGE_SIZE = 25;

export default function InvoicesPage() {
  const { filters } = useFilters();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const project = apiProjectParam(filters);

  const params = {
    project,
    invoiceNo: search || undefined,
    paymentStatus: filters.invoiceStatus,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading, isError, refetch } = useListInvoices(params, {
    query: { queryKey: getListInvoicesQueryKey(params) },
  });

  const rows = useMemo(() => clientFilterByProjects(data?.data ?? [], filters), [data?.data, filters]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <AppLayout title="Invoice & Collections" description="Full invoice register with payment status and collection tracking">
      <FilterBar showInvoiceStatus />

      <div className="mb-4 flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by invoice no or project..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9 text-xs"
            data-testid="input-search-invoices"
          />
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <LegendDot color="bg-destructive" label="Overdue" />
          <LegendDot color="bg-[hsl(var(--chart-1))]" label="Due Soon / Partial" />
          <LegendDot color="bg-[hsl(var(--chart-2))]" label="Collected" />
          <LegendDot color="bg-muted-foreground/50" label="Not Invoiced" />
          <LegendDot color="bg-[hsl(var(--chart-3))]" label="Not Yet Due" />
        </div>
      </div>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <TableSkeleton rows={12} cols={10} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Receipt} title="No invoices found" description="Try adjusting your search or filters." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-card-border bg-card">
            <table className="w-full min-w-[1400px] text-left text-xs" data-testid="table-invoices">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 font-medium">Invoice No</th>
                  <th className="px-3 py-3 font-medium">Project</th>
                  <th className="px-3 py-3 font-medium">Revenue Month</th>
                  <th className="px-3 py-3 font-medium">Invoice Date</th>
                  <th className="px-3 py-3 font-medium">Due Date</th>
                  <th className="px-3 py-3 text-right font-medium">Invoiced</th>
                  <th className="px-3 py-3 text-right font-medium">Collected</th>
                  <th className="px-3 py-3 text-right font-medium">Outstanding</th>
                  <th className="px-3 py-3 font-medium">Collected Date</th>
                  <th className="px-3 py-3 text-right font-medium">Collection Days</th>
                  <th className="px-3 py-3 text-right font-medium">Outstanding Age</th>
                  <th className="px-3 py-3 text-right font-medium">Penalties</th>
                  <th className="px-3 py-3 text-right font-medium">Net Revenue</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-b border-border/60 last:border-0 transition-colors ${statusRowClass(r.paymentStatus)}`} data-testid={`row-invoice-${r.id}`}>
                    <td className="px-3 py-2.5 font-mono-num font-medium text-foreground">{r.invoiceNo ?? '—'}</td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{r.projectName}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatDate(r.revenueMonth)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatDate(r.invoiceDate)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatDate(r.dueDate)}</td>
                    <td className="px-3 py-2.5 text-right font-mono-num">{formatSAR(r.invoiced)}</td>
                    <td className="px-3 py-2.5 text-right font-mono-num text-accent">{formatSAR(r.collected)}</td>
                    <td className="px-3 py-2.5 text-right font-mono-num">{formatSAR(r.outstanding)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatDate(r.collectedDate)}</td>
                    <td className="px-3 py-2.5 text-right font-mono-num">{r.days ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono-num">{formatDays(r.outstandingAgeDays)}</td>
                    <td className="px-3 py-2.5 text-right font-mono-num text-destructive">{formatSAR(r.penalties)}</td>
                    <td className="px-3 py-2.5 text-right font-mono-num font-semibold">{formatSAR(r.netRevenue)}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={r.paymentStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data && data.total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}
              </p>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      data-testid="button-page-prev"
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink className="pointer-events-none">{page} / {totalPages}</PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      data-testid="button-page-next"
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
