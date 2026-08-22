// Formatting helpers for the ACES MSD Revenue Dashboard.
// Currency is always Saudi Riyal (SAR).
export function formatSAR(value) {
    if (value === null || value === undefined || Number.isNaN(value))
        return 'SAR 0';
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    if (abs < 1000) {
        return `${sign}SAR ${Math.round(abs).toLocaleString('en-US')}`;
    }
    if (abs < 1_000_000) {
        return `${sign}SAR ${(abs / 1000).toFixed(1)}K`;
    }
    return `${sign}SAR ${(abs / 1_000_000).toFixed(1)}M`;
}
export function formatSARExact(value) {
    if (value === null || value === undefined || Number.isNaN(value))
        return 'SAR 0.00';
    return `SAR ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function formatNumber(value) {
    if (value === null || value === undefined || Number.isNaN(value))
        return '0';
    return value.toLocaleString('en-US');
}
export function formatPercent(value, digits = 1) {
    if (value === null || value === undefined || Number.isNaN(value))
        return '0.0%';
    return `${value.toFixed(digits)}%`;
}
export function formatDays(value) {
    if (value === null || value === undefined || Number.isNaN(value))
        return '—';
    return `${Math.round(value)}d`;
}
export function formatDate(value) {
    if (!value)
        return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime()))
        return value;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function formatMonthLabel(value) {
    if (!value)
        return '—';
    // Accept YYYY-MM or YYYY-MM-DD
    const parts = value.split('-');
    if (parts.length < 2)
        return value;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    if (Number.isNaN(d.getTime()))
        return value;
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}
export function formatMonthFull(value) {
    if (!value)
        return '—';
    const parts = value.split('-');
    if (parts.length < 2)
        return value;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    if (Number.isNaN(d.getTime()))
        return value;
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
export function formatDateTime(value) {
    if (!value)
        return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime()))
        return value;
    return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
export const PAYMENT_STATUSES = [
    'Not Invoiced',
    'Invoiced – Not Due',
    'Due Soon',
    'Overdue',
    'Partially Collected',
    'Fully Collected',
    'Collected Late',
    'Collected on Time',
];
// Row background tone by payment status, per brief:
// red=overdue, amber=due soon/partial, green=collected, grey=not invoiced, blue=not yet due
export function statusRowClass(status) {
    switch (status) {
        case 'Overdue':
            return 'bg-[hsl(var(--destructive)/0.08)] hover:bg-[hsl(var(--destructive)/0.13)]';
        case 'Due Soon':
        case 'Partially Collected':
        case 'Collected Late':
            return 'bg-[hsl(var(--chart-1)/0.10)] hover:bg-[hsl(var(--chart-1)/0.16)]';
        case 'Fully Collected':
        case 'Collected on Time':
            return 'bg-[hsl(var(--chart-2)/0.09)] hover:bg-[hsl(var(--chart-2)/0.15)]';
        case 'Not Invoiced':
            return 'bg-muted/40 hover:bg-muted/60';
        case 'Invoiced – Not Due':
            return 'bg-[hsl(var(--chart-3)/0.08)] hover:bg-[hsl(var(--chart-3)/0.14)]';
        default:
            return 'hover:bg-muted/40';
    }
}
export function statusDotClass(status) {
    switch (status) {
        case 'Overdue':
            return 'bg-destructive';
        case 'Due Soon':
        case 'Partially Collected':
        case 'Collected Late':
            return 'bg-[hsl(var(--chart-1))]';
        case 'Fully Collected':
        case 'Collected on Time':
            return 'bg-[hsl(var(--chart-2))]';
        case 'Not Invoiced':
            return 'bg-muted-foreground/50';
        case 'Invoiced – Not Due':
            return 'bg-[hsl(var(--chart-3))]';
        default:
            return 'bg-muted-foreground';
    }
}
export function statusBadgeClass(status) {
    switch (status) {
        case 'Overdue':
            return 'bg-destructive/10 text-destructive border-destructive/20';
        case 'Due Soon':
        case 'Partially Collected':
        case 'Collected Late':
            return 'bg-[hsl(var(--chart-1)/0.14)] text-[hsl(var(--chart-1))] border-[hsl(var(--chart-1)/0.3)]';
        case 'Fully Collected':
        case 'Collected on Time':
            return 'bg-[hsl(var(--chart-2)/0.14)] text-[hsl(var(--chart-2))] border-[hsl(var(--chart-2)/0.3)]';
        case 'Not Invoiced':
            return 'bg-muted text-muted-foreground border-border';
        case 'Invoiced – Not Due':
            return 'bg-[hsl(var(--chart-3)/0.14)] text-[hsl(var(--chart-3))] border-[hsl(var(--chart-3)/0.3)]';
        default:
            return 'bg-muted text-muted-foreground border-border';
    }
}
export function severityBadgeClass(severity) {
    switch (severity) {
        case 'critical':
        case 'error':
            return 'bg-destructive/10 text-destructive border-destructive/25';
        case 'warning':
            return 'bg-[hsl(var(--chart-1)/0.14)] text-[hsl(var(--chart-1))] border-[hsl(var(--chart-1)/0.3)]';
        case 'info':
            return 'bg-[hsl(var(--chart-3)/0.14)] text-[hsl(var(--chart-3))] border-[hsl(var(--chart-3)/0.3)]';
        default:
            return 'bg-muted text-muted-foreground border-border';
    }
}
