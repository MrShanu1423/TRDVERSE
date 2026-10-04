import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Loader2, Search, Star, Wallet } from 'lucide-react';
import { apiJson, compact, fmtInr, fmtPrice, nseOpenNow, useCryptoFeed, type Coin } from '@/lib/live-feed';

type Sort = 'volume' | 'gainers' | 'losers' | 'price';
const PAGE = 50;

const CoinRow = memo(function CoinRow({ c, usdInr, starred, onToggleStar }: { c: Coin; usdInr: number; starred: boolean; onToggleStar: (symbol: string) => void }) {
  const prev = useRef(c.price); const [dir, setDir] = useState<'' | 'up' | 'down'>('');
  useEffect(() => {
    if (c.price === prev.current) return;
    setDir(c.price > prev.current ? 'up' : 'down'); prev.current = c.price;
    const t = setTimeout(() => setDir(''), 700); return () => clearTimeout(t);
  }, [c.price]);
  return (
    <Link href={`/live/crypto/${c.symbol}`} className={`lm-row ${dir ? `flash-${dir}` : ''}`} data-testid={`row-live-${c.symbol}`}>
      <span className="lm-name">
        <button
          aria-label={starred ? `${c.symbol} watchlist se hatao` : `${c.symbol} watchlist mein daalo`}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleStar(c.symbol); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'inline-flex', color: starred ? '#F59E0B' : 'var(--muted-foreground)' }}
        ><Star size={15} fill={starred ? '#F59E0B' : 'none'} /></button>
        <span className="asset-logo">{c.symbol.slice(0, 2)}</span><span><strong>{c.symbol}</strong><small className="subtle">/USDT</small></span></span>
      <span className="lm-price mono"><strong>{fmtPrice(c.price * usdInr)}</strong><small className="subtle">{fmtPrice(c.price, '$')}</small></span>
      <span className={`lm-chg mono ${c.changePct >= 0 ? 'positive' : 'negative'}`}>{c.changePct >= 0 ? '+' : ''}{c.changePct.toFixed(2)}%</span>
      <span className="lm-vol subtle mono">{compact(c.volume)} USDT</span>
    </Link>
  );
});

