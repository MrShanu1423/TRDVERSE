import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Bell, LogOut, Moon, Search, Sun, X } from 'lucide-react';
import { useListAssets } from '@workspace/api-client-react';
import type { MarketAsset, Order } from '@workspace/api-client-react';
import { logout } from '@/components/auth-gate';

export type PageLink = { href: string; label: string };
type Theme = 'light' | 'dark';

const THEME_EVENT = 'tv_theme_change';

/** Theme is set synchronously in index.html (before paint) to avoid a flash; this just mirrors/toggles it.
 * Multiple ThemeToggle instances can be mounted at once (e.g. login screen), so a custom event keeps every
 * instance's local state in sync instead of each one drifting independently. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'));
  useEffect(() => {
    const onChange = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener(THEME_EVENT, onChange);
    return () => window.removeEventListener(THEME_EVENT, onChange);
  }, []);
  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('tv_theme', next); } catch {}
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }));
  };
  return { theme, toggle };
}

export function ThemeToggle({ className = 'icon-btn' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button className={className} onClick={toggle} aria-label={theme === 'light' ? 'Dark mode on karo' : 'Light mode on karo'} data-testid="button-theme-toggle">
      {theme === 'light' ? <Moon /> : <Sun />}
    </button>
  );
}

/** Logged-in identity from the session token. Falls back to a neutral label, never a fake name. */
export function useMe() {
  const [id, setId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    let dead = false;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${localStorage.getItem('tv_session')}` } })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (!dead && j?.id) { setId(j.id); setIsOwner(!!j.isOwner); } }).catch(() => {});
    return () => { dead = true; };
  }, []);
  const label = !id ? 'Your account' : id.includes('@') ? id : `+91 ${id.replace(/^\+?91/, '').replace(/(\d{2})\d{6}(\d{2})/, '$1••••••$2')}`;
  const initials = !id ? 'TV' : id.includes('@') ? id.slice(0, 2).toUpperCase() : id.slice(-2);
  return { id, label, initials, isOwner };
}

export function LogoutButton({ className = 'btn btn-secondary' }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return; setBusy(true);
    try { await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('tv_session')}` } }); } catch { /* still log out locally */ }
    logout();
  };
  return <button className={className} onClick={go} disabled={busy}><LogOut size={14} /> {busy ? 'Signing out…' : 'Sign out'}</button>;
}

export function GlobalSearch({ pages, autoFocus = false, onDone }: { pages: PageLink[]; autoFocus?: boolean; onDone?: () => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [, setLocation] = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const term = q.trim();
  const assetsQuery = useListAssets({ category: 'all', search: term || undefined, sort: 'popular' });
  const assets = ((assetsQuery.data as MarketAsset[] | undefined) ?? []).slice(0, 6);
  const pageHits = term ? pages.filter((p) => p.label.toLowerCase().includes(term.toLowerCase())).slice(0, 4) : [];
  const items: { key: string; label: string; sub: string; href: string }[] = [
    ...pageHits.map((p) => ({ key: `p${p.href}`, label: p.label, sub: 'Page', href: p.href })),
    ...(term ? assets.map((a) => ({ key: `a${a.symbol}`, label: `${a.name} (${a.symbol})`, sub: a.category, href: `/markets/${a.symbol}` })) : []),
  ];
  const pick = (href: string) => { setLocation(href); setQ(''); setOpen(false); input.current?.blur(); onDone?.(); };

  useEffect(() => { setCursor(0); }, [term]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus(); setOpen(true); } };
    const click = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', down); document.addEventListener('mousedown', click);
    return () => { window.removeEventListener('keydown', down); document.removeEventListener('mousedown', click); };
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); input.current?.blur(); onDone?.(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter' && items[cursor]) pick(items[cursor].href);
  };
  return (
    <div className="global-search" ref={ref} style={{ position: 'relative' }}>
      <Search size={15} />
      <input ref={input} autoFocus={autoFocus} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
        placeholder="Search stocks, crypto, pages…" aria-label="Search markets" role="combobox" aria-expanded={open && !!term} />
      {q ? <button className="link-button" aria-label="Clear search" onClick={() => { setQ(''); input.current?.focus(); }}><X size={13} /></button> : <kbd>⌘ K</kbd>}
      {open && term && (
        <div className="card" role="listbox" style={{ position: 'absolute', top: 44, left: 0, right: 0, zIndex: 50, padding: 6, maxHeight: 340, overflowY: 'auto' }}>
          {assetsQuery.isLoading && !items.length ? <p className="subtle" style={{ margin: 8 }}>Searching…</p>
            : !items.length ? <p className="subtle" style={{ margin: 8 }}>"{term}" ke liye kuch nahi mila</p>
            : items.map((it, i) => (
              <button key={it.key} role="option" aria-selected={i === cursor} onMouseEnter={() => setCursor(i)} onClick={() => pick(it.href)}
                className="row-btn" style={{ width: '100%', textAlign: 'left', background: i === cursor ? 'hsl(var(--muted))' : undefined }}>
                <span>{it.label}</span><span className="pill">{it.sub}</span>
              </button>))}
        </div>
      )}
    </div>
  );
}

