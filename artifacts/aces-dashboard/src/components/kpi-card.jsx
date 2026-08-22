import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatSARExact } from '@/lib/format';
const accentClasses = {
    primary: 'text-primary bg-primary/10',
    accent: 'text-accent bg-accent/10',
    destructive: 'text-destructive bg-destructive/10',
    'chart-3': 'text-[hsl(var(--chart-3))] bg-[hsl(var(--chart-3)/0.1)]',
};
export function KpiCard({ label, value, exactValue, icon: Icon, href, sublabel, trend, accent = 'primary', index = 0, testId, }) {
    const [, setLocation] = useLocation();
    const content = (<motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }} onClick={href ? () => setLocation(href) : undefined} className={cn('group relative flex flex-col justify-between overflow-hidden rounded-lg border border-card-border bg-card p-4 transition-all', href && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md')} data-testid={testId ?? `card-kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', accentClasses[accent])}>
          <Icon className="h-3.5 w-3.5"/>
        </div>
      </div>
      <div className="mt-3">
        {exactValue !== undefined ? (<Tooltip>
            <TooltipTrigger asChild>
              <p className="font-mono-num font-display text-xl font-semibold tracking-tight text-foreground">
                {value}
              </p>
            </TooltipTrigger>
            <TooltipContent>{formatSARExact(exactValue)}</TooltipContent>
          </Tooltip>) : (<p className="font-mono-num font-display text-xl font-semibold tracking-tight text-foreground">{value}</p>)}
        {sublabel && <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>}
        {trend && (<p className={cn('mt-1 text-xs font-medium', trend.positive ? 'text-accent' : 'text-destructive')}>
            {trend.positive ? '▲' : '▼'} {Math.abs(trend.value).toFixed(1)}%
          </p>)}
      </div>
      <div className={cn('pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-0 blur-2xl transition-opacity group-hover:opacity-100', accent === 'primary' && 'bg-primary/20', accent === 'accent' && 'bg-accent/20', accent === 'destructive' && 'bg-destructive/20', accent === 'chart-3' && 'bg-[hsl(var(--chart-3)/0.2)]')}/>
    </motion.div>);
    return content;
}
