import { type ReactNode, useEffect, useState } from 'react';
import { Mail, Smartphone, ShieldCheck, TrendingUp, Zap, Lock } from 'lucide-react';
import { ThemeToggle } from '@/components/shell-tools';

const KEY = 'tv_session';
const post = (path: string, body: object) =>
  fetch(`/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Error'); return j; });

export const logout = () => { localStorage.removeItem(KEY); location.reload(); };

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(() => localStorage.getItem(KEY));
  const [checking, setChecking] = useState(() => !!localStorage.getItem(KEY));
  // A token the server no longer knows (restart/expiry) must send the user back to login, not leave every API call failing.
  useEffect(() => {
    const t = localStorage.getItem(KEY); if (!t) return;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => { if (r.status === 401) { localStorage.removeItem(KEY); setSession(null); } })
      .catch(() => {}) // offline: keep the session
      .finally(() => setChecking(false));
  }, []);
  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [dev, setDev] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);
  if (checking) return <div className="auth-wrap" style={{ display: 'grid', placeItems: 'center' }}><p className="subtle">Loading…</p></div>;
  if (session) return <>{children}</>;
  const target = mode === 'phone' ? { phone: value } : { email: value };
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); try { await fn(); } catch (e) { setErr((e as Error).message); } setBusy(false); };
  const send = () => run(async () => { const j = await post('request-otp', target); setDev(!!j.dev); setSent(true); setWait(30); });
  const verify = () => run(async () => { const j = await post('verify-otp', { ...target, code }); localStorage.setItem(KEY, j.token); setSession(j.token); });
  return (
    <div className="auth-wrap">
      <div className="auth-mesh" aria-hidden="true" />
      <ThemeToggle className="icon-btn auth-theme-toggle" />
      <div className="auth-hero">
        <div className="brand"><img className="brand-mark" src="/icons/icon-192.png" alt="TradeVerse" width={29} height={29} /><span className="brand-name">TradeVerse</span></div>
        <span className="auth-live-badge"><i /> Live markets, right now</span>
        <h1>Stocks, F&amp;O, Mutual Funds, IPO aur Crypto — <em>ek hi app.</em></h1>
        <p className="auth-hero-sub">India ka sabse complete trading workspace — paper-safe se shuru karo, confidence ke saath aage badho.</p>
        <ul>
          <li><span className="auth-li-icon"><TrendingUp size={15} /></span> Live markets, option chain with Greeks</li>
          <li><span className="auth-li-icon"><Zap size={15} /></span> SIP, goals, tax aur EMI planners</li>
          <li><span className="auth-li-icon"><ShieldCheck size={15} /></span> OTP login, paper-trading safe mode</li>
        </ul>
      </div>
      <div className="auth-card card">
        <span className="auth-card-glow" aria-hidden="true" />
        <h2>{sent ? 'OTP verify karo' : 'Login / Sign up'}</h2>
        <p className="subtle">{sent ? `OTP bheja gaya: ${value}` : 'Naya account apne aap ban jayega.'}</p>
        {!sent && (
          <div className="segmented">
            <button className={mode === 'phone' ? 'on' : ''} onClick={() => { setMode('phone'); setValue(''); }}><Smartphone size={14} /> Mobile</button>
            <button className={mode === 'email' ? 'on' : ''} onClick={() => { setMode('email'); setValue(''); }}><Mail size={14} /> Email</button>
          </div>
        )}
        {!sent ? (
          <div className="phone-field">
            {mode === 'phone' && <span className="cc">+91</span>}
            <input className="input" autoFocus type={mode === 'phone' ? 'tel' : 'email'} inputMode={mode === 'phone' ? 'numeric' : 'email'} maxLength={mode === 'phone' ? 10 : 120}
              placeholder={mode === 'phone' ? '10-digit mobile number' : 'you@example.com'} value={value}
              onChange={(e) => setValue(mode === 'phone' ? e.target.value.replace(/\D/g, '') : e.target.value)} />
          </div>
        ) : (
          <input className="input otp-input" autoFocus inputMode="numeric" maxLength={6} placeholder="• • • • • •" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        )}
        {sent && dev && <span className="subtle">Dev mode: OTP server log me print hua hai (SMTP/SMS configure karo).</span>}
        {err && <span className="negative" style={{ fontSize: 12 }}>{err}</span>}
        <button className="btn btn-primary full" disabled={busy || (sent ? code.length !== 6 : !value)} onClick={sent ? verify : send}>{busy ? 'Please wait…' : sent ? 'Verify & continue' : 'Send OTP'}</button>
        {sent && (
          <div className="row-between">
            <button className="link-button" onClick={() => { setSent(false); setCode(''); }}>{mode === 'phone' ? 'Number' : 'Email'} badlo</button>
            <button className="link-button" disabled={wait > 0} onClick={send}>{wait > 0 ? `Resend in ${wait}s` : 'Resend OTP'}</button>
          </div>
        )}
        <div className="auth-card-footer">
          <p className="subtle center"><Lock size={11} /> Continue karke aap Terms &amp; Privacy Policy accept karte hain.</p>
          <ThemeToggle className="icon-btn" />
        </div>
      </div>
    </div>
  );
}
