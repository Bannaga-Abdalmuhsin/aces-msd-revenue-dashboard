import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { LayoutGrid, TableIcon, ChevronRight, FolderKanban } from 'lucide-react';
import { useListProjects } from '@workspace/api-client-react';
import { AppLayout } from '@/components/app-layout';
import { FilterBar } from '@/components/filter-bar';
import { ErrorState, EmptyState } from '@/components/empty-state';
import { TableSkeleton, CardGridSkeleton } from '@/components/table-skeleton';
import { useFilters } from '@/lib/filter-context';
import { formatSAR, formatPercent, formatDays } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
export default function ProjectsPage() {
    const { filters } = useFilters();
    const [, setLocation] = useLocation();
    const [view, setView] = useState('table');
    const { data, isLoading, isError, refetch } = useListProjects();
    const filtered = useMemo(() => {
        let rows = data ?? [];
        if (filters.projects.length > 0)
            rows = rows.filter((p) => filters.projects.includes(p.name));
        if (filters.projectStatus)
            rows = rows.filter((p) => p.status === filters.projectStatus);
        return rows;
    }, [data, filters.projects, filters.projectStatus]);
    return (<AppLayout title="Project Performance" description="Aggregated financial metrics across all managed services projects" actions={<div className="hidden items-center gap-1 rounded-md border border-border bg-card p-0.5 sm:flex">
          <Button variant={view === 'table' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setView('table')} data-testid="button-view-table">
            <TableIcon className="h-3.5 w-3.5"/>
          </Button>
          <Button variant={view === 'cards' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setView('cards')} data-testid="button-view-cards">
            <LayoutGrid className="h-3.5 w-3.5"/>
          </Button>
        </div>}>
      <FilterBar />

      {isError ? (<ErrorState onRetry={() => refetch()}/>) : isLoading ? (view === 'table' ? <TableSkeleton rows={6} cols={8}/> : <CardGridSkeleton count={6}/>) : filtered.length === 0 ? (<EmptyState icon={FolderKanban} title="No projects match your filters" description="Try adjusting or clearing the active filters."/>) : view === 'cards' ? (<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="grid-project-cards">
          {filtered.map((p, i) => (<motion.div key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.04 }} onClick={() => setLocation(`/projects/${p.id}`)} className="cursor-pointer rounded-lg border border-card-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md" data-testid={`card-project-${p.id}`}>
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="font-display text-sm font-semibold text-foreground">{p.name}</h3>
                  <span className={cn('mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize', p.status === 'ongoing' && 'border-accent/30 bg-accent/10 text-accent', p.status === 'completed' && 'border-[hsl(var(--chart-3)/0.3)] bg-[hsl(var(--chart-3)/0.1)] text-[hsl(var(--chart-3))]', p.status === 'closed' && 'border-border bg-muted text-muted-foreground')}>
                    {p.status}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground"/>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Metric label="Work Order" value={formatSAR(p.totalWorkOrder)}/>
                <Metric label="Revenue" value={formatSAR(p.totalRevenue)}/>
                <Metric label="Collected" value={formatSAR(p.totalCollected)}/>
                <Metric label="Outstanding" value={formatSAR(p.totalOutstanding)}/>
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, p.revenueAchievementPct)}%` }}/>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatPercent(p.revenueAchievementPct)} achievement
              </p>
            </motion.div>))}
        </div>) : (<div className="overflow-x-auto rounded-lg border border-card-border bg-card">
          <table className="w-full min-w-[1100px] text-left text-xs" data-testid="table-projects">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-3 font-medium">Project</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 text-right font-medium">Work Order</th>
                <th className="px-3 py-3 text-right font-medium">Revenue</th>
                <th className="px-3 py-3 text-right font-medium">Achievement</th>
                <th className="px-3 py-3 text-right font-medium">Invoiced</th>
                <th className="px-3 py-3 text-right font-medium">Collected</th>
                <th className="px-3 py-3 text-right font-medium">Outstanding</th>
                <th className="px-3 py-3 text-right font-medium">Overdue</th>
                <th className="px-3 py-3 text-right font-medium">Penalties</th>
                <th className="px-3 py-3 text-right font-medium">Net Revenue</th>
                <th className="px-3 py-3 text-right font-medium">Avg Days</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (<tr key={p.id} onClick={() => setLocation(`/projects/${p.id}`)} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/40" data-testid={`row-project-${p.id}`}>
                  <td className="px-3 py-3 font-medium text-foreground">{p.name}</td>
                  <td className="px-3 py-3">
                    <span className={cn('inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize', p.status === 'ongoing' && 'border-accent/30 bg-accent/10 text-accent', p.status === 'completed' && 'border-[hsl(var(--chart-3)/0.3)] bg-[hsl(var(--chart-3)/0.1)] text-[hsl(var(--chart-3))]', p.status === 'closed' && 'border-border bg-muted text-muted-foreground')}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono-num">{formatSAR(p.totalWorkOrder)}</td>
                  <td className="px-3 py-3 text-right font-mono-num">{formatSAR(p.totalRevenue)}</td>
                  <td className="px-3 py-3 text-right font-mono-num">{formatPercent(p.revenueAchievementPct)}</td>
                  <td className="px-3 py-3 text-right font-mono-num">{formatSAR(p.totalInvoiced)}</td>
                  <td className="px-3 py-3 text-right font-mono-num text-accent">{formatSAR(p.totalCollected)}</td>
                  <td className="px-3 py-3 text-right font-mono-num">{formatSAR(p.totalOutstanding)}</td>
                  <td className="px-3 py-3 text-right font-mono-num text-destructive">{formatSAR(p.totalOverdue)}</td>
                  <td className="px-3 py-3 text-right font-mono-num text-destructive">{formatSAR(p.totalPenalties)}</td>
                  <td className="px-3 py-3 text-right font-mono-num font-semibold">{formatSAR(p.totalNetRevenue)}</td>
                  <td className="px-3 py-3 text-right font-mono-num">{formatDays(p.avgCollectionDays)}</td>
                </tr>))}
            </tbody>
          </table>
        </div>)}
    </AppLayout>);
}
function Metric({ label, value }) {
    return (<div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-mono-num font-medium text-foreground">{value}</p>
    </div>);
}
