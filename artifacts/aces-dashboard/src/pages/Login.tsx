import { useState } from 'react';
import logoUrl from '@assets/MSD_Logo_1785945599981.png';

const CREDENTIAL_HASHES = [
  '72470eae5d1954da93d56ef47e0b2df54ff1f6a63c0e580f36da95a4a8cba97b',
  '4a83aabdb47fad7d48e4c436f1f231336730972e83c6747356660c2d72a877db',
  'd89512154d73d3f761a6f8b76d810ec85d27565759223b19e5ffae907519a9d9',
];

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setTimeout(async () => {
      const input = new TextEncoder().encode(`${username.trim().toLowerCase()}\0${password}`);
      const digest = await crypto.subtle.digest('SHA-256', input);
      const key = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (CREDENTIAL_HASHES.includes(key)) {
        localStorage.setItem('aces_auth', JSON.stringify({ username: username.trim().toLowerCase(), ts: Date.now() }));
        onLogin();
      } else {
        setError('Invalid username or password. Please try again.');
      }
      setLoading(false);
    }, 400);
  };

  const fieldFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = '#D9232A';
    e.target.style.boxShadow = '0 0 0 3px rgba(217,35,42,0.10)';
  };
  const fieldBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = '#CBD5E1';
    e.target.style.boxShadow = 'none';
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.08fr_0.92fr]" style={{ fontFamily: 'Inter, sans-serif' }}>
      <section className="relative overflow-hidden px-7 py-7 sm:px-12 sm:py-10 lg:px-16 lg:py-12 flex flex-col justify-between min-h-[280px] lg:min-h-screen"
               style={{ background: 'linear-gradient(145deg, #081B3A 0%, #112E63 58%, #0A224A 100%)' }}>
        <svg className="absolute bottom-0 left-0 w-full h-[72%] opacity-25" viewBox="0 0 900 520" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <pattern id="login-grid" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M44 0H0V44" fill="none" stroke="#76A1D7" strokeWidth="0.7" /></pattern>
            <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#397BCC" stopOpacity="0.42" /><stop offset="1" stopColor="#397BCC" stopOpacity="0" /></linearGradient>
          </defs>
          <rect width="900" height="520" fill="url(#login-grid)" />
          <path d="M0 450L95 385L175 410L270 305L350 342L455 230L548 285L650 165L740 220L900 92V520H0Z" fill="url(#chart-fill)" />
          <polyline points="0,450 95,385 175,410 270,305 350,342 455,230 548,285 650,165 740,220 900,92" fill="none" stroke="#4592EA" strokeWidth="3" />
          <polyline points="0,500 110,465 220,408 330,432 445,355 555,330 680,248 790,265 900,190" fill="none" stroke="#EF1E34" strokeWidth="3" />
        </svg>

        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-36 h-16 sm:w-40 sm:h-[72px] overflow-hidden flex items-center justify-center">
            <img src={logoUrl} alt="ACES Managed Services Logo" className="w-full h-auto"
                 style={{ mixBlendMode: 'screen', transform: 'scale(1.18)', transformOrigin: 'center' }} />
          </div>
          <div className="mt-5 lg:mt-16 max-w-2xl mx-auto">
            <p className="text-base sm:text-lg font-semibold tracking-[0.06em]" style={{ color: 'rgba(255,255,255,0.78)' }}>Managed Services Department</p>
            <h1 className="mt-3 text-3xl sm:text-4xl xl:text-5xl font-bold tracking-tight text-white">Project Revenue Dashboard</h1>
            <p className="mt-4 text-base sm:text-lg max-w-xl mx-auto leading-relaxed" style={{ color: 'rgba(255,255,255,0.78)' }}>Secure access to revenue performance, invoicing and collection insights.</p>
          </div>
        </div>

        <div className="relative z-10 hidden lg:flex items-center gap-3 flex-wrap">
          {['Revenue', 'Invoicing', 'Collections'].map((label, index) => (
            <div key={label} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold text-white"
                 style={{ borderColor: 'rgba(117,161,215,0.5)', background: 'rgba(5,21,49,0.3)' }}>
              <span className="grid place-items-center w-5 h-5 rounded-md" style={{ background: index === 1 ? '#EF1E34' : 'rgba(69,146,234,0.35)' }}>{index === 0 ? '↗' : index === 1 ? '▤' : '✓'}</span>
              {label}
            </div>
          ))}
        </div>
      </section>

      <main className="relative flex items-center justify-center px-5 py-10 sm:px-10" style={{ background: '#F8FAFC' }}>
        <div className="absolute top-0 left-0 right-0 h-1 lg:hidden" style={{ background: '#EF1E34' }} />
        <div className="w-full max-w-[500px] bg-white rounded-2xl px-6 py-8 sm:px-10 sm:py-10"
             style={{ border: '1px solid #E2E8F0', boxShadow: '0 20px 55px rgba(17,35,72,0.10)' }}>
          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-tight" style={{ color: '#112348' }}>Welcome back</h2>
            <p className="mt-2 text-sm" style={{ color: '#64748B' }}>Sign in to continue to the dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: '#1A202C' }}>Username</label>
              <div className="relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" fill="none" stroke="#718096" viewBox="0 0 24 24" strokeWidth={1.8}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>
                <input type="text" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required placeholder="Enter your username"
                       className="w-full text-sm pl-12 pr-4 py-3.5 rounded-xl border outline-none transition-all bg-white"
                       style={{ borderColor: '#CBD5E1', color: '#1A202C' }} onFocus={fieldFocus} onBlur={fieldBlur} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: '#1A202C' }}>Password</label>
              <div className="relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" fill="none" stroke="#718096" viewBox="0 0 24 24" strokeWidth={1.8}><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>
                <input type={showPw ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Enter your password"
                       className="w-full text-sm pl-12 pr-16 py-3.5 rounded-xl border outline-none transition-all bg-white"
                       style={{ borderColor: '#CBD5E1', color: '#1A202C' }} onFocus={fieldFocus} onBlur={fieldBlur} />
                <button type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1}
                        className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs font-medium"
                        style={{ color: '#64748B' }} aria-label={showPw ? 'Hide password' : 'Show password'}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {error && <p role="alert" className="text-xs font-medium px-3.5 py-3 rounded-xl" style={{ background: '#FDE8EB', color: '#C8102E' }}>{error}</p>}

            <button type="submit" disabled={loading}
                    className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ background: '#D9232A', boxShadow: '0 8px 18px rgba(217,35,42,0.20)' }}
                    onMouseOver={e => { if (!loading) e.currentTarget.style.background = '#C8102E'; }}
                    onMouseOut={e => { e.currentTarget.style.background = '#D9232A'; }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t text-center" style={{ borderColor: '#E2E8F0' }}>
            <p className="text-[11px]" style={{ color: '#94A3B8' }}>ACES Managed Services Department · Confidential</p>
          </div>
        </div>
      </main>
    </div>
  );
}
