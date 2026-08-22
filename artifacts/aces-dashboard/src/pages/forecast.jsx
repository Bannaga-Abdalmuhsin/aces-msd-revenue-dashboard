import { useMemo } from 'react';
import { CalendarClock, Wallet, TrendingUp } from 'lucide-react';
import { ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer, } from 'recharts';
import { useGetForecast } from '@workspace/api-client-react';
import { AppLayout } from '@/components/app-layout';
import { ChartCard } from '@/components/chart-card';
import { KpiCard } from '@/components/kpi-card';
import { ErrorState } from '@/components/empty-state';
import { ChartSkeleton, CardGridSkeleton } from '@/components/table-skeleton';
import { formatSAR, formatMonthLabel } from '@/lib/format';
export default function ForecastPage() {
    const { data, isLoading, isError, refetch } = useGetForecast();
    const chartData = useMemo(() => (data?.months ?? []).map((m) => ({ ...m, monthLabel: formatMonthLabel(m.month) })), [data?.months]);
    return (<AppLayout title="Monthly Forecast" description="Expected collections and revenue projections by due date month">
      {isLoading ? (<div className="space-y-4">
          <CardGridSkeleton count={3}/>
          <ChartSkeleton height={340}/>
        </div>) : isError ? (<ErrorState onRetry={() => refetch()}/>) : !data ? (<ErrorState title="No forecast data" description="Forecast data is unavailable."/>) : (<>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard label="Outstanding — Next 30 Days" value={formatSAR(data.next30)} exactValue={data.next30} icon={CalendarClock} accent="primary" index={0}/>
            <KpiCard label="Outstanding — Next 60 Days" value={formatSAR(data.next60)} exactValue={data.next60} icon={Wallet} accent="chart-3" index={1}/>
            <KpiCard label="Outstanding — Next 90 Days" value={formatSAR(data.next90)} exactValue={data.next90} icon={TrendingUp} accent="destructive" index={2}/>
          </div>

          <div className="mt-4">
            <ChartCard title="Work Order vs Actual / Forecast Revenue" description="Historical actuals shown solid, projected months shown as forecast" index={3}>
              {chartData.length === 0 ? (<div className="flex h-[340px] items-center justify-center text-sm text-muted-foreground">No forecast data</div>) : (<ResponsiveContainer width="100%" height={340}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                    <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}/>
                    <YAxis tickFormatter={(v) => formatSAR(v)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={70}/>
                    <RTooltip formatter={(v, name, p) => [formatSAR(v), `${name} (${p.payload.isActual ? 'Actual' : 'Forecast'})`]} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}/>
                    <Legend wrapperStyle={{ fontSize: 11 }}/>
                    <Bar dataKey="workOrder" name="Work Order" fill="hsl(var(--chart-5))" radius={[3, 3, 0, 0]}/>
                    <Bar dataKey="expectedCollection" name="Expected Collection" radius={[3, 3, 0, 0]}>
                      {chartData.map((entry) => (<Cell key={entry.month} fill={entry.isActual ? 'hsl(var(--chart-2))' : 'hsl(var(--chart-1) / 0.55)'}/>))}
                    </Bar>
                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={{ r: 2 }} connectNulls/>
                    <Line type="monotone" dataKey="outstanding" name="Outstanding" stroke="hsl(var(--destructive))" strokeWidth={1.5} strokeDasharray="4 3" dot={false}/>
                  </ComposedChart>
                </ResponsiveContainer>)}
            </ChartCard>
          </div>

          <div className="mt-4 rounded-lg border border-card-border bg-card p-4">
            <h3 className="mb-3 font-display text-sm font-semibold text-foreground">Forecast Detail</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-xs" data-testid="table-forecast">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">Month</th>
                    <th className="px-3 py-2.5 text-right font-medium">Work Order</th>
                    <th className="px-3 py-2.5 text-right font-medium">Revenue</th>
                    <th className="px-3 py-2.5 text-right font-medium">Expected Collection</th>
                    <th className="px-3 py-2.5 text-right font-medium">Outstanding</th>
                    <th className="px-3 py-2.5 font-medium">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((m) => (<tr key={m.month} className="border-b border-border/60 last:border-0" data-testid={`row-forecast-${m.month}`}>
                      <td className="px-3 py-2.5 font-medium text-foreground">{m.monthLabel}</td>
                      <td className="px-3 py-2.5 text-right font-mono-num">{formatSAR(m.workOrder ?? 0)}</td>
                      <td className="px-3 py-2.5 text-right font-mono-num">{m.revenue !== null && m.revenue !== undefined ? formatSAR(m.revenue) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono-num">{formatSAR(m.expectedCollection)}</td>
                      <td className="px-3 py-2.5 text-right font-mono-num">{formatSAR(m.outstanding)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${m.isActual ? 'border-[hsl(var(--chart-2)/0.3)] bg-[hsl(var(--chart-2)/0.1)] text-[hsl(var(--chart-2))]' : 'border-[hsl(var(--chart-1)/0.3)] bg-[hsl(var(--chart-1)/0.1)] text-[hsl(var(--chart-1))]'}`}>
                          {m.isActual ? 'Actual' : 'Forecast'}
                        </span>
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          </div>
        </>)}
    </AppLayout>);
}
