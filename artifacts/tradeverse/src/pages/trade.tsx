import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { LiveChart } from '@/components/live-chart';
import { LiveTradeBox } from '@/components/live-trade';
import { useMe } from '@/components/shell-tools';
import { apiJson, fmtInr, fmtPrice, nseOpenNow, useCryptoFeed } from '@/lib/live-feed';

type Holding = { market: string; symbol: string; qty: number; avgPrice: number; cost: number; last: number | null; value: number | null; pnl: number | null; pnlPct: number | null };
type PendingOrder = { id: string; market: string; symbol: string; side: 'buy' | 'sell'; kind: 'limit' | 'stop'; quantity: number; triggerPrice: number; status: 'open' | 'filled' | 'cancelled'; note?: string; filledPrice?: number; createdAt: string; filledAt: string | null };
type PriceAlert = { id: string; market: string; symbol: string; condition: 'above' | 'below'; targetPrice: number; status: 'open' | 'triggered' | 'cancelled'; triggeredPrice?: number; createdAt: string; triggeredAt: string | null };
const FEE = 0.001;

export function TradePage() {
  const [, params] = useRoute('/live/:market/:symbol');
  const market = params?.market === 'stock' ? 'stock' : 'crypto';
  const symbol = decodeURIComponent(params?.symbol ?? '').toUpperCase();
  const feed = useCryptoFeed(market === 'crypto');
  const [stock, setStock] = useState<{ ltp: number; changePct: number; high: number; low: number } | null>(null);
  const [stockErr, setStockErr] = useState('');
  const [bal, setBal] = useState(0); const [pos, setPos] = useState<Holding | null>(null);
  const me = useMe();

  const refresh = useCallback(async () => {
    try { const j = await apiJson('/api/trade/portfolio'); setBal(j.balance); setPos((j.holdings as Holding[]).find((h) => h.market === market && h.symbol === symbol) ?? null); } catch { /* shown on order */ }
  }, [market, symbol]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (market !== 'stock') return; let dead = false;
    const run = async () => { try { const j = await apiJson(`/api/live/stocks/quotes?symbols=${encodeURIComponent(symbol)}`); if (!dead && j.items?.[0]) { setStock(j.items[0]); setStockErr(''); } } catch (e) { if (!dead) setStockErr((e as Error).message); } };
    run(); const id = setInterval(run, 3000); return () => { dead = true; clearInterval(id); };
  }, [market, symbol]);

  const coin = market === 'crypto' ? feed.coins.get(symbol) : undefined;
  const priceInr = market === 'crypto' ? (coin ? coin.price * feed.usdInr : 0) : (stock?.ltp ?? 0);
  const changePct = market === 'crypto' ? coin?.changePct : stock?.changePct;
  const unknown = market === 'crypto' && feed.status !== 'loading' && feed.order.length > 0 && !coin;

  if (unknown) return <main className="page"><div className="card pad"><h2>{symbol} nahi mila</h2><p className="subtle">Ye coin Binance USDT par listed nahi hai.</p><Link href="/live" className="btn btn-primary">Live markets par wapas</Link></div></main>;
  return (
    <main className="page">
      <Link href="/live" className="link-button" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginBottom: 10 }}><ArrowLeft size={14} /> Live markets</Link>
      <div className="page-heading">
        <div><p className="eyebrow">{market === 'crypto' ? 'Binance · USDT pair' : 'NSE · Equity'}</p><h1>{symbol}</h1></div>
        <div style={{ textAlign: 'right' }}>
          {priceInr > 0 ? <><div className="mono" style={{ fontSize: 'clamp(22px, 5vw, 32px)', fontWeight: 600 }} aria-live="polite">{fmtPrice(priceInr)}</div>
            <div className={`mono ${(changePct ?? 0) >= 0 ? 'positive' : 'negative'}`}>{(changePct ?? 0) >= 0 ? '+' : ''}{(changePct ?? 0).toFixed(2)}% {market === 'crypto' ? '24h' : 'today'}{market === 'crypto' && coin ? <span className="subtle"> · {fmtPrice(coin.price, '$')}</span> : null}</div></>
            : stockErr ? <span className="negative" role="alert" style={{ fontSize: 13 }}>{stockErr}</span> : <Loader2 size={18} className="spin" />}
        </div>
      </div>
      <div className="trade-grid">
        <section style={{ minWidth: 0 }}>
          <div className="card pad">
            {market === 'crypto' && !feed.usdInr ? <p className="subtle"><Loader2 size={14} className="spin" /> Chart load ho raha hai…</p>
              : <LiveChart key={`${market}:${symbol}:${feed.usdInr}`} symbol={symbol} category={market === 'crypto' ? 'crypto' : 'stock'} price={priceInr || 1} usdInr={feed.usdInr || 88} allowSimulated={false} />}
          </div>
          {coin && <div className="card pad stats" style={{ marginTop: 12 }}>
            <div className="stat"><span className="subtle">24h high</span><strong className="mono">{fmtPrice(coin.high * feed.usdInr)}</strong></div>
            <div className="stat"><span className="subtle">24h low</span><strong className="mono">{fmtPrice(coin.low * feed.usdInr)}</strong></div>
            <div className="stat"><span className="subtle">24h volume</span><strong className="mono">{(coin.volume / 1e6).toFixed(2)}M USDT</strong></div>
          </div>}
          {stock && <div className="card pad stats" style={{ marginTop: 12 }}>
            <div className="stat"><span className="subtle">Day high</span><strong className="mono">{fmtPrice(stock.high)}</strong></div>
            <div className="stat"><span className="subtle">Day low</span><strong className="mono">{fmtPrice(stock.low)}</strong></div>
          </div>}
          {market === 'crypto' && <OrderBook symbol={symbol} />}
        </section>
        <aside style={{ minWidth: 0, display: 'grid', gap: 12, alignContent: 'start' }}>
          <TradeBox market={market} symbol={symbol} priceInr={priceInr} bal={bal} pos={pos} onDone={refresh} />
          <PendingOrdersBox market={market} symbol={symbol} />
          <AlertsBox market={market} symbol={symbol} priceInr={priceInr} />
          {me.isOwner && <details className="card pad"><summary style={{ cursor: 'pointer' }}>Advanced: real broker execution (admin)</summary>
            <p className="subtle" style={{ fontSize: 12 }}>Ye sirf owner ke apne broker account ke liye hai aur server par kill-switch se band rehta hai.</p>
            <LiveTradeBox symbol={symbol} category={market === 'crypto' ? 'crypto' : 'stock'} />
          </details>}
        </aside>
      </div>
    </main>
  );
}

