import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { JsonRpcProvider, Wallet as EvmWallet, parseEther } from "ethers";
import { requireAuth, deliverOtp } from "./auth";

/**
 * Wallet & transfers (DEMO ledger).
 * - Balances/transfers are simulated in memory - the paper balance moved is never real money.
 * - Address validation, whitelist, and OTP step-up are real for every coin/network.
 * - ETH (Sepolia) and BNB (BSC testnet) additionally broadcast a REAL on-chain transaction from a
 *   dedicated testnet-only hot wallet (TESTNET_EVM_PRIVATE_KEY) - real tx hash, checkable on a public
 *   testnet explorer, zero real-money risk since testnet coins are worthless. Every other coin/network
 *   (BTC, USDT, TRX, SOL, LTC, DOGE) stays paper-only: real custody/mainnet execution is a much bigger
 *   undertaking (private key security, per-chain node integration, FIU-IND registration) - see settle().
 * - TODO: persist to MySQL (infra/mysql/003_wallet_transfers.sql).
 */
const r: IRouter = Router();
r.use("/wallet", requireAuth);

/* ---------------- real testnet settlement (ETH/Sepolia + BNB/BSC-testnet only) ---------------- */
const EVM_CHAINS: Record<string, { rpc: string; explorer: string }> = {
  ETH: { rpc: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com", explorer: "https://sepolia.etherscan.io/tx/" },
  BSC: { rpc: process.env.BSC_TESTNET_RPC_URL || "https://bsc-testnet-rpc.publicnode.com", explorer: "https://testnet.bscscan.com/tx/" },
};
const evmPk = process.env.TESTNET_EVM_PRIVATE_KEY;
async function settle(coin: string, network: string, toAddress: string, amount: string): Promise<{ txHash: string; explorerUrl: string } | null> {
  const isNativeEvmSend = (coin === "ETH" && network === "ETH") || (coin === "BNB" && network === "BSC");
  if (!isNativeEvmSend) return null; // not a chain we broadcast for real - caller falls back to paper settlement
  if (!evmPk) throw Object.assign(new Error("TESTNET_EVM_PRIVATE_KEY server par set nahi hai, real testnet send band hai"), { code: "not_configured" });
  const chain = EVM_CHAINS[network];
  const provider = new JsonRpcProvider(chain.rpc);
  const wallet = new EvmWallet(evmPk, provider);
  const bal = await provider.getBalance(wallet.address);
  const value = parseEther(amount);
  if (bal < value) throw Object.assign(new Error(`Testnet hot wallet (${wallet.address}) mein ${network} testnet balance kam hai - faucet se fund karo`), { code: "insufficient_hot_wallet" });
  const txResp = await wallet.sendTransaction({ to: toAddress, value });
  await txResp.wait(1);
  return { txHash: txResp.hash, explorerUrl: `${chain.explorer}${txResp.hash}` };
}

/* ---------------- exact decimal money (8 dp, BigInt) ---------------- */
const SCALE = 8, ONE = 10n ** BigInt(SCALE);
const parseAmt = (s: unknown): bigint | null => {
  const t = String(s ?? "").trim();
  if (!/^\d{1,15}(\.\d{1,8})?$/.test(t)) return null;
  const [i, f = ""] = t.split(".");
  return BigInt(i) * ONE + BigInt(f.padEnd(SCALE, "0"));
};
const fmtAmt = (n: bigint) => { const neg = n < 0n; const a = neg ? -n : n; const s = `${a / ONE}.${String(a % ONE).padStart(SCALE, "0")}`.replace(/\.?0+$/, ""); return (neg ? "-" : "") + (s || "0"); };

/* ---------------- coin / network config ---------------- */
type Net = { id: string; label: string; fee: string; min: string; memo?: boolean };
const NETS: Record<string, Net> = {
  BTC: { id: "BTC", label: "Bitcoin", fee: "0.0001", min: "0.0005" },
  ETH: { id: "ETH", label: "Ethereum (ERC20)", fee: "0.002", min: "0.01" },
  BSC: { id: "BSC", label: "BNB Smart Chain (BEP20)", fee: "0.0005", min: "0.01" },
  TRX: { id: "TRX", label: "Tron (TRC20)", fee: "1", min: "10" },
  SOL: { id: "SOL", label: "Solana", fee: "0.01", min: "0.05" },
  LTC: { id: "LTC", label: "Litecoin", fee: "0.001", min: "0.01" },
  DOGE: { id: "DOGE", label: "Dogecoin", fee: "4", min: "20" },
};
// per-coin overrides of fee/min for tokens that ride on a shared network
const COINS: Record<string, { name: string; nets: Record<string, { fee: string; min: string }> }> = {
  BTC: { name: "Bitcoin", nets: { BTC: { fee: "0.0001", min: "0.0005" } } },
  ETH: { name: "Ethereum", nets: { ETH: { fee: "0.002", min: "0.01" } } },
  USDT: { name: "Tether", nets: { TRX: { fee: "1", min: "10" }, BSC: { fee: "0.8", min: "10" }, ETH: { fee: "4", min: "20" }, SOL: { fee: "1", min: "10" } } },
  BNB: { name: "BNB", nets: { BSC: { fee: "0.0005", min: "0.01" } } },
  SOL: { name: "Solana", nets: { SOL: { fee: "0.01", min: "0.05" } } },
  LTC: { name: "Litecoin", nets: { LTC: { fee: "0.001", min: "0.01" } } },
  DOGE: { name: "Dogecoin", nets: { DOGE: { fee: "4", min: "20" } } },
};

/* ---------------- address validation ---------------- */
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58decode(s: string): Buffer | null {
  if (!s) return null;
  let n = 0n;
  for (const ch of s) { const i = B58.indexOf(ch); if (i < 0) return null; n = n * 58n + BigInt(i); }
  let hex = n.toString(16); if (hex.length % 2) hex = "0" + hex;
  const body = n === 0n ? Buffer.alloc(0) : Buffer.from(hex, "hex");
  let z = 0; while (z < s.length && s[z] === "1") z++;
  return Buffer.concat([Buffer.alloc(z), body]);
}
const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest();
function b58check(s: string): Buffer | null {
  const d = b58decode(s); if (!d || d.length < 5) return null;
  const p = d.subarray(0, -4), c = d.subarray(-4);
  return sha(sha(p)).subarray(0, 4).equals(c) ? p : null;
}
const CH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function bech32ok(addr: string, hrp: string): boolean {
  if (addr !== addr.toLowerCase() && addr !== addr.toUpperCase()) return false;
  const a = addr.toLowerCase(); const pos = a.lastIndexOf("1");
  if (pos < 1 || a.slice(0, pos) !== hrp || a.length - pos - 1 < 6 || a.length > 90) return false;
  const data: number[] = [];
  for (const ch of a.slice(pos + 1)) { const i = CH.indexOf(ch); if (i < 0) return false; data.push(i); }
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  const vals = [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31), ...data];
  let chk = 1;
  for (const v of vals) { const b = chk >>> 25; chk = ((chk & 0x1ffffff) << 5) ^ v; for (let i = 0; i < 5; i++) if ((b >>> i) & 1) chk ^= G[i]; }
  chk >>>= 0;
  return chk === 1 || chk === 0x2bc830a3; // bech32 or bech32m
}
export function validateAddress(net: string, raw: string): string | null {
  const a = raw.trim();
  if (!a || a.length > 100 || /\s/.test(a)) return "Address khaali ya galat format me hai";
  switch (net) {
    case "ETH": case "BSC":
      if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return "EVM address 0x se shuru hokar 40 hex characters ka hona chahiye";
      if (/^0x0{40}$/i.test(a)) return "Ye burn address hai, yaha coins kabhi wapas nahi aate";
      return null;
    case "BTC": { const p = b58check(a); if (bech32ok(a, "bc") || (p && p.length === 21 && (p[0] === 0x00 || p[0] === 0x05))) return null; return "Valid Bitcoin address nahi hai (checksum fail)"; }
    case "LTC": { const p = b58check(a); if (bech32ok(a, "ltc") || (p && p.length === 21 && (p[0] === 0x30 || p[0] === 0x32 || p[0] === 0x05))) return null; return "Valid Litecoin address nahi hai (checksum fail)"; }
    case "DOGE": { const p = b58check(a); return p && p.length === 21 && (p[0] === 0x1e || p[0] === 0x16) ? null : "Valid Dogecoin address nahi hai (checksum fail)"; }
    case "TRX": { const p = b58check(a); return p && p.length === 21 && p[0] === 0x41 ? null : "Valid Tron address nahi hai (T se shuru, checksum fail)"; }
    case "SOL": { const d = b58decode(a); return d && d.length === 32 ? null : "Valid Solana address nahi hai (32-byte key chahiye)"; }
    default: return "Network supported nahi hai";
  }
}

