/**
 * Durable storage for the in-memory state (sessions, wallet, paper ledger, pending payments).
 *
 * How it works (so business-logic files need almost no change):
 *   1. On boot every collection is LOADED from the backend into the existing in-memory Map.
 *   2. Every FLUSH_MS (default 3s) changed entries are written back (only the documents whose JSON changed).
 *   3. On SIGTERM/SIGINT a final flush runs. `flushNow()` can be awaited after money-critical actions.
 *
 * Backends:  Firebase Firestore (production)  |  JSON file (local testing, STORE_FILE=./data.json)  |  none (memory only, dev)
 * Firestore is only reached from this server (Admin SDK) - the phone app never talks to it directly.
 */
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import { logger } from "./logger";

type Doc = { id: string; data: string };
interface Backend {
  name: string;
  load(col: string): Promise<Doc[]>;
  write(col: string, upserts: Doc[], deletes: string[]): Promise<void>;
}

/* ---- JSON with Map / Set / BigInt support ---- */
const replacer = (_k: string, v: any) =>
  v instanceof Map ? { __t: "Map", v: [...v.entries()] }
  : v instanceof Set ? { __t: "Set", v: [...v.values()] }
  : typeof v === "bigint" ? { __t: "big", v: v.toString() }
  : v;
const reviver = (_k: string, v: any) =>
  v && typeof v === "object" && v.__t === "Map" ? new Map(v.v)
  : v && typeof v === "object" && v.__t === "Set" ? new Set(v.v)
  : v && typeof v === "object" && v.__t === "big" ? BigInt(v.v)
  : v;
export const encode = (v: unknown) => JSON.stringify(v, replacer);
export const decode = (s: string) => JSON.parse(s, reviver);

/* ---- backends ---- */
async function firestoreBackend(): Promise<Backend | null> {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  const file = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!b64 && !file) return null;
  const { initializeApp, cert, applicationDefault, getApps } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  if (!getApps().length) {
    initializeApp({ credential: b64 ? cert(JSON.parse(Buffer.from(b64, "base64").toString("utf8"))) : applicationDefault() });
  }
  const db = getFirestore();
  const prefix = process.env.FIRESTORE_PREFIX || "tv_";
  return {
    name: "firestore",
    async load(col) {
      const snap = await db.collection(prefix + col).get();
      return snap.docs.map((d) => ({ id: d.id, data: String(d.get("data") ?? "null") }));
    },
    async write(col, upserts, deletes) {
      const ref = db.collection(prefix + col);
      const ops = [...upserts.map((u) => ({ u })), ...deletes.map((id) => ({ id }))];
      for (let i = 0; i < ops.length; i += 400) {            // Firestore batch limit is 500
        const batch = db.batch();
        for (const o of ops.slice(i, i + 400)) {
          if ("u" in o) batch.set(ref.doc(o.u!.id), { data: o.u!.data, updatedAt: Date.now() });
          else batch.delete(ref.doc(o.id!));
        }
        await batch.commit();
      }
    },
  };
}

function fileBackend(path: string): Backend {
  let cache: Record<string, Record<string, string>> | null = null;
  const read = async () => (cache ??= await fs.readFile(path, "utf8").then(JSON.parse, () => ({})));
  return {
    name: `file:${path}`,
    async load(col) { const all = await read(); return Object.entries(all[col] ?? {}).map(([id, data]) => ({ id, data: String(data) })); },
    async write(col, upserts, deletes) {
      const all = await read(); const c = (all[col] ??= {});
      for (const u of upserts) c[u.id] = u.data;
      for (const id of deletes) delete c[id];
      await fs.writeFile(path + ".tmp", JSON.stringify(all)); await fs.rename(path + ".tmp", path);
    },
  };
}

/* ---- collections ---- */
type Coll = { col: string; map: Map<string, any>; ser?: (v: any) => any; seen: Map<string, string> };
const colls: Coll[] = [];
let backend: Backend | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let flushing: Promise<void> = Promise.resolve();

/** Register a Map to be persisted. `ser` can strip fields that must not be stored (e.g. OTP hashes). */
export function persist(col: string, map: Map<string, any>, ser?: (v: any) => any) { colls.push({ col, map, ser, seen: new Map() }); }

async function flushOnce() {
  if (!backend) return;
  for (const c of colls) {
    const upserts: Doc[] = [], deletes: string[] = [];
    for (const [k, v] of c.map) {
      const data = encode(c.ser ? c.ser(v) : v);
      if (c.seen.get(k) !== data) upserts.push({ id: k, data });
    }
    for (const k of c.seen.keys()) if (!c.map.has(k)) deletes.push(k);
    if (!upserts.length && !deletes.length) continue;
    try {
      await backend.write(c.col, upserts, deletes);
      for (const u of upserts) c.seen.set(u.id, u.data);
      for (const k of deletes) c.seen.delete(k);
    } catch (err) { logger.error({ err, col: c.col }, "store flush failed - will retry"); }
  }
}
/** Writes all pending changes now. Await it after money-critical changes (payment credit). */
export const flushNow = (): Promise<void> => (flushing = flushing.then(flushOnce, flushOnce));

export async function initStore() {
  backend = await firestoreBackend();
  if (!backend && process.env.STORE_FILE) backend = fileBackend(process.env.STORE_FILE);
  if (!backend) { logger.warn("No FIREBASE_SERVICE_ACCOUNT_B64 / STORE_FILE set: data is kept in MEMORY only and is lost on restart."); return; }
  // If loading fails we must NOT start: an empty map would later overwrite good data.
  for (const c of colls) {
    const docs = await backend.load(c.col);
    for (const d of docs) { c.map.set(d.id, decode(d.data)); c.seen.set(d.id, d.data); }
    logger.info({ col: c.col, docs: docs.length, backend: backend.name }, "store loaded");
  }
  timer = setInterval(() => void flushNow(), Number(process.env.STORE_FLUSH_MS || 3000));
  timer.unref();
  const bye = () => void flushNow().finally(() => process.exit(0));
  process.once("SIGTERM", bye); process.once("SIGINT", bye);
}
