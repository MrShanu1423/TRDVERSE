import { useEffect, useRef, useState } from 'react';

export type Coin = { symbol: string; pair: string; price: number; changePct: number; high: number; low: number; volume: number };
export type FeedState = { coins: Map<string, Coin>; order: string[]; usdInr: number; inrSource: 'live' | 'fallback'; status: 'loading' | 'live' | 'polling' | 'error'; error: string; updatedAt: number };

const WS_URL = 'wss://stream.binance.com:9443/ws/!miniTicker@arr';

/**
 * Every Binance USDT pair. REST (via our server) gives the full list + USDT/INR; Binance's WebSocket then pushes
 * price ticks about once a second. If the socket drops, we fall back to polling and retry the socket with backoff.
 */
export function useCryptoFeed(enabled = true): FeedState & { retry: () => void } {
  const coins = useRef(new Map<string, Coin>());
  const [state, setState] = useState<FeedState>({ coins: coins.current, order: [], usdInr: 0, inrSource: 'live', status: 'loading', error: '', updatedAt: 0 });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let dead = false, ws: WebSocket | undefined, poll: ReturnType<typeof setInterval> | undefined, flush: ReturnType<typeof setInterval> | undefined, retryT: ReturnType<typeof setTimeout> | undefined;
    let usdInr = 0, inrSource: 'live' | 'fallback' = 'live', dirty = false, backoff = 2000, order: string[] = [], socketUp = false;
    const push = (status: FeedState['status'], error = '') => setState({ coins: coins.current, order, usdInr, inrSource, status, error, updatedAt: Date.now() });

    const load = async () => {
      try {
        const r = await fetch('/api/market/crypto/live'); const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Crypto feed error');
        if (dead) return;
        usdInr = j.usdInr; inrSource = j.inrSource;
        const next = new Map<string, Coin>(); for (const c of j.items as Coin[]) next.set(c.symbol, c);
        coins.current = next; order = (j.items as Coin[]).map((c) => c.symbol);
        push(socketUp ? 'live' : 'polling');
      } catch (e) { if (!dead) push(coins.current.size ? 'polling' : 'error', (e as Error).message); }
    };
    const connect = () => {
      if (dead) return;
      try { ws = new WebSocket(WS_URL); } catch { retryT = setTimeout(connect, backoff); return; }
      ws.onopen = () => { socketUp = true; backoff = 2000; };
      ws.onmessage = (m) => {
        try {
          for (const t of JSON.parse(m.data) as any[]) {
            const s = String(t.s); if (!s.endsWith('USDT')) continue;
            const c = coins.current.get(s.slice(0, -4)); if (!c) continue;
            const price = +t.c, open = +t.o; if (!(price > 0)) continue;
            c.price = price; c.high = +t.h; c.low = +t.l; c.volume = +t.q; if (open > 0) c.changePct = ((price - open) / open) * 100;
            dirty = true;
          }
        } catch { /* ignore a malformed frame */ }
      };
      ws.onclose = () => { socketUp = false; if (!dead) { retryT = setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 30000); } };
      ws.onerror = () => ws?.close();
    };
    load().then(connect);
    poll = setInterval(() => { if (!socketUp) load(); }, 4000);          // fallback while the socket is down
    const full = setInterval(load, 60000);                                 // resync list (new listings, volume order)
    flush = setInterval(() => { if (dirty && !dead) { dirty = false; push('live'); } }, 1000); // one render per second, not per tick
    return () => { dead = true; ws?.close(); clearInterval(poll); clearInterval(full); clearInterval(flush); clearTimeout(retryT); };
  }, [enabled, nonce]);

  return { ...state, retry: () => setNonce((n) => n + 1) };
}

export const nseOpenNow = (now = new Date()) => {
  const ist = new Date(now.getTime() + 19_800_000); const d = ist.getUTCDay(), m = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return d >= 1 && d <= 5 && m >= 555 && m <= 930;
};
export const fmtPrice = (n: number, cur: '₹' | '$' = '₹') => {
  if (!Number.isFinite(n)) return '—';
  const d = n >= 1000 ? 2 : n >= 1 ? 3 : n >= 0.01 ? 5 : 8;
  return `${cur}${n.toLocaleString('en-IN', { maximumFractionDigits: d })}`;
};
export const fmtInr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const compact = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(0));
export const authHeaders = (): Record<string, string> => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('tv_session')}` });
export async function apiJson(path: string, body?: object) {
  const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: authHeaders(), body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { localStorage.removeItem('tv_session'); location.reload(); throw new Error('Session expire ho gaya, dobara login karo'); }
  if (!r.ok) throw Object.assign(new Error(j.error || 'Kuch galat hua, dobara try karo'), { status: r.status, body: j });
  return j;
}