/* ---------------- per-user demo state ---------------- */
type Saved = { id: string; label: string; network: string; address: string; memo?: string; createdAt: number; activeAt: number };
type Tx = { id: string; coin: string; network: string; amount: bigint; fee: bigint; to: string; label: string; status: "awaiting_otp" | "completed" | "cancelled" | "expired" | "failed"; createdAt: number; note?: string; txHash?: string; explorerUrl?: string };
type User = { bal: Map<string, bigint>; book: Saved[]; txs: Tx[]; otp: Map<string, { hash: string; exp: number; tries: number; sent: number }> };
export const users = new Map<string, User>();
const COOLDOWN = Math.max(0, Number(process.env.WHITELIST_COOLDOWN_MIN ?? 0)) * 60_000; // real exchanges use 24h (1440)
const seed = (): [string, string][] => [["BTC", "0.0124"], ["ETH", "0.84"], ["USDT", "320"], ["SOL", "12"], ["BNB", "1.5"], ["DOGE", "500"], ["LTC", "2"]];
const get = (id: string): User => {
  let u = users.get(id);
  if (!u) { u = { bal: new Map(seed().map(([c, v]) => [c, parseAmt(v)!])), book: [], txs: [], otp: new Map() }; users.set(id, u); }
  return u;
};
const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const view = (t: Tx) => ({ id: t.id, coin: t.coin, network: t.network, amount: fmtAmt(t.amount), fee: fmtAmt(t.fee), to: t.to, label: t.label, status: t.status, createdAt: t.createdAt, note: t.note, txHash: t.txHash, explorerUrl: t.explorerUrl, simulated: !t.txHash });
const uid = (req: any): string => req.userEmail;

