import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { CheckCircle2, Loader2, QrCode } from 'lucide-react';
import { apiJson, fmtInr } from '@/lib/live-feed';

type Cfg = { razorpay: boolean; demoCredit: boolean; min: number; max: number };
type Qr = { qrId: string; imageUrl: string; amount: number; expiresAt: number };
const PRESETS = [500, 1000, 5000, 10000];

export function AddMoneyPage() {
  const [cfg, setCfg] = useState<Cfg | null>(null); const [bal, setBal] = useState<number | null>(null);
  const [amount, setAmount] = useState('1000'); const [qr, setQr] = useState<Qr | null>(null);
  const [status, setStatus] = useState<'idle' | 'waiting' | 'paid' | 'expired'>('idle');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [left, setLeft] = useState(0);
  const before = useRef(0);

  const load = useCallback(async () => {
    try { const [c, p] = await Promise.all([apiJson('/api/pay/config'), apiJson('/api/trade/portfolio')]); setCfg(c); setBal(p.balance); }
    catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!qr || status !== 'waiting') return;
    const id = setInterval(async () => {
      setLeft(Math.max(0, Math.round((qr.expiresAt - Date.now()) / 1000)));
      try { const j = await apiJson(`/api/pay/status/${qr.qrId}`); setBal(j.balance); if (j.status === 'paid') setStatus('paid'); else if (j.status === 'expired') setStatus('expired'); } catch { /* keep polling */ }
    }, 3000);
    return () => clearInterval(id);
  }, [qr, status]);

  const n = Number(amount); const amtOk = !!cfg && Number.isFinite(n) && n >= cfg.min && n <= cfg.max && Math.round(n * 100) === n * 100;
  const make = async () => {
    setBusy(true); setErr('');
    try { before.current = bal ?? 0; const j = await apiJson('/api/pay/qr', { amount: n }); setQr(j); setLeft(Math.round((j.expiresAt - Date.now()) / 1000)); setStatus('waiting'); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const demo = async () => { setBusy(true); setErr(''); try { const j = await apiJson('/api/pay/demo-credit', { amount: n }); setBal(j.balance); } catch (e) { setErr((e as Error).message); } setBusy(false); };
  const reset = () => { setQr(null); setStatus('idle'); setErr(''); };
  const mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0');

  return (
    <main className="page">
      <div className="page-heading"><div><p className="eyebrow">Wallet</p><h1>Add money</h1>
        <p className="subtle product-intro">Amount daalo, QR scan karo aur kisi bhi UPI app se pay karo. Payment confirm hote hi balance add ho jaata hai.</p></div>
        <div className="card pad" style={{ minWidth: 160 }}><span className="subtle" style={{ fontSize: 12 }}>Balance</span><div className="mono" style={{ fontSize: 22 }}>{bal == null ? '—' : fmtInr(bal)}</div></div></div>
      {!cfg ? (err ? <div className="card pad"><p className="negative" role="alert">{err}</p><button className="btn btn-secondary" onClick={load}>Retry</button></div> : <div className="card pad"><Loader2 size={16} className="spin" /> Loading…</div>) : (
        <div className="two-col">
          <div className="card pad">
            {status === 'idle' && <>
              <label className="field"><span>Amount (₹{cfg.min} – ₹{cfg.max.toLocaleString('en-IN')})</span><input className="input mono" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} /></label>
              <div className="quick-row" style={{ margin: '10px 0' }}>{PRESETS.map((p) => <button key={p} className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setAmount(String(p))}>₹{p.toLocaleString('en-IN')}</button>)}</div>
              {err && <p className="negative" role="alert">{err}</p>}
              {cfg.razorpay
                ? <button className="btn btn-primary full" disabled={busy || !amtOk} onClick={make}><QrCode size={14} /> {busy ? 'QR ban raha hai…' : 'Generate payment QR'}</button>
                : <p className="subtle" style={{ fontSize: 13 }}>UPI QR abhi configure nahi hua. Owner ko server par Razorpay keys set karni hongi.</p>}
              {cfg.demoCredit && <button className="btn btn-secondary full" style={{ marginTop: 8 }} disabled={busy || !amtOk} onClick={demo}>Demo credit (sirf testing)</button>}
            </>}
            {status === 'waiting' && qr && <div style={{ textAlign: 'center' }}>
              <p><strong>{fmtInr(qr.amount)}</strong> pay karo</p>
              <img src={qr.imageUrl} alt={`UPI QR for ${fmtInr(qr.amount)}`} style={{ width: 'min(260px, 70vw)', background: '#fff', padding: 10, borderRadius: 12 }} />
              <p className="subtle" role="status">Payment ka intezaar… <span className="mono">{mm}:{ss}</span> me expire hoga</p>
              <p className="subtle" style={{ fontSize: 12 }}>Exact ₹{qr.amount} hi pay karo. Dusra amount credit nahi hoga. Pay karne ke baad is page ko band mat karo.</p>
              <button className="btn btn-secondary" onClick={reset}>Cancel</button></div>}
            {status === 'paid' && <div style={{ textAlign: 'center' }}><CheckCircle2 size={40} color="#10B981" /><h2>Payment mil gaya</h2><p className="subtle">{fmtInr(before.current)} → <strong className="mono">{fmtInr(bal ?? 0)}</strong></p>
              <div className="quick-row" style={{ justifyContent: 'center' }}><Link href="/live" className="btn btn-primary">Trade karo</Link><button className="btn btn-secondary" onClick={reset}>Aur add karo</button></div></div>}
            {status === 'expired' && <div style={{ textAlign: 'center' }}><h2>QR expire ho gaya</h2><p className="subtle">Agar aapne pay kar diya tha to balance thodi der me add ho jayega. Nahi to naya QR banao.</p><button className="btn btn-primary" onClick={reset}>Naya QR</button></div>}
          </div>
          <div className="card pad"><h2>Kaise kaam karta hai</h2>
            <ol className="subtle" style={{ paddingLeft: 18, lineHeight: 1.7 }}><li>Amount choose karo aur QR generate karo.</li><li>Kisi bhi UPI app (GPay, PhonePe, Paytm) se scan karke pay karo.</li><li>Razorpay payment confirm karta hai aur balance automatically add ho jaata hai.</li></ol>
            <p className="subtle" style={{ fontSize: 12 }}>Balance se abhi paper (practice) trades hote hain. Asli exchange execution ke liye alag broker setup chahiye.</p></div>
        </div>)}
    </main>
  );
}
