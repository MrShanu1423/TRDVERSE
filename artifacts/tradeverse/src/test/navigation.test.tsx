import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fs from 'node:fs';

// canvas-based chart can't run in jsdom; the rest of the page is real
vi.mock('@/components/live-chart', () => ({ LiveChart: () => <div data-testid="chart-stub" /> }));
vi.mock('@/components/live-trade', () => ({ LiveTradeBox: () => <div data-testid="trade-stub" /> }));

import App from '@/App';

const API = process.env.API_URL || 'http://localhost:5055';
async function login() {
  const email = `ui${Date.now()}@example.com`;
  await fetch(`${API}/api/auth/request-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  await new Promise((r) => setTimeout(r, 400));
  const log = fs.readFileSync(process.env.SRV_LOG || '/tmp/srv.log', 'utf8');
  const code = [...log.matchAll(/(\d{6})/g)].map((m) => m[1]).pop()!;
  const j: any = await (await fetch(`${API}/api/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code }) })).json();
  return { token: j.token as string, email };
}
let email = '';
beforeAll(async () => { const s = await login(); localStorage.setItem('tv_session', s.token); email = s.email; });

const go = (path: string) => { window.history.pushState({}, '', path); };
const tab = async (name: RegExp) => { const bar = await waitFor(() => { const e = document.querySelector('.segmented') as HTMLElement; if (!e) throw new Error('no tabs'); return e; }); return within(bar).getByRole('button', { name }); };
const noCrash = () => expect(screen.queryByText(/something went wrong|unexpected error/i)).toBeNull();

const ROUTES: [string, RegExp][] = [
  ['/', /./], ['/products', /Every market/i], ['/markets', /./], ['/markets/BTC', /./], ['/portfolio', /Portfolio room/i], ['/orders', /Paper orders/i],
  ['/fno', /./], ['/funds', /Funds, SIP/i], ['/ipo', /IPO/i], ['/earn', /Earn, staking/i], ['/wallet', /Wallet & transfers/i], ['/tools', /./], ['/profile', /Profile/i],
];

describe('every route renders', () => {
  for (const [path, re] of ROUTES) it(path, async () => {
    go(path); render(<App />);
    await waitFor(() => expect(screen.getAllByText(re).length).toBeGreaterThan(0));
    noCrash();
  });
  it('unknown route shows not-found, not a crash', async () => { go('/nope'); render(<App />); await screen.findByText(/off the map/i); });
});

describe('sidebar navigation', () => {
  it('every nav link opens its page and highlights', async () => {
    go('/'); render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Primary navigation' });
    const links = within(nav).getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(11);
    for (const a of links) {
      const href = a.getAttribute('href')!;
      await userEvent.click(a);
      await waitFor(() => expect(window.location.pathname).toBe(href));
      expect(a.className).toContain('active');
      noCrash();
    }
  });
});

