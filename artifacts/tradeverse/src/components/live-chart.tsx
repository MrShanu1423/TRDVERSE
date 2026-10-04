import { useEffect, useRef, useState } from 'react';
import { createChart, type UTCTimestamp } from 'lightweight-charts';
import { analyze, bollinger, ema, macd, rsi, type Analysis, type OHLC } from '@/lib/indicators';

const TF = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800 } as const;
type TFKey = keyof typeof TF;
type Candle = { time: UTCTimestamp; open: number; high: number; low: number; close: number };
const COL = { up: '#10B981', down: '#EF4444', ema20: '#F59E0B', ema50: '#A78BFA', bb: '#64748B', rsi: '#3B82F6' };
const chartOpts = (h: number) => ({
  autoSize: true, height: h,
  layout: { background: { color: 'transparent' }, textColor: '#9CA3AF' },
  grid: { vertLines: { color: '#1b222c' }, horzLines: { color: '#1b222c' } },
  timeScale: { timeVisible: true, borderColor: '#222A35' }, rightPriceScale: { borderColor: '#222A35' },
});
// NaN warm-up points become whitespace so every series keeps the same time index as the candles.
const pts = (c: Candle[], v: number[]) => c.map((x, i) => (Number.isFinite(v[i]) ? { time: x.time, value: v[i] } : { time: x.time }));
const toneColor = (t: string) => (t === 'bull' ? COL.up : t === 'bear' ? COL.down : '#9CA3AF');

