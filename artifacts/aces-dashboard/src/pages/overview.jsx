import { useMemo } from 'react';
import { Briefcase, TrendingUp, FileText, Wallet, CircleDollarSign, AlertTriangle, ShieldMinus, Gavel, PiggyBank, Percent, Target, Repeat, Timer, } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer, } from 'recharts';
import { useGetDashboardSummary, useGetMonthlyTrend, useGetProjectPerformance, useGetPaymentStatusDistribution, useGetAgingReport, getGetDashboardSummaryQueryKey, getGetMonthlyTrendQueryKey, getGetProjectPerformanceQueryKey, getGetPaymentStatusDistributionQueryKey, getGetAgingReportQueryKey, } from '@workspace/api-client-react';
import { AppLayout } from '@/components/app-layout';
import { FilterBar } from '@/components/filter-bar';
import { KpiCard } from '@/components/kpi-card';
import { ChartCard } from '@/components/chart-card';
import { InsightsPanel } from '@/components/insights-panel';
import { CardGridSkeleton, ChartSkeleton } from '@/components/table-skeleton';
import { ErrorState } from '@/components/empty-state';
import { useFilters, apiProjectParam } from '@/lib/filter-context';
import { formatSAR, formatPercent, formatDays, formatMonthLabel } from '@/lib/format';
const CHART_COLORS = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
];
export default function OverviewPage() {
    const { filters } = useFilters();
    const project = apiProjectParam(filters);
    const summaryParams = {
        project,
        revenueYear: filters.revenueYear,
        revenueMonth: filters.revenueMonth,
        projectStatus: filters.projectStatus,
    };
    const trendParams = { project, revenueYear: filters.revenueYear };
    const summaryQ = useGetDashboardSummary(summaryParams, {
        query: { queryKey: getGetDashboardSummaryQueryKey(summaryParams) },
    });
    const trendQ = useGetMonthlyTrend(trendParams, {
        query: { queryKey: getGetMonthlyTrendQueryKey(trendParams) },
    });
    const perfParams = { revenueYear: filters.revenueYear };
    const perfQ = useGetProjectPerformance(perfParams, {
        query: { queryKey: getGetProjectPerformanceQueryKey(perfParams) },
    });
    const statusParams = { project };
    const statusQ = useGetPaymentStatusDistribution(statusParams, {
        query: { queryKey: getGetPaymentStatusDistributionQueryKey(statusParams) },
    });
    const agingParams = { project };
    const agingQ = useGetAgingReport(agingParams, {
        query: { queryKey: getGetAgingReportQueryKey(agingParams) },
    });
    const summary = summaryQ.data;
    const trendData = useMemo(() => (trendQ.data ?? []).map((p) => ({ ...p, monthLabel: formatMonthLabel(p.month) })), [trendQ.data]);
    const perfData = useMemo(() => (perfQ.data ?? [])
        .filter((p) => filters.projects.length === 0 || filters.projects.includes(p.projectName))
        .slice(0, 8), [perfQ.data, filters.projects]);
    const statusData = useMemo(() => statusQ.data ?? [], [statusQ.data]);
    const kpis = summary
        ? [
            { label: 'Work Order', value: formatSAR(summary.totalWorkOrder), exact: summary.totalWorkOrder, icon: Briefcase, href: '/projects', accent: 'primary' },
            { label: 'Revenue', value: formatSAR(summary.totalRevenue), exact: summary.totalRevenue, icon: TrendingUp, href: '/revenue', accent: 'primary' },
            { label: 'Invoiced', value: formatSAR(summary.totalInvoiced), exact: summary.totalInvoiced, icon: FileText, href: '/invoices', accent: 'chart-3' },
            { label: 'Collected', value: formatSAR(summary.totalCollected), exact: summary.totalCollected, icon: Wallet, href: '/invoices', accent: 'accent' },
            { label: 'Outstanding', value: formatSAR(summary.totalOutstanding), exact: summary.totalOutstanding, icon: CircleDollarSign, href: '/aging', accent: 'chart-3' },
            { label: 'Overdue', value: formatSAR(summary.totalOverdue), exact: summary.totalOverdue, icon: AlertTriangle, href: '/aging', accent: 'destructive' },
            { label: 'Deductibles', value: formatSAR(summary.totalDeductible), exact: summary.totalDeductible, icon: ShieldMinus, href: '/deductibles', accent: 'destructive' },
            { label: 'Penalties', value: formatSAR(summary.totalPenalties), exact: summary.totalPenalties, icon: Gavel, href: '/deductibles', accent: 'destructive' },
            { label: 'Net Revenue', value: formatSAR(summary.totalNetRevenue), exact: summary.totalNetRevenue, icon: PiggyBank, href: '/revenue', accent: 'accent' },
            { label: 'Collection Rate', value: formatPercent(summary.collectionRate), icon: Percent, href: '/invoices', accent: 'accent' },
            { label: 'Achievement Rate', value: formatPercent(summary.revenueAchievementRate), icon: Target, href: '/revenue', accent: 'primary' },
            { label: 'Invoice Conversion', value: formatPercent(summary.invoiceConversionRate), icon: Repeat, href: '/invoices', accent: 'chart-3' },
            { label: 'Avg Collection Days', value: formatDays(summary.avgCollectionDays), icon: Timer, href: '/aging', accent: 'primary' },
        ]
        : [];
    return (<AppLayout title="Executive Overview" description="Consolidated financial command center across all managed services projects" lastDataUpdate={summary?.lastDataUpdate}>
      <FilterBar />

      {summaryQ.isError ? (<ErrorState onRetry={() => summaryQ.refetch()}/>) : summaryQ.isLoading ? (<CardGridSkeleton count={13}/>) : (<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" data-testid="grid-kpi-cards">
          {kpis.map((kpi, i) => (<KpiCard key={kpi.label} label={kpi.label} value={kpi.value} exactValue={kpi.exact} icon={kpi.icon} href={kpi.href} accent={kpi.accent} index={i}/>))}
        </div>)}

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartCard title="Monthly Financial Performance" description="Work order vs revenue vs invoiced vs collected vs net revenue" index={0}>
            {trendQ.isLoading ? (<ChartSkeleton />) : trendQ.isError ? (<ErrorState onRetry={() => trendQ.refetch()}/>) : trendData.length === 0 ? (<div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No trend data</div>) : (<ResponsiveContainer width="100%" height={300}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35}/>
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}/>
                  <YAxis tickFormatter={(v) => formatSAR(v)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={70}/>
                  <RTooltip formatter={(v) => formatSAR(v)} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}/>
                  <Legend wrapperStyle={{ fontSize: 11 }}/>
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--chart-1))" fill="url(#revGrad)" strokeWidth={2}/>
                  <Line type="monotone" dataKey="workOrder" name="Work Order" stroke="hsl(var(--chart-5))" strokeWidth={1.5} dot={false} strokeDasharray="4 3"/>
                  <Line type="monotone" dataKey="invoiced" name="Invoiced" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false}/>
                  <Line type="monotone" dataKey="collected" name="Collected" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false}/>
                  <Line type="monotone" dataKey="netRevenue" name="Net Revenue" stroke="hsl(var(--chart-4))" strokeWidth={1.5} dot={false}/>
                </AreaChart>
              </ResponsiveContainer>)}
          </ChartCard>
        </div>

        <InsightsPanel />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Project Performance" description="Revenue vs work order by project" index={1}>
          {perfQ.isLoading ? (<ChartSkeleton />) : perfQ.isError ? (<ErrorState onRetry={() => perfQ.refetch()}/>) : perfData.length === 0 ? (<div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">No project data</div>) : (<ResponsiveContainer width="100%" height={280}>
              <BarChart data={perfData} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false}/>
                <XAxis type="number" tickFormatter={(v) => formatSAR(v)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}/>
                <YAxis dataKey="projectName" type="category" width={110} tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }}/>
                <RTooltip formatter={(v) => formatSAR(v)} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}/>
                <Legend wrapperStyle={{ fontSize: 11 }}/>
                <Bar dataKey="workOrder" name="Work Order" fill="hsl(var(--chart-5))" radius={[0, 4, 4, 0]}/>
                <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]}/>
                <Bar dataKey="collected" name="Collected" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]}/>
              </BarChart>
            </ResponsiveContainer>)}
        </ChartCard>

        <ChartCard title="Payment Status Distribution" description="Invoice count by payment status" index={2}>
          {statusQ.isLoading ? (<ChartSkeleton />) : statusQ.isError ? (<ErrorState onRetry={() => statusQ.refetch()}/>) : statusData.length === 0 ? (<div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">No invoice data</div>) : (<ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={statusData} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2}>
                  {statusData.map((entry, i) => (<Cell key={entry.status} fill={CHART_COLORS[i % CHART_COLORS.length]}/>))}
                </Pie>
                <RTooltip formatter={(v, n, p) => [`${v} invoices — ${formatSAR(p.payload.amount)}`, p.payload.status]} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}/>
                <Legend wrapperStyle={{ fontSize: 11 }}/>
              </PieChart>
            </ResponsiveContainer>)}
        </ChartCard>
      </div>

      <div className="mt-4">
        <ChartCard title="Outstanding Aging Summary" description="Distribution of outstanding amounts by age bucket" index={3}>
          {agingQ.isLoading ? (<ChartSkeleton height={220}/>) : agingQ.isError ? (<ErrorState onRetry={() => agingQ.refetch()}/>) : !agingQ.data || agingQ.data.buckets.length === 0 ? (<div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">No aging data</div>) : (<ResponsiveContainer width="100%" height={220}>
              <BarChart data={agingQ.data.buckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}/>
                <YAxis tickFormatter={(v) => formatSAR(v)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={70}/>
                <RTooltip formatter={(v, n, p) => [formatSAR(v), `${p.payload.count} invoices`]} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}/>
                <Bar dataKey="amount" name="Outstanding Amount" radius={[4, 4, 0, 0]}>
                  {agingQ.data.buckets.map((b, i) => (<Cell key={b.label} fill={b.label === 'Not Due'
                    ? 'hsl(var(--chart-2))'
                    : i === agingQ.data.buckets.length - 1
                        ? 'hsl(var(--destructive))'
                        : 'hsl(var(--chart-1))'}/>))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>)}
        </ChartCard>
      </div>
    </AppLayout>);
}
