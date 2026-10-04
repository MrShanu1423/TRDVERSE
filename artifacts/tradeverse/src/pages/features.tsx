import { Link } from 'wouter';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Rocket, Coins, Wallet, Calculator, Target, Landmark, Layers3, PiggyBank, ShieldAlert, Receipt, ArrowUpFromLine, Search, Loader2, FileText } from 'lucide-react';
import { apiJson, fmtInr } from '@/lib/live-feed';

const inr = (v: number) => (Number.isFinite(v) ? `₹${Math.round(v).toLocaleString('en-IN')}` : '₹—');
const Head = ({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) => (
  <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="subtle product-intro">{copy}</p></div></div>
);
function Num({ label, value, set, step = 1, suffix }: { label: string; value: number; set: (n: number) => void; step?: number; suffix?: string }) {
  return (
    <label className="field"><span>{label}{suffix ? ` (${suffix})` : ''}</span>
      <input className="input" type="number" value={value} step={step} min={0} onChange={(e) => set(Math.max(0, Number(e.target.value)))} /></label>
  );
}
const Stat = ({ k, v, tone }: { k: string; v: string; tone?: 'positive' | 'negative' }) => (
  <div className="stat"><span className="subtle">{k}</span><strong className={`mono ${tone || ''}`}>{v}</strong></div>
);

/* ---------- F&O: option chain with Black-Scholes Greeks ---------- */
const N = (x: number) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989423 * Math.exp((-x * x) / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; };
const pdf = (x: number) => 0.3989423 * Math.exp((-x * x) / 2);
function bs(S: number, K: number, T: number, iv: number, call: boolean, r = 0.065) {
  const sd = iv * Math.sqrt(T), d1 = (Math.log(S / K) + (r + (iv * iv) / 2) * T) / sd, d2 = d1 - sd;
  const price = call ? S * N(d1) - K * Math.exp(-r * T) * N(d2) : K * Math.exp(-r * T) * N(-d2) - S * N(-d1);
  return { price, delta: call ? N(d1) : N(d1) - 1, gamma: pdf(d1) / (S * sd), theta: (-(S * pdf(d1) * iv) / (2 * Math.sqrt(T)) - (call ? 1 : -1) * r * K * Math.exp(-r * T) * N(call ? d2 : -d2)) / 365, vega: (S * pdf(d1) * Math.sqrt(T)) / 100 };
}
export function FnoPage() {
  const [spot, setSpot] = useState(25487);
  const [days, setDays] = useState(7);
  const [iv, setIv] = useState(14);
  const [lot] = useState(75);
  const [pick, setPick] = useState<{ k: number; call: boolean } | null>(null);
  const rows = useMemo(() => {
    const atm = Math.round(spot / 50) * 50;
    return Array.from({ length: 13 }, (_, i) => atm + (i - 6) * 50).map((k) => ({ k, c: bs(spot, k, days / 365, iv / 100, true), p: bs(spot, k, days / 365, iv / 100, false) }));
  }, [spot, days, iv]);
  const sel = pick && rows.find((r) => r.k === pick.k);
  const leg = sel && (pick!.call ? sel.c : sel.p);
  const payoff = leg && Array.from({ length: 9 }, (_, i) => { const s = spot * (0.94 + i * 0.015); const intr = pick!.call ? Math.max(s - pick!.k, 0) : Math.max(pick!.k - s, 0); return { s, pnl: (intr - leg.price) * lot }; });
  return (
    <main className="page">
      <Head eyebrow="F&O" title="Option chain & Greeks" copy="NIFTY option chain with Delta, Gamma, Theta, Vega. Kisi bhi strike par click karke payoff dekho (paper mode, educational model)." />
      <div className="card pad form-row">
        <Num label="NIFTY spot" value={spot} set={setSpot} step={10} />
        <Num label="Days to expiry" value={days} set={(n) => setDays(Math.max(1, n))} />
        <Num label="IV" value={iv} set={(n) => setIv(Math.max(1, n))} suffix="%" />
        <Stat k="Lot size" v={String(lot)} />
      </div>
      <div className="card table-wrap">
        <table className="dtable chain">
          <thead><tr><th>Δ</th><th>Θ</th><th>Call LTP</th><th className="strike">Strike</th><th>Put LTP</th><th>Θ</th><th>Δ</th><th>Γ</th><th>Vega</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.k} className={Math.abs(r.k - spot) < 25 ? 'atm' : ''}>
              <td className="mono">{r.c.delta.toFixed(2)}</td><td className="mono negative">{r.c.theta.toFixed(1)}</td>
              <td><button className={`ltp ${pick?.k === r.k && pick.call ? 'on' : ''}`} onClick={() => setPick({ k: r.k, call: true })}>{r.c.price.toFixed(1)}</button></td>
              <td className="strike mono">{r.k}</td>
              <td><button className={`ltp ${pick?.k === r.k && !pick.call ? 'on' : ''}`} onClick={() => setPick({ k: r.k, call: false })}>{r.p.price.toFixed(1)}</button></td>
              <td className="mono negative">{r.p.theta.toFixed(1)}</td><td className="mono">{r.p.delta.toFixed(2)}</td>
              <td className="mono">{r.c.gamma.toFixed(4)}</td><td className="mono">{r.c.vega.toFixed(1)}</td>
            </tr>))}</tbody>
        </table>
      </div>
      {leg && payoff && (
        <div className="card pad" style={{ marginTop: 16 }}>
          <div className="section-header"><h2>Long {pick!.k} {pick!.call ? 'CE' : 'PE'} payoff at expiry</h2><span className="pill">Max loss {inr(leg.price * lot)}</span></div>
          <div className="payoff">{payoff.map((p) => (<div key={p.s} className="pbar"><span className={p.pnl >= 0 ? 'up' : 'down'} style={{ height: `${Math.min(100, Math.abs(p.pnl) / (leg.price * lot * 3) * 100)}%` }} /><em className="mono">{Math.round(p.s)}</em><b className={`mono ${p.pnl >= 0 ? 'positive' : 'negative'}`}>{inr(p.pnl)}</b></div>))}</div>
        </div>
      )}
    </main>
  );
}

