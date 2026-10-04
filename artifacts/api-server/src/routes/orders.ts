import { Router, type IRouter } from "express";
import { OrderInput, PlaceDemoOrderBody, PlaceDemoOrderResponse, GetOrdersResponse } from "@workspace/api-zod";
import { requireAuth } from "./auth";
import { assets } from "./tradeverse-data";
import { priceInr } from "./trade";
import { acct, execute, type TradeOrder } from "./ledger";

const router: IRouter = Router();
const uid = (req: any): string => req.userEmail;

const marketFor = (symbol: string): "crypto" | "stock" | null => {
  const asset = assets.find((a) => a.symbol === symbol);
  if (!asset) return null;
  return asset.category === "crypto" ? "crypto" : "stock";
};

const toOrder = (o: TradeOrder) => ({
  id: o.id,
  symbol: o.symbol,
  side: o.side.toLowerCase() as "buy" | "sell",
  orderType: "market" as const,
  quantity: o.qty,
  status: "simulated" as const,
  createdAt: new Date(o.createdAt).toISOString(),
  paper: true as const,
});

router.get("/orders", requireAuth, (req, res) => {
  const data = GetOrdersResponse.parse(acct(uid(req)).orders.slice(0, 100).map(toOrder));
  res.json(data);
});

router.post("/orders", requireAuth, async (req, res) => {
  const input: OrderInput = PlaceDemoOrderBody.parse(req.body);
  const symbol = input.symbol.trim().toUpperCase();
  const market = marketFor(symbol);
  if (!market) return res.status(400).json({ error: `${symbol} TradeVerse ke demo catalogue mein nahi hai. Markets se koi asset chuno.` });

  const priced = await priceInr(market, symbol);
  if (!priced.ok) return res.status(priced.status).json({ error: priced.error });

  if (input.orderType === "limit" && input.limitPrice != null) {
    if (input.side === "buy" && priced.price > input.limitPrice) {
      return res.status(400).json({ error: `Market price ₹${priced.price.toFixed(2)} aapke limit ₹${input.limitPrice.toFixed(2)} se zyada hai` });
    }
    if (input.side === "sell" && priced.price < input.limitPrice) {
      return res.status(400).json({ error: `Market price ₹${priced.price.toFixed(2)} aapke limit ₹${input.limitPrice.toFixed(2)} se kam hai` });
    }
  }

  const out = execute(uid(req), { market, symbol, side: input.side.toUpperCase() as "BUY" | "SELL", qty: input.quantity, priceInr: priced.price });
  if (!out.ok) return res.status(400).json({ error: out.error });

  const order = PlaceDemoOrderResponse.parse(toOrder(out.order));
  res.status(201).json(order);
});

export default router;
