import { AlertTriangle, AlertOctagon, Info, Sparkles } from 'lucide-react';
import { useGetInsights } from '@workspace/api-client-react';
import { formatSAR, severityBadgeClass } from '@/lib/format';
import { EmptyState } from '@/components/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';

const SEVERITY_ICON = {
  critical: AlertOctagon,
  warning: AlertTriangle,
  info: Info,
};

export function InsightsPanel() {
  const { data, isLoading, isError } = useGetInsights();

  return (
    <div className="rounded-lg border border-card-border bg-card p-4" data-testid="panel-insights">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-semibold text-foreground">Management Insights</h3>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {isError && <p className="text-sm text-muted-foreground">Unable to load insights.</p>}

      {!isLoading && !isError && (!data || data.length === 0) && (
        <EmptyState title="No insights available" description="Insights will appear once revenue data is present." />
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="space-y-2">
          {data.map((insight, i) => {
            const Icon = SEVERITY_ICON[insight.severity] ?? Info;
            return (
              <motion.div
                key={`${insight.type}-${i}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: i * 0.03 }}
                className="flex items-start gap-3 rounded-md border border-border bg-background/60 p-3"
                data-testid={`insight-${i}`}
              >
                <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${severityBadgeClass(insight.severity)}`}>
                  <Icon className="h-3 w-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-relaxed text-foreground">{insight.message}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {insight.projectName && (
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {insight.projectName}
                      </span>
                    )}
                    {insight.amount !== null && insight.amount !== undefined && (
                      <span className="font-mono-num text-[10px] font-semibold text-foreground">
                        {formatSAR(insight.amount)}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${severityBadgeClass(insight.severity)}`}>
                  {insight.severity}
                </span>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
