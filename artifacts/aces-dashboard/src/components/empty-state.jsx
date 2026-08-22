import { cn } from '@/lib/utils';
export function EmptyState({ icon: Icon, title, description, action, className }) {
    return (<div className={cn('flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/40 px-6 py-14 text-center', className)} data-testid="empty-state">
      {Icon && (<div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground"/>
        </div>)}
      <div className="space-y-1">
        <p className="font-display text-sm font-semibold text-foreground">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>);
}
export function ErrorState({ title = 'Unable to load data', description = 'Something went wrong while fetching this data.', onRetry, }) {
    return (<div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-6 py-14 text-center" data-testid="error-state">
      <div className="space-y-1">
        <p className="font-display text-sm font-semibold text-destructive">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry && (<button onClick={onRetry} data-testid="button-retry" className="rounded-md border border-destructive/30 bg-background px-4 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10">
          Retry
        </button>)}
    </div>);
}
