import { useState } from 'react';

const api = (path: string, body?: object) =>
  fetch(`/api/live/${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('tv_session')}` }, body: body ? JSON.stringify(body) : undefined })
    .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Error'); return j; });

export function LiveTradeBox({ symbol, category }: { symbol: string; category: string }) {
  const crypto = category === 'crypto';
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [type, setType] = useState('MARKET');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [lev, setLev] = useState('1');
  const [review, setReview] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setMsg('');
    try {
      const j = crypto
        ? await api('binance/order', { confirm: true, symbol: `${symbol.toUpperCase()}USDT`, side, type, quantity: qty, price, stopPrice: price, leverage: lev })
        : await api('angel/order', { confirm: true, symbol, side, ordertype: type, quantity: qty, price: price || 0 });
      setMsg(`✓ Order sent: ${JSON.stringify(j.data ?? { id: j.orderId, status: j.status })}`);
    } catch (e) { setMsg(`✗ ${(e as Error).message}`); }
    setBusy(false); setReview(false);
  };
  const types = crypto ? ['MARKET', 'LIMIT'] : ['MARKET', 'LIMIT'];
  return (
    <aside className="order-card card" style={{ borderColor: '#EF4444' }}>
      <p className="eyebrow">LIVE · {crypto ? 'Binance Futures' : 'Angel One (NSE)'}</p>
      <div className="side-toggle">
        <button className={side === 'BUY' ? 'selected-buy' : ''} onClick={() => setSide('BUY')}>Buy</button>
        <button className={side === 'SELL' ? 'selected-sell' : ''} onClick={() => setSide('SELL')}>Sell</button>
      </div>
      <label className="form-label">Order type</label>
      <select className="select" value={type} onChange={(e) => setType(e.target.value)}>{types.map((t) => <option key={t}>{t}</option>)}</select>
      <label className="form-label">Quantity</label>
      <input className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
      {type !== 'MARKET' && <><label className="form-label">Price</label><input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></>}
      {crypto && <><label className="form-label">Leverage ({lev}x)</label><input type="range" min="1" max="20" value={lev} onChange={(e) => setLev(e.target.value)} />{Number(lev) > 5 && <span className="negative" style={{ fontSize: 11 }}>High leverage = liquidation risk</span>}</>}
      {!review
        ? <button className="btn btn-primary full" style={{ marginTop: 12 }} onClick={() => setReview(true)}>Review live order</button>
        : <button className="btn full" style={{ marginTop: 12, background: side === 'BUY' ? '#10B981' : '#EF4444', color: '#fff' }} disabled={busy} onClick={submit}>{busy ? 'Sending…' : `Confirm REAL ${side} ${qty} ${symbol}`}</button>}
      {msg && <p style={{ fontSize: 11, wordBreak: 'break-all' }}>{msg}</p>}
    </aside>
  );
}