/* ---------- IPO ---------- */
const ipos = [
  { n: 'Sample Infra Ltd', band: '₹210–221', lot: 67, size: '₹1,240 Cr', gmp: 38, open: 'Open now', sub: '14.2x' },
  { n: 'Demo Fintech Ltd', band: '₹95–100', lot: 150, size: '₹640 Cr', gmp: 12, open: 'Opens in 3 days', sub: '—' },
  { n: 'Example Pharma Ltd', band: '₹480–505', lot: 29, size: '₹2,100 Cr', gmp: -6, open: 'Closed · allotment soon', sub: '3.1x' },
];
export function IpoPage() {
  const [applied, setApplied] = useState<string[]>([]);
  return (
    <main className="page">
      <Head eyebrow="IPO" title="IPO & new issues" copy="Price band, lot size, GMP aur subscription ek jagah. Neeche sample data hai - NSE/BSE ka koi free public IPO API nahi hai, isliye real calendar ke liye paid data feed (jaise NSE's own licensed feed) chahiye hoga." />
      <div className="grid3">{ipos.map((i) => (
        <div key={i.n} className="card pad">
          <div className="section-header"><h3>{i.n}</h3><span className="pill">{i.open}</span></div>
          <Stat k="Price band" v={i.band} /><Stat k="Lot size" v={`${i.lot} shares`} /><Stat k="Issue size" v={i.size} /><Stat k="Subscription" v={i.sub} />
          <Stat k="GMP (indicative)" v={`${i.gmp >= 0 ? '+' : ''}₹${i.gmp}`} tone={i.gmp >= 0 ? 'positive' : 'negative'} />
          <button className="btn btn-primary full" disabled={!i.open.startsWith('Open now') || applied.includes(i.n)} onClick={() => setApplied([...applied, i.n])}>{applied.includes(i.n) ? 'UPI mandate sent (demo)' : 'Apply with UPI'}</button>
        </div>))}
      </div>
      <p className="subtle" style={{ marginTop: 14 }}>GMP unofficial hota hai aur galat ho sakta hai. Real IPO apply karne ke liye SEBI-registered broker + UPI integration chahiye.</p>
    </main>
  );
}

/* ---------- Mutual funds + SIP (real AMFI/NAV data via mfapi.in) ---------- */
type FundSearchHit = { schemeCode: number; schemeName: string };
type FundDetail = { schemeCode: number; schemeName: string; fundHouse: string; category: string; nav: number; navDate: string; return1y: number | null; return3y: number | null; return5y: number | null };
type Sip = { id: string; schemeCode: number; schemeName: string; amount: number; status: 'active' | 'cancelled'; createdAt: string };

