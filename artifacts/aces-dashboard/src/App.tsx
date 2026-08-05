import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { ThemeProvider } from '@/components/theme-provider';
import { FiltersProvider } from '@/lib/filter-context';

import OverviewPage from '@/pages/overview';
import ProjectsPage from '@/pages/projects';
import ProjectDetailPage from '@/pages/project-detail';
import RevenuePage from '@/pages/revenue';
import InvoicesPage from '@/pages/invoices';
import AgingPage from '@/pages/aging';
import DeductiblesPage from '@/pages/deductibles';
import ForecastPage from '@/pages/forecast';
import ValidationPage from '@/pages/validation';
import ImportPage from '@/pages/import';
import AuditPage from '@/pages/audit';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={OverviewPage} />
      <Route path="/projects" component={ProjectsPage} />
      <Route path="/projects/:id" component={ProjectDetailPage} />
      <Route path="/revenue" component={RevenuePage} />
      <Route path="/invoices" component={InvoicesPage} />
      <Route path="/aging" component={AgingPage} />
      <Route path="/deductibles" component={DeductiblesPage} />
      <Route path="/forecast" component={ForecastPage} />
      <Route path="/validation" component={ValidationPage} />
      <Route path="/import" component={ImportPage} />
      <Route path="/audit" component={AuditPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <FiltersProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </FiltersProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
