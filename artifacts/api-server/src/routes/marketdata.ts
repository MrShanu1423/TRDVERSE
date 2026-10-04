import { Router, type IRouter } from "express";

/** Public crypto market data: every Binance USDT spot pair, cached for 2s so many users don't hammer Binance. */
const r: IRouter = Router();
const REST = process.env.BINANCE_REST || "https://api.binance.com";
// Without a (free) Demo API key, CoinGecko's anonymous rate limit is low enough that a shared cloud
// egress IP (many unrelated free-tier apps on the same host) can trip HTTP 429 - COINGECKO_API_KEY
// is optional but raises the limit to one dedicated to this app.
const CG_HEADERS: Record<string, string> = process.env.COINGECKO_API_KEY ? { "x-cg-demo-api-key": process.env.COINGECKO_API_KEY } : {};
export type CryptoRow = { symbol: string; pair: string; price: number; changePct: number; high: number; low: number; volume: number };
let cache: { at: number; rows: CryptoRow[]; usdInr: number; inrSource: "live" | "fallback" } | null = null;
let inflight: Promise<void> | null = null;

/**
 * Binance's global API (api.binance.com) has no INR trading pairs at all, so a literal
 * "USDTINR" ticker lookup there can never match - it would silently always fall back.
 * Fetch the real rate from dedicated sources instead, cached for a minute since forex/stablecoin
 * rates don't need 2s freshness the way order-book prices do.
 */
let inrCache: { at: number; rate: number; source: "live" | "fallback" } | null = null;
async function usdInrRate(): Promise<{ rate: number; source: "live" | "fallback" }> {
  if (inrCache && Date.now() - inrCache.at < 60_000) return inrCache;
  const fb = Number(process.env.USD_INR_FALLBACK || 88);
  try {
    // CoinGecko's tether/INR price: the crypto-market rate (often at a premium to bank forex), matching what an Indian exchange shows.
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=inr", { headers: CG_HEADERS, signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const j = (await res.json()) as any;
      const rate = Number(j?.tether?.inr);
      if (rate > 0) { inrCache = { at: Date.now(), rate, source: "live" }; return inrCache; }
    }
  } catch { /* try the forex fallback below */ }
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const j = (await res.json()) as any;
      const rate = Number(j?.rates?.INR);
      if (rate > 0) { inrCache = { at: Date.now(), rate, source: "live" }; return inrCache; }
    }
  } catch { /* fall through to the static fallback */ }
  inrCache = { at: Date.now(), rate: fb, source: "fallback" };
  return inrCache;
}

async function fromBinance(): Promise<CryptoRow[]> {
  const res = await fetch(`${REST}/api/v3/ticker/24hr`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
  const all = (await res.json()) as any[];
  const rows: CryptoRow[] = [];
  for (const t of all) {
    if (!/^[A-Z0-9]{2,15}USDT$/.test(t.symbol) || /(UP|DOWN|BULL|BEAR)USDT$/.test(t.symbol)) continue;
    const price = Number(t.lastPrice), volume = Number(t.quoteVolume);
    if (!(price > 0) || !(volume > 0)) continue;
    rows.push({ symbol: t.symbol.slice(0, -4), pair: t.symbol, price, changePct: Number(t.priceChangePercent), high: Number(t.highPrice), low: Number(t.lowPrice), volume });
  }
  return rows;
}

/**
 * Binance blocks most cloud/datacenter IPs with HTTP 451 (legal/geo-compliance), which breaks this
 * entirely once deployed off a home connection. CoinGecko's free public API is reachable from cloud
 * hosts and covers the same coins, so it's the fallback whenever Binance fails for any reason.
 */
async function fromCoinGecko(): Promise<CryptoRow[]> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=250&page=1&price_change_percentage=24h",
    { headers: CG_HEADERS, signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const all = (await res.json()) as any[];
  const rows: CryptoRow[] = [];
  // Unlike a single exchange's own ticker (Binance: one symbol = one pair), CoinGecko aggregates many
  // unrelated coins that happen to share a ticker (e.g. several different "AI" tokens), and low-liquidity
  // listings can carry wildly wrong prices from a single bad trade on an obscure venue. The API response
  // is already sorted by volume_desc, so keeping only the first (most liquid) occurrence per symbol and
  // requiring a sane market cap filters out both the duplicates and the garbage micro-cap price spikes.
  const seen = new Set<string>();
  for (const c of all) {
    const price = Number(c.current_price), volume = Number(c.total_volume), marketCap = Number(c.market_cap);
    if (!(price > 0) || !(volume > 0) || !c.symbol) continue;
    if (!(marketCap > 1_000_000)) continue;
    const symbol = String(c.symbol).toUpperCase();
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    rows.push({
      symbol,
      pair: `${symbol}USDT`,
      price,
      changePct: Number(c.price_change_percentage_24h) || 0,
      high: Number(c.high_24h) || price,
      low: Number(c.low_24h) || price,
      volume,
    });
  }
  return rows;
}

async function refresh(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    const inr = await usdInrRate();
    let rows: CryptoRow[];
    try { rows = await fromBinance(); } catch { rows = await fromCoinGecko(); }
    rows.sort((a, b) => b.volume - a.volume);
    cache = { at: Date.now(), rows, usdInr: inr.rate, inrSource: inr.source };
  })().finally(() => { inflight = null; });
  return inflight;
}
// 2s was fine for Binance's generous limits; CoinGecko's free/anonymous tier is far stricter, so the
// default cache window is wider to keep this app's own request rate well under CoinGecko's 429 threshold.
export async function cryptoSnapshot(maxAgeMs = 15_000) {
  if (!cache || Date.now() - cache.at > maxAgeMs) {
    try { await refresh(); } catch (e) { if (!cache) throw e; }
  }
  return cache!;
}

r.get("/market/crypto/live", async (_q, res) => {
  try {
    const s = await cryptoSnapshot();
    res.json({ updatedAt: s.at, stale: Date.now() - s.at > 30_000, usdInr: s.usdInr, inrSource: s.inrSource, count: s.rows.length, items: s.rows });
  } catch (e: any) { res.status(502).json({ error: `Binance se data nahi aa paya: ${e.message}` }); }
});

/** Real order-book depth (top 20 levels each side), converted to INR. Stocks have no depth feed configured yet. */
r.get("/market/crypto/depth", async (req, res) => {
  const symbol = String(req.query.symbol ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{2,15}$/.test(symbol)) return res.status(400).json({ error: "Symbol galat hai" });
  try {
    const [depthRes, snap] = await Promise.all([
      fetch(`${REST}/api/v3/depth?symbol=${symbol}USDT&limit=20`, { signal: AbortSignal.timeout(8000) }),
      cryptoSnapshot(5000),
    ]);
    if (!depthRes.ok) return res.status(depthRes.status === 400 ? 404 : 502).json({ error: `${symbol} ka order book nahi mila` });
    const j = (await depthRes.json()) as { bids: [string, string][]; asks: [string, string][] };
    const toInr = (rows: [string, string][]) => rows.map(([price, qty]) => ({ price: Number(price) * snap.usdInr, qty: Number(qty) }));
    res.json({ symbol, updatedAt: Date.now(), usdInr: snap.usdInr, bids: toInr(j.bids), asks: toInr(j.asks) });
  } catch (e: any) { res.status(502).json({ error: `Order book load nahi hua: ${e.message}` }); }
});

export default r;