function FundSearch({ onPick }: { onPick: (hit: FundSearchHit) => void }) {
  const [q, setQ] = useState(''); const [hits, setHits] = useState<FundSearchHit[]>([]); const [loading, setLoading] = useState(false); const [err, setErr] = useState('');
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) { setHits([]); return; }
    let dead = false; setLoading(true);
    const t = setTimeout(async () => {
      try { const j = await apiJson(`/api/funds/search?q=${encodeURIComponent(term)}`); if (!dead) { setHits(j.items); setErr(''); } }
      catch (e) { if (!dead) setErr((e as Error).message); }
      if (!dead) setLoading(false);
    }, 350);
    return () => { dead = true; clearTimeout(t); };
  }, [q]);
  return (
    <div>
      <label className="lm-search" style={{ marginBottom: 8 }}><Search size={15} /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Fund naam search karo (e.g. Nifty 50 Index, Flexi Cap)" /></label>
      {loading && <p className="subtle"><Loader2 size={14} className="spin" /> Dhoond rahe hain…</p>}
      {err && <p className="negative" style={{ fontSize: 12 }}>{err}</p>}
      {hits.length > 0 && <div className="card" style={{ maxHeight: 260, overflowY: 'auto' }}>
        {hits.map((h) => <button key={h.schemeCode} className="row-btn" style={{ width: '100%', textAlign: 'left' }} onClick={() => onPick(h)}>{h.schemeName}</button>)}
      </div>}
      {q.trim().length >= 3 && !loading && !hits.length && !err && <p className="subtle" style={{ fontSize: 12 }}>Kuch nahi mila "{q}" ke liye.</p>}
    </div>
  );
}

