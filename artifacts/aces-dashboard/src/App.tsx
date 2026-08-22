import { useState } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import Dashboard from '@/pages/Dashboard';
import Login from '@/pages/Login';

const ADMIN_USERNAMES = new Set(['bannaga', 'hussam']);

function getSessionUsername() {
  try {
    const session = JSON.parse(localStorage.getItem('aces_auth') || '{}');
    return typeof session.username === 'string' ? session.username.trim().toLowerCase() : '';
  } catch {
    return '';
  }
}

function useAuth() {
  const [authed, setAuthed] = useState<boolean>(() => {
    try { return !!localStorage.getItem('aces_auth'); }
    catch { return false; }
  });
  const login = () => setAuthed(true);
  const logout = () => {
    localStorage.removeItem('aces_auth');
    setAuthed(false);
  };
  return { authed, login, logout };
}

export default function App() {
  const { authed, login, logout } = useAuth();

  if (!authed) return <Login onLogin={login} />;

  return (
    <TooltipProvider>
      <Dashboard onLogout={logout} isAdmin={ADMIN_USERNAMES.has(getSessionUsername())} />
      <Toaster />
    </TooltipProvider>
  );
}
