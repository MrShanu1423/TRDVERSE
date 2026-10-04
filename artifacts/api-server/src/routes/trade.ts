import { Router, type IRouter } from "express";
import { requireAuth } from "./auth";
import { cryptoSnapshot } from "./marketdata";
import { stockQuote, angelConfigured } from "./live";
import { acct, execute, rupees, FEE_RATE, type TradeOrder } from "./ledger";
import { valuedHoldings } from "./portfolio-calc";

const r: IRouter = Router();
r.use("/trade", requireAuth);
const uid = (req: any): string => req.userEmail;

/** NSE cash segment hours (IST, Mon-Fri 09:15-15:30). Exchange holidays are not modelled. */
export function nseOpen(now = new Date()): boolean {
  const ist = new Date(now.getTime() + 19_800_000); const d = ist.getUTCDay(); const m = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return d >= 1 && d <= 5 && m >= 9 * 60 + 15 && m <= 15 * 60 + 30;
}

/** Server-side price (INR per unit). The client never supplies a price. */
export async function priceInr(market: string, symbol: string): Promise<{ ok: true; price: number } | { ok: false; error: string; status: number }> {
  if (market === "crypto") {
    let s; try { s = await cryptoSnapshot(3000); } catch { return { ok: false, status: 502, error: "Crypto price feed abhi available nahi hai, thodi der baad try karo" }; }
    if (Date.now() - s.at > 30_000) return { ok: false, status: 503, error: "Price feed purani ho gayi hai, order rok diya gaya" };
    const row = s.rows.find((x) => x.symbol === symbol);
    if (!row) return { ok: false, status: 404, error: `${symbol} Binance USDT par listed nahi hai` };
    return { ok: true, price: row.price * s.usdInr };
  }
  if (market === "stock") {
    if (!angelConfigured()) return { ok: false, status: 503, error: "Stock live prices ke liye Angel One keys server par set karni hongi" };
    if (!nseOpen() && process.env.ALLOW_OFF_HOURS_STOCK !== "true") return { ok: false, status: 409, error: "NSE band hai (Mon-Fri 9:15 AM - 3:30 PM IST). Market khulne par order lagao." };
    try { const q = await stockQuote(symbol); if (!q) return { ok: false, status: 404, error: `${symbol} NSE par nahi mila` }; return { ok: true, price: q.ltp }; }
    catch (e: any) { return { ok: false, status: 502, error: `Stock price nahi aa payi: ${e.message}` }; }
  }
  return { ok: false, status: 400, error: "market 'crypto' ya 'stock' hona chahiye" };
}

const view = (o: TradeOrder) => ({ id: o.id, market: o.market, symbol: o.symbol, side: o.side, qty: o.qty, price: o.price, value: rupees(o.valuePaise), fee: rupees(o.feePaise), createdAt: o.createdAt, paper: true });

r.get("/trade/orders", (req, res) => res.json(acct(uid(req)).orders.slice(0, 100).map(view)));

r.get("/trade/portfolio", async (req, res) => {
  const a = acct(uid(req));
  const holdings = await valuedHoldings(a);
  res.json({ balance: rupees(a.paise), feeRate: FEE_RATE, holdings, paper: true });
});

r.post("/trade/order", async (req, res) => {
  const market = String(req.body?.market ?? ""), symbol = String(req.body?.symbol ?? "").trim().toUpperCase();
  const side = String(req.body?.side ?? "").toUpperCase();
  const qtyRaw = String(req.body?.quantity ?? "").trim();
  if (!/^[A-Z0-9&\-]{1,20}$/.test(symbol)) return res.status(400).json({ error: "Symbol galat hai" });
  if (side !== "BUY" && side !== "SELL") return res.status(400).json({ error: "side BUY ya SELL hona chahiye" });
  if (!/^\d{1,9}(\.\d{1,8})?$/.test(qtyRaw)) return res.status(400).json({ error: "Quantity sahi number me daalo (max 8 decimals)" });
  const qty = Number(qtyRaw);
  if (!(qty > 0)) return res.status(400).json({ error: "Quantity 0 se zyada honi chahiye" });
  if (market === "stock" && !Number.isInteger(qty)) return res.status(400).json({ error: "Stocks ki quantity poori number me honi chahiye" });
  const p = await priceInr(market, symbol);
  if (!p.ok) return res.status(p.status).json({ error: p.error });
  // balance/holdings are read inside execute(), after the await above, so concurrent orders cannot overspend
  const out = execute(uid(req), { market: market as "crypto" | "stock", symbol, side, qty, priceInr: p.price });
  if (!out.ok) return res.status(400).json({ error: out.error });
  res.status(201).json({ order: view(out.order), balance: rupees(acct(uid(req)).paise) });
});

export default r;