export function FundsPage() {
  const [picked, setPicked] = useState<FundDetail | null>(null);
  const [detailErr, setDetailErr] = useState('');
  const [sip, setSip] = useState(5000), [rate, setRate] = useState(12), [yrs, setYrs] = useState(10), [step, setStep] = useState(10);
  const [sips, setSips] = useState<Sip[]>([]);
  const [starting, setStarting] = useState(false); const [sipErr, setSipErr] = useState(''); const [sipOk, setSipOk] = useState('');
  const loadSips = useCallback(async () => { try { setSips(await apiJson('/api/funds/sips')); } catch { /* keep last known list */ } }, []);
  useEffect(() => { loadSips(); }, [loadSips]);
  const calc = useMemo(() => {
    let bal = 0, amt = sip, inv = 0;
    for (let y = 0; y < yrs; y++) { for (let m = 0; m < 12; m++) { bal = (bal + amt) * (1 + rate / 1200); inv += amt; } amt *= 1 + step / 100; }
    return { bal, inv };
  }, [sip, rate, yrs, step]);
  const pick = async (hit: FundSearchHit) => {
    setDetailErr(''); setPicked(null);
    try { setPicked(await apiJson(`/api/funds/${hit.schemeCode}`)); } catch (e) { setDetailErr((e as Error).message); }
  };
  const startSip = async () => {
    if (!picked) return;
    setStarting(true); setSipErr(''); setSipOk('');
    try { await apiJson('/api/funds/sip', { schemeCode: picked.schemeCode, schemeName: picked.schemeName, amount: sip }); setSipOk(`SIP shuru ho gaya - pehli installment ₹${sip.toLocaleString('en-IN')} debit ho gayi.`); await loadSips(); }
    catch (e) { setSipErr((e as Error).message); }
    setStarting(false);
  };
  const cancelSip = async (id: string) => { try { await apiJson(`/api/funds/sips/${id}/cancel`, {}); } catch { /* reflected on reload */ } await loadSips(); };
  const activeSips = sips.filter((s) => s.status === 'active');
  return (
    <main className="page">
      <Head eyebrow="Mutual funds" title="Funds, SIP & comparison" copy="Fund dhundo - real NAV aur trailing returns AMFI data se (mfapi.in). SIP calculator illustrative hai; 'Start SIP' pehli installment turant paper balance se debit karta hai." />
      <div className="two-col">
        <div className="card pad">
          <h2>Find a fund</h2>
          <FundSearch onPick={pick} />
          {detailErr && <p className="negative" style={{ fontSize: 12, marginTop: 8 }}>{detailErr}</p>}
          {picked && <div style={{ marginTop: 14, borderTop: '1px solid hsl(var(--border))', paddingTop: 14 }}>
            <strong>{picked.schemeName}</strong>
            <p className="subtle" style={{ fontSize: 12, margin: '2px 0 10px' }}>{picked.fundHouse} · {picked.category}</p>
            <div className="stats">
              <Stat k="NAV" v={`₹${picked.nav.toFixed(2)}`} />
              <Stat k="As of" v={picked.navDate} />
              <Stat k="1Y return" v={picked.return1y == null ? '—' : `${picked.return1y}%`} tone={picked.return1y != null && picked.return1y >= 0 ? 'positive' : 'negative'} />
              <Stat k="3Y return" v={picked.return3y == null ? '—' : `${picked.return3y}%`} tone={picked.return3y != null && picked.return3y >= 0 ? 'positive' : 'negative'} />
              <Stat k="5Y return" v={picked.return5y == null ? '—' : `${picked.return5y}%`} tone={picked.return5y != null && picked.return5y >= 0 ? 'positive' : 'negative'} />
            </div>
            {sipErr && <p className="negative" style={{ fontSize: 12, marginTop: 8 }}>{sipErr}</p>}
            {sipOk && <p className="positive" style={{ fontSize: 12, marginTop: 8 }}>{sipOk}</p>}
            <button className="btn btn-primary full" style={{ marginTop: 10 }} disabled={starting} onClick={startSip}>{starting ? 'Starting…' : `Start SIP · ₹${sip.toLocaleString('en-IN')}/month`}</button>
          </div>}
        </div>
        <div className="card pad">
          <h2>SIP calculator (step-up)</h2>
          <div className="form-row"><Num label="Monthly SIP" value={sip} set={setSip} step={500} /><Num label="Expected return" value={rate} set={setRate} suffix="% p.a." /><Num label="Years" value={yrs} set={setYrs} /><Num label="Yearly step-up" value={step} set={setStep} suffix="%" /></div>
          <div className="stats"><Stat k="Invested" v={inr(calc.inv)} /><Stat k="Est. returns" v={inr(calc.bal - calc.inv)} tone="positive" /><Stat k="Future value" v={inr(calc.bal)} /></div>
        </div>
      </div>
      {activeSips.length > 0 && <div className="card pad" style={{ marginTop: 16 }}>
        <h2>My SIPs</h2>
        {activeSips.map((s) => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid hsl(var(--border))' }}>
            <span>{s.schemeName}<br /><span className="subtle" style={{ fontSize: 12 }}>₹{s.amount.toLocaleString('en-IN')}/month · started {new Date(s.createdAt).toLocaleDateString('en-IN')}</span></span>
            <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => cancelSip(s.id)}>Cancel</button>
          </div>
        ))}
      </div>}
    </main>
  );
}

/* ---------- Earn + Wallet (persisted paper staking) ---------- */
type StakeProduct = { coin: string; apr: number; lockDays: number };
type StakePosition = { id: string; coin: string; amount: number; apr: number; lockDays: number; status: 'active' | 'unstaked'; accrued: number; createdAt: string; unlocksAt: string | null };