function CryptoList() {
  const feed = useCryptoFeed(true);
  const [q, setQ] = useState(''); const [sort, setSort] = useState<Sort>('volume'); const [shown, setShown] = useState(PAGE);
  const [starred, setStarred] = useState<Set<string>>(new Set());
  useEffect(() => { setShown(PAGE); }, [q, sort]);
  useEffect(() => { apiJson('/api/watchlist').then((items) => setStarred(new Set(items.filter((i: any) => i.market === 'crypto').map((i: any) => i.symbol)))).catch(() => {}); }, []);
  const onToggleStar = useCallback((symbol: string) => {
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) { next.delete(symbol); fetch(`/api/watchlist/crypto/${symbol}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('tv_session')}` } }).catch(() => {}); }
      else { next.add(symbol); apiJson('/api/watchlist', { market: 'crypto', symbol }).catch(() => {}); }
      return next;
    });
  }, []);
  const term = q.trim().toUpperCase();
  let list = feed.order.map((s) => feed.coins.get(s)!).filter(Boolean).filter((c) => !term || c.symbol.includes(term));
  if (sort === 'gainers') list = [...list].sort((a, b) => b.changePct - a.changePct);
  else if (sort === 'losers') list = [...list].sort((a, b) => a.changePct - b.changePct);
  else if (sort === 'price') list = [...list].sort((a, b) => b.price - a.price);
  const dot = feed.status === 'live' ? '#10B981' : feed.status === 'polling' ? '#F59E0B' : '#EF4444';
  return (
    <>
      <div className="lm-tools">
        <label className="lm-search"><Search size={15} /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${feed.order.length || 'All'} coins me search karo (BTC, SOL…)`} aria-label="Search coins" /></label>
        <div className="segmented" role="group" aria-label="Sort">
          {(['volume', 'gainers', 'losers', 'price'] as Sort[]).map((s) => <button key={s} className={sort === s ? 'on' : ''} onClick={() => setSort(s)}>{s === 'volume' ? 'Top volume' : s[0].toUpperCase() + s.slice(1)}</button>)}
        </div>
        <span className="subtle" role="status" style={{ fontSize: 12, whiteSpace: 'nowrap' }}><span style={{ color: dot }}>●</span> {feed.status === 'live' ? 'Real-time' : feed.status === 'polling' ? 'Updating every 4s' : feed.status === 'loading' ? 'Connecting…' : 'Offline'}{feed.usdInr ? ` · $1 = ₹${feed.usdInr.toFixed(2)}${feed.inrSource === 'fallback' ? ' (approx)' : ''}` : ''}</span>
      </div>
      {feed.status === 'loading' && !feed.order.length ? <div className="card pad"><Loader2 size={16} className="spin" /> Binance se saare coins la raha hu…</div>
        : feed.status === 'error' && !feed.order.length ? <div className="card pad"><p className="negative" role="alert">{feed.error || 'Feed nahi chal rahi'}</p><button className="btn btn-secondary" onClick={feed.retry}>Retry</button></div>
        : (
          <div className="card lm-table">
            <div className="lm-head"><span>Coin</span><span>Price</span><span>24h</span><span className="lm-vol">Volume</span></div>
            {list.slice(0, shown).map((c) => <CoinRow key={c.symbol} c={c} usdInr={feed.usdInr} starred={starred.has(c.symbol)} onToggleStar={onToggleStar} />)}
            {!list.length && <p className="subtle pad">"{q}" ke liye koi coin nahi mila.</p>}
            {list.length > shown && <div className="pad" style={{ textAlign: 'center' }}><button className="btn btn-secondary" onClick={() => setShown((n) => n + PAGE)}>Aur dikhao ({list.length - shown} baaki)</button></div>}
          </div>
        )}
    </>
  );
}

type Quote = { symbol: string; ltp: number; changePct: number; high: number; low: number; volume: number };
function StockList() {
  const [q, setQ] = useState(''); const [syms, setSyms] = useState<string[]>([]); const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [err, setErr] = useState(''); const [loading, setLoading] = useState(true); const [nonce, setNonce] = useState(0);
  const open = nseOpenNow();
  useEffect(() => {
    let dead = false; setLoading(true);
    const t = setTimeout(async () => {
      try { const j = await apiJson(`/api/live/stocks/search?q=${encodeURIComponent(q.trim())}`); if (!dead) { setSyms(j.items.map((i: any) => i.symbol)); setErr(''); } }
      catch (e) { if (!dead) { setErr((e as Error).message); setSyms([]); } }
      if (!dead) setLoading(false);
    }, q ? 300 : 0);
    return () => { dead = true; clearTimeout(t); };
  }, [q, nonce]);
  useEffect(() => {
    if (!syms.length) return; let dead = false;
    const run = async () => { try { const j = await apiJson(`/api/live/stocks/quotes?symbols=${syms.slice(0, 50).join(',')}`); if (!dead) { setQuotes(Object.fromEntries((j.items as Quote[]).map((x) => [x.symbol, x]))); setErr(''); } } catch (e) { if (!dead) setErr((e as Error).message); } };
    run(); const id = setInterval(run, 4000); return () => { dead = true; clearInterval(id); };
  }, [syms]);
  return (
    <>
      <div className="lm-tools">
        <label className="lm-search"><Search size={15} /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="NSE stock search (RELIANCE, TCS, SBIN…)" aria-label="Search stocks" /></label>
        <span className="subtle" role="status" style={{ fontSize: 12 }}><span style={{ color: open ? '#10B981' : '#F59E0B' }}>●</span> NSE {open ? 'khula hai' : 'band hai (9:15-3:30 IST, Mon-Fri)'}</span>
      </div>
      {err && <div className="card pad" style={{ marginBottom: 12 }}><p className="negative" role="alert" style={{ margin: 0 }}>{err}</p><button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => setNonce((n) => n + 1)}>Retry</button></div>}
      {loading && !syms.length && !err ? <div className="card pad"><Loader2 size={16} className="spin" /> Stocks load ho rahe hain…</div> : (
        <div className="card lm-table">
          <div className="lm-head"><span>Stock</span><span>LTP</span><span>Day %</span><span className="lm-vol">Volume</span></div>
          {syms.map((s) => { const x = quotes[s]; return (
            <Link key={s} href={`/live/stock/${encodeURIComponent(s)}`} className="lm-row" data-testid={`row-live-${s}`}>
              <span className="lm-name"><span className="asset-logo">{s.slice(0, 2)}</span><strong>{s}</strong></span>
              <span className="lm-price mono"><strong>{x ? fmtPrice(x.ltp) : '—'}</strong></span>
              <span className={`lm-chg mono ${x && x.changePct < 0 ? 'negative' : 'positive'}`}>{x ? `${x.changePct >= 0 ? '+' : ''}${x.changePct.toFixed(2)}%` : '—'}</span>
              <span className="lm-vol subtle mono">{x ? compact(x.volume) : '—'}</span>
            </Link>); })}
          {!loading && !syms.length && !err && <p className="subtle pad">"{q}" ke liye koi stock nahi mila.</p>}
        </div>)}
    </>
  );
}

export function LiveMarketsPage() {
  const [tab, setTab] = useState<'crypto' | 'stock'>('crypto');
  const [bal, setBal] = useState<number | null>(null);
  useEffect(() => { apiJson('/api/trade/portfolio').then((j) => setBal(j.balance)).catch(() => {}); }, []);
  return (
    <main className="page">
      <div className="page-heading">
        <div><p className="eyebrow">Live markets</p><h1>Har coin, har stock — real time.</h1>
          <p className="subtle product-intro">Binance ke saare USDT pairs aur NSE stocks. Kisi par bhi click karke chart dekho aur trade karo.</p></div>
        <Link href="/add-money" className="btn btn-primary"><Wallet size={14} /> {bal == null ? 'Add money' : `${fmtInr(bal)} · Add money`}</Link>
      </div>
      <div className="segmented" style={{ maxWidth: 320, marginBottom: 14 }} role="tablist">
        <button role="tab" aria-selected={tab === 'crypto'} className={tab === 'crypto' ? 'on' : ''} onClick={() => setTab('crypto')}>Crypto (Binance)</button>
        <button role="tab" aria-selected={tab === 'stock'} className={tab === 'stock' ? 'on' : ''} onClick={() => setTab('stock')}>Stocks (NSE)</button>
      </div>
      {tab === 'crypto' ? <CryptoList /> : <StockList />}
    </main>
  );
}
