import { useEffect, useState } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import Dashboard from '@/pages/Dashboard';
import Login from '@/pages/Login';
import { getSession, signIn, signOut, supabaseConfigured } from '@/lib/supabase-rest';

export default function App() {
  const [session, setSession] = useState(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    getSession().then(setSession).finally(() => setRestoring(false));
  }, []);

  const login = async (username, password) => setSession(await signIn(username, password));
  const logout = async () => {
    await signOut();
    setSession(null);
  };

  if (!supabaseConfigured)
    return <div className="min-h-screen grid place-items-center bg-slate-50 p-6 text-center text-[#112348]"><div><h1 className="text-xl font-bold">Dashboard configuration required</h1><p className="mt-2 text-sm">Supabase URL and publishable key are missing.</p></div></div>;
  if (restoring)
    return <div className="min-h-screen grid place-items-center bg-slate-50 text-[#112348]">Loading dashboard…</div>;
  if (!session)
    return <Login onLogin={login}/>;

  return (<TooltipProvider>
    <Dashboard onLogout={logout} user={session.profile} isAdmin={session.profile?.role === 'admin'}/>
    <Toaster />
  </TooltipProvider>);
}
