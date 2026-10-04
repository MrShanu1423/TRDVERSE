import { acct, rupees, type Acct } from "./ledger";
import { cryptoSnapshot } from "./marketdata";
import { stockQuote, angelConfigured } from "./live";

/** One holding, valued against live prices where available (shared by /trade, /dashboard, /portfolio). */
export type ValuedHolding = {
  market: "crypto" | "stock";
  symbol: string;
  qty: number;
  avgPrice: number;
  cost: number;
  last: number | null;
  value: number;
  pnl: number;
  pnlPct: number;
  changePct: number | null;
};

export async function valuedHoldings(a: Acct): Promise<ValuedHolding[]> {
  let snap: Awaited<ReturnType<typeof cryptoSnapshot>> | null = null;
  try { snap = await cryptoSnapshot(5000); } catch { /* crypto prices unavailable: positions value falls back to cost */ }
  return Promise.all([...a.holdings.entries()].map(async ([key, h]) => {
    const [market, symbol] = key.split(":") as ["crypto" | "stock", string];
    let last: number | null = null;
    let changePct: number | null = null;
    if (market === "crypto" && snap) {
      const row = snap.rows.find((x) => x.symbol === symbol);
      if (row) { last = row.price * snap.usdInr; changePct = row.changePct; }
    } else if (market === "stock" && angelConfigured()) {
      try { const q = await stockQuote(symbol); if (q) { last = q.ltp; changePct = q.changePct; } } catch { /* leave null */ }
    }
    const cost = rupees(h.costPaise);
    const value = last == null ? cost : last * h.qty;
    return { market, symbol, qty: h.qty, avgPrice: cost / h.qty, cost, last, value, pnl: value - cost, pnlPct: cost === 0 ? 0 : ((value - cost) / cost) * 100, changePct };
  }));
}

export async function accountSnapshot(uid: string) {
  const a = acct(uid);
  const holdings = await valuedHoldings(a);
  const cash = rupees(a.paise);
  const investedValue = holdings.reduce((sum, h) => sum + h.cost, 0);
  const positionsValue = holdings.reduce((sum, h) => sum + h.value, 0);
  // Day change approximated from each live position's own 24h move; positions without a live quote contribute 0.
  const dayChange = holdings.reduce((sum, h) => sum + (h.changePct == null ? 0 : h.value * (h.changePct / (100 + h.changePct))), 0);
  const totalValue = cash + positionsValue;
  return { cash, holdings, investedValue, positionsValue, totalValue, dayChange };
}

/** Simple, transparent 0-100 heuristic: more positions and a healthy cash buffer score higher; one position dominating the book scores lower. */
export function healthScore(holdings: ValuedHolding[], cash: number, totalValue: number): number {
  if (totalValue <= 0) return 50;
  let score = 50 + Math.min(holdings.length * 8, 24);
  const cashRatio = cash / totalValue;
  if (cashRatio >= 0.05) score += 8;
  const topShare = holdings.reduce((max, h) => Math.max(max, h.value), 0) / totalValue;
  if (topShare > 0.6) score -= Math.round((topShare - 0.6) * 50);
  return Math.max(0, Math.min(100, Math.round(score)));
}