function TradeBox({ market, symbol, priceInr, bal, pos, onDone }: { market: 'crypto' | 'stock'; symbol: string; priceInr: number; bal: number; pos: Holding | null; onDone: () => Promise<void> }) {
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderKind, setOrderKind] = useState<'MARKET' | 'LIMIT' | 'STOP'>('MARKET');
  const [qty, setQty] = useState(''); const [triggerPrice, setTriggerPrice] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const n = Number(qty); const valid = /^\d{1,9}(\.\d{1,8})?$/.test(qty) && n > 0 && (market === 'crypto' || Number.isInteger(n));
  const trigger = Number(triggerPrice); const triggerValid = orderKind === 'MARKET' || (/^\d{1,9}(\.\d{1,8})?$/.test(triggerPrice) && trigger > 0);
  const effectivePrice = orderKind === 'MARKET' ? priceInr : (trigger || priceInr);
  const value = valid ? n * effectivePrice : 0; const fee = value * FEE;
  const maxBuy = priceInr > 0 ? Math.max(0, bal / (priceInr * (1 + FEE))) : 0;
  const floor = (x: number) => (market === 'stock' ? Math.floor(x) : Math.floor(x * 1e8) / 1e8);
  const setPct = (p: number) => { const base = side === 'BUY' ? maxBuy : (pos?.qty ?? 0); const v = floor(base * p); setQty(v > 0 ? String(v) : ''); };
  const closed = market === 'stock' && !nseOpenNow();
  const lowBal = side === 'BUY' && valid && orderKind === 'MARKET' && value + fee > bal;
  const noPos = side === 'SELL' && valid && orderKind === 'MARKET' && n > (pos?.qty ?? 0) + 1e-9;
  const resetAmounts = () => { setQty(''); setTriggerPrice(''); setErr(''); setOk(''); };
  const submit = async () => {
    setBusy(true); setErr(''); setOk('');
    try {
      if (orderKind === 'MARKET') {
        const j = await apiJson('/api/trade/order', { market, symbol, side, quantity: qty });
        setOk(`${side === 'BUY' ? 'Bought' : 'Sold'} ${j.order.qty} ${symbol} @ ${fmtPrice(j.order.price)} (paper)`);
      } else {
        await apiJson('/api/trade/pending-order', { market, symbol, side, kind: orderKind, quantity: qty, triggerPrice });
        setOk(`${orderKind === 'LIMIT' ? 'Limit' : 'Stop'} order rakh diya - ${symbol} ${effectivePrice ? fmtPrice(trigger) : ''} touch hone par execute hoga.`);
      }
      setQty(''); setTriggerPrice(''); await onDone();
    } catch (e) { setErr((e as Error).message); await onDone(); }
    setBusy(false);
  };
  const reason = !priceInr ? 'Price load ho rahi hai'
    : !valid ? (market === 'stock' ? 'Poori quantity daalo' : 'Quantity daalo')
    : !triggerValid ? 'Trigger price daalo'
    : closed ? 'NSE band hai'
    : lowBal ? 'Pehle balance add karo'
    : noPos ? 'Itna holding nahi hai' : '';
  const actionWord = orderKind === 'MARKET' ? (side === 'BUY' ? 'Buy' : 'Sell') : `Place ${orderKind === 'LIMIT' ? 'limit' : 'stop'} ${side === 'BUY' ? 'buy' : 'sell'}`;
  return (
    <div className="card pad order-card">
      <p className="eyebrow">Paper trade · live price</p>
      <div className="side-toggle">
        <button className={side === 'BUY' ? 'selected-buy' : ''} onClick={() => { setSide('BUY'); resetAmounts(); }}>Buy</button>
        <button className={side === 'SELL' ? 'selected-sell' : ''} onClick={() => { setSide('SELL'); resetAmounts(); }}>Sell</button>
      </div>
      <p className="subtle" style={{ fontSize: 12, margin: '8px 0' }}>Balance <strong className="mono">{fmtInr(bal)}</strong>{pos ? <> · Holding <strong className="mono">{pos.qty} {symbol}</strong></> : null}</p>
      <label className="form-label" htmlFor="tb-kind">Order type</label>
      <select id="tb-kind" className="select" value={orderKind} onChange={(e) => { setOrderKind(e.target.value as typeof orderKind); resetAmounts(); }}>
        <option value="MARKET">Market</option>
        <option value="LIMIT">Limit</option>
        <option value="STOP">Stop</option>
      </select>
      <label className="form-label" htmlFor="tb-qty">Quantity ({symbol})</label>
      <input id="tb-qty" className="input mono" inputMode="decimal" value={qty} placeholder="0" onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ''))} />
      <div className="quick-row" style={{ margin: '8px 0' }}>{[0.25, 0.5, 0.75, 1].map((p) => <button key={p} className="btn btn-secondary" style={{ flex: 1, padding: '6px 4px' }} onClick={() => setPct(p)}>{p * 100}%</button>)}</div>
      {orderKind !== 'MARKET' && <>
        <label className="form-label" htmlFor="tb-trigger">{orderKind === 'LIMIT' ? `Limit price (${side === 'BUY' ? 'execute at or below' : 'execute at or above'})` : `Stop price (${side === 'BUY' ? 'execute on breakout above' : 'execute on breakdown below'})`}</label>
        <input id="tb-trigger" className="input mono" inputMode="decimal" value={triggerPrice} placeholder={priceInr ? priceInr.toFixed(2) : '0'} onChange={(e) => setTriggerPrice(e.target.value.replace(/[^0-9.]/g, ''))} />
      </>}
      <dl className="subtle" style={{ fontSize: 12, display: 'grid', gridTemplateColumns: '1fr auto', gap: 4, margin: '8px 0' }}>
        <dt>{orderKind === 'MARKET' ? 'Price' : 'Est. price'}</dt><dd className="mono" style={{ margin: 0 }}>{effectivePrice ? fmtPrice(effectivePrice) : '—'}</dd>
        <dt>Value</dt><dd className="mono" style={{ margin: 0 }}>{fmtInr(value)}</dd>
        <dt>Fee (0.1%)</dt><dd className="mono" style={{ margin: 0 }}>{fmtInr(fee)}</dd>
        <dt><strong>Total {side === 'BUY' ? 'debit' : 'credit'}</strong></dt><dd className="mono" style={{ margin: 0 }}><strong>{fmtInr(side === 'BUY' ? value + fee : value - fee)}</strong></dd>
      </dl>
      {lowBal && <p className="negative" style={{ fontSize: 12 }}>Balance kam hai. <Link href="/add-money" className="link-button">Add money</Link></p>}
      {err && <p className="negative" role="alert" style={{ fontSize: 12 }}>{err}</p>}
      {ok && <p className="positive" role="status" style={{ fontSize: 12 }}>{ok}</p>}
      <button className="btn btn-primary full" disabled={busy || !!reason} onClick={submit} title={reason}>{busy ? 'Placing…' : reason || `${actionWord} ${qty} ${symbol}`}</button>
      <p className="subtle" style={{ fontSize: 11, marginBottom: 0 }}>{orderKind === 'MARKET' ? 'Order server par live price se execute hota hai.' : 'Order rakha rahega jab tak trigger price touch na ho (har 5s check hota hai).'} Abhi ye paper (practice) trade hai, asli exchange par order nahi jaata.</p>
    </div>
  );
}

