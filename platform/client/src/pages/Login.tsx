import { useState, type FormEvent } from 'react';

type Status = 'idle' | 'submitting' | 'invalid' | 'rate-limited' | 'error';

function formatForDisplay(digits: string): string {
  const groups = digits.match(/.{1,4}/g);
  return groups ? groups.join('-') : digits;
}

export function LoginPage() {
  const [raw, setRaw] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const digits = raw.replace(/\D/g, '');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!digits) return;
    setStatus('submitting');
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: digits }),
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
    status === 'invalid' ? 'Invalid code.' :
    status === 'rate-limited' ? 'Too many attempts. Try again in a few minutes.' :
    status === 'error' ? 'Sign-in failed. Try again.' :
    '';

  return (
    <div className="min-h-full flex items-center justify-center bg-[#0d1117] text-[#e7e9ea] p-6">
      <form onSubmit={onSubmit} className="w-full max-w-md bg-[#161b22] border border-[#21262d] rounded-lg p-6 shadow-lg">
        <h1 className="text-xl font-semibold mb-1">Sign in</h1>
        <p className="text-sm text-[#8b949e] mb-5">Paste your invite code.</p>

        <input
          type="text"
          inputMode="numeric"
          autoFocus
          autoComplete="one-time-code"
          spellCheck={false}
          value={formatForDisplay(digits)}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="0000-0000-0000-0000-0000"
          className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 font-mono text-lg tracking-wider focus:outline-none focus:border-cyan-500"
        />

        <div className="mt-2 text-xs text-[#8b949e]">{digits.length}/20 digits</div>

        {errorText && (
          <div className="mt-4 text-sm text-red-400 bg-red-950/40 border border-red-900/60 rounded px-3 py-2">
            {errorText}
          </div>
        )}

        <button
          type="submit"
          disabled={status === 'submitting' || digits.length === 0}
          className="mt-5 w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-[#21262d] disabled:text-[#8b949e] disabled:cursor-not-allowed text-white font-medium rounded px-3 py-2 transition"
        >
          {status === 'submitting' ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
