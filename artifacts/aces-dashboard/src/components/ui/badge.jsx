import * as React from 'react';
import { cn } from '@/lib/utils';
import { cva } from 'class-variance-authority';
const badgeVariants = cva(
// Whitespace-nowrap: Badges should never wrap.
'whitespace-nowrap inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2' +
    ' hover-elevate ', {
    variants: {
        variant: {
            default: 
            // Keep the compact shadow; elevation is handled by the shared utility.
            'border-transparent bg-primary text-primary-foreground shadow-xs',
            secondary: 
            // Elevation is handled by the shared utility.
            'border-transparent bg-secondary text-secondary-foreground',
            destructive: 
            // Keep the compact shadow; elevation is handled by the shared utility.
            'border-transparent bg-destructive text-destructive-foreground shadow-xs',
            // Use the dashboard badge-outline variable.
            outline: 'text-foreground border [border-color:var(--badge-outline)]',
        },
    },
    defaultVariants: {
        variant: 'default',
    },
});
function Badge({ className, variant, ...props }) {
    return (<div className={cn(badgeVariants({ variant }), className)} {...props}/>);
}
export { Badge, badgeVariants };
