import { Router, type IRouter } from "express";
import { GetActivityResponse, GetDashboardResponse } from "@workspace/api-zod";
import { requireAuth } from "./auth";
import { cryptoSnapshot } from "./marketdata";
import { assets } from "./tradeverse-data";
import { accountSnapshot, healthScore } from "./portfolio-calc";
import { acct, rupees } from "./ledger";
import { watchlists } from "./watchlist";

const router: IRouter = Router();
const uid = (req: any): string => req.userEmail;

router.get("/dashboard", requireAuth, async (req, res) => {
  const snap = await accountSnapshot(uid(req));
  let liveSnap: Awaited<ReturnType<typeof cryptoSnapshot>> | null = null;
  try { liveSnap = await cryptoSnapshot(5000); } catch { /* fall back to catalogue prices below */ }
  const starred = watchlists.get(uid(req)) ?? [];
  const watchlist = starred.length
    ? starred.slice(0, 5).map((item) => {
        const catalogue = assets.find((a) => a.symbol === item.symbol);
        const row = item.market === "crypto" && liveSnap ? liveSnap.rows.find((x) => x.symbol === item.symbol) : null;
        const price = row ? row.price * liveSnap!.usdInr : (catalogue?.price ?? 0);
        const changePercent = row ? row.changePct : (catalogue?.changePercent ?? 0);
        return { symbol: item.symbol, name: catalogue?.name ?? item.symbol, category: (catalogue?.category ?? (item.market === "crypto" ? "crypto" : "stocks")) as "crypto" | "stocks" | "funds", price, changePercent, marketCap: catalogue?.marketCap ?? 0, logo: catalogue?.logo ?? item.symbol.slice(0, 1), sparkline: catalogue?.sparkline ?? [] };
      })
    : assets.slice(0, 5).map((asset) => {
        if (asset.category !== "crypto" || !liveSnap) return asset;
        const row = liveSnap.rows.find((x) => x.symbol === asset.symbol);
        return row ? { ...asset, price: row.price * liveSnap.usdInr, changePercent: row.changePct } : asset;
      });
  const data = GetDashboardResponse.parse({
    portfolioValue: snap.totalValue,
    investedValue: snap.investedValue,
    dayChange: snap.dayChange,
    dayChangePercent: snap.totalValue > 0 ? (snap.dayChange / snap.totalValue) * 100 : 0,
    healthScore: healthScore(snap.holdings, snap.cash, snap.totalValue),
    cashBalance: snap.cash,
    watchlist,
  });
  res.json(data);
});

router.get("/activity", requireAuth, (req, res) => {
  const orders = acct(uid(req)).orders.slice(0, 10).map((o) => ({
    id: o.id,
    type: "order" as const,
    title: `${o.side === "BUY" ? "Bought" : "Sold"} ${o.symbol}`,
    detail: `${o.qty} ${o.symbol} · Paper order`,
    amount: rupees(o.valuePaise),
    timestamp: new Date(o.createdAt).toISOString(),
  }));
  res.json(GetActivityResponse.parse(orders));
});

export default router;
