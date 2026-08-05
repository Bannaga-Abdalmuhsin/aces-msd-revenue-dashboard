import { useMemo } from 'react';
import { useParams, useLocation } from 'wouter';
import { ArrowLeft, Briefcase, TrendingUp, Wallet, CircleDollarSign } from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useGetProject, getGetProjectQueryKey } from '@workspace/api-client-react';
import { AppLayout } from '@/components/app-layout';
import { ChartCard } from '@/components/chart-card';
import { KpiCard } from '@/components/kpi-card';
import { ErrorState, EmptyState } from '@/components/empty-state';
import { ChartSkeleton, TableSkeleton, CardGridSkeleton } from '@/components/table-skeleton';
import { StatusBadge } from '@/components/status-badge';
import { formatSAR, formatPercent, formatDays, formatMonthLabel, formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = Number(params.id);

  const { data, isLoading, isError, refetch } = useGetProject(id, {
    query: { queryKey: getGetProjectQueryKey(id), enabled: !Number.isNaN(id) },
  });

  const trendData = useMemo(
    () => (data?.monthlyTrend ?? []).map((p) => ({ ...p, monthLabel: formatMonthLabel(p.month) })),
    [data?.monthlyTrend],
  );

  const invoicedRecords = useMemo(
    () => (data?.records ?? []).filter((r) => r.invoiceNo),
    [data?.records],
  );

  const deductiblesTotal = useMemo(
    () => (data?.records ?? []).reduce((sum, r) => sum + (r.deductible || 0), 0),
    [data?.records],
  );
  const penaltiesTotal = useMemo(
    () => (data?.records ?? []).reduce((sum, r) => sum + (r.penalties || 0), 0),
    [data?.records],
  );

  const monthlyDeductibles = useMemo(
    () =>
      (data?.monthlyTrend ?? []).map((m, i) => {
        const monthRecords = (data?.records ?? []).filter((r) => r.revenueMonth.startsWith(m.month));
        return {
          monthLabel: formatMonthLabel(m.month),
          deductible: monthRecords.reduce((s, r) => s + (r.deductible || 0), 0),
          penalties: monthRecords.reduce((s, r) => s + (r.penalties || 0), 0),
        };
      }),
    [data?.monthlyTrend, data?.records],
  );

  return (
    <AppLayout
      title={data?.project.name ?? 'Project Detail'}
      description="Monthly performance, invoicing, and deductibles breakdown"
      actions={
        <Button variant="outline" size="sm" onClick={() => setLocation('/projects')} data-testid="button-back-projects">
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back
        </Button>
      }
    >
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-4">
          <CardGridSkeleton count={4} />
          <ChartSkeleton />
        </div>
      ) : !data ? (
        <EmptyState title="Project not found" description="This project may have been removed." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard label="Work Order" value={formatSAR(data.project.totalWorkOrder)} exactValue={data.project.totalWorkOrder} icon={Briefcase} accent="primary" index={0} />
            <KpiCard label="Revenue" value={formatSAR(data.project.totalRevenue)} exactValue={data.project.totalRevenue} icon={TrendingUp} accent="primary" index={1} sublabel={`${formatPercent(data.project.revenueAchievementPct)} achieved`} />
            <KpiCard label="Collected" value={formatSAR(data.project.totalCollected)} exactValue={data.project.totalCollected} icon={Wallet} accent="accent" index={2} sublabel={`${formatPercent(data.project.collectionPct)} collected`} />
            <KpiCard label="Outstanding" value={formatSAR(data.project.totalOutstanding)} exactValue={data.project.totalOutstanding} icon={CircleDollarSign} accent="chart-3" index={3} sublabel={`Avg ${formatDays(data.project.avgCollectionDays)} to collect`} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard title="Monthly Trend" description="Work order, revenue, invoiced, collected over time" index={0}>
              {trendData.length === 0 ? (
                <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">No monthly data</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tickFormatter={(v) => formatSAR(v)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={70} />
                    <RTooltip
                      formatter={(v: number) => formatSAR(v)}
                      contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="workOrder" name="Work Order" stroke="hsl(var(--chart-5))" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="invoiced" name="Invoiced" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="collected" name="Collected" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Deductibles & Penalties by Month" description={`Total deductibles ${formatSAR(deductiblesTotal)} · penalties ${formatSAR(penaltiesTotal)}`} index={1}>
              {monthlyDeductibles.length === 0 ? (
                <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlyDeductibles}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tickFormatter={(v) => formatSAR(v)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={70} />
                    <RTooltip
                      formatter={(v: number) => formatSAR(v)}
                      contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="deductible" name="Deductibles" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="penalties" name="Penalties" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <div className="mt-4 rounded-lg border border-card-border bg-card p-4">
            <h3 className="mb-3 font-display text-sm font-semibold text-foreground">Invoices</h3>
            {invoicedRecords.length === 0 ? (
              <EmptyState title="No invoices yet" description="No invoices have been raised for this project." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs" data-testid="table-project-invoices">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2.5 font-medium">Invoice No</th>
                      <th className="px-3 py-2.5 font-medium">Revenue Month</th>
                      <th className="px-3 py-2.5 font-medium">Invoice Date</th>
                      <th className="px-3 py-2.5 font-medium">Due Date</th>
                      <th className="px-3 py-2.5 text-right font-medium">Invoiced</th>
                      <th className="px-3 py-2.5 text-right font-medium">Collected</th>
                      <th className="px-3 py-2.5 text-right font-medium">Outstanding</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoicedRecords.map((r) => (
                      <tr key={r.id} className="border-b border-border/60 last:border-0" data-testid={`row-invoice-${r.id}`}>
                        <td className="px-3 py-2.5 font-mono-num font-medium text-foreground">{r.invoiceNo}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{formatDate(r.revenueMonth)}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{formatDate(r.invoiceDate)}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{formatDate(r.dueDate)}</td>
                        <td className="px-3 py-2.5 text-right font-mono-num">{formatSAR(r.invoiced)}</td>
                        <td className="px-3 py-2.5 text-right font-mono-num text-accent">{formatSAR(r.collected)}</td>
                        <td className="px-3 py-2.5 text-right font-mono-num">{formatSAR(r.outstandingAmount ?? 0)}</td>
                        <td className="px-3 py-2.5"><StatusBadge status={r.paymentStatus} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </AppLayout>
  );
}