export function EarnPage() {
  const [products, setProducts] = useState<StakeProduct[]>([]);
  const [sel, setSel] = useState<StakeProduct | null>(null);
  const [amt, setAmt] = useState(5000);
  const [positions, setPositions] = useState<StakePosition[]>([]);
  const [tab, setTab] = useState<'earn' | 'wallet'>('earn');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const loadPositions = useCallback(async () => { try { setPositions(await apiJson('/api/earn/positions')); } catch { /* keep last known list */ } }, []);
  useEffect(() => { apiJson('/api/earn/products').then((p) => { setProducts(p); setSel(p[0] ?? null); }).catch(() => {}); loadPositions(); }, [loadPositions]);
  const stake = async () => {
    if (!sel) return;
    setBusy(true); setErr(''); setOk('');
    try { await apiJson('/api/earn/stake', { coin: sel.coin, amount: amt }); setOk(`₹${amt.toLocaleString('en-IN')} ${sel.coin} mein stake ho gaya.`); await loadPositions(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const unstake = async (id: string) => { setErr(''); try { await apiJson(`/api/earn/positions/${id}/unstake`, {}); } catch (e) { setErr((e as Error).message); } await loadPositions(); };
  const active = positions.filter((p) => p.status === 'active');
  return (
    <main className="page">
      <Head eyebrow="Crypto" title="Earn, staking & wallet" copy="Positions ab persist hote hain (refresh pe nahi ukhadte) - paper balance se stake hota hai, lock khatam hone par principal + accrued wapas credit hota hai. Real custody/yield nahi hai." />
      <div className="segmented" style={{ maxWidth: 260, marginBottom: 16 }}><button className={tab === 'earn' ? 'on' : ''} onClick={() => setTab('earn')}><Coins size={14} /> Earn</button><button className={tab === 'wallet' ? 'on' : ''} onClick={() => setTab('wallet')}><Wallet size={14} /> Wallet</button></div>
      {tab === 'earn' ? (
        <>
          <div className="two-col">
            <div className="card pad"><h2>Products</h2>{products.map((s) => (<button key={s.coin} className={`row-btn ${sel?.coin === s.coin ? 'on' : ''}`} onClick={() => setSel(s)}><strong>{s.coin}</strong><span className="subtle">{s.lockDays ? `${s.lockDays} days` : 'Flexible'}</span><span className="pill">{s.apr}% APR</span></button>))}</div>
            <div className="card pad"><h2>Stake</h2><Num label="Amount" value={amt} set={setAmt} step={500} suffix="₹" />{sel && <div className="stats"><Stat k="Monthly est." v={inr((amt * sel.apr) / 1200)} tone="positive" /><Stat k="1 year est." v={inr((amt * sel.apr) / 100)} tone="positive" /></div>}
              {err && <p className="negative" style={{ fontSize: 12 }}>{err}</p>}
              {ok && <p className="positive" style={{ fontSize: 12 }}>{ok}</p>}
              <button className="btn btn-primary full" style={{ marginTop: 8 }} disabled={busy || !sel} onClick={stake}>{busy ? 'Staking…' : `Stake ₹${amt.toLocaleString('en-IN')} ${sel?.coin ?? ''}`}</button>
              <p className="subtle" style={{ marginTop: 8 }}>APR variable hota hai; lock period mein withdraw nahi hota. Crypto gains par India mein 30% tax + 1% TDS lagta hai.</p>
            </div>
          </div>
          {active.length > 0 && <div className="card pad" style={{ marginTop: 16 }}>
            <h2>My positions</h2>
            {active.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid hsl(var(--border))' }}>
                <span><strong>{p.coin}</strong> · {inr(p.amount)} · {p.apr}% APR<br /><span className="subtle positive" style={{ fontSize: 12 }}>+{inr(p.accrued)} accrued so far</span></span>
                <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => unstake(p.id)}>{p.unlocksAt ? `Unstake (unlocks ${new Date(p.unlocksAt).toLocaleDateString('en-IN')})` : 'Unstake'}</button>
              </div>
            ))}
          </div>}
        </>
      ) : (
        <div className="card pad"><h2>Wallet</h2><p className="subtle">Balances, address book aur OTP-confirmed transfers ab alag Wallet page par hain. Deposit aur convert tabhi chalenge jab real custody/exchange provider connect hoga.</p>
          <div className="quick-row"><Link href="/wallet" className="btn btn-primary"><ArrowUpFromLine size={14} /> Open Wallet & transfers</Link></div></div>
      )}
    </main>
  );
}

/* ---------- Life tools ---------- */
type TaxBucket = { gain: number; loss: number; tax: number; exemption?: number };
type TaxReport = { stcg: TaxBucket; ltcg: TaxBucket; crypto: TaxBucket; totalTax: number; disclaimer: string };

function CapitalGainsCard() {
  const [report, setReport] = useState<TaxReport | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { apiJson('/api/trade/tax-report').then(setReport).catch((e) => setErr(e.message)); }, []);
  if (err) return <div className="card pad"><h2><FileText size={16} /> Capital gains (real trades)</h2><p className="negative" style={{ fontSize: 12 }}>{err}</p></div>;
  if (!report) return <div className="card pad"><h2><FileText size={16} /> Capital gains (real trades)</h2><Loader2 size={14} className="spin" /></div>;
  return (
    <div className="card pad">
      <h2><FileText size={16} /> Capital gains (real trades)</h2>
      <div className="stats">
        <Stat k="STCG (20%)" v={inr(report.stcg.gain)} tone={report.stcg.gain >= 0 ? 'positive' : 'negative'} />
        <Stat k="LTCG (12.5%, >₹1.25L)" v={inr(report.ltcg.gain)} tone={report.ltcg.gain >= 0 ? 'positive' : 'negative'} />
        <Stat k="Crypto (flat 30%)" v={inr(report.crypto.gain)} tone={report.crypto.gain >= 0 ? 'positive' : 'negative'} />
        <Stat k="Total tax owed" v={inr(report.totalTax)} tone="negative" />
      </div>
      <p className="subtle" style={{ marginTop: 8 }}>{report.disclaimer}</p>
    </div>
  );
}

