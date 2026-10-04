// Run from artifacts/api-server:  npx tsx tests/trade-integration.ts   (spawns its own fake Binance + Razorpay and the API)
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const tick = (s: string, p: number, v = 5e6, c = 1.5) => ({ symbol: s, lastPrice: String(p), priceChangePercent: String(c), highPrice: String(p * 1.02), lowPrice: String(p * 0.98), quoteVolume: String(v) });
let btc = 60000;
const binance = http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end(JSON.stringify([tick('BTCUSDT', btc, 9e9), tick('ETHUSDT', 3000, 5e9), tick('DOGEUSDT', 0.15, 1e8), tick('USDTINR', 90, 1e7), tick('BTCUPUSDT', 1, 1e6), tick('DEADUSDT', 1, 0)])); }).listen(5071);
let qrCount = 0;
const razor = http.createServer((q, r) => { let b = ''; q.on('data', (d) => b += d); q.on('end', () => { r.setHeader('content-type', 'application/json'); if (!String(q.headers.authorization).startsWith('Basic ')) { r.statusCode = 401; return r.end('{}'); } qrCount++; r.statusCode = 200; r.end(JSON.stringify({ id: `qr_${qrCount}`, image_url: 'https://rzp.io/i/fake', body: JSON.parse(b) })); }); }).listen(5072);

