import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { requireAuth } from "./auth";
import { acct, rupees } from "./ledger";

/**
 * Real Indian mutual fund data via mfapi.in - a free, keyless wrapper around AMFI's daily NAV feed.
 * SIPs here are paper/persisted intents (this app never debits real money), but they're real records
 * now, not client-side state that vanishes on refresh.
 */
const MF_API = "https://api.mfapi.in/mf";

let searchCache: { at: number; q: string; rows: { schemeCode: number; schemeName: string }[] } | null = null;
async function searchSchemes(q: string) {
  if (searchCache && searchCache.q === q && Date.now() - searchCache.at < 60_000) return searchCache.rows;
  const res = await fetch(`${MF_API}/search?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`mfapi search HTTP ${res.status}`);
  const rows = (await res.json()) as { schemeCode: number; schemeName: string }[];
  searchCache = { at: Date.now(), q, rows };
  return rows;
}

type NavPoint = { date: string; nav: string };
const detailCache = new Map<number, { at: number; meta: any; data: NavPoint[] }>();
async function schemeDetail(code: number) {
  const cached = detailCache.get(code);
  if (cached && Date.now() - cached.at < 6 * 3600_000) return cached;
  const res = await fetch(`${MF_API}/${code}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`mfapi scheme HTTP ${res.status}`);
  const j = (await res.json()) as { meta: any; data: NavPoint[] };
  const entry = { at: Date.now(), meta: j.meta, data: j.data };
  detailCache.set(code, entry);
  return entry;
}

const parseDate = (d: string) => { const [dd, mm, yyyy] = d.split("-").map(Number); return new Date(yyyy, mm - 1, dd).getTime(); };
function trailingReturn(data: NavPoint[], years: number): number | null {
  if (!data.length) return null;
  const latest = Number(data[0].nav);
  const targetMs = parseDate(data[0].date) - years * 365.25 * 86_400_000;
  // data is newest-first; find the first point at or before the target date
  const past = data.find((p) => parseDate(p.date) <= targetMs);
  if (!past) return null;
  const pastNav = Number(past.nav);
  if (!(pastNav > 0)) return null;
  const cagr = (Math.pow(latest / pastNav, 1 / years) - 1) * 100;
  return Math.round(cagr * 100) / 100;
}

export type Sip = { id: string; uid: string; schemeCode: number; schemeName: string; amount: number; createdAt: number; status: "active" | "cancelled" };
export const sips = new Map<string, Sip>(); // persisted

const router: IRouter = Router();
const uid = (req: any): string => req.userEmail;

router.get("/funds/search", requireAuth, async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json({ items: [] });
  try {
    const rows = await searchSchemes(q);
    // Prefer Growth plans over IDCW/dividend variants so the list isn't dominated by near-duplicates.
    const growth = rows.filter((r) => /growth/i.test(r.schemeName));
    const items = (growth.length ? growth : rows).slice(0, 25).map((r) => ({ schemeCode: r.schemeCode, schemeName: r.schemeName }));
    res.json({ items });
  } catch (e: any) { res.status(502).json({ error: `Fund search nahi ho paya: ${e.message}` }); }
});

// NOTE: static paths (/funds/sips, /funds/sip) must be registered before the dynamic /funds/:code route
// below, otherwise Express matches "sips"/"sip" as a :code value and this route swallows them first.
const viewSip = (s: Sip) => ({ id: s.id, schemeCode: s.schemeCode, schemeName: s.schemeName, amount: s.amount, status: s.status, createdAt: new Date(s.createdAt).toISOString() });

router.get("/funds/sips", requireAuth, (req, res) => {
  const mine = [...sips.values()].filter((s) => s.uid === uid(req)).sort((a, b) => b.createdAt - a.createdAt);
  res.json(mine.map(viewSip));
});

router.post("/funds/sip", requireAuth, (req, res) => {
  const schemeCode = Number(req.body?.schemeCode);
  const schemeName = String(req.body?.schemeName ?? "").trim();
  const amount = Number(req.body?.amount);
  if (!(schemeCode > 0) || !schemeName) return res.status(400).json({ error: "Fund chuno" });
  if (!(amount >= 500)) return res.status(400).json({ error: "Minimum SIP ₹500/month hai" });
  const openCount = [...sips.values()].filter((s) => s.uid === uid(req) && s.status === "active").length;
  if (openCount >= 15) return res.status(400).json({ error: "Max 15 active SIPs ho sakte hain" });
  // First installment debits now, like a real SIP's day-one payment. Future monthly installments aren't
  // automated yet (no scheduler) - this only charges once at creation, not every month.
  const a = acct(uid(req));
  const paise = Math.round(amount * 100);
  if (a.paise < paise) return res.status(400).json({ error: `Balance kam hai. Chahiye ₹${amount.toFixed(2)}, available ₹${rupees(a.paise).toFixed(2)}. Add money se balance badhao.` });
  a.paise -= paise;
  const s: Sip = { id: `sip-${randomUUID().slice(0, 8)}`, uid: uid(req), schemeCode, schemeName, amount, createdAt: Date.now(), status: "active" };
  sips.set(s.id, s);
  res.status(201).json({ ...viewSip(s), balance: rupees(a.paise) });
});

router.post("/funds/sips/:id/cancel", requireAuth, (req, res) => {
  const s = sips.get(req.params.id);
  if (!s || s.uid !== uid(req)) return res.status(404).json({ error: "SIP nahi mili" });
  if (s.status !== "active") return res.status(400).json({ error: "Ye SIP ab active nahi hai" });
  s.status = "cancelled";
  res.json(viewSip(s));
});

router.get("/funds/:code", requireAuth, async (req, res) => {
  const code = Number(req.params.code);
  if (!(code > 0)) return res.status(400).json({ error: "Invalid scheme code" });
  try {
    const { meta, data } = await schemeDetail(code);
    if (!data.length) return res.status(404).json({ error: "Fund data nahi mila" });
    res.json({
      schemeCode: code,
      schemeName: meta.scheme_name,
      fundHouse: meta.fund_house,
      category: meta.scheme_category,
      nav: Number(data[0].nav),
      navDate: data[0].date,
      return1y: trailingReturn(data, 1),
      return3y: trailingReturn(data, 3),
      return5y: trailingReturn(data, 5),
      history: data.slice(0, 180).reverse().map((p) => ({ date: p.date, nav: Number(p.nav) })),
    });
  } catch (e: any) { res.status(502).json({ error: `Fund detail nahi mila: ${e.message}` }); }
});

export default router;