export function ToolsPage() {
  const [loan, setLoan] = useState(2500000), [lr, setLr] = useState(8.5), [ly, setLy] = useState(20);
  const m = lr / 1200, n = ly * 12, emi = m ? (loan * m * (1 + m) ** n) / ((1 + m) ** n - 1) : loan / n;
  const [cost, setCost] = useState(1000000), [gy, setGy] = useState(5), [infl, setInfl] = useState(6), [gr, setGr] = useState(12);
  const fut = cost * (1 + infl / 100) ** gy, mr = gr / 1200, gn = gy * 12, need = fut * mr / (((1 + mr) ** gn - 1) * (1 + mr));
  const [exp, setExp] = useState(35000), [dep, setDep] = useState(2);
  const [inc, setInc] = useState(1200000);
  const taxable = Math.max(0, inc - 75000);
  const slabs: [number, number][] = [[400000, 0], [800000, 5], [1200000, 10], [1600000, 15], [2000000, 20], [2400000, 25], [Infinity, 30]];
  let tax = 0, lo = 0; for (const [hi, p] of slabs) { if (taxable > lo) tax += (Math.min(taxable, hi) - lo) * p / 100; lo = hi; }
  if (taxable <= 1200000) tax = 0;
  tax *= 1.04;
  return (
    <main className="page">
      <Head eyebrow="Life tools" title="Roz ki money problems ka solution" copy="EMI, goal planning, emergency fund aur income-tax estimate. Sab calculator device par chalte hain, koi data server ko nahi jata." />
      <div className="grid2">
        <div className="card pad"><h2><Landmark size={16} /> Loan EMI</h2><div className="form-row"><Num label="Loan" value={loan} set={setLoan} step={50000} suffix="₹" /><Num label="Rate" value={lr} set={setLr} step={0.1} suffix="%" /><Num label="Years" value={ly} set={setLy} /></div><div className="stats"><Stat k="Monthly EMI" v={inr(emi)} /><Stat k="Total interest" v={inr(emi * n - loan)} tone="negative" /></div></div>
        <div className="card pad"><h2><Target size={16} /> Goal planner</h2><div className="form-row"><Num label="Cost today" value={cost} set={setCost} step={50000} suffix="₹" /><Num label="Years" value={gy} set={setGy} /><Num label="Inflation" value={infl} set={setInfl} step={0.5} suffix="%" /><Num label="Return" value={gr} set={setGr} step={0.5} suffix="%" /></div><div className="stats"><Stat k="Future cost" v={inr(fut)} /><Stat k="Monthly SIP needed" v={inr(need)} tone="positive" /></div></div>
        <div className="card pad"><h2><ShieldAlert size={16} /> Emergency fund</h2><div className="form-row"><Num label="Monthly expenses" value={exp} set={setExp} step={1000} suffix="₹" /><Num label="Dependents" value={dep} set={setDep} /></div><div className="stats"><Stat k="Target (6–12 months)" v={`${inr(exp * (6 + Math.min(dep, 3) * 2))}`} /></div><p className="subtle">Dependents jitne zyada, utna bada buffer. Ye liquid fund ya savings account me rakho.</p></div>
        <div className="card pad"><h2><Receipt size={16} /> Income tax (new regime, estimate)</h2><div className="form-row"><Num label="Annual salary" value={inc} set={setInc} step={50000} suffix="₹" /></div><div className="stats"><Stat k="Est. tax + cess" v={inr(tax)} /><Stat k="Take-home / month" v={inr((inc - tax) / 12)} /></div><p className="subtle">FY 2025-26 slabs, ₹75k standard deduction aur 87A rebate ke saath. Ye sirf estimate hai, filing ke liye CA se confirm karo.</p></div>
        <CapitalGainsCard />
      </div>
    </main>
  );
}
