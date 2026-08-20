import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import Dashboard from '@/pages/Dashboard';

export default function App() {
  return (
    <TooltipProvider>
      <Dashboard />
      <Toaster />
    </TooltipProvider>
  );
}