export function LiveChart({ symbol, category, price, usdInr = 88, allowSimulated = true }: { symbol: string; category: string; price: number; usdInr?: number; allowSimulated?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const rsiBox = useRef<HTMLDivElement>(null);
  const macdBox = useRef<HTMLDivElement>(null);
  const overlays = useRef<{ e20?: any; e50?: any; bu?: any; bl?: any }>({});
  const [tf, setTf] = useState<TFKey>('15m');
  const [kind, setKind] = useState<'candle' | 'line'>('candle');
  const [src, setSrc] = useState<'loading' | 'live' | 'simulated' | 'error'>('loading');
  const [on, setOn] = useState({ ema: true, bb: false, rsi: true, macd: true });
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  // Toggling an indicator only shows/hides series; it never reloads the data.
  useEffect(() => {
    const o = overlays.current;
    o.e20?.applyOptions({ visible: on.ema }); o.e50?.applyOptions({ visible: on.ema });
    o.bu?.applyOptions({ visible: on.bb }); o.bl?.applyOptions({ visible: on.bb });
  }, [on.ema, on.bb, symbol, category, price, tf, kind]);

  useEffect(() => {
    if (!box.current || !rsiBox.current || !macdBox.current) return;
    const step = TF[tf];
    const chart = createChart(box.current, chartOpts(380) as any);
    const rChart = createChart(rsiBox.current, chartOpts(110) as any);
    const mChart = createChart(macdBox.current, chartOpts(130) as any);
    const series: any = kind === 'candle'
      ? chart.addCandlestickSeries({ upColor: COL.up, downColor: COL.down, borderVisible: false, wickUpColor: COL.up, wickDownColor: COL.down })
      : chart.addLineSeries({ color: '#3B82F6', lineWidth: 2 });
    const ln = (color: string, dash = false) => chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...(dash ? { lineStyle: 2 } : {}) } as any);
    const o = overlays.current = { e20: ln(COL.ema20), e50: ln(COL.ema50), bu: ln(COL.bb, true), bl: ln(COL.bb, true) };
    o.e20.applyOptions({ visible: on.ema }); o.e50.applyOptions({ visible: on.ema }); o.bu.applyOptions({ visible: on.bb }); o.bl.applyOptions({ visible: on.bb });
    const rs: any = rChart.addLineSeries({ color: COL.rsi, lineWidth: 2, priceLineVisible: false });
    rs.createPriceLine({ price: 70, color: COL.down, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
    rs.createPriceLine({ price: 30, color: COL.up, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
    const mh: any = mChart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
    const ml: any = mChart.addLineSeries({ color: '#38BDF8', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const ms: any = mChart.addLineSeries({ color: COL.ema20, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });

    // keep the three time axes moving together
    let syncing = false;
    const follow = (targets: any[]) => (r: any) => { if (!r || syncing) return; syncing = true; targets.forEach((t) => t.timeScale().setVisibleLogicalRange(r)); syncing = false; };
    chart.timeScale().subscribeVisibleLogicalRangeChange(follow([rChart, mChart]));
    rChart.timeScale().subscribeVisibleLogicalRangeChange(follow([chart, mChart]));
    mChart.timeScale().subscribeVisibleLogicalRangeChange(follow([chart, rChart]));

    let candles: Candle[] = [];
    let ws: WebSocket | undefined; let timer: ReturnType<typeof setInterval> | undefined; let dead = false; let lastAn = 0;
    const recalc = (force = false) => {
      if (candles.length < 2) return;
      const close = candles.map((c) => c.close);
      o.e20.setData(pts(candles, ema(close, 20))); o.e50.setData(pts(candles, ema(close, 50)));
      const bb = bollinger(close, 20, 2); o.bu.setData(pts(candles, bb.upper)); o.bl.setData(pts(candles, bb.lower));
      rs.setData(pts(candles, rsi(close, 14)));
      const m = macd(close);
      mh.setData(candles.map((c, i) => (Number.isFinite(m.hist[i]) ? { time: c.time, value: m.hist[i], color: m.hist[i] >= 0 ? COL.up : COL.down } : { time: c.time })));
      ml.setData(pts(candles, m.line)); ms.setData(pts(candles, m.signal));
      const now = Date.now();
      if (force || now - lastAn > 1500) { lastAn = now; setAnalysis(analyze(candles as OHLC[])); }
    };
    const draw = (c: Candle) => series.update(kind === 'candle' ? c : { time: c.time, value: c.close });
    const setAll = () => { series.setData(kind === 'candle' ? candles : candles.map((c) => ({ time: c.time, value: c.close }))); recalc(true); chart.timeScale().fitContent(); };
    const tick = (p: number, tSec: number) => {
      if (!Number.isFinite(p) || p <= 0) return;
      const t = (Math.floor(tSec / step) * step) as UTCTimestamp; const last = candles[candles.length - 1];
      if (last && t < last.time) return; // ignore out-of-order ticks; the chart would throw
      if (last && last.time === t) { last.high = Math.max(last.high, p); last.low = Math.min(last.low, p); last.close = p; }
      else candles.push({ time: t, open: last?.close ?? p, high: p, low: p, close: p });
      draw(candles[candles.length - 1]); recalc();
    };
    const simulate = () => {
      if (!allowSimulated) { setSrc('error'); return; } // real markets never show fake candles
      let p = price; const now = Math.floor(Date.now() / 1000); const rows: Candle[] = [];
      for (let i = 220; i > 0; i--) { const o2 = p; p = o2 * (1 + (Math.random() - 0.5) * 0.01); rows.push({ time: (Math.floor((now - i * step) / step) * step) as UTCTimestamp, open: o2, high: Math.max(o2, p) * 1.002, low: Math.min(o2, p) * 0.998, close: p }); }
      candles = rows; setAll(); setSrc('simulated');
      timer = setInterval(() => { const l = candles[candles.length - 1].close; tick(l * (1 + (Math.random() - 0.5) * 0.0008), Date.now() / 1000); }, 1000);
    };
    (async () => {
      if (category !== 'crypto') {
        try {
          const h = { Authorization: `Bearer ${localStorage.getItem('tv_session')}` };
          const r = await fetch(`/api/live/angel/candles?symbol=${symbol}&tf=${tf}`, { headers: h });
          if (!r.ok) throw new Error('angel');
          candles = await r.json(); if (dead || !candles.length) throw new Error('empty');
          setAll(); setSrc('live');
          timer = setInterval(async () => { try { const q = await (await fetch(`/api/live/angel/ltp?symbol=${symbol}`, { headers: h })).json(); if (q.ltp) tick(q.ltp, Date.now() / 1000); } catch {} }, 2000);
          return;
        } catch { if (!dead) return simulate(); return; }
      }
      try {
        const pair = `${symbol.toUpperCase()}USDT`;
        const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${tf}&limit=300`);
        if (!r.ok) throw new Error('klines');
        const rows: any[][] = await r.json(); if (dead) return;
        candles = rows.map((k) => ({ time: Math.floor(k[0] / 1000) as UTCTimestamp, open: +k[1] * usdInr, high: +k[2] * usdInr, low: +k[3] * usdInr, close: +k[4] * usdInr }));
        setAll();
        ws = new WebSocket(`wss://stream.binance.com:9443/ws/${pair.toLowerCase()}@aggTrade`);
        ws.onopen = () => setSrc('live');
        ws.onmessage = (m) => { const d = JSON.parse(m.data); tick(+d.p * usdInr, d.T / 1000); };
        ws.onerror = () => { if (!dead && !candles.length) simulate(); };
      } catch { if (!dead) simulate(); }
    })();
    return () => { dead = true; ws?.close(); if (timer) clearInterval(timer); overlays.current = {}; chart.remove(); rChart.remove(); mChart.remove(); };
    // `on` is deliberately not a dependency: toggles must not reload the feed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, category, tf, kind, usdInr, allowSimulated]);

  const btn = (v: boolean) => `chart-tab ${v ? 'active' : ''}`;
  const tog = (k: keyof typeof on) => setOn((s) => ({ ...s, [k]: !s[k] }));
  const fmt = (n: number | null) => (n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: 2 }));
  return (
    <div>
      <div className="chart-tabs" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
        {(Object.keys(TF) as TFKey[]).map((k) => <button key={k} className={btn(tf === k)} onClick={() => setTf(k)}>{k}</button>)}
        <button className={btn(kind === 'candle')} onClick={() => setKind('candle')}>Candles</button>
        <button className={btn(kind === 'line')} onClick={() => setKind('line')}>Line</button>
        <span role="status" style={{ marginLeft: 'auto', fontSize: 11, color: src === 'live' ? '#10B981' : src === 'error' ? '#EF4444' : '#9CA3AF' }}>● {src === 'live' ? 'Live' : src === 'simulated' ? 'Simulated feed' : src === 'error' ? 'Chart data unavailable' : 'Loading…'}</span>
      </div>
      <div className="chart-tabs" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
        <button className={btn(on.ema)} onClick={() => tog('ema')}>EMA 20/50</button>
        <button className={btn(on.bb)} onClick={() => tog('bb')}>Bollinger</button>
        <button className={btn(on.rsi)} onClick={() => tog('rsi')}>RSI</button>
        <button className={btn(on.macd)} onClick={() => tog('macd')}>MACD</button>
      </div>
      <div ref={box} style={{ width: '100%', height: 380 }} />
      <div style={{ display: on.rsi ? 'block' : 'none' }}><p className="subtle" style={{ fontSize: 11, margin: '6px 0 0' }}>RSI (14) — 70 se upar overbought, 30 se neeche oversold</p><div ref={rsiBox} style={{ width: '100%', height: 110 }} /></div>
      <div style={{ display: on.macd ? 'block' : 'none' }}><p className="subtle" style={{ fontSize: 11, margin: '6px 0 0' }}>MACD (12, 26, 9)</p><div ref={macdBox} style={{ width: '100%', height: 130 }} /></div>
      <div className="card pad" style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>Chart analysis</h2>
        {!analysis ? <p className="subtle">Analysis ke liye kam se kam 60 candles chahiye. Data load ho raha hai…</p> : (
          <>
            <p style={{ margin: '0 0 10px' }}><strong style={{ color: toneColor(analysis.tone), fontSize: 18 }}>{analysis.verdict}</strong> <span className="subtle">(score {analysis.score > 0 ? '+' : ''}{analysis.score})</span></p>
            <div style={{ display: 'grid', gap: 6 }}>
              {analysis.signals.map((s) => <div key={s.name} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><span style={{ color: toneColor(s.tone) }}>●</span><span><strong>{s.name}:</strong> <span className="subtle">{s.detail}</span></span></div>)}
            </div>
            <div className="stats" style={{ marginTop: 12 }}>
              <div className="stat"><span className="subtle">Support (50 candles)</span><strong className="mono">{fmt(analysis.support)}</strong></div>
              <div className="stat"><span className="subtle">Resistance (50 candles)</span><strong className="mono">{fmt(analysis.resistance)}</strong></div>
              <div className="stat"><span className="subtle">ATR (14)</span><strong className="mono">{fmt(analysis.atr)}</strong></div>
            </div>
            <p className="subtle" style={{ fontSize: 11, marginBottom: 0 }}>Ye sirf educational technical summary hai, investment advice nahi. Stop-loss ke liye ATR ka use kar sakte ho (jaise entry se 1.5 × ATR door).</p>
          </>
        )}
      </div>
    </div>
  );
}
