import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
export function ChartCard({ title, description, children, actions, className, index = 0 }) {
    return (<motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }} className={cn('rounded-lg border border-card-border bg-card p-4', className)} data-testid={`chart-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-sm font-semibold text-foreground">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </motion.div>);
}
