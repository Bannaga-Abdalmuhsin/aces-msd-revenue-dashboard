import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
  ResponsiveContainer,
  Line,
} from 'recharts';
import {
  useGetMonthlyTrend,
  useGetProjectPerformance,
  useGetRevenueHeatmap,
  getGetMonthlyTrendQueryKey,
  getGetProjectPerformanceQueryKey,
  getGetRevenueHeatmapQueryKey,
} from '@workspace/api-client-react';
import { AppLayout } from '@/components/app-layout';
import { FilterBar } from '@/components/filter-bar';
import { ChartCard } from '@/components/chart-card';
import { ErrorState } from '@/components/empty-state';
import { ChartSkeleton } from '@/components/table-skeleton';
import { useFilters, apiProjectParam } from '@/lib/filter-context';
import { formatSAR, formatPercent, formatMonthLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export default function RevenuePage() {
  const { filters } = useFilters();
  const project = apiProjectParam(filters);

  const trendParams = { project, revenueYear: filters.revenueYear };
  const trendQ = useGetMonthlyTrend(trendParams, { query: { queryKey: getGetMonthlyTrendQueryKey(trendParams) } });

  const perfParams = { revenueYear: filters.revenueYear };
  const perfQ = useGetProjectPerformance(perfParams, { query: { queryKey: getGetProjectPerformanceQueryKey(perfParams) } });

  const heatmapParams = { revenueYear: filters.revenueYear };
  const heatmapQ = useGetRevenueHeatmap(heatmapParams, { query: { queryKey: getGetRevenueHeatmapQueryKey(heatmapParams) } });

  const trendData = useMemo(
    () => (trendQ.data ?? []).map((p) => ({ ...p, monthLabel: formatMonthLabel(p.month) })),
    [trendQ.data],
  );

  // Waterfall: workOrder -> revenue -> invoiced -> collected -> netRevenue (aggregate totals)
  const waterfallData = useMemo(() => {
    const totals = (trendQ.data ?? []).reduce(
      (acc, p) => ({
        workOrder: acc.workOrder + p.workOrder,
        revenue: acc.revenue + p.revenue,
        invoiced: acc.invoiced + p.invoiced,
        collected: acc.collected + p.collected,
        netRevenue: acc.netRevenue + p.netRevenue,
      }),
      { workOrder: 0, revenue: 0, invoiced: 0, collected: 0, netRevenue: 0 },
    );
    const steps = [
      { name: 'Work Order', value: totals.workOrder },
      { name: 'Revenue', value: totals.revenue },
      { name: 'Invoiced', value: totals.invoiced },
      { name: 'Collected', value: totals.collected },
      { name: 'Net Revenue', value: totals.netRevenue },
    ];
    let cumulative = 0;
    return steps.map((s, i) => {
      const base = i === 0 ? 0 : cumulative;
      cumulative = s.value;
      return { name: s.name, base: Math.min(base, s.value), value: Math.abs(s.value - (i === 0 ? 0 : base)), display: s.value };
    });
  }, [trendQ.data]);

  const perfData = useMemo(() => perfQ.data ?? [], [perfQ.data]);

  const contributionData = useMemo(
    () => perfData.map((p) => ({ name: p.projectName, value: p.revenue })),
    [perfData],
  );

  const heatmap = heatmapQ.data;

  function heatColor(pct: number | null) {
    if (pct === null || pct === undefined) return 'hsl(var(--muted))';
    if (pct >= 100) return 'hsl(var(--chart-2) / 0.9)';
    if (pct >= 80) return 'hsl(var(--chart-2) / 0.55)';
    if (pct >= 60) return 'hsl(var(--chart-1) / 0.55)';
    if (pct >= 40) return 'hsl(var(--chart-1) / 0.3)';
    return 'hsl(var(--destructive) / 0.35)';
  }

  return (
    <AppLayout title="Revenue Analysis" description="Monthly performance, revenue flow, project contribution and achievement heatmap">
      <FilterBar />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Monthly Financial Performance" description="Work order, revenue, invoiced, collected, net revenue" index={0}>
          {trendQ.isLoading ? (
            <ChartSkeleton />
          ) : trendQ.isError ? (
            <ErrorState onRetry={() => trendQ.refetch()} />
          ) : trendData.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No trend data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tickFormatter={(v) => formatSAR(v)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={70} />
                <RTooltip formatter={(v: number) => formatSAR(v)} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="workOrder" name="Work Order" fill="hsl(var(--chart-5))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="invoiced" name="Invoiced" fill="hsl(var(--chart-3))" radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="collected" name="Collected" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="netRevenue" name="Net Revenue" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Revenue Waterfall" description="Cumulative flow from work order to net revenue" index={1}>
          {trendQ.isLoading ? (
            <ChartSkeleton />
          ) : waterfallData.every((s) => s.display === 0) ? (
            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={waterfallData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tickFormatter={(v) => formatSAR(v)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={70} />
                <RTooltip
                  formatter={(v: number, name: string, p: any) => [formatSAR(p.payload.display), p.payload.name]}
                  contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="base" stackId="a" fill="transparent" />
                <Bar dataKey="value" stackId="a" radius={[4, 4, 0, 0]}>
                  {waterfallData.map((entry, i) => (
                    <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Project Contribution" description="Share of total revenue by project" index={2}>
          {perfQ.isLoading ? (
            <ChartSkeleton />
          ) : perfQ.isError ? (
            <ErrorState onRetry={() => perfQ.refetch()} />
          ) : contributionData.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={contributionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={105} paddingAngle={2} label={(e) => `${e.name}: ${formatPercent((e.value / contributionData.reduce((s, d) => s + d.value, 0)) * 100)}`} labelLine={false} style={{ fontSize: 10 }}>
                  {contributionData.map((entry, i) => (
                    <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <RTooltip formatter={(v: number) => formatSAR(v)} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Revenue Achievement Heatmap" description="Achievement % by project and month" index={3}>
          {heatmapQ.isLoading ? (
            <ChartSkeleton />
          ) : heatmapQ.isError ? (
            <ErrorState onRetry={() => heatmapQ.refetch()} />
          ) : !heatmap || heatmap.rows.length === 0 ? (
            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No data</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-[10px]" data-testid="table-heatmap">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-card px-2 py-1.5 text-left font-medium text-muted-foreground">Project</th>
                    {heatmap.months.map((m) => (
                      <th key={m} className="px-1 py-1.5 text-center font-medium text-muted-foreground">
                        {formatMonthLabel(m)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmap.rows.map((row) => (
                    <tr key={row.projectName}>
                      <td className="sticky left-0 bg-card px-2 py-1 font-medium text-foreground">{row.projectName}</td>
                      {row.cells.map((cell) => (
                        <td key={cell.month} className="p-0.5">
                          <div
                            className={cn('flex h-7 w-full items-center justify-center rounded text-[9px] font-semibold')}
                            style={{ backgroundColor: heatColor(cell.achievementPct), color: cell.achievementPct && cell.achievementPct >= 60 ? 'white' : 'hsl(var(--foreground))' }}
                            title={cell.achievementPct !== null ? `${cell.achievementPct.toFixed(1)}%` : 'No data'}
                          >
                            {cell.achievementPct !== null ? Math.round(cell.achievementPct) : '—'}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </div>
    </AppLayout>
  );
}