type Note = { id: string; symbol: string; market: string; side: string; qty: number; price: number; createdAt: number };
type AlertNote = { id: string; symbol: string; condition: 'above' | 'below'; status: string; triggeredPrice?: number; triggeredAt: string | null };
/** Bell shows the user's latest real (paper-ledger) trades; each row opens that market's trade page. */
export function NotificationBell({ orders }: { orders: Order[] }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [alertNotes, setAlertNotes] = useState<AlertNote[]>([]);
  const [seen, setSeen] = useState<number>(() => Number(localStorage.getItem('tv_notif_seen') || 0));
  const [, setLocation] = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const load = () => {
    fetch('/api/trade/orders', { headers: { Authorization: `Bearer ${localStorage.getItem('tv_session')}` } }).then((r) => (r.ok ? r.json() : [])).then((j) => setNotes(Array.isArray(j) ? j : [])).catch(() => {});
    fetch('/api/alerts', { headers: { Authorization: `Bearer ${localStorage.getItem('tv_session')}` } }).then((r) => (r.ok ? r.json() : [])).then((j) => setAlertNotes(Array.isArray(j) ? j.filter((a: AlertNote) => a.status === 'triggered') : [])).catch(() => {});
  };
  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, []);
  const all = [...notes.map((n) => ({ ...n, ts: n.createdAt, href: `/live/${n.market}/${n.symbol}`, text: `${n.side === 'BUY' ? 'Bought' : 'Sold'} ${n.qty} ${n.symbol}`, sub: `₹${n.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })} · paper` })),
    ...alertNotes.map((a) => ({ id: a.id, ts: a.triggeredAt ? new Date(a.triggeredAt).getTime() : 0, href: `/live/crypto/${a.symbol}`, text: `${a.symbol} price alert`, sub: `${a.condition === 'above' ? 'Pahunch gaya' : 'Gir gaya'} ₹${(a.triggeredPrice ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` })),
    ...orders.map((o) => ({ id: o.id, ts: new Date(o.createdAt).getTime(), href: '/orders', text: `${o.side === 'buy' ? 'Bought' : 'Sold'} ${o.quantity} ${o.symbol}`, sub: `${o.orderType} · ${o.status} (demo)` }))].sort((a, b) => b.ts - a.ts);
  const unread = all.filter((n) => n.ts > seen).length;
  useEffect(() => {
    const click = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', click); window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', click); window.removeEventListener('keydown', esc); };
  }, []);
  const toggle = () => { setOpen((o) => !o); if (!open) load(); const now = Date.now(); setSeen(now); try { localStorage.setItem('tv_notif_seen', String(now)); } catch {} };
  const go = (href: string) => { setOpen(false); setLocation(href); };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'} aria-expanded={open} onClick={toggle} data-testid="button-notifications">
        <Bell />{unread > 0 && <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, background: '#EF4444', color: '#fff', fontSize: 10, display: 'grid', placeItems: 'center' }}>{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="card notif-pop" role="dialog" aria-label="Notifications">
          <strong>Notifications</strong>
          {!all.length ? <p className="subtle" style={{ margin: '10px 0 0' }}>Abhi kuch naya nahi. Trade karoge to update yaha dikhega.</p>
            : all.slice(0, 8).map((n) => (
              <button key={n.id} className="row-btn" style={{ width: '100%', textAlign: 'left' }} onClick={() => go(n.href)}>
                <span>{n.text}<br /><span className="subtle" style={{ fontSize: 11 }}>{n.sub} · {new Date(n.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span></span>
              </button>))}
          <button className="btn btn-secondary full" style={{ marginTop: 8 }} onClick={() => go('/live')}>Live markets kholo</button>
        </div>
      )}
    </div>
  );
}
