import { randomUUID } from "node:crypto";

/**
 * Paper-trading ledger (in memory; move to MySQL before launch).
 * INR is stored in integer paise so money never drifts. Quantities are rounded to 8 decimals.
 */
export type Holding = { qty: number; costPaise: number };
export type TradeOrder = { id: string; market: "crypto" | "stock"; symbol: string; side: "BUY" | "SELL"; qty: number; price: number; valuePaise: number; feePaise: number; createdAt: number; paper: true };
export type Acct = { paise: number; holdings: Map<string, Holding>; orders: TradeOrder[]; credited: Set<string> };
export const accts = new Map<string, Acct>();
export const acct = (uid: string): Acct => { let a = accts.get(uid); if (!a) { a = { paise: 0, holdings: new Map(), orders: [], credited: new Set() }; accts.set(uid, a); } return a; };
export const round8 = (n: number) => Math.round(n * 1e8) / 1e8;
export const FEE_RATE = 0.001; // 0.1% per trade, shown to the user before they confirm
export const rupees = (paise: number) => paise / 100;

export function credit(uid: string, paise: number, ref: string): boolean {
  const a = acct(uid);
  if (a.credited.has(ref)) return false; // idempotent: same payment id never credits twice
  a.credited.add(ref); a.paise += paise; return true;
}

export function execute(uid: string, o: { market: "crypto" | "stock"; symbol: string; side: "BUY" | "SELL"; qty: number; priceInr: number }): { ok: true; order: TradeOrder } | { ok: false; error: string } {
  const a = acct(uid), key = `${o.market}:${o.symbol}`;
  const value = Math.round(o.qty * o.priceInr * 100);
  if (value < 1000) return { ok: false, error: "Minimum order value ₹10 hai" };
  const fee = Math.round(value * FEE_RATE);
  const h = a.holdings.get(key);
  if (o.side === "BUY") {
    if (a.paise < value + fee) return { ok: false, error: `Balance kam hai. Chahiye ₹${rupees(value + fee).toFixed(2)} (fee ₹${rupees(fee).toFixed(2)} ke saath), available ₹${rupees(a.paise).toFixed(2)}. Add money se balance badhao.` };
    a.paise -= value + fee;
    a.holdings.set(key, { qty: round8((h?.qty ?? 0) + o.qty), costPaise: (h?.costPaise ?? 0) + value });
  } else {
    if (!h || h.qty + 1e-9 < o.qty) return { ok: false, error: `Aapke paas sirf ${h?.qty ?? 0} ${o.symbol} hai, ${o.qty} sell nahi ho sakta` };
    const left = round8(h.qty - o.qty);
    const costOut = left <= 0 ? h.costPaise : Math.round(h.costPaise * (o.qty / h.qty));
    a.paise += value - fee;
    if (left <= 0) a.holdings.delete(key); else a.holdings.set(key, { qty: left, costPaise: h.costPaise - costOut });
  }
  const order: TradeOrder = { id: `tv-${randomUUID().slice(0, 8)}`, market: o.market, symbol: o.symbol, side: o.side, qty: o.qty, price: o.priceInr, valuePaise: value, feePaise: fee, createdAt: Date.now(), paper: true };
  a.orders.unshift(order); if (a.orders.length > 500) a.orders.pop();
  return { ok: true, order };
}
