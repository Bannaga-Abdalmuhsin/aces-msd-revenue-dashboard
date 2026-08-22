import { Menu, Sun, Moon, CircleDot } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { formatDateTime } from '@/lib/format';
export function AppHeader({ title, description, onMenuClick, lastDataUpdate, actions }) {
    const { theme, toggleTheme } = useTheme();
    return (<header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-6">
      <button onClick={onMenuClick} data-testid="button-menu-toggle" className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted lg:hidden">
        <Menu className="h-5 w-5"/>
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-base font-semibold tracking-tight text-foreground sm:text-lg">
          {title}
        </h1>
        {description && <p className="hidden truncate text-xs text-muted-foreground sm:block">{description}</p>}
      </div>

      {actions}

      <div className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 md:flex" data-testid="text-last-update">
        <CircleDot className="h-3 w-3 text-accent"/>
        <span className="text-[11px] font-medium text-muted-foreground">
          Data as of {formatDateTime(lastDataUpdate)}
        </span>
      </div>

      <button onClick={toggleTheme} data-testid="button-theme-toggle" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-muted">
        {theme === 'light' ? <Moon className="h-4 w-4"/> : <Sun className="h-4 w-4"/>}
      </button>
    </header>);
}
