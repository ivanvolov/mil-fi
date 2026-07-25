import { useState, type FormEvent } from 'react';

type Status = 'idle' | 'submitting' | 'invalid' | 'rate-limited' | 'error';

const DEMO_ACCOUNTS = [
  { username: 'admin', note: 'full access' },
  { username: 'government', note: 'Orb · rules + payouts' },
  { username: 'military', note: 'Passport · run downings' },
  { username: 'spotter', note: 'Selfie · file reports' },
];

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username || !password) return;
    setStatus('submitting');
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
        credentials: 'include',
      });
      if (res.ok) {
        window.location.href = '/';
        return;
      }
      if (res.status === 429) setStatus('rate-limited');
      else if (res.status === 401) setStatus('invalid');
      else setStatus('error');
    } catch {
      setStatus('error');
    }
  }

  const errorText =
    status === 'invalid' ? 'Invalid username or password.' :
    status === 'rate-limited' ? 'Too many attempts. Try again in a few minutes.' :
    status === 'error' ? 'Sign-in failed. Try again.' :
    '';

  return (
    <div className="min-h-full flex items-center justify-center bg-[#0d1117] text-[#e7e9ea] p-6">
      <form onSubmit={onSubmit} className="w-full max-w-md bg-[#161b22] border border-[#21262d] rounded-lg p-6 shadow-lg">
        <h1 className="text-xl font-semibold mb-1">MilFi — sign in</h1>
        <p className="text-sm text-[#8b949e] mb-5">Sign in with your role account.</p>

        <label className="block text-xs text-[#8b949e] mb-1">Username</label>
        <input
          type="text"
          autoFocus
          autoComplete="username"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="government"
          className="w-full mb-3 bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 font-mono focus:outline-none focus:border-cyan-500"
        />

        <label className="block text-xs text-[#8b949e] mb-1">Password</label>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••"
          className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 font-mono focus:outline-none focus:border-cyan-500"
        />

        {errorText && (
          <div className="mt-4 text-sm text-red-400 bg-red-950/40 border border-red-900/60 rounded px-3 py-2">
            {errorText}
          </div>
        )}

        <button
          type="submit"
          disabled={status === 'submitting' || !username || !password}
          className="mt-5 w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-[#21262d] disabled:text-[#8b949e] disabled:cursor-not-allowed text-white font-medium rounded px-3 py-2 transition"
        >
          {status === 'submitting' ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="mt-5 pt-4 border-t border-[#21262d]">
          <div className="text-[11px] uppercase tracking-wider text-[#8b949e] mb-2">Demo accounts · password “milfi”</div>
          <div className="grid grid-cols-1 gap-1">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.username}
                type="button"
                onClick={() => { setUsername(a.username); setPassword('milfi'); }}
                className="flex items-center justify-between text-left text-xs font-mono bg-[#0d1117] hover:border-cyan-600 border border-[#30363d] rounded px-2 py-1.5 transition"
              >
                <span className="text-[#e7e9ea]">{a.username}</span>
                <span className="text-[#8b949e]">{a.note}</span>
              </button>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
}