r.get("/wallet/config", (_q, res) => res.json({ demo: true, whitelistCooldownMin: COOLDOWN / 60_000, networks: NETS, coins: COINS }));

r.get("/wallet/balances", (req, res) => {
  const u = get(uid(req));
  const held = new Map<string, bigint>();
  for (const t of u.txs) if (t.status === "awaiting_otp") held.set(t.coin, (held.get(t.coin) ?? 0n) + t.amount + t.fee);
  res.json([...u.bal.entries()].map(([coin, v]) => ({ coin, total: fmtAmt(v), locked: fmtAmt(held.get(coin) ?? 0n), available: fmtAmt(v - (held.get(coin) ?? 0n)) })));
});

r.get("/wallet/addresses", (req, res) => res.json(get(uid(req)).book.map((a) => ({ ...a, active: Date.now() >= a.activeAt }))));

r.post("/wallet/addresses", (req, res) => {
  const u = get(uid(req));
  const label = String(req.body?.label ?? "").trim(), network = String(req.body?.network ?? ""), address = String(req.body?.address ?? "").trim();
  const memo = String(req.body?.memo ?? "").trim().slice(0, 40);
  if (label.length < 1 || label.length > 40) return res.status(400).json({ error: "Label 1 se 40 characters ka rakho" });
  if (!NETS[network]) return res.status(400).json({ error: "Network chuno" });
  const bad = validateAddress(network, address);
  if (bad) return res.status(400).json({ error: bad });
  const key = network === "ETH" || network === "BSC" ? address.toLowerCase() : address;
  if (u.book.some((a) => a.network === network && (network === "ETH" || network === "BSC" ? a.address.toLowerCase() : a.address) === key)) return res.status(409).json({ error: "Ye address is network par pehle se saved hai" });
  if (u.book.length >= 50) return res.status(400).json({ error: "Maximum 50 addresses save kar sakte ho" });
  const now = Date.now();
  const a: Saved = { id: crypto.randomUUID(), label, network, address, memo: memo || undefined, createdAt: now, activeAt: now + COOLDOWN };
  u.book.push(a);
  res.status(201).json({ ...a, active: COOLDOWN === 0 });
});

r.delete("/wallet/addresses/:id", (req, res) => {
  const u = get(uid(req)); const i = u.book.findIndex((a) => a.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: "Address nahi mila" });
  if (u.txs.some((t) => t.status === "awaiting_otp" && t.to === u.book[i].address)) return res.status(409).json({ error: "Is address par ek transfer pending hai, pehle use confirm ya cancel karo" });
  u.book.splice(i, 1); res.json({ ok: true });
});

r.get("/wallet/transfers", (req, res) => {
  const u = get(uid(req)); const now = Date.now();
  for (const t of u.txs) if (t.status === "awaiting_otp" && now - t.createdAt > 5 * 60_000) { t.status = "expired"; u.otp.delete(t.id); }
  res.json([...u.txs].reverse().slice(0, 100).map(view));
});

