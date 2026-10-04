import { useCallback, useEffect, useState } from 'react';
import { ArrowUpFromLine, BookUser, History, Loader2, ShieldCheck, Trash2, Wallet } from 'lucide-react';

type Bal = { coin: string; total: string; locked: string; available: string };
type Saved = { id: string; label: string; network: string; address: string; memo?: string; active: boolean; activeAt: number };
type Tx = { id: string; coin: string; network: string; amount: string; fee: string; to: string; label: string; status: string; createdAt: number; note?: string; txHash?: string; explorerUrl?: string };
type Cfg = { demo: boolean; whitelistCooldownMin: number; networks: Record<string, { id: string; label: string }>; coins: Record<string, { name: string; nets: Record<string, { fee: string; min: string }> }> };

const api = async (method: string, path: string, body?: object) => {
  const r = await fetch(`/api/wallet${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('tv_session')}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { localStorage.removeItem('tv_session'); location.reload(); throw new Error('Session expire ho gaya, dobara login karo'); }
  if (!r.ok) throw new Error(j.error || 'Kuch galat hua, dobara try karo');
  return j;
};
const short = (a: string) => (a.length > 18 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);
const statusTone: Record<string, string> = { completed: 'positive', awaiting_otp: '', cancelled: '', expired: 'negative', failed: 'negative' };
const statusText: Record<string, string> = { completed: 'Completed', awaiting_otp: 'OTP pending', cancelled: 'Cancelled', expired: 'Expired', failed: 'Failed' };

export function WalletPage() {
  const [tab, setTab] = useState<'send' | 'book' | 'history'>('send');
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [bals, setBals] = useState<Bal[]>([]);
  const [book, setBook] = useState<Saved[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loadErr, setLoadErr] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [c, b, a, t] = await Promise.all([api('GET', '/config'), api('GET', '/balances'), api('GET', '/addresses'), api('GET', '/transfers')]);
      setCfg(c); setBals(b); setBook(a); setTxs(t); setLoadErr('');
    } catch (e) { setLoadErr((e as Error).message); }
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  return (
    <main className="page">
      <div className="page-heading"><div><p className="eyebrow">Crypto</p><h1>Wallet & transfers</h1>
        <p className="subtle product-intro">Kisi bhi exchange ya wallet ka address save karo, phir OTP se confirm karke transfer karo. Demo mode: asli coins kahin nahi jaate.</p></div></div>
      {loading ? <div className="card pad"><Loader2 size={16} className="spin" /> Loading…</div>
        : loadErr || !cfg ? <div className="card pad"><p className="negative">{loadErr || 'Wallet load nahi hua'}</p><button className="btn btn-secondary" onClick={() => { setLoading(true); refresh(); }}>Retry</button></div>
        : (
          <>
            <div className="card pad" style={{ marginBottom: 16 }}>
              <div className="grid3">{bals.map((b) => (
                <div key={b.coin} className="stat"><span className="subtle">{b.coin}</span><strong className="mono">{b.available}</strong>
                  {b.locked !== '0' && <small className="subtle">{b.locked} locked (pending)</small>}</div>))}</div>
            </div>
            <div className="segmented" style={{ maxWidth: 420, marginBottom: 16 }}>
              <button className={tab === 'send' ? 'on' : ''} onClick={() => setTab('send')}><ArrowUpFromLine size={14} /> Send</button>
              <button className={tab === 'book' ? 'on' : ''} onClick={() => setTab('book')}><BookUser size={14} /> Address book</button>
              <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}><History size={14} /> History</button>
            </div>
            {tab === 'send' && <SendForm cfg={cfg} bals={bals} book={book} onDone={refresh} goBook={() => setTab('book')} />}
            {tab === 'book' && <AddressBook cfg={cfg} book={book} onChange={refresh} />}
            {tab === 'history' && <HistoryList txs={txs} onChange={refresh} />}
          </>
        )}
    </main>
  );
}

function SendForm({ cfg, bals, book, onDone, goBook }: { cfg: Cfg; bals: Bal[]; book: Saved[]; onDone: () => Promise<void>; goBook: () => void }) {
  const coins = Object.keys(cfg.coins);
  const [coin, setCoin] = useState(coins[0]);
  const nets = Object.keys(cfg.coins[coin].nets);
  const [network, setNetwork] = useState(nets[0]);
  const [addressId, setAddressId] = useState('');
  const [amount, setAmount] = useState('');
  const [pending, setPending] = useState<{ id: string; sentTo: string; dev: boolean } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const onCoin = (c: string) => { setCoin(c); setNetwork(Object.keys(cfg.coins[c].nets)[0]); setAddressId(''); };
  const usable = book.filter((a) => a.network === network);
  const conf = cfg.coins[coin].nets[network];
  const avail = bals.find((b) => b.coin === coin)?.available ?? '0';
  const picked = usable.find((a) => a.id === addressId);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); setOk(''); try { await fn(); } catch (e) { setErr((e as Error).message); } setBusy(false); };

  const init = () => run(async () => {
    const j = await api('POST', '/transfer/init', { coin, network, addressId, amount: amount.trim() });
    setPending({ id: j.transfer.id, sentTo: j.otpSentTo, dev: !!j.dev }); setCode(''); await onDone();
  });
  const confirm = () => run(async () => {
    await api('POST', '/transfer/confirm', { transferId: pending!.id, code });
    setOk(`${amount} ${coin} ka demo transfer complete hua.`); setPending(null); setAmount(''); await onDone();
  });
  const cancel = () => run(async () => { await api('POST', '/transfer/cancel', { transferId: pending!.id }); setPending(null); await onDone(); });

  if (pending) return (
    <div className="card pad" style={{ maxWidth: 480 }}>
      <h2><ShieldCheck size={16} /> OTP se confirm karo</h2>
      <p className="subtle">{pending.dev ? 'Dev mode: OTP server log me print hua hai (SMTP/SMS configure nahi hai).' : `6-digit OTP ${pending.sentTo} par bheja gaya.`}</p>
      <p>{amount} {coin} → <strong>{picked?.label}</strong> <span className="subtle mono">{picked && short(picked.address)}</span></p>
      <label className="field"><span>OTP</span><input className="input mono" inputMode="numeric" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="••••••" /></label>
      {err && <p className="negative" role="alert">{err}</p>}
      <div className="quick-row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" disabled={busy || code.length !== 6} onClick={confirm}>{busy ? 'Wait…' : 'Confirm transfer'}</button>
        <button className="btn btn-secondary" disabled={busy} onClick={cancel}>Cancel</button>
      </div>
    </div>
  );

  const fee = Number(conf.fee), amt = Number(amount);
  return (
    <div className="card pad" style={{ maxWidth: 520 }}>
      <div className="form-row">
        <label className="field"><span>Coin</span><select className="select" value={coin} onChange={(e) => onCoin(e.target.value)}>{coins.map((c) => <option key={c} value={c}>{c} — {cfg.coins[c].name}</option>)}</select></label>
        <label className="field"><span>Network</span><select className="select" value={network} onChange={(e) => { setNetwork(e.target.value); setAddressId(''); }}>{nets.map((n) => <option key={n} value={n}>{cfg.networks[n]?.label ?? n}</option>)}</select></label>
      </div>
      <label className="field" style={{ marginTop: 12 }}><span>Recipient (saved address)</span>
        <select className="select" value={addressId} onChange={(e) => setAddressId(e.target.value)}>
          <option value="">{usable.length ? 'Address chuno' : `Koi ${network} address saved nahi`}</option>
          {usable.map((a) => <option key={a.id} value={a.id} disabled={!a.active}>{a.label} — {short(a.address)}{a.active ? '' : ' (cooldown)'}</option>)}
        </select></label>
      {!usable.length && <p className="subtle" style={{ marginTop: 6 }}>Pehle <button className="link-button" onClick={goBook}>Address book</button> me {network} network ka address add karo.</p>}
      <label className="field" style={{ marginTop: 12 }}><span>Amount ({coin}) — available {avail}</span>
        <input className="input mono" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} /></label>
      <p className="subtle" style={{ fontSize: 11 }}>Network fee {conf.fee} {coin} · Minimum {conf.min} {coin}{Number.isFinite(amt) && amt > 0 ? ` · Total debit ${+(amt + fee).toFixed(8)} ${coin}` : ''}</p>
      <p className="subtle" style={{ fontSize: 11 }}>Dhyan rakho: recipient ka network wahi ho jo yaha chuna hai, warna coins hamesha ke liye kho sakte hain.</p>
      {err && <p className="negative" role="alert">{err}</p>}
      {ok && <p className="positive" role="status">{ok}</p>}
      <button className="btn btn-primary" disabled={busy || !addressId || !amount} onClick={init}>{busy ? 'Wait…' : 'Continue'}</button>
    </div>
  );
}

function AddressBook({ cfg, book, onChange }: { cfg: Cfg; book: Saved[]; onChange: () => Promise<void> }) {
  const nets = Object.keys(cfg.networks);
  const [label, setLabel] = useState(''), [network, setNetwork] = useState(nets[0]), [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); try { await fn(); } catch (e) { setErr((e as Error).message); } setBusy(false); };
  const add = () => run(async () => { await api('POST', '/addresses', { label: label.trim(), network, address: address.trim() }); setLabel(''); setAddress(''); await onChange(); });
  const del = (id: string) => { if (!window.confirm('Ye address delete karna hai?')) return; run(async () => { await api('DELETE', `/addresses/${id}`); await onChange(); }); };
  return (
    <div className="two-col">
      <div className="card pad">
        <h2>Naya address</h2>
        <label className="field"><span>Label (jaise "Binance USDT")</span><input className="input" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <label className="field" style={{ marginTop: 10 }}><span>Network</span><select className="select" value={network} onChange={(e) => setNetwork(e.target.value)}>{nets.map((n) => <option key={n} value={n}>{cfg.networks[n].label}</option>)}</select></label>
        <label className="field" style={{ marginTop: 10 }}><span>Wallet / deposit address</span><input className="input mono" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={address} onChange={(e) => setAddress(e.target.value.trim())} /></label>
        <p className="subtle" style={{ fontSize: 11 }}>Address ka checksum check hota hai, galat ya typo wala address save nahi hoga.{cfg.whitelistCooldownMin > 0 ? ` Naya address ${cfg.whitelistCooldownMin} minute baad use ho paata hai.` : ''}</p>
        {err && <p className="negative" role="alert">{err}</p>}
        <button className="btn btn-primary" disabled={busy || !label.trim() || !address} onClick={add}>{busy ? 'Wait…' : 'Save address'}</button>
      </div>
      <div className="card pad">
        <h2>Saved addresses ({book.length})</h2>
        {!book.length ? <p className="subtle">Abhi koi address nahi. Left side se pehla address add karo.</p> : book.map((a) => (
          <div key={a.id} className="row-btn" style={{ cursor: 'default' }}>
            <span style={{ minWidth: 0 }}><strong>{a.label}</strong><br /><span className="subtle mono" style={{ fontSize: 11, wordBreak: 'break-all' }}>{a.address}</span></span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="pill">{a.network}</span>{!a.active && <span className="pill negative">cooldown</span>}
              <button className="btn btn-danger" aria-label={`Delete ${a.label}`} disabled={busy} onClick={() => del(a.id)}><Trash2 size={14} /></button></span>
          </div>))}
      </div>
    </div>
  );
}

function HistoryList({ txs, onChange }: { txs: Tx[]; onChange: () => Promise<void> }) {
  return (
    <div className="card pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2><Wallet size={16} /> Transfers</h2><button className="btn btn-secondary" onClick={() => onChange()}>Refresh</button></div>
      {!txs.length ? <p className="subtle">Abhi koi transfer nahi hua.</p> : txs.map((t) => (
        <div key={t.id} className="row-btn" style={{ cursor: 'default' }}>
          <span style={{ minWidth: 0 }}><strong>{t.amount} {t.coin}</strong> <span className="subtle">→ {t.label}</span><br /><span className="subtle mono" style={{ fontSize: 11 }}>{t.network} · fee {t.fee} · {short(t.to)} · {new Date(t.createdAt).toLocaleString('en-IN')}</span>{t.note && <><br /><span className="subtle" style={{ fontSize: 11 }}>{t.note}</span></>}{t.explorerUrl && <><br /><a href={t.explorerUrl} target="_blank" rel="noreferrer" className="link-button positive" style={{ fontSize: 11 }}>View real testnet tx ↗</a></>}</span>
          <span className={`pill ${statusTone[t.status] ?? ''}`}>{statusText[t.status] ?? t.status}</span>
        </div>))}
    </div>
  );
}
