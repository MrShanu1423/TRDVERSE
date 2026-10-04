import { Router, type IRouter } from "express";
import nodemailer from "nodemailer";
import crypto from "node:crypto";

const r: IRouter = Router();
type Otp = { code: string; exp: number; tries: number; last: number };
const otps = new Map<string, Otp>();
type Session = { id: string; exp: number };
export const sessions = new Map<string, Session>(); // persisted by lib/persist.ts; key = sha256(token), never the raw token
const tk = (req: any) => crypto.createHash("sha256").update((req.headers.authorization || "").replace("Bearer ", "")).digest("hex");

/** A session dies after 7 days of inactivity. Active use keeps renewing it, so only a stolen/forgotten token ever actually expires. */
const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TOUCH_MIN_MS = 60 * 60 * 1000; // avoid rewriting (and re-persisting) the session on every single request

// The deployer's own id (email or +91 phone, matching how they log in). Gates real broker-account
// access in live.ts, since every signed-up user otherwise shares the same login system.
const OWNER_ID = (process.env.OWNER_ID || "").trim().toLowerCase();
export const OWNER_CONFIGURED = !!OWNER_ID;
export const isOwner = (id: string | null | undefined): boolean => !!OWNER_ID && String(id || "").toLowerCase() === OWNER_ID;

function resolveSession(hash: string): string | null {
  const s = sessions.get(hash);
  if (!s) return null;
  if (s.exp < Date.now()) { sessions.delete(hash); return null; }
  if (s.exp - Date.now() < SESSION_IDLE_MS - SESSION_TOUCH_MIN_MS) s.exp = Date.now() + SESSION_IDLE_MS;
  return s.id;
}

const mail = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

/**
 * Most free cloud hosts (Render included) silently drop outbound SMTP (port 587/465) to stop
 * spam abuse, so raw nodemailer just hangs until it times out there even with correct credentials.
 * Resend's API runs over plain HTTPS, so it isn't affected - preferred whenever RESEND_API_KEY is set.
 * Without a verified sending domain, Resend's sandbox sender only delivers to the Resend account's
 * own email, which is exactly the owner-login case this was needed for.
 */
async function sendEmailOtp(to: string, code: string): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "TradeVerse <onboarding@resend.dev>",
        to: [to],
        subject: "Your TradeVerse OTP",
        text: `Your OTP is ${code}. Valid for 5 minutes. Never share it with anyone.`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${await res.text().catch(() => "")}`);
    return true;
  }
  if (mail) {
    await mail.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject: "Your TradeVerse OTP", text: `Your OTP is ${code}. Valid for 5 minutes. Never share it with anyone.` });
    return true;
  }
  console.log(`[DEV OTP] ${to}: ${code}`);
  return false;
}

// Mobile OTP: point SMS_WEBHOOK_URL to your SMS gateway (MSG91 / Twilio / Fast2SMS relay).
// It receives POST {to, message}. Without it, OTP is printed in the server log (dev only).
async function sendSms(to: string, message: string) {
  const url = process.env.SMS_WEBHOOK_URL;
  if (!url) return console.log(`[DEV SMS OTP] ${to}: ${message}`), false;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SMS_WEBHOOK_TOKEN || ""}` },
    body: JSON.stringify({ to, message }),
  });
  if (!res.ok) throw new Error("sms failed");
  return true;
}

function normalize(body: any): { id: string; kind: "email" | "phone" } | null {
  if (body?.email) {
    const e = String(body.email).trim().toLowerCase();
    return /^\S+@\S+\.\S+$/.test(e) ? { id: e, kind: "email" } : null;
  }
  if (body?.phone) {
    const p = String(body.phone).replace(/[\s-]/g, "");
    const m = p.match(/^(?:\+91|91|0)?([6-9]\d{9})$/); // Indian mobile numbers
    return m ? { id: `+91${m[1]}`, kind: "phone" } : null;
  }
  return null;
}

r.post("/auth/request-otp", async (req, res) => {
  const t = normalize(req.body);
  if (!t) return res.status(400).json({ error: "Valid email ya 10-digit mobile number daalo" });
  const prev = otps.get(t.id);
  if (prev && Date.now() - prev.last < 30_000) return res.status(429).json({ error: "30 second baad dobara try karo" });
  const code = String(crypto.randomInt(100000, 1000000));
  otps.set(t.id, { code, exp: Date.now() + 5 * 60_000, tries: 0, last: Date.now() });
  try {
    let real = true;
    if (t.kind === "email") real = await sendEmailOtp(t.id, code);
    else real = await sendSms(t.id, `${code} is your TradeVerse OTP. Valid for 5 minutes. Do not share.`);
    res.json({ ok: true, dev: !real, kind: t.kind });
  } catch {
    res.status(502).json({ error: "OTP send nahi ho paya" });
  }
});

r.post("/auth/verify-otp", (req, res) => {
  const t = normalize(req.body);
  const o = t && otps.get(t.id);
  if (!t || !o || o.exp < Date.now() || ++o.tries > 5) { t && otps.delete(t.id); return res.status(400).json({ error: "OTP expire ya galat" }); }
  const a = Buffer.from(o.code), b = Buffer.from(String(req.body?.code || "").padEnd(6, "x").slice(0, 6));
  if (!crypto.timingSafeEqual(a, b)) return res.status(400).json({ error: "Galat OTP" });
  otps.delete(t.id);
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(crypto.createHash("sha256").update(token).digest("hex"), { id: t.id, exp: Date.now() + SESSION_IDLE_MS });
  res.json({ token, id: t.id, kind: t.kind, email: t.kind === "email" ? t.id : undefined });
});

r.post("/auth/logout", (req, res) => {
  sessions.delete(tk(req));
  res.json({ ok: true });
});

r.get("/auth/me", (req, res) => {
  const id = resolveSession(tk(req));
  return id ? res.json({ id, email: id, isOwner: isOwner(id) }) : res.status(401).json({ error: "Login required" });
});

export default r;

export const requireAuth = (req: any, res: any, next: any) => {
  const id = resolveSession(tk(req));
  if (!id) return res.status(401).json({ error: "Login required" });
  req.userEmail = id;
  next();
};

/** Sends an OTP for a non-login purpose (e.g. transfer confirmation). Returns false when it was only logged (dev mode). */
export async function deliverOtp(id: string, kind: "email" | "phone", code: string, purpose: string): Promise<boolean> {
  if (kind === "email") {
    if (!mail) return console.log(`[DEV OTP] ${purpose} ${id}: ${code}`), false;
    await mail.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: id, subject: `TradeVerse ${purpose} OTP`, text: `Your ${purpose} OTP is ${code}. Valid for 5 minutes. Never share it with anyone.` });
    return true;
  }
  return sendSms(id, `${code} is your TradeVerse ${purpose} OTP. Valid for 5 minutes. Do not share.`);
}
