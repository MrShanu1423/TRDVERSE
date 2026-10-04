import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { requireAuth } from "./auth";
import { acct, rupees } from "./ledger";

/**
 * Paper staking/earn positions, persisted (previously pure client state that reset on refresh).
 * Amount is staked FROM the same paper-trading cash balance used for /trade - no real custody,
 * no real yield; APR accrual is simulated time-based interest, settled on unstake.
 */
const PRODUCTS: Record<string, { apr: number; lockDays: number }> = {
  ETH: { apr: 3.6, lockDays: 0 },
  SOL: { apr: 6.8, lockDays: 30 },
  USDT: { apr: 7.5, lockDays: 90 },
  BNB: { apr: 4.9, lockDays: 0 },
};

export type StakePosition = { id: string; uid: string; coin: string; amount: number; apr: number; lockDays: number; createdAt: number; status: "active" | "unstaked"; unstakedAt?: number; payout?: number };
export const positions = new Map<string, StakePosition>(); // persisted

const router: IRouter = Router();
const uid = (req: any): string => req.userEmail;

const accrued = (p: StakePosition, atMs = Date.now()) => p.amount * (p.apr / 100) * ((atMs - p.createdAt) / (365 * 86_400_000));
const view = (p: StakePosition) => ({
  id: p.id, coin: p.coin, amount: p.amount, apr: p.apr, lockDays: p.lockDays, status: p.status,
  createdAt: new Date(p.createdAt).toISOString(), unstakedAt: p.unstakedAt ? new Date(p.unstakedAt).toISOString() : null,
  unlocksAt: p.lockDays ? new Date(p.createdAt + p.lockDays * 86_400_000).toISOString() : null,
  accrued: p.status === "active" ? Math.round(accrued(p) * 100) / 100 : (p.payout ? Math.round((p.payout - p.amount) * 100) / 100 : 0),
});

router.get("/earn/products", (_req, res) => res.json(Object.entries(PRODUCTS).map(([coin, p]) => ({ coin, ...p }))));

router.get("/earn/positions", requireAuth, (req, res) => {
  const mine = [...positions.values()].filter((p) => p.uid === uid(req)).sort((a, b) => b.createdAt - a.createdAt);
  res.json(mine.map(view));
});

router.post("/earn/stake", requireAuth, (req, res) => {
  const coin = String(req.body?.coin ?? "").toUpperCase();
  const amount = Number(req.body?.amount);
  const product = PRODUCTS[coin];
  if (!product) return res.status(400).json({ error: "Ye product available nahi hai" });
  if (!(amount >= 100)) return res.status(400).json({ error: "Minimum ₹100 stake kar sakte ho" });
  const a = acct(uid(req));
  const paise = Math.round(amount * 100);
  if (a.paise < paise) return res.status(400).json({ error: `Balance kam hai. Chahiye ₹${amount.toFixed(2)}, available ₹${rupees(a.paise).toFixed(2)}.` });
  a.paise -= paise;
  const p: StakePosition = { id: `stk-${randomUUID().slice(0, 8)}`, uid: uid(req), coin, amount, apr: product.apr, lockDays: product.lockDays, createdAt: Date.now(), status: "active" };
  positions.set(p.id, p);
  res.status(201).json({ ...view(p), balance: rupees(a.paise) });
});

router.post("/earn/positions/:id/unstake", requireAuth, (req, res) => {
  const p = positions.get(req.params.id);
  if (!p || p.uid !== uid(req)) return res.status(404).json({ error: "Position nahi mili" });
  if (p.status !== "active") return res.status(400).json({ error: "Ye position already unstaked hai" });
  const unlocksAt = p.createdAt + p.lockDays * 86_400_000;
  if (Date.now() < unlocksAt) return res.status(400).json({ error: `Lock period khatam nahi hua, ${new Date(unlocksAt).toLocaleDateString("en-IN")} ke baad try karo` });
  const payout = p.amount + accrued(p);
  acct(uid(req)).paise += Math.round(payout * 100);
  p.status = "unstaked"; p.unstakedAt = Date.now(); p.payout = payout;
  res.json({ ...view(p), balance: rupees(acct(uid(req)).paise) });
});

export default router;
