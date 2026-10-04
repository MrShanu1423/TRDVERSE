// Pure indicator maths (no React, no DOM) so it can be unit-tested.
// Every function returns an array aligned 1:1 with the input; warm-up slots are NaN.
export type OHLC = { time: number; open: number; high: number; low: number; close: number; volume?: number };

const nanArr = (n: number) => new Array<number>(n).fill(NaN);

export function sma(v: number[], p: number): number[] {
  const out = nanArr(v.length);
  if (p < 1 || v.length < p) return out;
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i];
    if (i >= p) sum -= v[i - p];
    if (i >= p - 1) out[i] = sum / p;
  }
  return out;
}

export function ema(v: number[], p: number): number[] {
  const out = nanArr(v.length);
  if (p < 1 || v.length < p) return out;
  const k = 2 / (p + 1);
  let prev = v.slice(0, p).reduce((a, b) => a + b, 0) / p; // seed with SMA
  out[p - 1] = prev;
  for (let i = p; i < v.length; i++) { prev = v[i] * k + prev * (1 - k); out[i] = prev; }
  return out;
}

// Wilder's RSI
export function rsi(v: number[], p = 14): number[] {
  const out = nanArr(v.length);
  if (v.length <= p) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = v[i] - v[i - 1]; if (d >= 0) g += d; else l -= d; }
  g /= p; l /= p;
  const calc = () => (l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l));
  out[p] = calc();
  for (let i = p + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    g = (g * (p - 1) + (d > 0 ? d : 0)) / p;
    l = (l * (p - 1) + (d < 0 ? -d : 0)) / p;
    out[i] = calc();
  }
  return out;
}

export function macd(v: number[], fast = 12, slow = 26, sig = 9) {
  const ef = ema(v, fast), es = ema(v, slow);
  const line = v.map((_, i) => (Number.isFinite(ef[i]) && Number.isFinite(es[i]) ? ef[i] - es[i] : NaN));
  const first = line.findIndex(Number.isFinite);
  const signal = nanArr(v.length);
  if (first >= 0) {
    const s = ema(line.slice(first), sig);
    s.forEach((x, i) => { signal[first + i] = x; });
  }
  const hist = line.map((x, i) => (Number.isFinite(x) && Number.isFinite(signal[i]) ? x - signal[i] : NaN));
  return { line, signal, hist };
}

export function bollinger(v: number[], p = 20, mult = 2) {
  const mid = sma(v, p), upper = nanArr(v.length), lower = nanArr(v.length);
  for (let i = p - 1; i < v.length; i++) {
    let s = 0;
    for (let j = i - p + 1; j <= i; j++) s += (v[j] - mid[i]) ** 2;
    const sd = Math.sqrt(s / p);
    upper[i] = mid[i] + mult * sd; lower[i] = mid[i] - mult * sd;
  }
  return { mid, upper, lower };
}

export function atr(c: OHLC[], p = 14): number[] {
  const out = nanArr(c.length);
  if (c.length <= p) return out;
  const tr = c.map((x, i) => (i === 0 ? x.high - x.low : Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close))));
  let prev = tr.slice(1, p + 1).reduce((a, b) => a + b, 0) / p;
  out[p] = prev;
  for (let i = p + 1; i < c.length; i++) { prev = (prev * (p - 1) + tr[i]) / p; out[i] = prev; }
  return out;
}

export type Tone = 'bull' | 'bear' | 'neutral';
export type Signal = { name: string; tone: Tone; detail: string };
export type Analysis = { score: number; verdict: string; tone: Tone; signals: Signal[]; support: number | null; resistance: number | null; atr: number | null };

const last = (a: number[]) => { for (let i = a.length - 1; i >= 0; i--) if (Number.isFinite(a[i])) return a[i]; return NaN; };
const at = (a: number[], back: number) => a[a.length - 1 - back];

/** Educational summary of the indicators. Not investment advice. */
export function analyze(c: OHLC[]): Analysis | null {
  if (c.length < 60) return null;
  const close = c.map((x) => x.close), px = close[close.length - 1];
  const e20 = ema(close, 20), e50 = ema(close, 50), r = rsi(close, 14), m = macd(close), bb = bollinger(close, 20, 2), a = atr(c, 14);
  const signals: Signal[] = [];
  let score = 0;
  const add = (name: string, tone: Tone, detail: string, w: number) => { signals.push({ name, tone, detail }); score += tone === 'bull' ? w : tone === 'bear' ? -w : 0; };

  const l20 = last(e20), l50 = last(e50);
  if (l20 > l50 && px > l20) add('Trend', 'bull', 'Price EMA20 ke upar aur EMA20 > EMA50 (uptrend).', 2);
  else if (l20 < l50 && px < l20) add('Trend', 'bear', 'Price EMA20 ke neeche aur EMA20 < EMA50 (downtrend).', 2);
  else add('Trend', 'neutral', 'EMA20/EMA50 mixed hain, clear trend nahi.', 0);

  const lr = last(r);
  if (lr >= 70) add('RSI', 'bear', `RSI ${lr.toFixed(1)}: overbought zone, pullback ka chance.`, 1);
  else if (lr <= 30) add('RSI', 'bull', `RSI ${lr.toFixed(1)}: oversold zone, bounce ka chance.`, 1);
  else add('RSI', lr >= 50 ? 'bull' : 'bear', `RSI ${lr.toFixed(1)}: ${lr >= 50 ? 'momentum positive' : 'momentum weak'}.`, 1);

  const h0 = at(m.hist, 0), h1 = at(m.hist, 1);
  if (Number.isFinite(h0) && Number.isFinite(h1)) {
    if (h1 <= 0 && h0 > 0) add('MACD', 'bull', 'MACD ne signal line ko upar cross kiya (bullish crossover).', 2);
    else if (h1 >= 0 && h0 < 0) add('MACD', 'bear', 'MACD ne signal line ko neeche cross kiya (bearish crossover).', 2);
    else add('MACD', h0 > 0 ? 'bull' : 'bear', `MACD histogram ${h0 > 0 ? 'positive' : 'negative'} hai.`, 1);
  }

  const up = last(bb.upper), lo = last(bb.lower), mid = last(bb.mid);
  const pctB = up === lo ? 0.5 : (px - lo) / (up - lo);
  if (pctB > 1) add('Bollinger', 'bear', 'Price upper band ke bahar: stretched, reversal risk.', 1);
  else if (pctB < 0) add('Bollinger', 'bull', 'Price lower band ke bahar: stretched, bounce possible.', 1);
  else add('Bollinger', 'neutral', `Price bands ke andar (%B ${(pctB * 100).toFixed(0)}).`, 0);
  const width = mid ? (up - lo) / mid : 0;
  if (width < 0.03) signals.push({ name: 'Volatility', tone: 'neutral', detail: 'Bands bahut tight hain (squeeze): bada move aa sakta hai, direction unknown.' });

  const win = c.slice(-50);
  const support = Math.min(...win.map((x) => x.low)), resistance = Math.max(...win.map((x) => x.high));
  const verdict = score >= 3 ? 'Bullish bias' : score <= -3 ? 'Bearish bias' : 'Neutral / wait';
  return { score, verdict, tone: score >= 3 ? 'bull' : score <= -3 ? 'bear' : 'neutral', signals, support, resistance, atr: Number.isFinite(last(a)) ? last(a) : null };
}
