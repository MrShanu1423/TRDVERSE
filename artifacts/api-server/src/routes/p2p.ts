import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { requireAuth } from "./auth";
import { acct, round8, rupees } from "./ledger";

/**
 * P2P crypto marketplace: sellers post an ad at their own price (can differ from the live market -
 * that's the point of P2P), crypto is escrowed from their paper holdings immediately, buyers match
 * against it and the trade settles atomically in the same paper ledger used by /trade. Unlike a real
 * P2P exchange there's no external bank-transfer wait/dispute window - this is an instant in-app match.
 */
export type P2pAd = {
  id: string; sellerUid: string; coin: string; pricePerUnit: number; qtyTotal: number; qtyRemaining: number;
  minLimit: number; maxLimit: number; status: "open" | "completed" | "cancelled"; createdAt: number;
};
export const ads = new Map<string, P2pAd>(); // persisted

export type P2pTrade = { id: string; adId: string; sellerUid: string; buyerUid: string; coin: string; qty: number; pricePerUnit: number; totalInr: number; createdAt: number };
export const trades = new Map<string, P2pTrade>(); // persisted

const router: IRouter = Router();
const uid = (req: any): string => req.userEmail;

const viewAd = (a: P2pAd) => ({ id: a.id, coin: a.coin, pricePerUnit: a.pricePerUnit, qtyTotal: a.qtyTotal, qtyRemaining: a.qtyRemaining, minLimit: a.minLimit, maxLimit: a.maxLimit, status: a.status, createdAt: new Date(a.createdAt).toISOString() });

router.get("/p2p/ads", requireAuth, (req, res) => {
  const coin = String(req.query.coin ?? "").toUpperCase();
  const open = [...ads.values()].filter((a) => a.status === "open" && (!coin || a.coin === coin)).sort((a, b) => a.pricePerUnit - b.pricePerUnit);
  res.json(open.map((a) => ({ ...viewAd(a), isMine: a.sellerUid === uid(req) })));
});

router.get("/p2p/my-ads", requireAuth, (req, res) => {
  const mine = [...ads.values()].filter((a) => a.sellerUid === uid(req)).sort((a, b) => b.createdAt - a.createdAt);
  res.json(mine.map(viewAd));
});

router.get("/p2p/my-trades", requireAuth, (req, res) => {
  const mine = [...trades.values()].filter((t) => t.sellerUid === uid(req) || t.buyerUid === uid(req)).sort((a, b) => b.createdAt - a.createdAt);
  res.json(mine.map((t) => ({ id: t.id, coin: t.coin, qty: t.qty, pricePerUnit: t.pricePerUnit, totalInr: t.totalInr, role: t.sellerUid === uid(req) ? "seller" : "buyer", createdAt: new Date(t.createdAt).toISOString() })));
});

router.post("/p2p/ads", requireAuth, (req, res) => {
  const coin = String(req.body?.coin ?? "").trim().toUpperCase();
  const pricePerUnit = Number(req.body?.pricePerUnit);
  const qty = Number(req.body?.qty);
  const minLimit = Number(req.body?.minLimit ?? 0);
  if (!/^[A-Z0-9]{2,15}$/.test(coin)) return res.status(400).json({ error: "Coin symbol galat hai" });
  if (!(pricePerUnit > 0)) return res.status(400).json({ error: "Price 0 se zyada honi chahiye" });
  if (!(qty > 0)) return res.status(400).json({ error: "Quantity 0 se zyada honi chahiye" });
  const totalValue = qty * pricePerUnit;
  const maxLimitRaw = req.body?.maxLimit;
  const maxLimit = maxLimitRaw == null || maxLimitRaw === "" ? totalValue : Number(maxLimitRaw);
  if (minLimit < 0 || maxLimit < minLimit) return res.status(400).json({ error: "Min/max limit galat hai" });
  if (maxLimit > totalValue + 1e-6) return res.status(400).json({ error: "Max limit total ad value se zyada nahi ho sakta" });

  const a = acct(uid(req));
  const key = `crypto:${coin}`;
  const h = a.holdings.get(key);
  if (!h || h.qty + 1e-9 < qty) return res.status(400).json({ error: `Aapke paas sirf ${h?.qty ?? 0} ${coin} hai, ${qty} ad nahi laga sakte` });
  // Escrow: pull the qty out of tradeable holdings now, same proportional cost-basis reduction as a normal sell.
  const left = round8(h.qty - qty);
  const costOut = left <= 0 ? h.costPaise : Math.round(h.costPaise * (qty / h.qty));
  if (left <= 0) a.holdings.delete(key); else a.holdings.set(key, { qty: left, costPaise: h.costPaise - costOut });

  const ad: P2pAd = { id: `p2p-${randomUUID().slice(0, 8)}`, sellerUid: uid(req), coin, pricePerUnit, qtyTotal: qty, qtyRemaining: qty, minLimit, maxLimit: Number.isFinite(maxLimit) ? maxLimit : qty * pricePerUnit, status: "open", createdAt: Date.now() };
  ads.set(ad.id, ad);
  res.status(201).json(viewAd(ad));
});

