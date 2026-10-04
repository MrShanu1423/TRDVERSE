import http from 'node:http';
const t = (s, p, v, c) => ({ symbol: s, lastPrice: String(p), priceChangePercent: String(c), highPrice: String(p * 1.02), lowPrice: String(p * 0.98), quoteVolume: String(v) });
http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end(JSON.stringify([t('BTCUSDT', 60000, 9e9, 1.5), t('ETHUSDT', 3000, 5e9, -2.1), t('DOGEUSDT', 0.15, 1e8, 7.7), t('USDTINR', 90, 1e7, 0)])); }).listen(5071, () => console.log('fake binance up'));
http.createServer((q, r) => { let b = ''; q.on('data', (d) => b += d); q.on('end', () => { r.setHeader('content-type', 'application/json'); r.end(JSON.stringify({ id: 'qr_ui1', image_url: 'https://rzp.io/i/fake' })); }); }).listen(5072);
