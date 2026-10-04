import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { requireAuth } from "./auth";
import { execute } from "./ledger";
import { priceInr } from "./trade";

/**
 * Resting limit/stop orders for the paper engine (market orders execute immediately in trade.ts/ledger.ts
 * and never reach this file). A background loop polls live prices and fills orders once their trigger
 * condition is met - there is no real exchange order book behind this, so fills happen on the next poll
 * tick (every 5s) at the then-current price, not instantly at the exact trigger price.
 */
export type PendingOrder = {
  id: string; uid: string; market: "crypto" | "stock"; symbol: string; side: "BUY" | "SELL";
  kind: "LIMIT" | "STOP"; qty: number; triggerPrice: number; createdAt: number;
  status: "open" | "filled" | "cancelled"; note?: string; filledPrice?: number; filledAt?: number;
};
const orders = new Map<string, PendingOrder>();
export const pendingOrders = orders; // exported for lib/persist.ts

const MAX_OPEN_PER_USER = 20;

function triggered(o: PendingOrder, price: number): boolean {
  if (o.kind === "LIMIT") return o.side === "BUY" ? price <= o.triggerPrice : price >= o.triggerPrice;
  // STOP: a stop-buy arms on breakout above triggerPrice, a stop-loss arms on breakdown below it.
  return o.side === "BUY" ? price >= o.triggerPrice : price <= o.triggerPrice;
}

async function pollOnce() {
  const open = [...orders.values()].filter((o) => o.status === "open");
  const byKey = new Map<string, PendingOrder[]>();
  for (const o of open) { const k = `${o.market}:${o.symbol}`; (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(o); }
  for (const [key, list] of byKey) {
    const [market, symbol] = key.split(":") as ["crypto" | "stock", string];
    const p = await priceInr(market, symbol).catch(() => null);
    if (!p || !p.ok) continue;
    for (const o of list) {
      if (!triggered(o, p.price)) continue;
      const out = execute(o.uid, { market, symbol, side: o.side, qty: o.qty, priceInr: p.price });
      if (out.ok) { o.status = "filled"; o.filledPrice = p.price; o.filledAt = Date.now(); }
      else { o.status = "cancelled"; o.note = out.error; } // e.g. balance/holding no longer sufficient by the time it triggered
    }
  }
}
let timer: ReturnType<typeof setInterval> | null = null;
export function startPendingOrderPoller(intervalMs = 5000) {
  if (timer) return;
  timer = setInterval(() => void pollOnce().catch(() => {}), intervalMs);
  timer.unref();
}

const router: IRouter = Router();
const uid = (req: any): string => req.userEmail;
const view = (o: PendingOrder) => ({ id: o.id, market: o.market, symbol: o.symbol, side: o.side.toLowerCase(), kind: o.kind.toLowerCase(), quantity: o.qty, triggerPrice: o.triggerPrice, status: o.status, note: o.note, filledPrice: o.filledPrice, createdAt: new Date(o.createdAt).toISOString(), filledAt: o.filledAt ? new Date(o.filledAt).toISOString() : null });

router.get("/trade/pending-orders", requireAuth, (req, res) => {
  const mine = [...orders.values()].filter((o) => o.uid === uid(req)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
  res.json(mine.map(view));
});

router.post("/trade/pending-order", requireAuth, async (req, res) => {
  const market = req.body?.market === "stock" ? "stock" : req.body?.market === "crypto" ? "crypto" : null;
  const symbol = String(req.body?.symbol ?? "").trim().toUpperCase();
  const side = String(req.body?.side ?? "").toUpperCase();
  const kind = String(req.body?.kind ?? "").toUpperCase();
  const qty = Number(req.body?.quantity);
  const triggerPrice = Number(req.body?.triggerPrice);
  if (!market) return res.status(400).json({ error: "market 'crypto' ya 'stock' hona chahiye" });
  if (!/^[A-Z0-9&\-]{1,20}$/.test(symbol)) return res.status(400).json({ error: "Symbol galat hai" });
  if (side !== "BUY" && side !== "SELL") return res.status(400).json({ error: "side BUY ya SELL hona chahiye" });
  if (kind !== "LIMIT" && kind !== "STOP") return res.status(400).json({ error: "kind LIMIT ya STOP hona chahiye" });
  if (!(qty > 0)) return res.status(400).json({ error: "Quantity 0 se zyada honi chahiye" });
  if (market === "stock" && !Number.isInteger(qty)) return res.status(400).json({ error: "Stocks ki quantity poori number me honi chahiye" });
  if (!(triggerPrice > 0)) return res.status(400).json({ error: "Trigger price 0 se zyada honi chahiye" });

  const openCount = [...orders.values()].filter((o) => o.uid === uid(req) && o.status === "open").length;
  if (openCount >= MAX_OPEN_PER_USER) return res.status(400).json({ error: `Ek saath max ${MAX_OPEN_PER_USER} pending order ho sakte hain` });

  // Reject orders that would trigger immediately - the user wants market execution for that, not a pending order.
  const p = await priceInr(market, symbol);
  if (!p.ok) return res.status(p.status).json({ error: p.error });
  const draft: PendingOrder = { id: `po-${randomUUID().slice(0, 8)}`, uid: uid(req), market, symbol, side, kind: kind as "LIMIT" | "STOP", qty, triggerPrice, createdAt: Date.now(), status: "open" };
  if (triggered(draft, p.price)) return res.status(400).json({ error: `Trigger price abhi ke live price (₹${p.price.toFixed(2)}) se turant trigger ho jayega - market order use karo.` });

  orders.set(draft.id, draft);
  res.status(201).json(view(draft));
});

router.post("/trade/pending-order/:id/cancel", requireAuth, (req, res) => {
  const o = orders.get(req.params.id);
  if (!o || o.uid !== uid(req)) return res.status(404).json({ error: "Order nahi mila" });
  if (o.status !== "open") return res.status(400).json({ error: "Ye order ab open nahi hai" });
  o.status = "cancelled"; o.note = "Cancelled by user";
  res.json(view(o));
});

export default router;
