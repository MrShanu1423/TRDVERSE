import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { requireAuth } from "./auth";
import { acct, rupees } from "./ledger";
import { priceInr } from "./trade";

/**
 * Paper crypto futures/margin: real leverage mechanics (entry price, liquidation price, unrealized PnL)
 * against live Binance prices, settled through the same paper cash balance as spot trading. A background
 * poller actually liquidates a position (full margin lost) if the live price crosses the liq price - this
 * is the real risk education point of margin trading, not just a payoff calculator.
 */
const MAINTENANCE_MARGIN = 0.005; // 0.5% buffer before full loss, same ballpark as real exchanges
const MAX_LEVERAGE = 20;

export type FuturesPosition = {
  id: string; uid: string; symbol: string; side: "LONG" | "SHORT"; leverage: number;
  marginPaise: number; entryPrice: number; qty: number; liqPrice: number;
  status: "open" | "closed" | "liquidated"; openedAt: number; closedAt?: number; exitPrice?: number; realizedPnl?: number;
};
export const positions = new Map<string, FuturesPosition>(); // persisted

function liqPriceFor(side: "LONG" | "SHORT", entry: number, leverage: number): number {
  const band = entry * (1 / leverage - MAINTENANCE_MARGIN);
  return side === "LONG" ? Math.max(0, entry - band) : entry + band;
}
function unrealizedPnl(p: FuturesPosition, mark: number): number {
  const diff = p.side === "LONG" ? mark - p.entryPrice : p.entryPrice - mark;
  return diff * p.qty;
}
function breached(p: FuturesPosition, mark: number): boolean {
  return p.side === "LONG" ? mark <= p.liqPrice : mark >= p.liqPrice;
}

async function pollOnce() {
  const open = [...positions.values()].filter((p) => p.status === "open");
  const bySymbol = new Map<string, FuturesPosition[]>();
  for (const p of open) (bySymbol.get(p.symbol) ?? bySymbol.set(p.symbol, []).get(p.symbol)!).push(p);
  for (const [symbol, list] of bySymbol) {
    const priced = await priceInr("crypto", symbol).catch(() => null);
    if (!priced || !priced.ok) continue;
    for (const p of list) {
      if (!breached(p, priced.price)) continue;
      p.status = "liquidated"; p.closedAt = Date.now(); p.exitPrice = priced.price; p.realizedPnl = -rupees(p.marginPaise);
      // Margin is already "spent" (debited at open) - liquidation means it's gone, no credit back.
    }
  }
}
let timer: ReturnType<typeof setInterval> | null = null;
export function startFuturesLiquidationPoller(intervalMs = 5000) {
  if (timer) return;
  timer = setInterval(() => void pollOnce().catch(() => {}), intervalMs);
  timer.unref();
}

const router: IRouter = Router();
const uid = (req: any): string => req.userEmail;

async function view(p: FuturesPosition) {
  let mark = p.exitPrice ?? p.entryPrice;
  if (p.status === "open") { const priced = await priceInr("crypto", p.symbol).catch(() => null); if (priced?.ok) mark = priced.price; }
  const pnl = p.status === "open" ? unrealizedPnl(p, mark) : (p.realizedPnl ?? 0);
  return {
    id: p.id, symbol: p.symbol, side: p.side, leverage: p.leverage, margin: rupees(p.marginPaise),
    entryPrice: p.entryPrice, qty: p.qty, liqPrice: p.liqPrice, status: p.status,
    markPrice: mark, pnl: Math.round(pnl * 100) / 100, pnlPct: Math.round((pnl / rupees(p.marginPaise)) * 10000) / 100,
    openedAt: new Date(p.openedAt).toISOString(), closedAt: p.closedAt ? new Date(p.closedAt).toISOString() : null,
  };
}

router.get("/futures/positions", requireAuth, async (req, res) => {
  const mine = [...positions.values()].filter((p) => p.uid === uid(req)).sort((a, b) => b.openedAt - a.openedAt).slice(0, 100);
  res.json(await Promise.all(mine.map(view)));
});

router.post("/futures/open", requireAuth, async (req, res) => {
  const symbol = String(req.body?.symbol ?? "").trim().toUpperCase();
  const side = String(req.body?.side ?? "").toUpperCase();
  const leverage = Math.round(Number(req.body?.leverage));
  const marginInr = Number(req.body?.marginInr);
  if (side !== "LONG" && side !== "SHORT") return res.status(400).json({ error: "side LONG ya SHORT hona chahiye" });
  if (!(leverage >= 1) || leverage > MAX_LEVERAGE) return res.status(400).json({ error: `Leverage 1x se ${MAX_LEVERAGE}x ke beech honi chahiye` });
  if (!(marginInr >= 100)) return res.status(400).json({ error: "Minimum margin ₹100 hai" });

  const priced = await priceInr("crypto", symbol);
  if (!priced.ok) return res.status(priced.status).json({ error: priced.error });

  const a = acct(uid(req));
  const marginPaise = Math.round(marginInr * 100);
  if (a.paise < marginPaise) return res.status(400).json({ error: `Balance kam hai. Chahiye ₹${marginInr.toFixed(2)}, available ₹${rupees(a.paise).toFixed(2)}` });
  const openCount = [...positions.values()].filter((p) => p.uid === uid(req) && p.status === "open").length;
  if (openCount >= 20) return res.status(400).json({ error: "Max 20 open positions ho sakte hain" });

  a.paise -= marginPaise;
  const qty = (marginInr * leverage) / priced.price;
  const liqPrice = liqPriceFor(side as "LONG" | "SHORT", priced.price, leverage);
  const p: FuturesPosition = { id: `fut-${randomUUID().slice(0, 8)}`, uid: uid(req), symbol, side: side as "LONG" | "SHORT", leverage, marginPaise, entryPrice: priced.price, qty, liqPrice, status: "open", openedAt: Date.now() };
  positions.set(p.id, p);
  res.status(201).json({ ...(await view(p)), balance: rupees(a.paise) });
});

router.post("/futures/positions/:id/close", requireAuth, async (req, res) => {
  const p = positions.get(req.params.id);
  if (!p || p.uid !== uid(req)) return res.status(404).json({ error: "Position nahi mili" });
  if (p.status !== "open") return res.status(400).json({ error: "Ye position ab open nahi hai" });
  const priced = await priceInr("crypto", p.symbol);
  if (!priced.ok) return res.status(priced.status).json({ error: priced.error });
  const pnl = unrealizedPnl(p, priced.price);
  const payout = Math.max(0, rupees(p.marginPaise) + pnl); // can't go below zero - that's what liquidation is for
  acct(uid(req)).paise += Math.round(payout * 100);
  p.status = "closed"; p.closedAt = Date.now(); p.exitPrice = priced.price; p.realizedPnl = Math.round(pnl * 100) / 100;
  res.json({ ...(await view(p)), balance: rupees(acct(uid(req)).paise) });
});

export default router;