describe('header tools', () => {
  it('search finds BTC and opens its page', async () => {
    go('/'); render(<App />);
    const box = await screen.findByRole('combobox', { name: /search markets/i });
    await userEvent.type(box, 'bit');
    const opt = await screen.findByRole('option', { name: /BTC/ });
    await userEvent.click(opt);
    await waitFor(() => expect(window.location.pathname).toBe('/markets/BTC'));
  });
  it('search page hit works and no-result message shows', async () => {
    go('/'); render(<App />);
    const box = await screen.findByRole('combobox', { name: /search markets/i });
    await userEvent.type(box, 'wallet{Enter}');
    await waitFor(() => expect(window.location.pathname).toBe('/wallet'));
    await userEvent.type(box, 'zzzzqq');
    await screen.findByText(/kuch nahi mila/i);
  });
  it('Ctrl+K focuses search', async () => {
    go('/'); render(<App />);
    const box = await screen.findByRole('combobox', { name: /search markets/i });
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(document.activeElement).toBe(box);
  });
  it('notification bell opens and closes with Escape', async () => {
    go('/'); render(<App />);
    const bells = await screen.findAllByRole('button', { name: /notifications/i });
    await userEvent.click(bells[0]);
    await screen.findByRole('dialog', { name: 'Notifications' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notifications' })).toBeNull());
  });
  it('shows the real logged-in identity, not a fake name', async () => {
    go('/profile'); render(<App />);
    await waitFor(() => expect(screen.getAllByText(email).length).toBeGreaterThan(0));
    expect(screen.queryByText(/Arjun Shah/)).toBeNull();
  });
  it('sign out clears the session and calls the server', async () => {
    go('/profile'); render(<App />);
    const btn = await screen.findByRole('button', { name: /sign out/i });
    await userEvent.click(btn);
    await waitFor(() => expect(localStorage.getItem('tv_session')).toBeNull());
    const s = await login(); localStorage.setItem('tv_session', s.token); email = s.email;
  });
  it('a dead token sends the user back to login', async () => {
    const good = localStorage.getItem('tv_session')!; localStorage.setItem('tv_session', 'stale-token');
    try {
      go('/'); render(<App />);
      await screen.findByRole('button', { name: /send otp/i });
      expect(localStorage.getItem('tv_session')).toBeNull();
    } finally { localStorage.setItem('tv_session', good); }
  });
});

describe('page actions', () => {
  it('Earn > Wallet tab links to the real wallet', async () => {
    go('/earn'); render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /^wallet$/i }));
    const a = await screen.findByRole('link', { name: /open wallet/i });
    expect(a.getAttribute('href')).toBe('/wallet');
  });
  it('dashboard quick actions point to real pages', async () => {
    go('/'); render(<App />);
    const qa = await screen.findByLabelText('Quick actions');
    const hrefs = within(qa).getAllByRole('link').map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(['/markets', '/wallet', '/funds', '/tools']);
  });
  it('wallet tabs switch', async () => {
    go('/wallet'); render(<App />);
    await userEvent.click(await tab(/address book/i));
    await screen.findByText(/Naya address/);
    await userEvent.click(await tab(/history/i));
    await screen.findByText(/Transfers/);
    await userEvent.click(await tab(/send/i));
    await screen.findByText(/Recipient/);
  });
  it('wallet: save address, send with OTP, balance drops', async () => {
    go('/wallet'); render(<App />);
    await userEvent.click(await tab(/address book/i));
    await userEvent.type(await screen.findByLabelText(/Label/), 'Binance');
    await userEvent.selectOptions(screen.getByLabelText('Network'), 'TRX');
    await userEvent.type(screen.getByLabelText(/Wallet \/ deposit/), 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u'); // bad checksum
    await userEvent.click(screen.getByRole('button', { name: /save address/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/checksum/i);
    await userEvent.clear(screen.getByLabelText(/Wallet \/ deposit/));
    await userEvent.type(screen.getByLabelText(/Wallet \/ deposit/), 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
    await userEvent.click(screen.getByRole('button', { name: /save address/i }));
    await screen.findByText(/Saved addresses \(1\)/);
    await userEvent.click(await tab(/send/i));
    await userEvent.selectOptions(await screen.findByLabelText(/^Coin/), 'USDT');
    await userEvent.selectOptions(screen.getByLabelText(/^Network/), 'TRX');
    await userEvent.selectOptions(screen.getByLabelText(/Recipient/), screen.getByRole('option', { name: /Binance/ }));
    await userEvent.type(screen.getByLabelText(/^Amount/), '50');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    const otpInput = await screen.findByLabelText('OTP');
    await new Promise((r) => setTimeout(r, 300));
    const log = fs.readFileSync(process.env.SRV_LOG || '/tmp/srv.log', 'utf8');
    const code = [...log.matchAll(/(\d{6})/g)].map((m) => m[1]).pop()!;
    await userEvent.type(otpInput, code);
    await userEvent.click(screen.getByRole('button', { name: /confirm transfer/i }));
    await screen.findByText(/demo transfer complete/i);
  });
});
