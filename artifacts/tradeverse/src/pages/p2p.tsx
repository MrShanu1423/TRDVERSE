import { useCallback, useEffect, useState } from 'react';
import { Users, Loader2 } from 'lucide-react';
import { apiJson, fmtInr } from '@/lib/live-feed';

type Ad = { id: string; coin: string; pricePerUnit: number; qtyTotal: number; qtyRemaining: number; minLimit: number; maxLimit: number; status: string; createdAt: string; isMine?: boolean };
type Trade = { id: string; coin: string; qty: number; pricePerUnit: number; totalInr: number; role: 'buyer' | 'seller'; createdAt: string };

function BuyRow({ ad, onDone }: { ad: Ad; onDone: () => void }) {
  const [qty, setQty] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [open, setOpen] = useState(false);
  const n = Number(qty); const value = n > 0 ? n * ad.pricePerUnit : 0;
  const buy = async () => {
    setBusy(true); setErr('');
    try { await apiJson(`/api/p2p/ads/${ad.id}/buy`, { qty: n }); setOpen(false); setQty(''); onDone(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <div className="row-btn" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span><strong>{ad.coin}</strong> <span className="mono">{fmtInr(ad.pricePerUnit)}</span>/unit<br />
          <span className="subtle" style={{ fontSize: 11 }}>Available {ad.qtyRemaining} {ad.coin} · Limit {fmtInr(ad.minLimit)}–{fmtInr(ad.maxLimit)}</span></span>
        <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setOpen((v) => !v)}>Buy</button>
      </div>
      {open && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input className="input mono" style={{ maxWidth: 140 }} inputMode="decimal" placeholder={`Qty (${ad.coin})`} value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ''))} />
        <span className="subtle mono" style={{ fontSize: 12 }}>{value > 0 ? fmtInr(value) : ''}</span>
        <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: 12 }} disabled={busy || !n} onClick={buy}>{busy ? '…' : 'Confirm'}</button>
      </div>}
      {err && <p className="negative" style={{ fontSize: 11, margin: 0 }}>{err}</p>}
    </div>
  );
}

function BuyTab() {
  const [ads, setAds] = useState<Ad[]>([]); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { try { setAds(await apiJson('/api/p2p/ads')); } catch { /* keep last known */ } setLoading(false); }, []);
  useEffect(() => { load(); const id = setInterval(load, 8000); return () => clearInterval(id); }, [load]);
  const others = ads.filter((a) => !a.isMine);
  if (loading) return <Loader2 size={16} className="spin" />;
  if (!others.length) return <p className="subtle">Abhi koi sell ad available nahi hai.</p>;
  return <div className="card">{others.map((a) => <BuyRow key={a.id} ad={a} onDone={load} />)}</div>;
}

function SellTab() {
  const [coin, setCoin] = useState('BTC'); const [price, setPrice] = useState(''); const [qty, setQty] = useState('');
  const [minL, setMinL] = useState('500'); const [maxL, setMaxL] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const [myAds, setMyAds] = useState<Ad[]>([]);
  const load = useCallback(async () => { try { setMyAds(await apiJson('/api/p2p/my-ads')); } catch { /* keep last known */ } }, []);
  useEffect(() => { load(); }, [load]);
  const create = async () => {
    setBusy(true); setErr(''); setOk('');
    try {
      await apiJson('/api/p2p/ads', { coin, pricePerUnit: Number(price), qty: Number(qty), minLimit: Number(minL || 0), maxLimit: maxL ? Number(maxL) : undefined });
      setOk('Ad live ho gaya.'); setPrice(''); setQty(''); await load();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const cancel = async (id: string) => { try { await apiJson(`/api/p2p/ads/${id}/cancel`, {}); } catch { /* reflected on reload */ } await load(); };
  const open = myAds.filter((a) => a.status === 'open');
  return (
    <div className="two-col">
      <div className="card pad">
        <h2>New sell ad</h2>
        <p className="subtle" style={{ fontSize: 12 }}>Tumhare paper holdings se coin escrow ho jayega jab tak ad open hai ya cancel na ho.</p>
        <label className="form-label">Coin</label>
        <input className="input" value={coin} onChange={(e) => setCoin(e.target.value.toUpperCase())} placeholder="BTC" />
        <label className="form-label">Price per unit (₹)</label>
        <input className="input mono" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} />
        <label className="form-label">Quantity</label>
        <input className="input mono" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ''))} />
        <div className="form-row">
          <label className="field"><span>Min order (₹)</span><input className="input mono" value={minL} onChange={(e) => setMinL(e.target.value.replace(/[^0-9.]/g, ''))} /></label>
          <label className="field"><span>Max order (₹, optional)</span><input className="input mono" value={maxL} onChange={(e) => setMaxL(e.target.value.replace(/[^0-9.]/g, ''))} /></label>
        </div>
        {err && <p className="negative" style={{ fontSize: 12 }}>{err}</p>}
        {ok && <p className="positive" style={{ fontSize: 12 }}>{ok}</p>}
        <button className="btn btn-primary full" disabled={busy || !price || !qty} onClick={create}>{busy ? 'Posting…' : 'Post ad'}</button>
      </div>
      <div className="card pad">
        <h2>My open ads</h2>
        {!open.length ? <p className="subtle">Koi active ad nahi hai.</p> : open.map((a) => (
          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid hsl(var(--border))' }}>
            <span><strong>{a.coin}</strong> {a.qtyRemaining}/{a.qtyTotal} @ <span className="mono">{fmtInr(a.pricePerUnit)}</span></span>
            <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => cancel(a.id)}>Cancel</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryTab() {
  const [trades, setTrades] = useState<Trade[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { apiJson('/api/p2p/my-trades').then(setTrades).catch(() => {}).finally(() => setLoading(false)); }, []);
  if (loading) return <Loader2 size={16} className="spin" />;
  if (!trades.length) return <p className="subtle">Abhi koi P2P trade nahi hua.</p>;
  return <div className="card">{trades.map((t) => (
    <div key={t.id} className="row-btn" style={{ cursor: 'default' }}>
      <span><span className={t.role === 'buyer' ? 'positive' : 'negative'}>{t.role === 'buyer' ? 'Bought' : 'Sold'}</span> {t.qty} {t.coin} @ {fmtInr(t.pricePerUnit)}<br /><span className="subtle" style={{ fontSize: 11 }}>{new Date(t.createdAt).toLocaleString('en-IN')}</span></span>
      <strong className="mono">{fmtInr(t.totalInr)}</strong>
    </div>
  ))}</div>;
}

export function P2pPage() {
  const [tab, setTab] = useState<'buy' | 'sell' | 'history'>('buy');
  return (
    <main className="page">
      <div className="page-heading">
        <div><p className="eyebrow">P2P</p><h1><Users size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />Crypto P2P marketplace</h1>
          <p className="subtle product-intro">Apni price pe sell ad lagao ya kisi aur ki ad se seedha khareedo. Sab paper balance/holdings se settle hota hai, instant match - real bank-transfer wait nahi hai.</p></div>
      </div>
      <div className="segmented" style={{ maxWidth: 360, marginBottom: 16 }}>
        <button className={tab === 'buy' ? 'on' : ''} onClick={() => setTab('buy')}>Buy</button>
        <button className={tab === 'sell' ? 'on' : ''} onClick={() => setTab('sell')}>Sell</button>
        <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>History</button>
      </div>
      {tab === 'buy' && <BuyTab />}
      {tab === 'sell' && <SellTab />}
      {tab === 'history' && <HistoryTab />}
    </main>
  );
}
