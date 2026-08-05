import { Link, useLocation } from 'wouter';
import { useState } from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  TrendingUp,
  Receipt,
  Clock,
  ShieldAlert,
  CalendarRange,
  ClipboardCheck,
  UploadCloud,
  History,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_SECTIONS = [
  {
    label: 'Command Center',
    items: [{ path: '/', label: 'Executive Overview', icon: LayoutDashboard }],
  },
  {
    label: 'Portfolio',
    items: [
      { path: '/projects', label: 'Project Performance', icon: FolderKanban },
      { path: '/revenue', label: 'Revenue Analysis', icon: TrendingUp },
    ],
  },
  {
    label: 'Cash Operations',
    items: [
      { path: '/invoices', label: 'Invoice & Collections', icon: Receipt },
      { path: '/aging', label: 'Outstanding Aging', icon: Clock },
      { path: '/deductibles', label: 'Deductibles & Penalties', icon: ShieldAlert },
      { path: '/forecast', label: 'Monthly Forecast', icon: CalendarRange },
    ],
  },
  {
    label: 'Governance',
    items: [
      { path: '/validation', label: 'Data Validation', icon: ClipboardCheck },
      { path: '/import', label: 'Import & Export', icon: UploadCloud },
      { path: '/audit', label: 'Administration', icon: History },
    ],
  },
];

export function AppSidebar({
  mobileOpen,
  onMobileClose,
}: {
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onMobileClose}
          data-testid="overlay-sidebar-mobile"
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200 ease-out',
          collapsed ? 'w-[72px]' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        data-testid="sidebar-main"
      >
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary font-display text-sm font-bold text-sidebar-primary-foreground">
            A
          </div>
          {!collapsed && (
            <div className="min-w-0 overflow-hidden">
              <p className="font-display text-[13px] font-semibold leading-tight tracking-tight text-sidebar-foreground">
                ACES MSD
              </p>
              <p className="truncate text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
                Revenue Dashboard
              </p>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="mb-5">
              {!collapsed && (
                <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = location === item.path;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      onClick={onMobileClose}
                      data-testid={`link-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors',
                        active
                          ? 'bg-sidebar-primary/15 text-sidebar-primary'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                        collapsed && 'justify-center',
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {active && !collapsed && (
                        <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-sidebar-primary" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <button
            onClick={() => setCollapsed((c) => !c)}
            data-testid="button-sidebar-collapse"
            className="hidden w-full items-center justify-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:flex"
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
