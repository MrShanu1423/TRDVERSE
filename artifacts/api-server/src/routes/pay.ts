import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { requireAuth } from "./auth";
import { acct, credit, rupees } from "./ledger";
import { flushNow } from "../lib/store";

/**
 * Add money via the owner's Razorpay account.
 * Flow: user enters amount -> server creates a single-use, fixed-amount UPI QR on Razorpay -> user pays from any UPI app
 * -> Razorpay calls our webhook (signature verified) -> balance is credited exactly once.
 */
const r: IRouter = Router();
const env = process.env;
const BASE = env.RAZORPAY_BASE || "https://api.razorpay.com";
const razorpayOn = () => !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET);
const MIN = 10, MAX = 100000;
type Pending = { uid: string; paise: number; exp: number; credited: boolean };
export const pending = new Map<string, Pending>(); // qr id -> pending (move to MySQL before launch)

r.get("/pay/config", (_q, res) => res.json({ razorpay: razorpayOn(), demoCredit: env.DEMO_CREDIT === "true", min: MIN, max: MAX }));

r.post("/pay/qr", requireAuth, async (req: any, res) => {
  if (!razorpayOn()) return res.status(503).json({ error: "Razorpay abhi configure nahi hai (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET)." });
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount < MIN || amount > MAX || Math.round(amount * 100) !== amount * 100) return res.status(400).json({ error: `Amount ₹${MIN} se ₹${MAX.toLocaleString("en-IN")} ke beech, max 2 decimals me daalo` });
  const open = [...pending.values()].filter((p) => p.uid === req.userEmail && !p.credited && p.exp > Date.now()).length;
  if (open >= 3) return res.status(429).json({ error: "Bahut saare QR open hain, pehle purane pay ya expire hone do" });
  const paise = Math.round(amount * 100), exp = Math.floor(Date.now() / 1000) + 15 * 60;
  try {
    const rp = await fetch(`${BASE}/v1/payments/qr_codes`, {
      method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64")}` },
      body: JSON.stringify({ type: "upi_qr", name: "TradeVerse wallet", usage: "single_use", fixed_amount: true, payment_amount: paise, description: "TradeVerse wallet top-up", close_by: exp, notes: { user: String(req.userEmail).slice(0, 60) } }),
    });
    const j: any = await rp.json();
    if (!rp.ok || !j.id || !j.image_url) return res.status(502).json({ error: j?.error?.description || "Razorpay QR nahi bana paya" });
    pending.set(j.id, { uid: req.userEmail, paise, exp: exp * 1000, credited: false });
    res.status(201).json({ qrId: j.id, imageUrl: j.image_url, amount, expiresAt: exp * 1000 });
  } catch { res.status(502).json({ error: "Razorpay se connect nahi ho paya, thodi der baad try karo" }); }
});

r.get("/pay/status/:qrId", requireAuth, (req: any, res) => {
  const p = pending.get(req.params.qrId);
  if (!p || p.uid !== req.userEmail) return res.status(404).json({ error: "QR nahi mila" });
  res.json({ status: p.credited ? "paid" : p.exp < Date.now() ? "expired" : "waiting", balance: rupees(acct(req.userEmail).paise) });
});

// Razorpay -> us. No login: authenticity comes from the HMAC signature over the raw body.
r.post("/pay/razorpay/webhook", async (req: any, res) => {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  const sig = String(req.headers["x-razorpay-signature"] ?? "");
  const raw: Buffer | undefined = req.rawBody;
  if (!secret || !raw || !sig) return res.status(400).json({ error: "bad request" });
  const want = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(want), b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(400).json({ error: "bad signature" });
  if (req.body?.event === "qr_code.credited") {
    const pay = req.body?.payload?.payment?.entity, qrId = req.body?.payload?.qr_code?.entity?.id;
    const p = qrId ? pending.get(qrId) : undefined;
    if (p && pay?.id && (pay.status === "captured" || pay.status === "authorized")) {
      if (Number(pay.amount) === p.paise) { credit(p.uid, p.paise, String(pay.id)); p.credited = true; await flushNow(); /* save before telling Razorpay OK */ }
      else console.warn(`[pay] amount mismatch for ${qrId}: got ${pay.amount}, expected ${p.paise}`);
    }
  }
  res.json({ ok: true }); // always 200 for valid signatures so Razorpay stops retrying
});

// Dev/testing only: set DEMO_CREDIT=true to add pretend money without Razorpay.
r.post("/pay/demo-credit", requireAuth, async (req: any, res) => {
  if (env.DEMO_CREDIT !== "true") return res.status(403).json({ error: "Demo credit band hai" });
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount < MIN || amount > MAX) return res.status(400).json({ error: `Amount ₹${MIN} se ₹${MAX.toLocaleString("en-IN")} ke beech daalo` });
  credit(req.userEmail, Math.round(amount * 100), `demo-${crypto.randomUUID()}`);
  await flushNow();
  res.json({ balance: rupees(acct(req.userEmail).paise) });
});

export default r;