function PendingOrdersBox({ market, symbol }: { market: 'crypto' | 'stock'; symbol: string }) {
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [busyId, setBusyId] = useState('');
  const load = useCallback(async () => { try { setOrders(await apiJson('/api/trade/pending-orders')); } catch { /* keep last known list */ } }, []);
  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, [load]);
  const mine = orders.filter((o) => o.market === market && o.symbol === symbol);
  const open = mine.filter((o) => o.status === 'open');
  const recent = mine.filter((o) => o.status !== 'open').slice(0, 3);
  const cancel = async (id: string) => { setBusyId(id); try { await apiJson(`/api/trade/pending-order/${id}/cancel`, {}); } catch { /* reflected on next load */ } setBusyId(''); await load(); };
  if (!open.length && !recent.length) return null;
  return (
    <div className="card pad">
      <p className="eyebrow">Pending orders · {symbol}</p>
      {open.map((o) => (
        <div key={o.id} className="subtle" style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid hsl(var(--border))' }}>
          <span><strong className={o.side === 'buy' ? 'positive' : 'negative'}>{o.side.toUpperCase()}</strong> {o.quantity} {o.symbol} · {o.kind} @ <span className="mono">{fmtPrice(o.triggerPrice)}</span></span>
          <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 11 }} disabled={busyId === o.id} onClick={() => cancel(o.id)}>{busyId === o.id ? '…' : 'Cancel'}</button>
        </div>
      ))}
      {recent.map((o) => (
        <div key={o.id} className="subtle" style={{ fontSize: 11, padding: '4px 0' }}>
          {o.status === 'filled' ? <span className="positive">Filled</span> : <span className="negative">Cancelled{o.note ? ` — ${o.note}` : ''}</span>} · {o.side.toUpperCase()} {o.quantity} {o.symbol} {o.filledPrice ? `@ ${fmtPrice(o.filledPrice)}` : ''}
        </div>
      ))}
    </div>
  );
}

