import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FiltersProvider } from '@/lib/filter-context';
import Dashboard from '@/pages/Dashboard';
import Login from '@/pages/Login';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
  },
});

function useAuth() {
  const [authed, setAuthed] = useState<boolean>(() => {
    try { return !!localStorage.getItem('aces_auth'); }
    catch { return false; }
  });
  const login  = () => setAuthed(true);
  const logout = () => { localStorage.removeItem('aces_auth'); setAuthed(false); };
  return { authed, login, logout };
}

export default function App() {
  const { authed, login, logout } = useAuth();

  if (!authed) return <Login onLogin={login} />;

  return (
    <QueryClientProvider client={queryClient}>
      <FiltersProvider>
        <TooltipProvider>
          <Dashboard onLogout={logout} />
          <Toaster />
        </TooltipProvider>
      </FiltersProvider>
    </QueryClientProvider>
  );
}
