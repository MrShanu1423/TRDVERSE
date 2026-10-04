import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { requireAuth, isOwner, OWNER_CONFIGURED } from "./auth";

const r: IRouter = Router();
r.use("/live", requireAuth);

const env = process.env;
const ENABLED = env.BROKER_EXECUTION_ENABLED === "true"; // kill switch, default OFF
// The Binance/Angel keys below belong to one person (the server deployer) - every signed-up user shares the
// same login system, so without this check anyone with an OTP login could fire real trades on the owner's
// real brokerage/exchange account. isOwner() (from auth.ts) matches the request's id against OWNER_ID.
const ownerGuard = (req: any, res: any): boolean => {
  if (!isOwner(req.userEmail)) { res.status(403).json({ error: "Sirf account owner hi real broker balance/orders access kar sakta hai. Server par OWNER_ID set hai ya nahi, ya tumhara login id usse match nahi karta." }); return false; }
  return true;
};
const guard = (req: any, res: any): boolean => {
  if (!ownerGuard(req, res)) return false;
  if (!ENABLED) { res.status(403).json({ error: "Live execution OFF. Set BROKER_EXECUTION_ENABLED=true on the server." }); return false; }
  if (req.body?.confirm !== true) { res.status(400).json({ error: "confirm:true required" }); return false; }
  return true;
};

/* ---------------- Binance USDⓈ-M Futures (HMAC-signed REST) ---------------- */
const BN = env.BINANCE_BASE || "https://fapi.binance.com"; // testnet: https://testnet.binancefuture.com
async function bn(method: "GET" | "POST", path: string, params: Record<string, string | number> = {}) {
  const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), timestamp: String(Date.now()), recvWindow: "5000" });
  q.append("signature", crypto.createHmac("sha256", env.BINANCE_API_SECRET || "").update(q.toString()).digest("hex"));
  const res = await fetch(`${BN}${path}?${q}`, { method, headers: { "X-MBX-APIKEY": env.BINANCE_API_KEY || "" } });
  const j: any = await res.json();
  if (!res.ok) throw Object.assign(new Error(j.msg || "Binance error"), { status: res.status, body: j });
  return j;
}

r.get("/live/binance/account", async (req, res) => {
  if (!ownerGuard(req, res)) return;
  if (!env.BINANCE_API_KEY) return res.status(503).json({ error: "BINANCE_API_KEY not set" });
  try { res.json(await bn("GET", "/fapi/v2/balance")); } catch (e: any) { res.status(e.status || 500).json({ error: e.message }); }
});

r.post("/live/binance/order", async (req, res) => {
  if (!guard(req, res)) return;
  const { symbol, side, type = "MARKET", quantity, price, stopPrice, leverage } = req.body;
  if (!/^[A-Z0-9]{5,20}$/.test(symbol || "") || !["BUY", "SELL"].includes(side) || !(Number(quantity) > 0)) return res.status(400).json({ error: "Bad order params" });
  try {
    if (leverage) await bn("POST", "/fapi/v1/leverage", { symbol, leverage: Math.min(Number(leverage), 20) });
    const p: Record<string, string | number> = { symbol, side, type, quantity };
    if (type === "LIMIT") { p.price = price; p.timeInForce = "GTC"; }
    if (type.startsWith("STOP")) { p.stopPrice = stopPrice; if (price) { p.price = price; p.timeInForce = "GTC"; } }
    res.json(await bn("POST", "/fapi/v1/order", p));
  } catch (e: any) { res.status(e.status || 500).json({ error: e.message }); }
});

/* ---------------- Angel One SmartAPI ---------------- */
const AO = "https://apiconnect.angelone.in";
const TOKENS: Record<string, string> = { SBIN: "3045", RELIANCE: "2885", HDFCBANK: "1333", INFY: "1594", TCS: "11536" }; // fallback until the full instrument master is loaded
// Full NSE equity list from Angel One's public instrument master (loaded once, cached 12h).
type Inst = { symbol: string; name: string; token: string };
let master: { at: number; list: Inst[]; bySym: Map<string, Inst> } | null = null;
let masterLoading: Promise<void> | null = null;
export async function loadMaster(): Promise<void> {
  if (master && Date.now() - master.at < 12 * 3600_000) return;
  if (masterLoading) return masterLoading;
  masterLoading = (async () => {
    const url = env.ANGEL_MASTER_URL || "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json";
    const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
    if (!res.ok) throw new Error(`Instrument master HTTP ${res.status}`);
    const rows = (await res.json()) as any[];
    const list: Inst[] = rows.filter((x) => x.exch_seg === "NSE" && typeof x.symbol === "string" && x.symbol.endsWith("-EQ"))
      .map((x) => ({ symbol: String(x.name).toUpperCase(), name: String(x.name), token: String(x.token) }));
    const bySym = new Map(list.map((i) => [i.symbol, i]));
    master = { at: Date.now(), list, bySym };
  })().finally(() => { masterLoading = null; });
  return masterLoading;
}
export async function stockToken(symbol: string): Promise<string | null> {
  try { await loadMaster(); } catch { return TOKENS[symbol] ?? null; }
  return master?.bySym.get(symbol)?.token ?? TOKENS[symbol] ?? null;
}
export async function stockQuote(symbol: string): Promise<{ ltp: number; changePct: number; open: number; high: number; low: number; close: number } | null> {
  const t = await stockToken(symbol); if (!t) return null;
  const j = await ao("/rest/secure/angelbroking/market/v1/quote/", { mode: "FULL", exchangeTokens: { NSE: [t] } });
  const q = j.data?.fetched?.[0]; if (!q || !(Number(q.ltp) > 0)) return null;
  return { ltp: Number(q.ltp), changePct: Number(q.percentChange ?? 0), open: Number(q.open), high: Number(q.high), low: Number(q.low), close: Number(q.close) };
}
export const angelConfigured = () => !!(env.ANGEL_API_KEY && env.ANGEL_CLIENT_CODE && env.ANGEL_PIN && env.ANGEL_TOTP_SECRET);
let jwt = { token: "", at: 0 };