function AlertsBox({ market, symbol, priceInr }: { market: 'crypto' | 'stock'; symbol: string; priceInr: number }) {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const load = useCallback(async () => { try { setAlerts(await apiJson('/api/alerts')); } catch { /* keep last known list */ } }, []);
  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, [load]);
  const mine = alerts.filter((a) => a.market === market && a.symbol === symbol);
  const open = mine.filter((a) => a.status === 'open');
  const recent = mine.filter((a) => a.status !== 'open').slice(0, 3);
  const create = async () => {
    setErr(''); setBusy(true);
    try { await apiJson('/api/alerts', { market, symbol, condition, targetPrice: target }); setTarget(''); await load(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const cancel = async (id: string) => { try { await apiJson(`/api/alerts/${id}/cancel`, {}); } catch { /* reflected on next load */ } await load(); };
  return (
    <div className="card pad">
      <p className="eyebrow">Price alert · {symbol}</p>
      <div className="side-toggle">
        <button className={condition === 'above' ? 'selected-buy' : ''} onClick={() => setCondition('above')}>Price goes above</button>
        <button className={condition === 'below' ? 'selected-sell' : ''} onClick={() => setCondition('below')}>Price goes below</button>
      </div>
      <input className="input mono" style={{ marginTop: 8 }} inputMode="decimal" value={target} placeholder={priceInr ? priceInr.toFixed(2) : '0'} onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ''))} />
      {err && <p className="negative" role="alert" style={{ fontSize: 12, marginTop: 6 }}>{err}</p>}
      <button className="btn btn-secondary full" style={{ marginTop: 8 }} disabled={busy || !target} onClick={create}>{busy ? 'Saving…' : 'Set alert'}</button>
      {open.map((a) => (
        <div key={a.id} className="subtle" style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid hsl(var(--border))', marginTop: 8 }}>
          <span>Alert when {a.condition === 'above' ? '≥' : '≤'} <span className="mono">{fmtPrice(a.targetPrice)}</span></span>
          <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => cancel(a.id)}>Cancel</button>
        </div>
      ))}
      {recent.map((a) => (
        <div key={a.id} className="subtle" style={{ fontSize: 11, padding: '4px 0' }}>
          {a.status === 'triggered' ? <span className="positive">Triggered @ {fmtPrice(a.triggeredPrice ?? 0)}</span> : <span className="negative">Cancelled</span>}
        </div>
      ))}
    </div>
  );
}

