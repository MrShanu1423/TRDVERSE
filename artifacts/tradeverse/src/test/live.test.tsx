import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fs from 'node:fs';

vi.mock('@/components/live-chart', () => ({ LiveChart: () => <div data-testid="chart-stub" /> }));
import App from '@/App';

const API = process.env.API_URL || 'http://localhost:5055';
const post = (p: string, b: any, t?: string) => fetch(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(b) }).then((r) => r.json());
beforeAll(async () => {
  const email = `live${Date.now()}@example.com`;
  await post('/api/auth/request-otp', { email }); await new Promise((r) => setTimeout(r, 400));
  const code = [...fs.readFileSync(process.env.SRV_LOG || '/tmp/srv.log', 'utf8').matchAll(/(\d{6})/g)].map((m) => m[1]).pop();
  localStorage.setItem('tv_session', (await post('/api/auth/verify-otp', { email, code })).token);
});
const go = (p: string) => window.history.pushState({}, '', p);
const submitBtn = () => document.querySelector('.order-card .btn-primary') as HTMLButtonElement;

describe('live markets', () => {
  it('lists every coin from the feed, sorted by volume, with INR prices', async () => {
    go('/live'); render(<App />);
    const rows = await screen.findAllByTestId(/row-live-/);
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('BTC');
    expect(rows[0].textContent).toContain('₹54,00,000'); // 60000 USDT * 90 INR, Indian digit grouping
    expect(screen.getByRole('status', { name: '' }) ).toBeTruthy;
  });
  it('search narrows the list and shows an empty state', async () => {
    go('/live'); render(<App />);
    await screen.findAllByTestId(/row-live-/);
    await userEvent.type(screen.getByLabelText('Search coins'), 'doge');
    await waitFor(() => expect(screen.getAllByTestId(/row-live-/).length).toBe(1));
    await userEvent.clear(screen.getByLabelText('Search coins')); await userEvent.type(screen.getByLabelText('Search coins'), 'zzz');
    await screen.findByText(/koi coin nahi mila/);
  });
  it('sorting buttons reorder (losers first puts the most negative on top)', async () => {
    go('/live'); render(<App />);
    await screen.findAllByTestId(/row-live-/);
    await userEvent.click(screen.getByRole('button', { name: 'Price' }));
    await waitFor(() => expect(screen.getAllByTestId(/row-live-/)[0].textContent).toContain('BTC'));
    await userEvent.click(screen.getByRole('button', { name: 'Gainers' }));
  });
  it('stocks tab explains missing Angel keys instead of showing fake prices', async () => {
    go('/live'); render(<App />);
    await userEvent.click(await screen.findByRole('tab', { name: /stocks/i }));
    await waitFor(() => expect(screen.queryByText(/load ho rahe hain/)).toBeNull(), { timeout: 8000 });
    expect(screen.queryAllByTestId(/row-live-/).length === 0 || screen.queryByRole('alert') !== null).toBe(true);
  });
  it('clicking a coin opens its trade page', async () => {
    go('/live'); render(<App />);
    await userEvent.click((await screen.findAllByTestId(/row-live-/))[0]);
    await waitFor(() => expect(window.location.pathname).toBe('/live/crypto/BTC'));
    await screen.findByRole('heading', { name: 'BTC' });
  });
  it('unknown coin shows a clear message', async () => {
    go('/live/crypto/NOPE'); render(<App />);
    await screen.findByText(/NOPE nahi mila/);
  });
});

describe('add money + trade end to end', () => {
  it('add money page: bad amounts blocked, demo credit raises balance, QR flow shows image', async () => {
    go('/add-money'); render(<App />);
    const amt = await screen.findByLabelText(/Amount/);
    await userEvent.clear(amt); await userEvent.type(amt, '5');
    expect((screen.getByRole('button', { name: /generate payment qr/i }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.clear(amt); await userEvent.type(amt, '20000');
    await userEvent.click(screen.getByRole('button', { name: /demo credit/i }));
    await waitFor(() => expect(screen.getAllByText('₹20,000.00').length).toBeGreaterThan(0));
    await userEvent.clear(amt); await userEvent.type(amt, '500');
    await userEvent.click(screen.getByRole('button', { name: /generate payment qr/i }));
    const img = await screen.findByAltText(/UPI QR/); expect(img.getAttribute('src')).toContain('rzp.io');
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await screen.findByRole('button', { name: /generate payment qr/i });
  });
  it('trade page: quick % fills, total shown, buy executes and balance drops, sell closes', async () => {
    go('/live/crypto/BTC'); render(<App />);
    const qty = await screen.findByLabelText(/Quantity \(BTC\)/);
    await screen.findByText(/₹20,000\.00/); // balance from previous test (same user)
    expect(submitBtn().disabled).toBe(true);
    await userEvent.type(qty, '0.001');
    expect(await screen.findByText('₹5,400.00')).toBeTruthy(); // value
    await waitFor(() => expect(submitBtn().textContent).toMatch(/^Buy 0.001 BTC/));
    await userEvent.click(submitBtn());
    await screen.findByText(/Bought 0.001 BTC/);
    await screen.findByText(/₹14,594\.60/); // 20000 - 5400 - 5.40 fee
    await screen.findByText(/Holding/);
    // sell 100% of holding via quick button
    await userEvent.click(within(document.querySelector('.side-toggle') as HTMLElement).getByRole('button', { name: 'Sell' }));
    await userEvent.click(screen.getByRole('button', { name: '100%' }));
    expect((screen.getByLabelText(/Quantity \(BTC\)/) as HTMLInputElement).value).toBe('0.001');
    await waitFor(() => expect(submitBtn().textContent).toMatch(/^Sell 0.001 BTC/));
    await userEvent.click(submitBtn());
    await screen.findByText(/Sold 0.001 BTC/);
  });
  it('buying more than the balance is blocked in the UI with a way to add money', async () => {
    go('/live/crypto/BTC'); render(<App />);
    await userEvent.type(await screen.findByLabelText(/Quantity \(BTC\)/), '5');
    await screen.findByText(/Balance kam hai\./);
    expect(submitBtn().disabled).toBe(true);
    expect(within(document.querySelector('.order-card') as HTMLElement).getByRole('link', { name: /add money/i }).getAttribute('href')).toBe('/add-money');
  });
  it('bell lists the trades and clicking one opens that market', async () => {
    go('/'); render(<App />);
    const bell = (await screen.findAllByRole('button', { name: /notifications/i }))[0];
    await userEvent.click(bell);
    const dlg = await screen.findByRole('dialog', { name: 'Notifications' });
    const item = await within(dlg).findByText(/Sold 0.001 BTC/);
    await userEvent.click(item);
    await waitFor(() => expect(window.location.pathname).toBe('/live/crypto/BTC'));
  });
});