function totp(secret: string) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = crypto.createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}
const headers = (auth?: string) => ({
  "Content-Type": "application/json", Accept: "application/json", "X-UserType": "USER", "X-SourceID": "WEB",
  "X-ClientLocalIP": env.ANGEL_LOCAL_IP || "127.0.0.1", "X-ClientPublicIP": env.ANGEL_PUBLIC_IP || "127.0.0.1",
  "X-MACAddress": env.ANGEL_MAC || "00:00:00:00:00:00", "X-PrivateKey": env.ANGEL_API_KEY || "",
  ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
});
export async function ao(path: string, body: object) {
  if (!env.ANGEL_API_KEY) throw Object.assign(new Error("ANGEL_API_KEY not set"), { status: 503 });
  if (!jwt.token || Date.now() - jwt.at > 6 * 3600_000) {
    const l = await fetch(`${AO}/rest/auth/angelbroking/user/v1/loginByPassword`, { method: "POST", headers: headers(), body: JSON.stringify({ clientcode: env.ANGEL_CLIENT_CODE, password: env.ANGEL_PIN, totp: totp(env.ANGEL_TOTP_SECRET || "") }) }).then((x) => x.json() as Promise<any>);
    if (!l.status) throw Object.assign(new Error(l.message || "Angel login failed"), { status: 502 });
    jwt = { token: l.data.jwtToken, at: Date.now() };
  }
  const j: any = await fetch(`${AO}${path}`, { method: "POST", headers: headers(jwt.token), body: JSON.stringify(body) }).then((x) => x.json() as Promise<any>);
  if (j.status === false || j.success === false) throw Object.assign(new Error(j.message || "Angel error"), { status: 400 });
  return j;
}

r.get("/live/angel/ltp", async (req, res) => {
  const t = await stockToken(String(req.query.symbol)); if (!t) return res.status(404).json({ error: "Unknown symbol" });
  try { const j = await ao("/rest/secure/angelbroking/market/v1/quote/", { mode: "FULL", exchangeTokens: { NSE: [t] } }); res.json(j.data.fetched?.[0] ?? {}); }
  catch (e: any) { res.status(e.status || 500).json({ error: e.message }); }
});

const IV: Record<string, [string, number]> = { "1m": ["ONE_MINUTE", 5], "5m": ["FIVE_MINUTE", 20], "15m": ["FIFTEEN_MINUTE", 40], "1h": ["ONE_HOUR", 100], "1d": ["ONE_DAY", 365] };
r.get("/live/angel/candles", async (req, res) => {
  const t = await stockToken(String(req.query.symbol)); const iv = IV[String(req.query.tf)];
  if (!t || !iv) return res.status(404).json({ error: "Unsupported symbol/timeframe" });
  const f = (d: Date) => new Date(d.getTime() + 19_800_000).toISOString().slice(0, 16).replace("T", " "); // IST
  try {
    const j = await ao("/rest/secure/angelbroking/historical/v1/getCandleData", { exchange: "NSE", symboltoken: t, interval: iv[0], fromdate: f(new Date(Date.now() - iv[1] * 864e5)), todate: f(new Date()) });
    res.json((j.data || []).map((c: any[]) => ({ time: Math.floor(new Date(c[0]).getTime() / 1000), open: c[1], high: c[2], low: c[3], close: c[4] })));
  } catch (e: any) { res.status(e.status || 500).json({ error: e.message }); }
});

