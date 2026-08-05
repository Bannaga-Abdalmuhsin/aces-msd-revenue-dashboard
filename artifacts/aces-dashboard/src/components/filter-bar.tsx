import { useState } from 'react';
import { ChevronDown, Filter, X } from 'lucide-react';
import { useListProjects } from '@workspace/api-client-react';
import { useFilters } from '@/lib/filter-context';
import { cn } from '@/lib/utils';
import { PAYMENT_STATUSES } from '@/lib/format';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

const YEARS = [2022, 2023, 2024, 2025, 2026];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function FilterBar({ showInvoiceStatus = false }: { showInvoiceStatus?: boolean }) {
  const { filters, setFilters, toggleProject, resetFilters, activeCount, barOpen, setBarOpen } = useFilters();
  const { data: projects } = useListProjects();
  const [datesOpen, setDatesOpen] = useState(false);

  return (
    <div className="mb-5 rounded-lg border border-card-border bg-card" data-testid="filter-bar">
      <button
        onClick={() => setBarOpen(!barOpen)}
        className="flex w-full items-center justify-between px-4 py-2.5"
        data-testid="button-toggle-filters"
      >
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Filters</span>
          {activeCount > 0 && (
            <span className="flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </div>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', barOpen && 'rotate-180')} />
      </button>

      {barOpen && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          {/* Project multi-select */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs" data-testid="button-filter-project">
                Project {filters.projects.length > 0 && `(${filters.projects.length})`}
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-xs">Select Projects</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(projects ?? []).map((p) => (
                <DropdownMenuCheckboxItem
                  key={p.id}
                  checked={filters.projects.includes(p.name)}
                  onCheckedChange={() => toggleProject(p.name)}
                  data-testid={`checkbox-project-${p.id}`}
                >
                  {p.name}
                </DropdownMenuCheckboxItem>
              ))}
              {(!projects || projects.length === 0) && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No projects</div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Project status */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs" data-testid="button-filter-status">
                Status {filters.projectStatus ? `(${filters.projectStatus})` : ''}
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {['ongoing', 'completed', 'closed'].map((s) => (
                <DropdownMenuCheckboxItem
                  key={s}
                  checked={filters.projectStatus === s}
                  onCheckedChange={() => setFilters({ projectStatus: filters.projectStatus === s ? undefined : s })}
                  data-testid={`checkbox-status-${s}`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Year */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs" data-testid="button-filter-year">
                Year {filters.revenueYear ?? ''}
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-32">
              {YEARS.map((y) => (
                <DropdownMenuCheckboxItem
                  key={y}
                  checked={filters.revenueYear === y}
                  onCheckedChange={() => setFilters({ revenueYear: filters.revenueYear === y ? undefined : y })}
                  data-testid={`checkbox-year-${y}`}
                >
                  {y}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Month */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs" data-testid="button-filter-month">
                Month {filters.revenueMonth ? MONTHS[filters.revenueMonth - 1].slice(0, 3) : ''}
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              {MONTHS.map((m, i) => (
                <DropdownMenuCheckboxItem
                  key={m}
                  checked={filters.revenueMonth === i + 1}
                  onCheckedChange={() => setFilters({ revenueMonth: filters.revenueMonth === i + 1 ? undefined : i + 1 })}
                  data-testid={`checkbox-month-${i + 1}`}
                >
                  {m}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {showInvoiceStatus && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs" data-testid="button-filter-invoice-status">
                  Invoice Status
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {PAYMENT_STATUSES.map((s) => (
                  <DropdownMenuCheckboxItem
                    key={s}
                    checked={filters.invoiceStatus === s}
                    onCheckedChange={() => setFilters({ invoiceStatus: filters.invoiceStatus === s ? undefined : s })}
                    data-testid={`checkbox-invoice-status-${s}`}
                  >
                    {s}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Date range */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setDatesOpen((o) => !o)}
              data-testid="button-filter-dates"
            >
              Date Range
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
            {datesOpen && (
              <div className="absolute left-0 top-9 z-20 flex w-64 flex-col gap-2 rounded-md border border-border bg-popover p-3 shadow-lg">
                <label className="text-[11px] font-medium text-muted-foreground">From</label>
                <input
                  type="date"
                  value={filters.dateFrom ?? ''}
                  onChange={(e) => setFilters({ dateFrom: e.target.value || undefined })}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  data-testid="input-date-from"
                />
                <label className="text-[11px] font-medium text-muted-foreground">To</label>
                <input
                  type="date"
                  value={filters.dateTo ?? ''}
                  onChange={(e) => setFilters({ dateTo: e.target.value || undefined })}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  data-testid="input-date-to"
                />
              </div>
            )}
          </div>

          {activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={resetFilters}
              data-testid="button-clear-filters"
            >
              <X className="mr-1 h-3 w-3" />
              Clear all
            </Button>
          )}

          {filters.projects.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {filters.projects.map((p) => (
                <span
                  key={p}
                  className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                  data-testid={`chip-project-${p}`}
                >
                  {p}
                  <button onClick={() => toggleProject(p)}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