router.post("/p2p/ads/:id/cancel", requireAuth, (req, res) => {
  const ad = ads.get(req.params.id);
  if (!ad || ad.sellerUid !== uid(req)) return res.status(404).json({ error: "Ad nahi mila" });
  if (ad.status !== "open") return res.status(400).json({ error: "Ye ad ab open nahi hai" });
  // Return the un-sold escrowed qty back to tradeable holdings, at the ad's own price as its new cost basis.
  if (ad.qtyRemaining > 0) {
    const a = acct(ad.sellerUid);
    const key = `crypto:${ad.coin}`;
    const h = a.holdings.get(key);
    const returnedCostPaise = Math.round(ad.qtyRemaining * ad.pricePerUnit * 100);
    a.holdings.set(key, { qty: round8((h?.qty ?? 0) + ad.qtyRemaining), costPaise: (h?.costPaise ?? 0) + returnedCostPaise });
  }
  ad.status = "cancelled";
  res.json(viewAd(ad));
});

router.post("/p2p/ads/:id/buy", requireAuth, (req, res) => {
  const ad = ads.get(req.params.id);
  if (!ad || ad.status !== "open") return res.status(404).json({ error: "Ad available nahi hai" });
  if (ad.sellerUid === uid(req)) return res.status(400).json({ error: "Apne hi ad se nahi khareed sakte" });
  const qty = Number(req.body?.qty);
  if (!(qty > 0) || qty > ad.qtyRemaining + 1e-9) return res.status(400).json({ error: `Max ${ad.qtyRemaining} ${ad.coin} available hai is ad mein` });
  const totalInr = Math.round(qty * ad.pricePerUnit * 100) / 100;
  if (totalInr < ad.minLimit - 1e-6 || totalInr > ad.maxLimit + 1e-6) return res.status(400).json({ error: `Order value ₹${ad.minLimit} aur ₹${ad.maxLimit} ke beech honi chahiye` });

  const buyer = acct(uid(req));
  const totalPaise = Math.round(totalInr * 100);
  if (buyer.paise < totalPaise) return res.status(400).json({ error: `Balance kam hai. Chahiye ₹${totalInr.toFixed(2)}, available ₹${rupees(buyer.paise).toFixed(2)}` });

  buyer.paise -= totalPaise;
  const key = `crypto:${ad.coin}`;
  const bh = buyer.holdings.get(key);
  buyer.holdings.set(key, { qty: round8((bh?.qty ?? 0) + qty), costPaise: (bh?.costPaise ?? 0) + totalPaise });

  const seller = acct(ad.sellerUid);
  seller.paise += totalPaise;

  ad.qtyRemaining = round8(ad.qtyRemaining - qty);
  if (ad.qtyRemaining <= 1e-9) ad.status = "completed";

  const trade: P2pTrade = { id: `p2pt-${randomUUID().slice(0, 8)}`, adId: ad.id, sellerUid: ad.sellerUid, buyerUid: uid(req), coin: ad.coin, qty, pricePerUnit: ad.pricePerUnit, totalInr, createdAt: Date.now() };
  trades.set(trade.id, trade);
  res.status(201).json({ trade: { id: trade.id, coin: trade.coin, qty: trade.qty, totalInr: trade.totalInr }, balance: rupees(buyer.paise) });
});

export default router;
