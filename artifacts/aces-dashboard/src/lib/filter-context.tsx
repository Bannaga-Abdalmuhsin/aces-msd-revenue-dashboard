import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export interface FiltersState {
  projects: string[];
  projectStatus?: string;
  revenueYear?: number;
  revenueMonth?: number;
  invoiceStatus?: string;
  dateFrom?: string;
  dateTo?: string;
}

const DEFAULT_FILTERS: FiltersState = {
  projects: [],
};

interface FiltersContextValue {
  filters: FiltersState;
  setFilters: (next: Partial<FiltersState>) => void;
  toggleProject: (name: string) => void;
  resetFilters: () => void;
  activeCount: number;
  barOpen: boolean;
  setBarOpen: (open: boolean) => void;
}

const FiltersContext = createContext<FiltersContextValue | null>(null);

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFiltersState] = useState<FiltersState>(DEFAULT_FILTERS);
  const [barOpen, setBarOpen] = useState(false);

  const setFilters = useCallback((next: Partial<FiltersState>) => {
    setFiltersState((prev) => ({ ...prev, ...next }));
  }, []);

  const toggleProject = useCallback((name: string) => {
    setFiltersState((prev) => {
      const has = prev.projects.includes(name);
      return {
        ...prev,
        projects: has ? prev.projects.filter((p) => p !== name) : [...prev.projects, name],
      };
    });
  }, []);

  const resetFilters = useCallback(() => setFiltersState(DEFAULT_FILTERS), []);

  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.projects.length > 0) n++;
    if (filters.projectStatus) n++;
    if (filters.revenueYear) n++;
    if (filters.revenueMonth) n++;
    if (filters.invoiceStatus) n++;
    if (filters.dateFrom) n++;
    if (filters.dateTo) n++;
    return n;
  }, [filters]);

  const value = useMemo(
    () => ({ filters, setFilters, toggleProject, resetFilters, activeCount, barOpen, setBarOpen }),
    [filters, setFilters, toggleProject, resetFilters, activeCount, barOpen],
  );

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error('useFilters must be used within FiltersProvider');
  return ctx;
}

// A single API `project` query param is supported server-side. When exactly
// one project is selected we can push filtering to the server; otherwise we
// fall back to filtering the returned rows on the client.
export function apiProjectParam(filters: FiltersState): string | undefined {
  return filters.projects.length === 1 ? filters.projects[0] : undefined;
}

export function clientFilterByProjects<T extends { projectName: string }>(
  rows: T[],
  filters: FiltersState,
): T[] {
  if (filters.projects.length <= 1) return rows;
  const set = new Set(filters.projects);
  return rows.filter((r) => set.has(r.projectName));
}