const env = { ...process.env, PORT: '5056', BINANCE_REST: 'http://localhost:5071', RAZORPAY_BASE: 'http://localhost:5072', RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 's', RAZORPAY_WEBHOOK_SECRET: 'whsec', DEMO_CREDIT: 'true' };
const srv = spawn('npx', ['tsx', 'src/index.ts'], { env, cwd: process.cwd() });
let log = ''; srv.stdout.on('data', (d) => log += d); srv.stderr.on('data', (d) => log += d);
const B = 'http://localhost:5056/api';
let bad = 0; const ok = (c: any, m: string) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const call = async (m: string, path: string, body?: any, tok?: string, raw?: string, hdr: any = {}) => {
  const r = await fetch(B + path, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...hdr }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  return { s: r.status, j: await r.json().catch(() => ({})) as any };
};
(async () => {
  await new Promise((r) => setTimeout(r, 9000));
  const email = 'trader@example.com';
  await call('POST', '/auth/request-otp', { email }); await new Promise((r) => setTimeout(r, 500));
  const code = [...log.matchAll(/(\d{6})/g)].map((m) => m[1]).pop();
  const tok = (await call('POST', '/auth/verify-otp', { email, code })).j.token; ok(tok, 'login');

  const live = await call('GET', '/market/crypto/live');
  ok(live.s === 200 && live.j.count === 3, `live crypto: 3 pairs (junk/leveraged/zero-volume filtered) -> ${live.j.count}`);
  ok(live.j.usdInr === 90 && live.j.inrSource === 'live', 'USDT/INR comes from Binance, not a hardcoded number');
  ok(live.j.items[0].symbol === 'BTC', 'sorted by volume');

  ok((await call('POST', '/trade/order', { market: 'crypto', symbol: 'BTC', side: 'BUY', quantity: '0.001' })).s === 401, 'trade needs login');
  let r = await call('POST', '/trade/order', { market: 'crypto', symbol: 'BTC', side: 'BUY', quantity: '0.001' }, tok);
  ok(r.s === 400 && /Balance kam/.test(r.j.error), 'buy with zero balance rejected');

  r = await call('POST', '/pay/demo-credit', { amount: 10000 }, tok); ok(r.j.balance === 10000, 'demo credit adds Rs 10,000');
  ok((await call('POST', '/pay/demo-credit', { amount: 5 }, tok)).s === 400, 'demo credit below minimum rejected');

  r = await call('POST', '/trade/order', { market: 'crypto', symbol: 'BTC', side: 'BUY', quantity: '0.001' }, tok);
  // 0.001 * 60000 * 90 = 5400, fee 5.4
  ok(r.s === 201 && Math.abs(r.j.order.value - 5400) < 0.01 && Math.abs(r.j.order.fee - 5.4) < 0.01, `buy 0.001 BTC at server price: value ${r.j.order?.value} fee ${r.j.order?.fee}`);
  ok(Math.abs(r.j.balance - (10000 - 5400 - 5.4)) < 0.01, `balance debited: ${r.j.balance}`);
  r = await call('POST', '/trade/order', { market: 'crypto', symbol: 'BTC', side: 'BUY', quantity: '0.0005', price: 1 }, tok);
  ok(r.s === 201 && Math.abs(r.j.order.price - 5.4e6) < 1, 'client-supplied price is ignored');
  r = await call('POST', '/trade/order', { market: 'crypto', symbol: 'BTC', side: 'BUY', quantity: '1' }, tok); ok(r.s === 400, 'cannot overspend');
  r = await call('POST', '/trade/order', { market: 'crypto', symbol: 'ETH', side: 'SELL', quantity: '1' }, tok); ok(r.s === 400 && /sirf/.test(r.j.error), 'cannot sell what you do not own');
  r = await call('POST', '/trade/order', { market: 'crypto', symbol: 'NOPE', side: 'BUY', quantity: '1' }, tok); ok(r.s === 404, 'unknown coin 404');
  for (const q of ['0', '-1', '1e3', 'abc', '', '1.123456789']) { r = await call('POST', '/trade/order', { market: 'crypto', symbol: 'BTC', side: 'BUY', quantity: q }, tok); ok(r.s === 400, `bad quantity "${q}" rejected`); }
  r = await call('POST', '/trade/order', { market: 'crypto', symbol: 'DOGE', side: 'BUY', quantity: '0.00001' }, tok); ok(r.s === 400 && /Minimum/.test(r.j.error), 'dust order below Rs 10 rejected');
  btc = 66000; await new Promise((r) => setTimeout(r, 5500));
  const pf = (await call('GET', '/trade/portfolio', undefined, tok)).j;
  const h = pf.holdings.find((x: any) => x.symbol === 'BTC');
  ok(h && Math.abs(h.qty - 0.0015) < 1e-9 && h.pnl > 0 && Math.abs(h.last - 66000 * 90) < 1, `position tracks live price: last ${h?.last}, pnl ${h?.pnl?.toFixed(0)}`);
  r = await call('POST', '/trade/order', { market: 'crypto', symbol: 'BTC', side: 'SELL', quantity: '0.0015' }, tok); ok(r.s === 201, 'sell whole position');
  ok(!(await call('GET', '/trade/portfolio', undefined, tok)).j.holdings.length, 'position closed');
  r = await call('POST', '/trade/order', { market: 'stock', symbol: 'SBIN', side: 'BUY', quantity: '1' }, tok); ok(r.s === 503 || r.s === 409, `stock without Angel keys fails clearly: ${r.j.error}`);
  const orders = (await call('GET', '/trade/orders', undefined, tok)).j; ok(orders.length === 3 && orders[0].side === 'SELL', 'order history newest first');

  // concurrent overspend race
  const t2 = 'race@example.com'; await call('POST', '/auth/request-otp', { email: t2 }); await new Promise((r) => setTimeout(r, 400));
  const c2 = [...log.matchAll(/(\d{6})/g)].map((m) => m[1]).pop(); const tok2 = (await call('POST', '/auth/verify-otp', { email: t2, code: c2 })).j.token;
  await call('POST', '/pay/demo-credit', { amount: 10000 }, tok2);
  const race = await Promise.all(Array.from({ length: 5 }, () => call('POST', '/trade/order', { market: 'crypto', symbol: 'BTC', side: 'BUY', quantity: '0.001' }, tok2)));
  ok(race.filter((x) => x.s === 201).length === 1, `5 parallel buys, only 1 affordable -> ${race.filter((x) => x.s === 201).length} succeeded`);
  ok((await call('GET', '/trade/portfolio', undefined, tok2)).j.balance > 0, 'balance never negative');

  // Razorpay
  ok((await call('GET', '/pay/config')).j.razorpay === true, 'razorpay configured flag');
  r = await call('POST', '/pay/qr', { amount: 5 }, tok); ok(r.s === 400, 'QR below minimum rejected');
  r = await call('POST', '/pay/qr', { amount: 500.555 }, tok); ok(r.s === 400, 'QR with 3 decimals rejected');
  r = await call('POST', '/pay/qr', { amount: 500 }, tok); ok(r.s === 201 && r.j.qrId === 'qr_1' && r.j.imageUrl, 'QR created via Razorpay');
  const qrId = r.j.qrId; const before = (await call('GET', '/trade/portfolio', undefined, tok)).j.balance;
  ok((await call('GET', `/pay/status/${qrId}`, undefined, tok)).j.status === 'waiting', 'status waiting');
  ok((await call('GET', `/pay/status/${qrId}`, undefined, tok2)).s === 404, "other user cannot see someone's QR");
  const evt = (amount: number, pid = 'pay_1', status = 'captured') => JSON.stringify({ event: 'qr_code.credited', payload: { payment: { entity: { id: pid, amount, status } }, qr_code: { entity: { id: qrId } } } });
  const sign = (b: string, k = 'whsec') => crypto.createHmac('sha256', k).update(b).digest('hex');
  let b = evt(50000);
  r = await call('POST', '/pay/razorpay/webhook', undefined, undefined, b, { 'x-razorpay-signature': 'deadbeef' }); ok(r.s === 400, 'webhook with bad signature rejected');
  r = await call('POST', '/pay/razorpay/webhook', undefined, undefined, b, { 'x-razorpay-signature': sign(b, 'wrong') }); ok(r.s === 400, 'webhook signed with wrong secret rejected');
  ok((await call('GET', '/trade/portfolio', undefined, tok)).j.balance === before, 'forged webhooks credited nothing');
  b = evt(10000, 'pay_x'); r = await call('POST', '/pay/razorpay/webhook', undefined, undefined, b, { 'x-razorpay-signature': sign(b) });
  ok((await call('GET', '/trade/portfolio', undefined, tok)).j.balance === before, 'wrong amount not credited');
  b = evt(50000); r = await call('POST', '/pay/razorpay/webhook', undefined, undefined, b, { 'x-razorpay-signature': sign(b) });
  ok(r.s === 200 && (await call('GET', '/trade/portfolio', undefined, tok)).j.balance === before + 500, 'valid webhook credits exactly Rs 500');
  await call('POST', '/pay/razorpay/webhook', undefined, undefined, b, { 'x-razorpay-signature': sign(b) });
  ok((await call('GET', '/trade/portfolio', undefined, tok)).j.balance === before + 500, 'replayed webhook does not double credit');
  ok((await call('GET', `/pay/status/${qrId}`, undefined, tok)).j.status === 'paid', 'status paid');

  console.log(bad ? `\n${bad} FAILED` : '\nALL PASS');
  srv.kill(); binance.close(); razor.close(); process.exit(bad ? 1 : 0);
})();
