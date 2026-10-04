import { Router, type IRouter } from "express";
import { GetPortfolioResponse } from "@workspace/api-zod";
import { requireAuth } from "./auth";
import { assets } from "./tradeverse-data";
import { accountSnapshot, type ValuedHolding } from "./portfolio-calc";

const router: IRouter = Router();
const uid = (req: any): string => req.userEmail;

const ALLOCATION_COLOR: Record<string, string> = { crypto: "#F29D49", stocks: "#5B7CFA", funds: "#6BCB9B", cash: "#B8C0CC" };
const catalogue = (symbol: string) => assets.find((a) => a.symbol === symbol);

function toHolding(h: ValuedHolding) {
  const info = catalogue(h.symbol);
  const category = info?.category ?? (h.market === "crypto" ? "crypto" : "stocks");
  return {
    symbol: h.symbol,
    name: info?.name ?? h.symbol,
    category,
    quantity: h.qty,
    averagePrice: h.avgPrice,
    currentValue: h.value,
    pnl: h.pnl,
    pnlPercent: h.pnlPct,
    logo: info?.logo ?? h.symbol.slice(0, 1),
  };
}

router.get("/portfolio", requireAuth, async (req, res) => {
  const snap = await accountSnapshot(uid(req));
  const holdings = snap.holdings.map(toHolding);

  const byCategory = new Map<string, number>();
  for (const h of holdings) byCategory.set(h.category, (byCategory.get(h.category) ?? 0) + h.currentValue);
  if (snap.cash > 0) byCategory.set("cash", (byCategory.get("cash") ?? 0) + snap.cash);
  const allocation = [...byCategory.entries()]
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({ label: key === "cash" ? "Cash" : key[0].toUpperCase() + key.slice(1), value, color: ALLOCATION_COLOR[key] ?? "#B8C0CC" }));

  const totalPnl = snap.positionsValue - snap.investedValue;
  const data = GetPortfolioResponse.parse({
    totalValue: snap.totalValue,
    investedValue: snap.investedValue,
    totalPnl,
    totalPnlPercent: snap.investedValue > 0 ? (totalPnl / snap.investedValue) * 100 : 0,
    allocation,
    holdings,
  });
  res.json(data);
});

export default router;