r.post("/wallet/transfer/init", async (req, res) => {
  const me = uid(req), u = get(me);
  const coin = String(req.body?.coin ?? ""), network = String(req.body?.network ?? "");
  const cfg = COINS[coin]?.nets[network];
  if (!cfg) return res.status(400).json({ error: `${coin || "Coin"} is network par supported nahi hai` });
  const saved = u.book.find((a) => a.id === req.body?.addressId);
  if (!saved) return res.status(400).json({ error: "Pehle address book se recipient chuno" });
  if (saved.network !== network) return res.status(400).json({ error: `Ye address ${saved.network} network ka hai, aapne ${network} chuna. Galat network se coins kho sakte hain.` });
  if (Date.now() < saved.activeAt) return res.status(403).json({ error: `Naya address ${Math.ceil((saved.activeAt - Date.now()) / 60_000)} minute baad use hoga (security cooldown)` });
  const amount = parseAmt(req.body?.amount);
  if (amount === null || amount <= 0n) return res.status(400).json({ error: "Amount sahi number me daalo (max 8 decimals)" });
  if (amount < parseAmt(cfg.min)!) return res.status(400).json({ error: `Minimum transfer ${cfg.min} ${coin} hai` });
  const fee = parseAmt(cfg.fee)!;
  const held = u.txs.filter((t) => t.status === "awaiting_otp" && t.coin === coin).reduce((a, t) => a + t.amount + t.fee, 0n);
  const avail = (u.bal.get(coin) ?? 0n) - held;
  if (amount + fee > avail) return res.status(400).json({ error: `Balance kam hai. Available ${fmtAmt(avail < 0n ? 0n : avail)} ${coin}, chahiye ${fmtAmt(amount + fee)} (fee ${cfg.fee} ke saath)` });
  if (u.txs.filter((t) => t.status === "awaiting_otp").length >= 5) return res.status(429).json({ error: "Bahut saare pending transfers hain, pehle unhe confirm ya cancel karo" });

  const tx: Tx = { id: crypto.randomUUID(), coin, network, amount, fee, to: saved.address, label: saved.label, status: "awaiting_otp", createdAt: Date.now() };
  const code = String(crypto.randomInt(100000, 1000000));
  u.otp.set(tx.id, { hash: hash(code), exp: Date.now() + 5 * 60_000, tries: 0, sent: Date.now() });
  u.txs.push(tx);
  try {
    const real = await deliverOtp(me, me.includes("@") ? "email" : "phone", code, "transfer");
    res.status(201).json({ transfer: view(tx), otpSentTo: me, dev: !real });
  } catch {
    tx.status = "failed"; tx.note = "OTP send nahi ho paya"; u.otp.delete(tx.id);
    res.status(502).json({ error: "OTP send nahi ho paya, thodi der baad try karo" });
  }
});

r.post("/wallet/transfer/confirm", async (req, res) => {
  const u = get(uid(req)); const tx = u.txs.find((t) => t.id === req.body?.transferId);
  if (!tx) return res.status(404).json({ error: "Transfer nahi mila" });
  if (tx.status !== "awaiting_otp") return res.status(409).json({ error: `Ye transfer pehle se ${tx.status} hai` });
  const o = u.otp.get(tx.id);
  if (!o || Date.now() > o.exp) { tx.status = "expired"; u.otp.delete(tx.id); return res.status(400).json({ error: "OTP expire ho gaya, naya transfer shuru karo" }); }
  if (++o.tries > 5) { tx.status = "failed"; tx.note = "Bahut zyada galat OTP"; u.otp.delete(tx.id); return res.status(429).json({ error: "Bahut zyada galat OTP. Transfer cancel ho gaya." }); }
  const code = String(req.body?.code ?? "").trim();
  if (!/^\d{6}$/.test(code) || !crypto.timingSafeEqual(Buffer.from(hash(code)), Buffer.from(o.hash))) return res.status(400).json({ error: `Galat OTP (${6 - o.tries} koshish baaki)` });
  const bal = u.bal.get(tx.coin) ?? 0n;
  if (bal < tx.amount + tx.fee) { tx.status = "failed"; tx.note = "Balance kam"; u.otp.delete(tx.id); return res.status(400).json({ error: "Balance kam ho gaya, transfer fail" }); }

  let onchain: { txHash: string; explorerUrl: string } | null = null;
  try { onchain = await settle(tx.coin, tx.network, tx.to, fmtAmt(tx.amount)); }
  catch (e: any) { tx.status = "failed"; tx.note = e.message; u.otp.delete(tx.id); return res.status(502).json({ error: `On-chain send fail hua: ${e.message}` }); }

  u.bal.set(tx.coin, bal - tx.amount - tx.fee);
  tx.status = "completed"; u.otp.delete(tx.id);
  if (onchain) { tx.txHash = onchain.txHash; tx.explorerUrl = onchain.explorerUrl; tx.note = "Real testnet transaction - koi real paisa/value nahi, verify karo explorer par"; }
  else tx.note = "Paper transfer: is coin/network ke liye on-chain execution abhi wired nahi hai";
  res.json({ transfer: view(tx) });
});

r.post("/wallet/transfer/cancel", (req, res) => {
  const u = get(uid(req)); const tx = u.txs.find((t) => t.id === req.body?.transferId);
  if (!tx) return res.status(404).json({ error: "Transfer nahi mila" });
  if (tx.status !== "awaiting_otp") return res.status(409).json({ error: `Ye transfer pehle se ${tx.status} hai` });
  tx.status = "cancelled"; u.otp.delete(tx.id); res.json({ transfer: view(tx) });
});

export default r;
