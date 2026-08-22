import { Skeleton } from '@/components/ui/skeleton';
export function TableSkeleton({ rows = 8, cols = 6 }) {
    return (<div className="space-y-2" data-testid="skeleton-table">
      <div className="flex gap-3 border-b border-border pb-3">
        {Array.from({ length: cols }).map((_, i) => (<Skeleton key={i} className="h-4 flex-1"/>))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (<div key={r} className="flex gap-3 py-2">
          {Array.from({ length: cols }).map((_, c) => (<Skeleton key={c} className="h-4 flex-1"/>))}
        </div>))}
    </div>);
}
export function CardGridSkeleton({ count = 8 }) {
    return (<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" data-testid="skeleton-cards">
      {Array.from({ length: count }).map((_, i) => (<div key={i} className="rounded-lg border border-card-border bg-card p-4">
          <Skeleton className="mb-3 h-3 w-20"/>
          <Skeleton className="mb-2 h-6 w-28"/>
          <Skeleton className="h-3 w-16"/>
        </div>))}
    </div>);
}
export function ChartSkeleton({ height = 300 }) {
    return (<div className="flex w-full items-end gap-2 rounded-lg border border-card-border bg-card p-4" style={{ height }} data-testid="skeleton-chart">
      {Array.from({ length: 12 }).map((_, i) => (<Skeleton key={i} className="flex-1" style={{ height: `${30 + ((i * 37) % 60)}%` }}/>))}
    </div>);
}
