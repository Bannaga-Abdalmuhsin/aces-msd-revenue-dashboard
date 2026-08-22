import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer, } from 'recharts';
import { useGetAgingReport, useGetCollectionTrend, useListInvoices, getGetAgingReportQueryKey, getGetCollectionTrendQueryKey, getListInvoicesQueryKey, } from '@workspace/api-client-react';
import { AppLayout } from '@/components/app-layout';
import { FilterBar } from '@/components/filter-bar';
import { ChartCard } from '@/components/chart-card';
import { ErrorState, EmptyState } from '@/components/empty-state';
import { ChartSkeleton, TableSkeleton } from '@/components/table-skeleton';
import { StatusBadge } from '@/components/status-badge';
import { useFilters, apiProjectParam, clientFilterByProjects } from '@/lib/filter-context';
import { formatSAR, formatDate, formatDays, formatMonthLabel } from '@/lib/format';
export default function AgingPage() {
    const { filters } = useFilters();
    const project = apiProjectParam(filters);
    const agingParams = { project };
    const agingQ = useGetAgingReport(agingParams, { query: { queryKey: getGetAgingReportQueryKey(agingParams) } });
    const trendParams = { project, revenueYear: filters.revenueYear };
    const trendQ = useGetCollectionTrend(trendParams, { query: { queryKey: getGetCollectionTrendQueryKey(trendParams) } });
    const invoicesParams = { project, overdue: true, page: 1, pageSize: 100 };
    const invoicesQ = useListInvoices(invoicesParams, { query: { queryKey: getListInvoicesQueryKey(invoicesParams) } });
    const trendData = useMemo(() => (trendQ.data ?? []).map((p) => ({ ...p, monthLabel: formatMonthLabel(p.month) })), [trendQ.data]);
    const overdueRows = useMemo(() => clientFilterByProjects(invoicesQ.data?.data ?? [], filters), [invoicesQ.data?.data, filters]);
    function bucketColor(label) {
        if (label === 'Not Due')
            return 'hsl(var(--chart-2))';
        if (label === '90d+')
            return 'hsl(var(--destructive))';
        if (label === '61-90d')
            return 'hsl(var(--chart-4))';
        return 'hsl(var(--chart-1))';
    }
    return (<AppLayout title="Outstanding Aging" description="Aging buckets and overdue invoice management">
      <FilterBar />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Aging Buckets" description={agingQ.data ? `Total outstanding ${formatSAR(agingQ.data.totalOutstanding)}` : undefined} index={0}>
          {agingQ.isLoading ? (<ChartSkeleton />) : agingQ.isError ? (<ErrorState onRetry={() => agingQ.refetch()}/>) : !agingQ.data || agingQ.data.buckets.length === 0 ? (<div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No aging data</div>) : (<ResponsiveContainer width="100%" height={300}>
              <BarChart data={agingQ.data.buckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}/>
                <YAxis tickFormatter={(v) => formatSAR(v)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={70}/>
                <RTooltip formatter={(v, n, p) => [formatSAR(v), `${p.payload.count} invoices`]} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}/>
                <Bar dataKey="amount" name="Outstanding" radius={[4, 4, 0, 0]}>
                  {agingQ.data.buckets.map((b) => (<Cell key={b.label} fill={bucketColor(b.label)}/>))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>)}
        </ChartCard>

        <ChartCard title="Collection Trend" description="Monthly collected amounts" index={1}>
          {trendQ.isLoading ? (<ChartSkeleton />) : trendQ.isError ? (<ErrorState onRetry={() => trendQ.refetch()}/>) : trendData.length === 0 ? (<div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No collection data</div>) : (<ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}/>
                <YAxis tickFormatter={(v) => formatSAR(v)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={70}/>
                <RTooltip formatter={(v, n, p) => [formatSAR(v), `${p.payload.count} collections`]} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}/>
                <Legend wrapperStyle={{ fontSize: 11 }}/>
                <Line type="monotone" dataKey="collected" name="Collected" stroke="hsl(var(--chart-2))" strokeWidth={2.5} dot={{ r: 3 }}/>
              </LineChart>
            </ResponsiveContainer>)}
        </ChartCard>
      </div>

      <div className="mt-4 rounded-lg border border-card-border bg-card p-4">
        <h3 className="mb-3 font-display text-sm font-semibold text-foreground">Overdue Invoices</h3>
        {invoicesQ.isLoading ? (<TableSkeleton rows={6} cols={7}/>) : invoicesQ.isError ? (<ErrorState onRetry={() => invoicesQ.refetch()}/>) : overdueRows.length === 0 ? (<EmptyState icon={Clock} title="No overdue invoices" description="All invoices are within their payment terms."/>) : (<div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-xs" data-testid="table-overdue-invoices">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Invoice No</th>
                  <th className="px-3 py-2.5 font-medium">Project</th>
                  <th className="px-3 py-2.5 font-medium">Due Date</th>
                  <th className="px-3 py-2.5 text-right font-medium">Outstanding</th>
                  <th className="px-3 py-2.5 text-right font-medium">Age</th>
                  <th className="px-3 py-2.5 text-right font-medium">Penalties</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {overdueRows.map((r) => (<tr key={r.id} className="border-b border-border/60 bg-destructive/5 last:border-0" data-testid={`row-overdue-${r.id}`}>
                    <td className="px-3 py-2.5 font-mono-num font-medium text-foreground">{r.invoiceNo ?? '—'}</td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{r.projectName}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatDate(r.dueDate)}</td>
                    <td className="px-3 py-2.5 text-right font-mono-num text-destructive">{formatSAR(r.outstanding)}</td>
                    <td className="px-3 py-2.5 text-right font-mono-num">{formatDays(r.outstandingAgeDays)}</td>
                    <td className="px-3 py-2.5 text-right font-mono-num text-destructive">{formatSAR(r.penalties)}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={r.paymentStatus}/></td>
                  </tr>))}
              </tbody>
            </table>
          </div>)}
      </div>
    </AppLayout>);
}
