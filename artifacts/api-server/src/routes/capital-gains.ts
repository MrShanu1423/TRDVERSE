import { Router, type IRouter } from "express";
import { requireAuth } from "./auth";
import { acct, rupees, type TradeOrder } from "./ledger";

/**
 * Real capital-gains computation from the user's actual paper-trade history (acct(uid).orders),
 * not a generic estimate. FIFO lot matching, current India tax rules:
 *  - Listed equity: STCG 20% if held <12 months, LTCG 12.5% above a Rs 1.25L exemption if held >=12 months
 *    (rates per the July 2024 budget changes to sections 111A/112A).
 *  - Crypto (Virtual Digital Assets): flat 30% on every gain, no holding-period distinction, losses
 *    cannot offset other gains (Section 115BBH) - so only positive-gain trades contribute tax here.
 * This is a computation of your own real trades against published tax rules, not personalized advice.
 */
type Lot = { qty: number; costPaise: number; buyAt: number };
type RealizedTrade = { market: "crypto" | "stock"; symbol: string; qty: number; buyAt: string; sellAt: string; buyValue: number; sellValue: number; gain: number; holdingDays: number; type: "STCG" | "LTCG" | "crypto"; tax: number };

const STCG_RATE = 0.20;
const LTCG_RATE = 0.125;
const LTCG_EXEMPTION = 125_000; // per financial year, across all LTCG - applied once at the end, not per-trade
const CRYPTO_RATE = 0.30;
const LONG_TERM_DAYS = 365;

function computeRealized(orders: TradeOrder[]): RealizedTrade[] {
  const bySymbol = new Map<string, Lot[]>();
  const realized: RealizedTrade[] = [];
  const chrono = [...orders].sort((a, b) => a.createdAt - b.createdAt);
  for (const o of chrono) {
    const key = `${o.market}:${o.symbol}`;
    const lots = bySymbol.get(key) ?? bySymbol.set(key, []).get(key)!;
    if (o.side === "BUY") {
      lots.push({ qty: o.qty, costPaise: o.valuePaise, buyAt: o.createdAt });
      continue;
    }
    // SELL: consume oldest lots first (FIFO)
    let remaining = o.qty;
    const sellPricePerUnit = o.valuePaise / o.qty;
    while (remaining > 1e-9 && lots.length) {
      const lot = lots[0];
      const take = Math.min(remaining, lot.qty);
      const buyCostForTake = (lot.costPaise / lot.qty) * take;
      const sellValueForTake = sellPricePerUnit * take;
      const holdingDays = Math.round((o.createdAt - lot.buyAt) / 86_400_000);
      const gain = rupees(sellValueForTake - buyCostForTake);
      const isLongTerm = o.market === "stock" && holdingDays >= LONG_TERM_DAYS;
      const type: RealizedTrade["type"] = o.market === "crypto" ? "crypto" : isLongTerm ? "LTCG" : "STCG";
      realized.push({
        market: o.market, symbol: o.symbol, qty: take,
        buyAt: new Date(lot.buyAt).toISOString(), sellAt: new Date(o.createdAt).toISOString(),
        buyValue: rupees(buyCostForTake), sellValue: rupees(sellValueForTake), gain, holdingDays, type,
        tax: 0, // filled in after LTCG exemption is applied across all trades below
      });
      lot.qty -= take; lot.costPaise -= buyCostForTake;
      if (lot.qty <= 1e-9) lots.shift();
      remaining -= take;
    }
  }
  return realized;
}

function applyTax(realized: RealizedTrade[]) {
  const ltcgGains = realized.filter((t) => t.type === "LTCG" && t.gain > 0);
  const totalLtcgGain = ltcgGains.reduce((s, t) => s + t.gain, 0);
  // Exemption is consumed proportionally across LTCG trades so the per-trade tax sums to the correct total.
  const exemptShare = totalLtcgGain > 0 ? Math.min(1, LTCG_EXEMPTION / totalLtcgGain) : 0;
  for (const t of realized) {
    if (t.gain <= 0) { t.tax = 0; continue; }
    if (t.type === "STCG") t.tax = Math.round(t.gain * STCG_RATE * 100) / 100;
    else if (t.type === "LTCG") t.tax = Math.round(t.gain * (1 - exemptShare) * LTCG_RATE * 100) / 100;
    else t.tax = Math.round(t.gain * CRYPTO_RATE * 100) / 100; // crypto losses never offset - already gated by gain>0 above
  }
}

const router: IRouter = Router();
const uid = (req: any): string => req.userEmail;

router.get("/trade/tax-report", requireAuth, (req, res) => {
  const orders = acct(uid(req)).orders;
  const realized = computeRealized(orders);
  applyTax(realized);
  const sum = (pred: (t: RealizedTrade) => boolean) => realized.filter(pred).reduce((s, t) => s + Math.max(0, t.gain), 0);
  const sumTax = (pred: (t: RealizedTrade) => boolean) => realized.filter(pred).reduce((s, t) => s + t.tax, 0);
  const sumLoss = (pred: (t: RealizedTrade) => boolean) => realized.filter((t) => pred(t) && t.gain < 0).reduce((s, t) => s + t.gain, 0);
  res.json({
    stcg: { gain: sum((t) => t.type === "STCG"), loss: sumLoss((t) => t.type === "STCG"), tax: sumTax((t) => t.type === "STCG") },
    ltcg: { gain: sum((t) => t.type === "LTCG"), loss: sumLoss((t) => t.type === "LTCG"), tax: sumTax((t) => t.type === "LTCG"), exemption: LTCG_EXEMPTION },
    crypto: { gain: sum((t) => t.type === "crypto"), loss: sumLoss((t) => t.type === "crypto"), tax: sumTax((t) => t.type === "crypto") },
    totalTax: Math.round(realized.reduce((s, t) => s + t.tax, 0) * 100) / 100,
    trades: realized.sort((a, b) => b.sellAt.localeCompare(a.sellAt)).slice(0, 200),
    disclaimer: "Ye tumhare real paper trades par current tax rules (STCG 20%, LTCG 12.5% >₹1.25L exemption, crypto flat 30%) ka calculation hai - personalized tax advice nahi. CA se confirm karo filing se pehle.",
  });
});

export default router;
