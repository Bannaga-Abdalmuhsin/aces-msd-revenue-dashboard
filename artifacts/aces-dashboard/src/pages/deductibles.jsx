import { useMemo } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer, } from 'recharts';
import { useListRecords, useGetPaymentStatusDistribution, getListRecordsQueryKey, getGetPaymentStatusDistributionQueryKey, } from '@workspace/api-client-react';
import { AppLayout } from '@/components/app-layout';
import { FilterBar } from '@/components/filter-bar';
import { ChartCard } from '@/components/chart-card';
import { ErrorState } from '@/components/empty-state';
import { ChartSkeleton, TableSkeleton } from '@/components/table-skeleton';
import { useFilters, apiProjectParam, clientFilterByProjects } from '@/lib/filter-context';
import { formatSAR, formatPercent } from '@/lib/format';
const CHART_COLORS = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
];
export default function DeductiblesPage() {
    const { filters } = useFilters();
    const project = apiProjectParam(filters);
    const recordsParams = { project, pageSize: 1000, page: 1 };
    const recordsQ = useListRecords(recordsParams, { query: { queryKey: getListRecordsQueryKey(recordsParams) } });
    const statusParams = { project };
    const statusQ = useGetPaymentStatusDistribution(statusParams, {
        query: { queryKey: getGetPaymentStatusDistributionQueryKey(statusParams) },
    });
    const rows = useMemo(() => clientFilterByProjects(recordsQ.data?.data ?? [], filters), [recordsQ.data?.data, filters]);
    const byProject = useMemo(() => {
        const map = new Map();
        for (const r of rows) {
            const entry = map.get(r.projectName) ?? { projectName: r.projectName, deductible: 0, penalties: 0, revenue: 0, netRevenue: 0 };
            entry.deductible += r.deductible || 0;
            entry.penalties += r.penalties || 0;
            entry.revenue += r.revenue || 0;
            entry.netRevenue += r.netRevenue || 0;
            map.set(r.projectName, entry);
        }
        return Array.from(map.values()).sort((a, b) => b.deductible + b.penalties - (a.deductible + a.penalties));
    }, [rows]);
    const totals = useMemo(() => byProject.reduce((acc, p) => ({ deductible: acc.deductible + p.deductible, penalties: acc.penalties + p.penalties, revenue: acc.revenue + p.revenue }), { deductible: 0, penalties: 0, revenue: 0 }), [byProject]);
    const impactData = useMemo(() => byProject.map((p) => ({ name: p.projectName, impact: p.deductible + p.penalties, revenue: p.revenue })), [byProject]);
    const statusData = useMemo(() => statusQ.data ?? [], [statusQ.data]);
    return (<AppLayout title="Deductibles & Penalties" description="Breakdown of revenue reductions by project and their impact on collections">
      <FilterBar />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <SummaryStat label="Total Deductibles" value={formatSAR(totals.deductible)} accent="destructive"/>
        <SummaryStat label="Total Penalties" value={formatSAR(totals.penalties)} accent="destructive"/>
        <SummaryStat label="Impact on Revenue" value={formatPercent(totals.revenue > 0 ? ((totals.deductible + totals.penalties) / totals.revenue) * 100 : 0)} accent="chart-1"/>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Deductibles & Penalties by Project" index={0}>
          {recordsQ.isLoading ? (<ChartSkeleton />) : recordsQ.isError ? (<ErrorState onRetry={() => recordsQ.refetch()}/>) : byProject.length === 0 ? (<div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No data</div>) : (<ResponsiveContainer width="100%" height={300}>
              <BarChart data={byProject}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                <XAxis dataKey="projectName" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} angle={-15} textAnchor="end" height={60}/>
                <YAxis tickFormatter={(v) => formatSAR(v)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={70}/>
                <RTooltip formatter={(v) => formatSAR(v)} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}/>
                <Legend wrapperStyle={{ fontSize: 11 }}/>
                <Bar dataKey="deductible" name="Deductibles" fill="hsl(var(--chart-4))" radius={[3, 3, 0, 0]}/>
                <Bar dataKey="penalties" name="Penalties" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]}/>
              </BarChart>
            </ResponsiveContainer>)}
        </ChartCard>

        <ChartCard title="Payment Status Distribution" description="By invoice count" index={1}>
          {statusQ.isLoading ? (<ChartSkeleton />) : statusQ.isError ? (<ErrorState onRetry={() => statusQ.refetch()}/>) : statusData.length === 0 ? (<div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No data</div>) : (<ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={statusData} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={55} outerRadius={100} paddingAngle={2}>
                  {statusData.map((entry, i) => (<Cell key={entry.status} fill={CHART_COLORS[i % CHART_COLORS.length]}/>))}
                </Pie>
                <RTooltip formatter={(v, n, p) => [`${v} invoices — ${formatSAR(p.payload.amount)}`, p.payload.status]} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}/>
                <Legend wrapperStyle={{ fontSize: 11 }}/>
              </PieChart>
            </ResponsiveContainer>)}
        </ChartCard>
      </div>

      <div className="mt-4 rounded-lg border border-card-border bg-card p-4">
        <h3 className="mb-3 font-display text-sm font-semibold text-foreground">Project Breakdown</h3>
        {recordsQ.isLoading ? (<TableSkeleton rows={5} cols={5}/>) : (<div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs" data-testid="table-deductibles-breakdown">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Project</th>
                  <th className="px-3 py-2.5 text-right font-medium">Revenue</th>
                  <th className="px-3 py-2.5 text-right font-medium">Deductibles</th>
                  <th className="px-3 py-2.5 text-right font-medium">Penalties</th>
                  <th className="px-3 py-2.5 text-right font-medium">Net Revenue</th>
                  <th className="px-3 py-2.5 text-right font-medium">Impact %</th>
                </tr>
              </thead>
              <tbody>
                {byProject.map((p) => (<tr key={p.projectName} className="border-b border-border/60 last:border-0" data-testid={`row-deductible-${p.projectName}`}>
                    <td className="px-3 py-2.5 font-medium text-foreground">{p.projectName}</td>
                    <td className="px-3 py-2.5 text-right font-mono-num">{formatSAR(p.revenue)}</td>
                    <td className="px-3 py-2.5 text-right font-mono-num text-destructive">{formatSAR(p.deductible)}</td>
                    <td className="px-3 py-2.5 text-right font-mono-num text-destructive">{formatSAR(p.penalties)}</td>
                    <td className="px-3 py-2.5 text-right font-mono-num font-semibold">{formatSAR(p.netRevenue)}</td>
                    <td className="px-3 py-2.5 text-right font-mono-num">{formatPercent(p.revenue > 0 ? ((p.deductible + p.penalties) / p.revenue) * 100 : 0)}</td>
                  </tr>))}
              </tbody>
            </table>
          </div>)}
      </div>
    </AppLayout>);
}
function SummaryStat({ label, value, accent }) {
    return (<div className="rounded-lg border border-card-border bg-card p-4">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-2 font-mono-num font-display text-lg font-semibold ${accent === 'destructive' ? 'text-destructive' : 'text-[hsl(var(--chart-1))]'}`}>
        {value}
      </p>
    </div>);
}