function OrderBook({ symbol }: { symbol: string }) {
  const [book, setBook] = useState<{ bids: { price: number; qty: number }[]; asks: { price: number; qty: number }[] } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let dead = false;
    const load = async () => { try { const j = await apiJson(`/api/market/crypto/depth?symbol=${symbol}`); if (!dead) { setBook(j); setErr(''); } } catch (e) { if (!dead) setErr((e as Error).message); } };
    load(); const id = setInterval(load, 4000); return () => { dead = true; clearInterval(id); };
  }, [symbol]);
  if (err) return null; // depth is a nice-to-have - stay quiet if the symbol has none
  if (!book) return <div className="card pad" style={{ marginTop: 12 }}><Loader2 size={14} className="spin" /></div>;
  const asks = book.asks.slice(0, 10).reverse(); const bids = book.bids.slice(0, 10);
  const maxQty = Math.max(...asks.map((a) => a.qty), ...bids.map((b) => b.qty), 1e-9);
  const row = (r: { price: number; qty: number }, tone: 'positive' | 'negative') => (
    <div key={r.price} style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 6px' }}>
      <div style={{ position: 'absolute', inset: 0, right: 'auto', width: `${Math.min(100, (r.qty / maxQty) * 100)}%`, background: tone === 'positive' ? 'hsl(142 71% 45% / .12)' : 'hsl(0 72% 51% / .12)' }} />
      <span className={`mono ${tone}`} style={{ position: 'relative' }}>{fmtPrice(r.price)}</span>
      <span className="mono subtle" style={{ position: 'relative' }}>{r.qty.toFixed(5)}</span>
    </div>
  );
  return (
    <div className="card pad" style={{ marginTop: 12 }}>
      <p className="eyebrow">Order book · {symbol}</p>
      {asks.map((a) => row(a, 'negative'))}
      <div style={{ height: 1, background: 'hsl(var(--border))', margin: '4px 0' }} />
      {bids.map((b) => row(b, 'positive'))}
    </div>
  );
}
