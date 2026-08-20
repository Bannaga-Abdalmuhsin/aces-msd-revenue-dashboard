import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FiltersProvider } from '@/lib/filter-context';
import Dashboard from '@/pages/Dashboard';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <FiltersProvider>
        <TooltipProvider>
          <Dashboard />
          <Toaster />
        </TooltipProvider>
      </FiltersProvider>
    </QueryClientProvider>
  );
}
