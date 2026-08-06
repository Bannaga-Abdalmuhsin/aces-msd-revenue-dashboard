import { useState } from 'react';
import logoUrl from '@assets/MSD_Logo_1785945599981.png';

// ── Credentials ───────────────────────────────────────────────────────
const CREDENTIALS = [
  { username: 'aces.admin',   password: 'MSD@2026' },
  { username: 'aces.manager', password: 'Revenue#26' },
];

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Small artificial delay for UX
    setTimeout(() => {
      const match = CREDENTIALS.find(
        c => c.username === username.trim() && c.password === password
      );
      if (match) {
        localStorage.setItem('aces_auth', JSON.stringify({ username: match.username }));
        onLogin();
      } else {
        setError('Invalid username or password.');
      }
      setLoading(false);
    }, 400);
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: '#F4F5F7', fontFamily: 'Inter, sans-serif' }}
    >
      {/* Card */}
      <div
        className="w-full max-w-sm bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 8px 32px rgba(18,46,100,0.13)', border: '1px solid #D9DEE7' }}
      >
        {/* Navy header strip */}
        <div className="px-8 pt-8 pb-6 text-center" style={{ background: '#122E64' }}>
          <img
            src={logoUrl}
            alt="ACES Logo"
            style={{ height: 56, width: 'auto', objectFit: 'contain', margin: '0 auto' }}
          />
          <p
            className="text-xs font-medium tracking-widest uppercase mt-3"
            style={{ color: 'rgba(255,255,255,0.55)' }}
          >
            Managed Services Department
          </p>
          <h1 className="text-base font-bold text-white mt-0.5">
            Project Revenue Dashboard
          </h1>
          {/* Red brand line */}
          <div className="h-0.5 mt-5 -mx-8" style={{ background: '#EF1E34' }} />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-7 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#122E64' }}>
            Sign in to continue
          </p>

          {/* Username */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: '#303846' }}>
              Username
            </label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              placeholder="Enter your username"
              className="w-full text-sm px-3 py-2 rounded-lg border outline-none transition-all"
              style={{
                borderColor: '#D9DEE7',
                color: '#303846',
                background: '#F4F5F7',
              }}
              onFocus={e => (e.target.style.borderColor = '#EF1E34')}
              onBlur={e => (e.target.style.borderColor = '#D9DEE7')}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: '#303846' }}>
              Password
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
                className="w-full text-sm px-3 py-2 pr-10 rounded-lg border outline-none transition-all"
                style={{
                  borderColor: '#D9DEE7',
                  color: '#303846',
                  background: '#F4F5F7',
                }}
                onFocus={e => (e.target.style.borderColor = '#EF1E34')}
                onBlur={e => (e.target.style.borderColor = '#D9DEE7')}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: '#7B8495' }}
              >
                {showPw ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs font-medium px-3 py-2 rounded-lg"
               style={{ background: 'rgba(239,30,52,0.08)', color: '#EF1E34' }}>
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-60"
            style={{ background: '#EF1E34' }}
            onMouseOver={e => { if (!loading) e.currentTarget.style.background = '#9C1C2A'; }}
            onMouseOut={e => { e.currentTarget.style.background = '#EF1E34'; }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>

      {/* Footer */}
      <p className="mt-6 text-[11px]" style={{ color: '#7B8495' }}>
        ACES Managed Services Department · Confidential
      </p>
    </div>
  );
}
