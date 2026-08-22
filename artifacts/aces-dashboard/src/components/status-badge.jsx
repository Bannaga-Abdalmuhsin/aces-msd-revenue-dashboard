import { cn } from '@/lib/utils';
import { statusBadgeClass, statusDotClass, severityBadgeClass } from '@/lib/format';
export function StatusBadge({ status, className }) {
    return (<span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium', statusBadgeClass(status), className)} data-testid={`badge-status-${status.replace(/\s+/g, '-').toLowerCase()}`}>
      <span className={cn('h-1.5 w-1.5 rounded-full', statusDotClass(status))}/>
      {status}
    </span>);
}
export function SeverityBadge({ severity, className }) {
    return (<span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', severityBadgeClass(severity), className)} data-testid={`badge-severity-${severity}`}>
      {severity}
    </span>);
}
