import { useCallback, useEffect, useState } from 'react';
import { Zap, Loader2 } from 'lucide-react';
import { apiJson, fmtInr, fmtPrice, useCryptoFeed } from '@/lib/live-feed';

type Position = {
  id: string; symbol: string; side: 'LONG' | 'SHORT'; leverage: number; margin: number;
  entryPrice: number; qty: number; liqPrice: number; status: string; markPrice: number;
  pnl: number; pnlPct: number; openedAt: string; closedAt: string | null;
};

export function FuturesPage() {
  const feed = useCryptoFeed(true);
  const [symbol, setSymbol] = useState('BTC');
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [leverage, setLeverage] = useState(5);
  const [margin, setMargin] = useState(1000);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const [positions, setPositions] = useState<Position[]>([]);
  const load = useCallback(async () => { try { setPositions(await apiJson('/api/futures/positions')); } catch { /* keep last known */ } }, []);
  useEffect(() => { load(); const id = setInterval(load, 4000); return () => clearInterval(id); }, [load]);

  const coin = feed.coins.get(symbol);
  const price = coin ? coin.price * feed.usdInr : 0;
  const notional = margin * leverage;
  const qty = price > 0 ? notional / price : 0;
  const liqBand = price * (1 / leverage - 0.005);
  const liqPrice = price > 0 ? (side === 'LONG' ? Math.max(0, price - liqBand) : price + liqBand) : 0;

  const open = async () => {
    setBusy(true); setErr(''); setOk('');
    try { await apiJson('/api/futures/open', { symbol, side, leverage, marginInr: margin }); setOk(`${side} position khula: ${symbol} ${leverage}x, margin ${fmtInr(margin)}`); await load(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const close = async (id: string) => { try { await apiJson(`/api/futures/positions/${id}/close`, {}); } catch { /* reflected on reload */ } await load(); };
  const openPositions = positions.filter((p) => p.status === 'open');
  const closedPositions = positions.filter((p) => p.status !== 'open').slice(0, 5);

  return (
    <main className="page">
      <div className="page-heading">
        <div><p className="eyebrow">Derivatives</p><h1><Zap size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />Crypto futures (paper)</h1>
          <p className="subtle product-intro">Live price pe leverage ke saath long/short lo. Real liquidation risk hai - agar price liq level cross kare to poora margin paper mein chala jaata hai, har 5s check hota hai. Paper hai, asli paisa risk mein nahi.</p></div>
      </div>
      <div className="two-col">
        <div className="card pad">
          <h2>Open position</h2>
          <label className="form-label">Symbol</label>
          <input className="input" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="BTC" />
          <div className="side-toggle" style={{ marginTop: 8 }}>
            <button className={side === 'LONG' ? 'selected-buy' : ''} onClick={() => setSide('LONG')}>Long</button>
            <button className={side === 'SHORT' ? 'selected-sell' : ''} onClick={() => setSide('SHORT')}>Short</button>
          </div>
          <label className="form-label">Leverage ({leverage}x)</label>
          <input type="range" min="1" max="20" value={leverage} onChange={(e) => setLeverage(Number(e.target.value))} />
          <label className="form-label">Margin (₹)</label>
          <input className="input mono" inputMode="decimal" value={margin} onChange={(e) => setMargin(Math.max(0, Number(e.target.value.replace(/[^0-9.]/g, '')) || 0))} />
          <dl className="subtle" style={{ fontSize: 12, display: 'grid', gridTemplateColumns: '1fr auto', gap: 4, margin: '10px 0' }}>
            <dt>Entry price</dt><dd className="mono" style={{ margin: 0 }}>{price ? fmtPrice(price) : <Loader2 size={12} className="spin" />}</dd>
            <dt>Position size</dt><dd className="mono" style={{ margin: 0 }}>{fmtInr(notional)} ({qty.toFixed(6)} {symbol})</dd>
            <dt>Liquidation price</dt><dd className="mono negative" style={{ margin: 0 }}>{liqPrice ? fmtPrice(liqPrice) : '—'}</dd>
          </dl>
          {err && <p className="negative" style={{ fontSize: 12 }}>{err}</p>}
          {ok && <p className="positive" style={{ fontSize: 12 }}>{ok}</p>}
          <button className="btn btn-primary full" disabled={busy || !price || margin < 100} onClick={open}>{busy ? 'Opening…' : `${side === 'LONG' ? 'Long' : 'Short'} ${symbol} · ${leverage}x`}</button>
        </div>
        <div className="card pad">
          <h2>My positions</h2>
          {!openPositions.length ? <p className="subtle">Koi open position nahi hai.</p> : openPositions.map((p) => (
            <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid hsl(var(--border))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span><strong className={p.side === 'LONG' ? 'positive' : 'negative'}>{p.side}</strong> {p.symbol} {p.leverage}x · margin {fmtInr(p.margin)}</span>
                <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => close(p.id)}>Close</button>
              </div>
              <div className="subtle mono" style={{ fontSize: 11, marginTop: 4 }}>
                Entry {fmtPrice(p.entryPrice)} · Mark {fmtPrice(p.markPrice)} · Liq {fmtPrice(p.liqPrice)}
              </div>
              <div className={`mono ${p.pnl >= 0 ? 'positive' : 'negative'}`} style={{ fontSize: 13, marginTop: 2 }}>{p.pnl >= 0 ? '+' : ''}{fmtInr(p.pnl)} ({p.pnlPct >= 0 ? '+' : ''}{p.pnlPct.toFixed(2)}%)</div>
            </div>
          ))}
          {closedPositions.length > 0 && <>
            <p className="subtle" style={{ marginTop: 12, marginBottom: 4, fontSize: 12 }}>Recent closed</p>
            {closedPositions.map((p) => (
              <div key={p.id} className="subtle" style={{ fontSize: 11, padding: '4px 0' }}>
                {p.status === 'liquidated' ? <span className="negative">Liquidated</span> : <span>Closed</span>} · {p.side} {p.symbol} {p.leverage}x · <span className={p.pnl >= 0 ? 'positive' : 'negative'}>{fmtInr(p.pnl)}</span>
              </div>
            ))}
          </>}
        </div>
      </div>
    </main>
  );
}
