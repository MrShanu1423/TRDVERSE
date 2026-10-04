import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { requireAuth } from "./auth";
import { cryptoSnapshot } from "./marketdata";
import { stockQuote, angelConfigured } from "./live";

export type WatchItem = { market: "crypto" | "stock"; symbol: string; addedAt: number };
export const watchlists = new Map<string, WatchItem[]>(); // uid -> starred symbols, persisted

export type Alert = {
  id: string; uid: string; market: "crypto" | "stock"; symbol: string;
  condition: "above" | "below"; targetPrice: number; createdAt: number;
  status: "open" | "triggered" | "cancelled"; triggeredPrice?: number; triggeredAt?: number;
};
export const alerts = new Map<string, Alert>(); // persisted

async function livePrice(market: "crypto" | "stock", symbol: string): Promise<{ price: number; changePercent: number } | null> {
  if (market === "crypto") {
    try {
      const s = await cryptoSnapshot(5000);
      const row = s.rows.find((x) => x.symbol === symbol);
      return row ? { price: row.price * s.usdInr, changePercent: row.changePct } : null;
    } catch { return null; }
  }
  if (!angelConfigured()) return null;
  try { const q = await stockQuote(symbol); return q ? { price: q.ltp, changePercent: q.changePct } : null; } catch { return null; }
}

async function pollAlerts() {
  const open = [...alerts.values()].filter((a) => a.status === "open");
  const byKey = new Map<string, Alert[]>();
  for (const a of open) { const k = `${a.market}:${a.symbol}`; (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(a); }
  for (const [key, list] of byKey) {
    const [market, symbol] = key.split(":") as ["crypto" | "stock", string];
    const live = await livePrice(market, symbol);
    if (!live) continue;
    for (const a of list) {
      const hit = a.condition === "above" ? live.price >= a.targetPrice : live.price <= a.targetPrice;
      if (hit) { a.status = "triggered"; a.triggeredPrice = live.price; a.triggeredAt = Date.now(); }
    }
  }
}
let timer: ReturnType<typeof setInterval> | null = null;
export function startAlertPoller(intervalMs = 5000) {
  if (timer) return;
  timer = setInterval(() => void pollAlerts().catch(() => {}), intervalMs);
  timer.unref();
}

const router: IRouter = Router();
const uid = (req: any): string => req.userEmail;
const MAX_WATCH = 100;
const MAX_OPEN_ALERTS = 30;

router.get("/watchlist", requireAuth, async (req, res) => {
  const items = watchlists.get(uid(req)) ?? [];
  const enriched = await Promise.all(items.map(async (it) => ({ ...it, ...(await livePrice(it.market, it.symbol)) })));
  res.json(enriched.map((it) => ({ market: it.market, symbol: it.symbol, price: it.price ?? null, changePercent: it.changePercent ?? null, addedAt: new Date(it.addedAt).toISOString() })));
});

router.post("/watchlist", requireAuth, (req, res) => {
  const market = req.body?.market === "stock" ? "stock" : req.body?.market === "crypto" ? "crypto" : null;
  const symbol = String(req.body?.symbol ?? "").trim().toUpperCase();
  if (!market || !/^[A-Z0-9&\-]{1,20}$/.test(symbol)) return res.status(400).json({ error: "market aur symbol sahi do" });
  const list = watchlists.get(uid(req)) ?? [];
  if (list.some((i) => i.market === market && i.symbol === symbol)) return res.status(200).json({ ok: true });
  if (list.length >= MAX_WATCH) return res.status(400).json({ error: `Max ${MAX_WATCH} symbols watchlist mein ho sakte hain` });
  list.push({ market, symbol, addedAt: Date.now() });
  watchlists.set(uid(req), list);
  res.status(201).json({ ok: true });
});

router.delete("/watchlist/:market/:symbol", requireAuth, (req, res) => {
  const market = req.params.market; const symbol = req.params.symbol.toUpperCase();
  const list = watchlists.get(uid(req)) ?? [];
  watchlists.set(uid(req), list.filter((i) => !(i.market === market && i.symbol === symbol)));
  res.json({ ok: true });
});

const viewAlert = (a: Alert) => ({ id: a.id, market: a.market, symbol: a.symbol, condition: a.condition, targetPrice: a.targetPrice, status: a.status, triggeredPrice: a.triggeredPrice, createdAt: new Date(a.createdAt).toISOString(), triggeredAt: a.triggeredAt ? new Date(a.triggeredAt).toISOString() : null });

router.get("/alerts", requireAuth, (req, res) => {
  const mine = [...alerts.values()].filter((a) => a.uid === uid(req)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
  res.json(mine.map(viewAlert));
});

router.post("/alerts", requireAuth, async (req, res) => {
  const market = req.body?.market === "stock" ? "stock" : req.body?.market === "crypto" ? "crypto" : null;
  const symbol = String(req.body?.symbol ?? "").trim().toUpperCase();
  const condition = req.body?.condition === "below" ? "below" : req.body?.condition === "above" ? "above" : null;
  const targetPrice = Number(req.body?.targetPrice);
  if (!market || !/^[A-Z0-9&\-]{1,20}$/.test(symbol)) return res.status(400).json({ error: "market aur symbol sahi do" });
  if (!condition) return res.status(400).json({ error: "condition 'above' ya 'below' honi chahiye" });
  if (!(targetPrice > 0)) return res.status(400).json({ error: "Target price 0 se zyada honi chahiye" });
  const openCount = [...alerts.values()].filter((a) => a.uid === uid(req) && a.status === "open").length;
  if (openCount >= MAX_OPEN_ALERTS) return res.status(400).json({ error: `Ek saath max ${MAX_OPEN_ALERTS} alert ho sakte hain` });
  const live = await livePrice(market, symbol);
  if (!live) return res.status(503).json({ error: `${symbol} ka live price abhi available nahi hai` });
  const hitNow = condition === "above" ? live.price >= targetPrice : live.price <= targetPrice;
  if (hitNow) return res.status(400).json({ error: `Target abhi ke live price (₹${live.price.toFixed(2)}) se turant trigger ho jayega` });
  const a: Alert = { id: `al-${randomUUID().slice(0, 8)}`, uid: uid(req), market, symbol, condition, targetPrice, createdAt: Date.now(), status: "open" };
  alerts.set(a.id, a);
  res.status(201).json(viewAlert(a));
});

router.post("/alerts/:id/cancel", requireAuth, (req, res) => {
  const a = alerts.get(req.params.id);
  if (!a || a.uid !== uid(req)) return res.status(404).json({ error: "Alert nahi mila" });
  if (a.status !== "open") return res.status(400).json({ error: "Ye alert ab open nahi hai" });
  a.status = "cancelled";
  res.json(viewAlert(a));
});

export default router;
