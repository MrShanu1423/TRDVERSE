import { sma, ema, rsi, macd, bollinger, analyze } from './indicators';
const eq = (a: number, b: number, tol = 1e-2, n = '') => { if (!(Math.abs(a - b) <= tol)) { console.error('FAIL', n, a, b); process.exit(1); } else console.log('ok', n, a.toFixed(4)); };
// classic Wilder RSI reference series (StockCharts) -> RSI(14) at index 14 ≈ 70.46, index 15 ≈ 66.25
const c = [44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46.00,46.03,46.41,46.22,45.64];
const r = rsi(c, 14);
eq(r[14], 70.46, 0.05, 'rsi[14]'); eq(r[15], 66.25, 0.1, 'rsi[15]');
eq(sma([1,2,3,4,5], 3)[4], 4, 1e-9, 'sma');
eq(ema([1,2,3,4,5], 3)[2], 2, 1e-9, 'ema seed'); eq(ema([1,2,3,4,5], 3)[3], 3, 1e-9, 'ema step');
const flat = new Array(40).fill(10); eq(rsi(flat)[30], 50, 1e-9, 'rsi flat');
const up = Array.from({ length: 60 }, (_, i) => 100 + i); eq(rsi(up)[59], 100, 1e-9, 'rsi up');
const b = bollinger([1,2,3,4,5], 5, 2); eq(b.mid[4], 3, 1e-9, 'bb mid'); eq(b.upper[4], 3 + 2 * Math.SQRT2, 1e-9, 'bb upper');
const mm = macd(Array.from({ length: 100 }, (_, i) => Math.sin(i / 5) * 10 + 100)); eq(mm.hist.filter(Number.isFinite).length > 50 ? 1 : 0, 1, 0, 'macd len');
const k = Array.from({ length: 120 }, (_, i) => { const p = 100 + i * 0.5 + Math.sin(i / 3); return { time: i, open: p, high: p + 1, low: p - 1, close: p + 0.2 }; });
const a = analyze(k); console.log(a?.verdict, a?.score, a?.signals.map(s => s.name).join(','));
if (analyze(k.slice(0, 30)) !== null) { console.error('FAIL short'); process.exit(1); }
console.log('ALL PASS');