r.post("/live/angel/order", async (req, res) => {
  if (!guard(req, res)) return;
  const { symbol, side, ordertype = "MARKET", producttype = "INTRADAY", quantity, price = 0, triggerprice = 0 } = req.body;
  const token = await stockToken(String(symbol));
  if (!token || !["BUY", "SELL"].includes(side) || !(Number(quantity) > 0)) return res.status(400).json({ error: "Bad order params" });
  try {
    res.json(await ao("/rest/secure/angelbroking/order/v1/placeOrder", {
      variety: ordertype.startsWith("STOPLOSS") ? "STOPLOSS" : "NORMAL", tradingsymbol: `${symbol}-EQ`, symboltoken: token,
      transactiontype: side, exchange: "NSE", ordertype, producttype, duration: "DAY",
      price: String(price), triggerprice: String(triggerprice), squareoff: "0", stoploss: "0", quantity: String(quantity),
    }));
  } catch (e: any) { res.status(e.status || 500).json({ error: e.message }); }
});

const POPULAR = ["RELIANCE","TCS","HDFCBANK","INFY","ICICIBANK","SBIN","BHARTIARTL","ITC","LT","KOTAKBANK","AXISBANK","HINDUNILVR","ASIANPAINT","MARUTI","SUNPHARMA","TITAN","BAJFINANCE","WIPRO","ONGC","NTPC","POWERGRID","TATAMOTORS","TATASTEEL","ADANIENT","ULTRACEMCO","NESTLEIND","HCLTECH","COALINDIA","JSWSTEEL","TECHM"];
r.get("/live/stocks/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim().toUpperCase().slice(0, 30);
  try { await loadMaster(); } catch (e: any) { return res.status(503).json({ error: `Stock list load nahi hui: ${e.message}`, configured: angelConfigured() }); }
  const list = master!.list;
  const hits = q ? list.filter((i) => i.symbol.includes(q)).sort((a, b) => Number(b.symbol.startsWith(q)) - Number(a.symbol.startsWith(q)) || a.symbol.length - b.symbol.length).slice(0, 40)
    : POPULAR.map((s) => master!.bySym.get(s)).filter(Boolean) as Inst[];
  res.json({ configured: angelConfigured(), items: hits.map((i) => ({ symbol: i.symbol, token: i.token })) });
});
r.get("/live/stocks/quotes", async (req, res) => {
  if (!angelConfigured()) return res.status(503).json({ error: "Angel One keys server par set nahi hain (ANGEL_API_KEY, ANGEL_CLIENT_CODE, ANGEL_PIN, ANGEL_TOTP_SECRET)", configured: false });
  const syms = String(req.query.symbols ?? "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean).slice(0, 50);
  if (!syms.length) return res.json({ items: [] });
  try {
    await loadMaster();
    const pairs = syms.map((s) => [s, master!.bySym.get(s)?.token] as const).filter((p) => p[1]);
    const j = await ao("/rest/secure/angelbroking/market/v1/quote/", { mode: "FULL", exchangeTokens: { NSE: pairs.map((p) => p[1]) } });
    const byTok = new Map(pairs.map(([s, t]) => [t, s]));
    const items = (j.data?.fetched ?? []).map((q: any) => ({ symbol: byTok.get(String(q.symbolToken)) ?? q.tradingSymbol, ltp: Number(q.ltp), changePct: Number(q.percentChange ?? 0), high: Number(q.high), low: Number(q.low), open: Number(q.open), close: Number(q.close), volume: Number(q.tradeVolume ?? 0) }));
    res.json({ items, updatedAt: Date.now() });
  } catch (e: any) { res.status(e.status || 500).json({ error: e.message }); }
});

// Well-known index tokens (Angel One SmartAPI docs/instrument master) - indices aren't "-EQ" symbols so
// they never show up in loadMaster()'s stock list, hence the separate hardcoded lookup.
const INDEX_TOKENS: Record<string, { token: string; seg: "NSE" | "BSE" }> = {
  NIFTY: { token: "99926000", seg: "NSE" },
  SENSEX: { token: "99919000", seg: "BSE" },
};
r.get("/live/indices", async (_req, res) => {
  if (!angelConfigured()) return res.status(503).json({ error: "Angel One keys server par set nahi hain", configured: false });
  try {
    const exchangeTokens: Record<string, string[]> = {};
    for (const { token, seg } of Object.values(INDEX_TOKENS)) (exchangeTokens[seg] ??= []).push(token);
    const j = await ao("/rest/secure/angelbroking/market/v1/quote/", { mode: "FULL", exchangeTokens });
    const byTok = new Map(Object.entries(INDEX_TOKENS).map(([name, v]) => [v.token, name]));
    const items: Record<string, { ltp: number; changePct: number }> = {};
    for (const q of j.data?.fetched ?? []) {
      const name = byTok.get(String(q.symbolToken));
      if (name) items[name] = { ltp: Number(q.ltp), changePct: Number(q.percentChange ?? 0) };
    }
    res.json({ items, updatedAt: Date.now() });
  } catch (e: any) { res.status(e.status || 500).json({ error: e.message }); }
});

r.get("/live/status", (req: any, res) => res.json({ execution: ENABLED, ownerConfigured: OWNER_CONFIGURED, isOwner: isOwner(req.userEmail), binance: !!env.BINANCE_API_KEY, angel: !!env.ANGEL_API_KEY, binanceBase: BN, angelSymbols: Object.keys(TOKENS) }));

export default r;
