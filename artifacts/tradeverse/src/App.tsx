import { type ReactNode, lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Activity as ActivityIcon,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Bitcoin,
  Bot,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleAlert,
  Code2,
  Coins,
  Calculator,
  CreditCard,
  Database,
  FileText,
  Gem,
  Gauge,
  Globe2,
  Landmark,
  Layers3,
  LayoutDashboard,
  LineChart,
  Menu,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  WalletCards,
  X,
  Zap,
} from 'lucide-react';
import {
  getGetActivityQueryKey,
  getGetDashboardQueryKey,
  getGetOrdersQueryKey,
  getGetPortfolioQueryKey,
  useGetActivity,
  useGetAsset,
  useGetDashboard,
  useGetOrders,
  useGetPortfolio,
  useListAssets,
  usePlaceDemoOrder,
} from '@workspace/api-client-react';
import type {
  Activity,
  Dashboard,
  Holding,
  MarketAsset,
  MarketAssetDetail,
  Order,
  OrderInput,
  Portfolio,
} from '@workspace/api-client-react';
// The charting library (lightweight-charts) is one of the heaviest deps in the app - only load it
// when a page actually renders a chart, instead of shipping it in the main bundle.
const LiveChart = lazy(() => import('@/components/live-chart').then((m) => ({ default: m.LiveChart })));
const LiveTradeBox = lazy(() => import('@/components/live-trade').then((m) => ({ default: m.LiveTradeBox })));
import { AuthGate } from '@/components/auth-gate';
import { GlobalSearch, LogoutButton, NotificationBell, ThemeToggle, useMe } from '@/components/shell-tools';
// Lazy-loaded: each only downloads when the user actually visits that route, instead of all 11 pages'
// worth of code shipping in the initial bundle (this used to be a single 650KB chunk).
const FnoPage = lazy(() => import('@/pages/features').then((m) => ({ default: m.FnoPage })));
const IpoPage = lazy(() => import('@/pages/features').then((m) => ({ default: m.IpoPage })));
const FundsPage = lazy(() => import('@/pages/features').then((m) => ({ default: m.FundsPage })));
const EarnPage = lazy(() => import('@/pages/features').then((m) => ({ default: m.EarnPage })));
const ToolsPage = lazy(() => import('@/pages/features').then((m) => ({ default: m.ToolsPage })));
const P2pPage = lazy(() => import('@/pages/p2p').then((m) => ({ default: m.P2pPage })));
const FuturesPage = lazy(() => import('@/pages/futures').then((m) => ({ default: m.FuturesPage })));
const WalletPage = lazy(() => import('@/pages/wallet').then((m) => ({ default: m.WalletPage })));
const LiveMarketsPage = lazy(() => import('@/pages/live').then((m) => ({ default: m.LiveMarketsPage })));
const TradePage = lazy(() => import('@/pages/trade').then((m) => ({ default: m.TradePage })));
const AddMoneyPage = lazy(() => import('@/pages/add-money').then((m) => ({ default: m.AddMoneyPage })));
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Link, useLocation, useParams, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

type Category = 'all' | 'crypto' | 'stocks' | 'funds';

const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/live', label: 'Live markets', icon: ActivityIcon },
  { href: '/products', label: 'All products', icon: Layers3 },
  { href: '/markets', label: 'Markets', icon: LineChart },
  { href: '/portfolio', label: 'Portfolio', icon: BriefcaseBusiness },
  { href: '/orders', label: 'Paper orders', icon: FileText },
  { href: '/fno', label: 'F&O chain', icon: BarChart3 },
  { href: '/funds', label: 'Funds & SIP', icon: Landmark },
  { href: '/ipo', label: 'IPO', icon: Rocket },
  { href: '/earn', label: 'Crypto Earn', icon: Coins },
  { href: '/p2p', label: 'P2P', icon: Users },
  { href: '/futures', label: 'Futures', icon: Zap },
  { href: '/add-money', label: 'Add money', icon: WalletCards },
  { href: '/wallet', label: 'Wallet & transfers', icon: WalletCards },
  { href: '/tools', label: 'Life tools', icon: Calculator },
];

const productModules = [
  {
    group: 'Wealth',
    title: 'Stocks & ETFs',
    description: 'Explore Indian listed companies, index funds, and exchange-traded baskets.',
    icon: LineChart,
    tone: 'teal',
    status: 'Preview ready',
    href: '/markets',
    features: ['NSE & BSE discovery', 'Watchlists and alerts', 'Delivery and intraday workspace'],
  },
  {
    group: 'Wealth',
    title: 'Mutual funds & SIPs',
    description: 'Build disciplined wealth with direct funds, comparisons, and recurring plans.',
    icon: Landmark,
    tone: 'blue',
    status: 'Module ready',
    href: '/funds',
    features: ['Direct fund research', 'Monthly SIP planning', 'XIRR and goal tracking'],
  },
  {
    group: 'Wealth',
    title: 'IPOs & new issues',
    description: 'Keep upcoming public offerings, price bands, lots, and allotment tracking together.',
    icon: Rocket,
    tone: 'orange',
    status: 'Integration required',
    href: '/ipo',
    features: ['IPO calendar', 'UPI mandate status', 'Allotment tracking'],
  },
  {
    group: 'Wealth',
    title: 'F&O and intraday',
    description: 'A focused derivatives workspace for positions, margin, payoff, and risk.',
    icon: BarChart3,
    tone: 'violet',
    status: 'Paper mode',
    href: '/fno',
    features: ['Option chain', 'Payoff visualizer', 'Stop-loss and target planning'],
  },
  {
    group: 'Wealth',
    title: 'Gold, bonds & US assets',
    description: 'Diversify beyond Indian equities with gold, government securities, and global exposure.',
    icon: Gem,
    tone: 'gold',
    status: 'Module ready',
    href: '/markets',
    features: ['Digital gold and SGB', 'Bonds and G-Secs', 'US stocks and ETFs'],
  },
  {
    group: 'Crypto',
    title: 'Crypto spot',
    description: 'Follow the digital asset market with INR-first discovery and paper execution.',
    icon: Bitcoin,
    tone: 'orange',
    status: 'Preview ready',
    href: '/markets',
    features: ['500+ asset catalogue', 'Market and limit orders', 'Price alerts and watchlists'],
  },
  {
    group: 'Crypto',
    title: 'Crypto futures',
    description: 'Study long and short strategies with margin controls before connecting an exchange.',
    icon: Zap,
    tone: 'red',
    status: 'Paper mode',
    href: '/markets',
    features: ['Isolated and cross margin', 'Leverage planning', 'Take-profit and stop-loss'],
  },
  {
    group: 'Crypto',
    title: 'Earn & staking',
    description: 'Track yield opportunities, lock periods, rewards, and passive-income scenarios.',
    icon: Coins,
    tone: 'green',
    status: 'Integration required',
    href: '/earn',
    features: ['APR comparison', 'Rewards tracker', 'Flexible and locked products'],
  },
  {
    group: 'Crypto',
    title: 'Web3 & launchpad',
    description: 'Keep new token launches and Web3 opportunities separate from your core portfolio.',
    icon: Globe2,
    tone: 'cyan',
    status: 'Roadmap',
    href: '/wallet',
    features: ['Token discovery', 'Launch participation', 'Web3 wallet boundary'],
  },
  {
    group: 'TradeVerse',
    title: 'Unified portfolio',
    description: 'See crypto, stocks, funds, gold, and cash in one allocation and health view.',
    icon: BriefcaseBusiness,
    tone: 'teal',
    status: 'Preview ready',
    href: '/portfolio',
    features: ['Cross-asset allocation', 'P&L and risk view', 'Portfolio health score'],
  },
  {
    group: 'TradeVerse',
    title: 'Bots & auto-invest',
    description: 'Design repeatable strategies without writing code or handing over control blindly.',
    icon: Bot,
    tone: 'violet',
    status: 'Roadmap',
    href: '/products',
    features: ['DCA and grid ideas', 'Rebalancing rules', 'Max allocation guardrails'],
  },
  {
    group: 'TradeVerse',
    title: 'Social & copy trading',
    description: 'Study public strategies and set transparent limits before considering copy execution.',
    icon: Users,
    tone: 'blue',
    status: 'Roadmap',
    href: '/products',
    features: ['Trader profiles', 'Opt-in portfolios', 'Per-trade allocation caps'],
  },
  {
    group: 'TradeVerse',
    title: 'AI health & tax',
    description: 'Turn a complex multi-asset account into understandable decisions and tax context.',
    icon: Calculator,
    tone: 'gold',
    status: 'Preview ready',
    href: '/tools',
    features: ['Diversification score', 'Tax-lot planning', 'Crypto and equity tax context'],
  },
  {
    group: 'TradeVerse',
    title: 'Developer API',
    description: 'A rate-limited REST and WebSocket boundary for future algo and reporting workflows.',
    icon: Code2,
    tone: 'slate',
    status: 'Integration required',
    href: '/profile',
    features: ['API keys and scopes', 'Market data streams', 'Paper execution endpoints'],
  },
];

const tickerItems = [
  { label: 'NIFTY 50', value: '25,487.6', change: '+0.84%' },
  { label: 'SENSEX', value: '83,921.4', change: '+0.62%' },
  { label: 'BTC / INR', value: '₹57,38,421', change: '+2.84%' },
  { label: 'ETH / INR', value: '₹2,98,442', change: '+1.62%' },
  { label: 'RELIANCE', value: '₹2,841.25', change: '+1.18%' },
  { label: 'HDFCBANK', value: '₹1,684.70', change: '-0.32%' },
];

const formatCurrency = (value: number, compact = false) => {
  if (!Number.isFinite(value)) return '₹—';
  if (compact && Math.abs(value) >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (compact && Math.abs(value) >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

function AssetLogo({ asset, size = 'normal' }: { asset: Pick<MarketAsset, 'symbol' | 'logo'>; size?: 'normal' | 'large' }) {
  const [failed, setFailed] = useState(false);
  const initials = asset.symbol.slice(0, 2);
  return (
    <span className={`asset-logo ${size === 'large' ? 'large' : ''}`} data-testid={`img-asset-logo-${asset.symbol}`}>
      {asset.logo && !failed ? <img src={asset.logo} alt="" onError={() => setFailed(true)} /> : initials}
    </span>
  );
}

function Sparkline({ points, negative = false }: { points: number[]; negative?: boolean }) {
  const path = useMemo(() => {
    if (!points.length) return '';
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    return points.map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * 100;
      const y = 39 - ((point - min) / range) * 32;
      return `${x},${y}`;
    }).join(' ');
  }, [points]);
  return (
    <svg className="spark" viewBox="0 0 100 42" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={path} fill="none" stroke={negative ? 'hsl(5 73% 53%)' : 'hsl(177 57% 35%)'} strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MainChart({ chart }: { chart: { label: string; value: number }[] }) {
  const values = chart.map((item) => item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = chart.map((item, index) => {
    const x = (index / Math.max(chart.length - 1, 1)) * 1000;
    const y = 230 - ((item.value - min) / range) * 185;
    return { ...item, x, y };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = `0,240 ${line} 1000,240`;
  return (
    <svg className="line-chart" viewBox="0 0 1000 280" preserveAspectRatio="none" data-testid="chart-asset-history">
      <defs>
        <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="hsl(177 57% 35%)" stopOpacity=".22" />
          <stop offset="1" stopColor="hsl(177 57% 35%)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[55, 115, 175, 235].map((y) => <line key={y} x1="0" x2="1000" y1={y} y2={y} stroke="hsl(42 20% 88%)" strokeWidth="1" />)}
      <polygon points={area} fill="url(#chart-fill)" />
      <polyline points={line} fill="none" stroke="hsl(177 57% 35%)" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      {points.filter((_, index) => index === 0 || index === points.length - 1).map((point) => (
        <circle key={point.label} cx={point.x} cy={point.y} r="4" fill="hsl(45 36% 99%)" stroke="hsl(177 57% 35%)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      ))}
      {points.filter((_, index) => index % Math.max(Math.floor(points.length / 5), 1) === 0).map((point) => (
        <text key={`label-${point.label}`} x={point.x} y="267" fill="hsl(229 12% 46%)" fontSize="11" textAnchor={point.x === 0 ? 'start' : point.x === 1000 ? 'end' : 'middle'}>{point.label}</text>
      ))}
    </svg>
  );
}

function LoadingDashboard() {
  return <div className="loading-grid" data-testid="loading-dashboard">
    {[1, 2, 3].map((item) => <div key={item} className="card loading-box skeleton" />)}
  </div>;
}

function StateCard({ type, title, copy, onRetry }: { type: 'error' | 'empty'; title: string; copy: string; onRetry?: () => void }) {
  return (
    <div className={`${type}-state card`} data-testid={`state-${type}`}>
      <div className="state-icon">{type === 'error' ? <CircleAlert /> : <Search />}</div>
      <h3>{title}</h3>
      <p>{copy}</p>
      {onRetry && <button className="btn btn-secondary" onClick={onRetry} data-testid="button-retry">Try again</button>}
    </div>
  );
}

function Shell({ children, orders }: { children: ReactNode; orders: Order[] }) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const me = useMe();
  const active = (href: string) => href === '/' ? location === '/' : location.startsWith(href);
  const closeMobileMenu = () => setMobileMenuOpen(false);
  const cryptoQuery = useListAssets({ category: 'crypto', sort: 'popular' });
  const liveCrypto = (cryptoQuery.data as MarketAsset[] | undefined) ?? [];
  const [liveIndices, setLiveIndices] = useState<Record<string, { ltp: number; changePct: number }>>({});
  useEffect(() => {
    let dead = false;
    const load = () => fetch('/api/live/indices', { headers: { Authorization: `Bearer ${localStorage.getItem('tv_session')}` } })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (!dead && j?.items) setLiveIndices(j.items); }).catch(() => {});
    load(); const id = setInterval(load, 10000); return () => { dead = true; clearInterval(id); };
  }, []);
  const tickerLive = tickerItems.map((item) => {
    const symbol = item.label.split(' / ')[0];
    const liveCoin = liveCrypto.find((asset) => asset.symbol === symbol);
    if (liveCoin) return { ...item, value: `₹${liveCoin.price.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, change: formatPercent(liveCoin.changePercent) };
    const idxName = symbol === 'NIFTY 50' ? 'NIFTY' : symbol === 'SENSEX' ? 'SENSEX' : null;
    const liveIdx = idxName && liveIndices[idxName];
    if (liveIdx) return { ...item, value: liveIdx.ltp.toLocaleString('en-IN', { maximumFractionDigits: 1 }), change: formatPercent(liveIdx.changePct) };
    return item;
  });
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand" data-testid="link-brand">
          <img className="brand-mark" src="/icons/icon-192.png" alt="TradeVerse" width={29} height={29} /><span className="brand-name">TradeVerse</span>
        </Link>
        <p className="nav-label">Workspace</p>
        <nav className="nav-list" aria-label="Primary navigation">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`nav-link ${active(href) ? 'active' : ''}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>
              <Icon /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="paper-badge" data-testid="status-paper-trading">
            <ShieldCheck />
            <div><strong>Paper trading only</strong><span>No real money moves here. Build conviction first.</span></div>
          </div>
          <Link href="/profile" className="user-chip" data-testid="link-profile-sidebar">
            <span className="avatar">{me.initials}</span>
            <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{me.label}<small>Personal workspace</small></div>
          </Link>
        </div>
      </aside>
      <main className="main">
        <div className="mobile-topbar">
          <Link href="/" className="brand" data-testid="link-mobile-brand"><img className="brand-mark" src="/icons/icon-192.png" alt="TradeVerse" width={29} height={29} /><span className="brand-name">TradeVerse</span></Link>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="icon-btn" aria-label="Search" onClick={() => setMobileSearch((v) => !v)} data-testid="button-mobile-search"><Search /></button>
          <ThemeToggle />
          <NotificationBell orders={orders} />
          <button
            className="icon-btn"
            aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
            data-testid="button-mobile-menu"
          >
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
          </div>
        </div>
        {mobileSearch && <div className="mobile-search" style={{ position: 'sticky', top: 63, zIndex: 22, padding: '8px 14px', background: 'hsl(var(--background))' }}><GlobalSearch pages={navItems} autoFocus onDone={() => setMobileSearch(false)} /></div>}
        {mobileMenuOpen && (
          <div className="mobile-menu" role="dialog" aria-label="Mobile navigation">
            <button className="mobile-menu-backdrop" aria-label="Close navigation" onClick={closeMobileMenu} />
            <aside className="mobile-menu-panel">
              <div className="mobile-menu-heading">
                <div>
                  <p className="eyebrow">Workspace</p>
                  <strong>Move with intention.</strong>
                </div>
                <button className="icon-btn" aria-label="Close navigation" onClick={closeMobileMenu}><X /></button>
              </div>
              <nav className="mobile-menu-links" aria-label="Mobile primary navigation">
                {navItems.map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} onClick={closeMobileMenu} className={`mobile-menu-link ${active(href) ? 'active' : ''}`}>
                    <Icon /><span>{label}</span><ChevronRight size={15} />
                  </Link>
                ))}
              </nav>
              <div className="paper-badge">
                <ShieldCheck />
                <div><strong>Paper trading only</strong><span>No real money moves here. Build conviction first.</span></div>
              </div>
            </aside>
          </div>
        )}
        <header className="topbar">
          <div className="breadcrumb">Workspace <ChevronRight size={12} /> <strong>{navItems.find((n) => n.href !== '/' && location.startsWith(n.href))?.label ?? (location === '/' ? 'Overview' : 'Workspace')}</strong></div>
          <GlobalSearch pages={navItems} />
          <div className="top-actions">
            <span className="market-status"><i /> Market open</span>
            <ThemeToggle />
            <NotificationBell orders={orders} />
            <Link href="/profile" className="avatar" data-testid="link-profile-avatar" aria-label="Profile">{me.initials}</Link>
          </div>
        </header>
        <div className="ticker-tape" aria-label="Market ticker">
          <div className="ticker-track">
            {tickerLive.concat(tickerLive).map((item, index) => (
              <span className="ticker-item" key={`${item.label}-${index}`}><strong>{item.label}</strong><b>{item.value}</b><em className={item.change.startsWith('-') ? 'negative' : 'positive'}>{item.change}</em></span>
            ))}
          </div>
        </div>
        {children}
      </main>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navItems.slice(0, 4).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={active(href) ? 'active' : ''} data-testid={`link-mobile-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon /><span>{label === 'Paper orders' ? 'Orders' : label}</span></Link>
        ))}
      </nav>
    </div>
  );
}

function DashboardPage() {
  const dashboardQuery = useGetDashboard();
  const activityQuery = useGetActivity();
  const me = useMe();
  const dashboard = dashboardQuery.data as Dashboard | undefined;
  const activity = activityQuery.data as Activity[] | undefined;
  if (dashboardQuery.isLoading) return <div className="page"><LoadingDashboard /></div>;
  if (dashboardQuery.isError || !dashboard) return <div className="page"><StateCard type="error" title="Dashboard took a wrong turn" copy="Your workspace could not be loaded. Nothing has been changed." onRetry={() => dashboardQuery.refetch()} /></div>;
  const watchlist = dashboard.watchlist ?? [];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="page">
      <div className="page-heading">
        <div><p className="eyebrow">{today} · Mumbai</p><h1>{greeting}, {me.label}.</h1></div>
        <Link href="/markets" className="btn btn-primary" data-testid="link-explore-markets"><LineChart /> Explore markets</Link>
      </div>
      <div className="dashboard-grid">
        <div className="hero-card card">
          <p className="eyebrow">Total portfolio value</p>
          <div className="hero-value" data-testid="text-portfolio-value">{formatCurrency(dashboard.portfolioValue)}<small>INR</small></div>
          <div className="hero-meta"><span className="positive" data-testid="text-day-change">{formatCurrency(dashboard.dayChange)} ({formatPercent(dashboard.dayChangePercent)})</span><span>today</span></div>
        </div>
        <div className="metric-card card">
          <div className="metric-label"><span>Invested capital</span><WalletCards /></div>
          <div className="metric-value" data-testid="text-invested-value">{formatCurrency(dashboard.investedValue, true)}</div>
          <div className="metric-foot">Across your active positions</div>
        </div>
        <div className="metric-card health-card card">
          <div className="metric-label"><span>Portfolio health</span><Gauge /></div>
          <div className="health-score"><div className="score-ring"><strong data-testid="text-health-score">{dashboard.healthScore}</strong></div><div className="health-copy"><strong>{dashboard.healthScore >= 75 ? 'Well balanced' : 'Room to tune'}</strong><span>Risk-aware allocation</span></div></div>
          <div className="metric-foot">Cash buffer · {formatCurrency(dashboard.cashBalance, true)}</div>
        </div>
      </div>
      <div className="quick-actions" aria-label="Quick actions">
        <span className="quick-actions-label">Quick actions</span>
        <Link href="/markets" className="quick-action"><LineChart /><span><strong>Trade</strong><small>Explore markets</small></span><ArrowUpRight /></Link>
        <Link href="/wallet" className="quick-action"><WalletCards /><span><strong>Wallet</strong><small>Send crypto, address book</small></span><ArrowUpRight /></Link>
        <Link href="/funds" className="quick-action"><Sparkles /><span><strong>Start a SIP</strong><small>Invest regularly</small></span><ArrowUpRight /></Link>
        <Link href="/tools" className="quick-action"><ShieldCheck /><span><strong>Learn</strong><small>Risk before return</small></span><ArrowUpRight /></Link>
      </div>
      <div className="lower-grid">
        <section className="watch-card card">
          <div className="section-header"><div><h2>On your radar</h2><p className="subtle">A short list worth a closer look</p></div><Link href="/markets" className="link-button" data-testid="link-view-all-markets">View all</Link></div>
          {watchlist.length ? <div className="watch-items">{watchlist.slice(0, 5).map((asset) => <Link href={`/markets/${asset.symbol}`} className="asset-row" key={asset.symbol} data-testid={`link-watchlist-${asset.symbol}`}>
            <AssetLogo asset={asset} /><div className="asset-name"><strong>{asset.symbol}</strong><span>{asset.name}</span></div><div className="asset-price"><strong>{formatCurrency(asset.price)}</strong><span className={asset.changePercent >= 0 ? 'positive' : 'negative'}>{formatPercent(asset.changePercent)}</span></div>
          </Link>)}</div> : <StateCard type="empty" title="Your radar is clear" copy="Browse markets and pin the assets you want to follow." />}
        </section>
        <section className="activity-card card">
          <div className="section-header"><div><h2>Recent activity</h2><p className="subtle">The latest moves in your workspace</p></div><ActivityIcon size={17} color="hsl(177 57% 35%)" /></div>
          {activityQuery.isLoading ? <div className="skeleton" style={{ height: 210 }} /> : activity?.length ? <div className="activity-list">{activity.slice(0, 4).map((item) => <div className="activity-row" key={item.id} data-testid={`row-activity-${item.id}`}>
            <div className="activity-icon">{item.type === 'order' ? <BarChart3 /> : item.type === 'deposit' ? <CreditCard /> : <Sparkles />}</div><div className="activity-copy"><strong>{item.title}</strong><span>{item.detail} · {formatDate(item.timestamp)}</span></div><span className={`activity-amount ${item.amount >= 0 ? 'positive' : 'negative'}`}>{item.amount >= 0 ? '+' : ''}{formatCurrency(item.amount)}</span>
          </div>)}</div> : <StateCard type="empty" title="No activity yet" copy="Your first deposit, SIP, or paper order will appear here." />}
        </section>
      </div>
      <div className="insights-grid">
        <section className="insight-card card">
          <div className="section-header"><div><p className="eyebrow">Market pulse</p><h2>Movers today</h2></div><Link href="/markets" className="link-button">View markets</Link></div>
          <div className="movers-list">
            {watchlist.slice(0, 4).map((asset) => <Link href={`/markets/${asset.symbol}`} className="mover-row" key={`mover-${asset.symbol}`}><AssetLogo asset={asset} /><span><strong>{asset.symbol}</strong><small>{asset.name}</small></span><Sparkline points={asset.sparkline} negative={asset.changePercent < 0} /><b className={asset.changePercent >= 0 ? 'positive' : 'negative'}>{formatPercent(asset.changePercent)}</b></Link>)}
          </div>
        </section>
        <section className="insight-card card">
          <div className="section-header"><div><p className="eyebrow">Research desk</p><h2>Signals to explore</h2></div><BookOpen size={17} color="hsl(var(--accent))" /></div>
          <div className="signal-list">
            <Link href="/products" className="signal-row"><span className="signal-icon"><Sparkles /></span><span><strong>Portfolio health is {dashboard.healthScore}</strong><small>Review your crypto concentration before adding risk.</small></span><ChevronRight /></Link>
            <Link href="/funds" className="signal-row"><span className="signal-icon orange"><TrendingUp /></span><span><strong>3 SIP ideas ready</strong><small>Explore recurring investments from ₹500/month.</small></span><ChevronRight /></Link>
            <Link href="/fno" className="signal-row"><span className="signal-icon blue"><BookOpen /></span><span><strong>New to F&O?</strong><small>Learn margin, leverage, and payoff before trading.</small></span><ChevronRight /></Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function ProductsPage() {
  const [filter, setFilter] = useState<'All' | 'Wealth' | 'Crypto' | 'TradeVerse'>('All');
  const visibleModules = filter === 'All' ? productModules : productModules.filter((module) => module.group === filter);
  const readyCount = productModules.filter((module) => module.status === 'Preview ready' || module.status === 'Module ready').length;

  return (
    <div className="page">
      <div className="page-heading product-heading">
        <div>
          <p className="eyebrow">The full TradeVerse universe</p>
          <h1>Every market. One workspace.</h1>
          <p className="subtle product-intro">Stocks, funds, and crypto, organized without the clutter.</p>
        </div>
        <div className="product-summary">
          <strong>{productModules.length}</strong>
          <span>product modules</span>
        </div>
      </div>

      <div className="product-hero card">
        <div className="product-hero-copy">
          <span className="product-kicker"><Sparkles size={14} /> Unified by design</span>
          <h2>Choose the way you want to build conviction.</h2>
          <p>Research, practice, and understand the whole account before connecting any live broker or exchange.</p>
        </div>
        <div className="product-hero-stats">
          <div><strong>{readyCount}</strong><span>available now</span></div>
          <div><strong>3</strong><span>asset families</span></div>
          <div><strong>0</strong><span>live trades enabled</span></div>
        </div>
      </div>

      <div className="product-toolbar">
        <div>
          <p className="eyebrow">Explore modules</p>
          <h2>Built for the whole journey</h2>
        </div>
        <div className="filter-tabs product-filters" role="tablist" aria-label="Product groups">
          {(['All', 'Wealth', 'Crypto', 'TradeVerse'] as const).map((item) => (
            <button key={item} className={`filter-tab ${filter === item ? 'active' : ''}`} onClick={() => setFilter(item)} role="tab" aria-selected={filter === item}>
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="product-grid">
        {visibleModules.map((module) => {
          const Icon = module.icon;
          const isLivePreview = module.status === 'Preview ready' || module.status === 'Module ready' || module.status === 'Paper mode';
          return (
            <article className={`product-card card tone-${module.tone}`} key={module.title}>
              <div className="product-card-top">
                <span className="product-icon"><Icon /></span>
                <span className={`product-status ${isLivePreview ? 'ready' : 'roadmap'}`}>{module.status}</span>
              </div>
              <p className="product-group">{module.group}</p>
              <h3>{module.title}</h3>
              <p className="product-description">{module.description}</p>
              <ul className="product-features">
                {module.features.map((feature) => <li key={feature}><Check size={13} />{feature}</li>)}
              </ul>
              <Link className="product-link" href={module.href}>
                {isLivePreview ? 'Open workspace' : 'View module'} <ArrowUpRight size={14} />
              </Link>
            </article>
          );
        })}
      </div>

      <div className="integration-banner card">
        <div className="integration-banner-icon"><ShieldCheck /></div>
        <div>
          <strong>Live integrations stay behind a safety gate.</strong>
          <p>Broker execution, KYC, payments, custody, staking, and Web3 wallet actions require verified providers and production credentials. TradeVerse keeps this preview paper-only until those boundaries are configured.</p>
        </div>
        <Link href="/profile" className="btn btn-secondary">View readiness <ChevronRight size={14} /></Link>
      </div>
    </div>
  );
}

function MarketsPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [sort, setSort] = useState<'popular' | 'gainers' | 'losers'>('popular');
  const params = useMemo(() => ({ category, search: search || undefined, sort }), [category, search, sort]);
  const assetsQuery = useListAssets(params);
  const assets = (assetsQuery.data as MarketAsset[] | undefined) ?? [];
  return (
    <div className="page">
      <div className="page-heading"><div><p className="eyebrow">Market intelligence</p><h1>Find your next thesis.</h1><p className="subtle" style={{ margin: '10px 0 0' }}>One clean view across the assets that shape your wealth.</p></div></div>
      <div className="toolbar">
        <div className="search-wrap"><Search /><input className="input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or symbol" data-testid="input-market-search" /></div>
        <div className="filter-tabs" role="tablist" aria-label="Asset category">
          {(['all', 'crypto', 'stocks', 'funds'] as Category[]).map((item) => <button key={item} className={`filter-tab ${category === item ? 'active' : ''}`} onClick={() => setCategory(item)} role="tab" data-testid={`button-filter-${item}`}>{item === 'all' ? 'Everything' : item[0].toUpperCase() + item.slice(1)}</button>)}
        </div>
        <label><span className="sr-only">Sort assets</span><select className="select" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} data-testid="select-market-sort"><option value="popular">Most watched</option><option value="gainers">Top gainers</option><option value="losers">Top losers</option></select></label>
      </div>
      {assetsQuery.isLoading ? <div className="market-grid">{[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="card loading-box skeleton" />)}</div>
        : assetsQuery.isError ? <StateCard type="error" title="Market feed is resting" copy="We could not fetch the latest instruments. Try again in a moment." onRetry={() => assetsQuery.refetch()} />
          : assets.length ? <div className="market-grid">{assets.map((asset) => <Link key={asset.symbol} href={`/markets/${asset.symbol}`} className="market-card card" data-testid={`link-market-${asset.symbol}`}>
            <div className="market-card-top"><div className="market-card-main"><AssetLogo asset={asset} /><div><strong>{asset.symbol}</strong><span>{asset.name}</span></div></div><span className="category-tag">{asset.category}</span></div>
            <Sparkline points={asset.sparkline} negative={asset.changePercent < 0} />
            <div className="market-card-bottom"><div><div className="market-card-price">{formatCurrency(asset.price)}</div><div className="market-card-cap">MCap {formatCurrency(asset.marketCap, true)}</div></div><span className={`pill ${asset.changePercent >= 0 ? 'positive' : 'negative'}`}>{asset.changePercent >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{formatPercent(asset.changePercent)}</span></div>
          </Link>)}</div>
          : <StateCard type="empty" title="No assets match that view" copy="Try a different symbol, category, or sort order." onRetry={() => { setSearch(''); setCategory('all'); }} />}
    </div>
  );
}

function OrderForm({ asset, onPlaced }: { asset: MarketAssetDetail; onPlaced: () => void }) {
  const mutation = usePlaceDemoOrder();
  const [side, setSide] = useState<OrderInput['side']>('buy');
  const [orderType, setOrderType] = useState<OrderInput['orderType']>('market');
  const [quantity, setQuantity] = useState('1');
  const [limitPrice, setLimitPrice] = useState(String(asset.price));
  const [error, setError] = useState('');
  const submit = () => {
    const amount = Number(quantity);
    const price = Number(limitPrice);
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a quantity greater than zero.'); return; }
    if (orderType === 'limit' && (!Number.isFinite(price) || price <= 0)) { setError('Enter a valid limit price.'); return; }
    setError('');
    mutation.mutate({ data: { symbol: asset.symbol, side, orderType, quantity: amount, limitPrice: orderType === 'limit' ? price : null } }, { onSuccess: () => onPlaced() });
  };
  return <aside className="order-card card">
    <p className="eyebrow">Paper entry</p><h2>Place an order</h2><p className="subtle">Practice the decision. No capital at risk.</p>
    <label className="form-label">Direction</label>
    <div className="side-toggle"><button className={side === 'buy' ? 'selected-buy' : ''} onClick={() => setSide('buy')} data-testid="button-order-buy">Buy</button><button className={side === 'sell' ? 'selected-sell' : ''} onClick={() => setSide('sell')} data-testid="button-order-sell">Sell</button></div>
    <label className="form-label" htmlFor="order-quantity">Quantity</label><input id="order-quantity" className="input" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} data-testid="input-order-quantity" />
    <label className="form-label" htmlFor="order-type">Order type</label><select id="order-type" className="select" value={orderType} onChange={(event) => setOrderType(event.target.value as OrderInput['orderType'])} data-testid="select-order-type"><option value="market">Market</option><option value="limit">Limit</option></select>
    {orderType === 'limit' && <><label className="form-label" htmlFor="limit-price">Limit price</label><input id="limit-price" className="input" inputMode="decimal" value={limitPrice} onChange={(event) => setLimitPrice(event.target.value)} data-testid="input-limit-price" /></>}
    <div className="order-note"><ShieldCheck /><span>Orders are simulated against market data. Live execution is not enabled.</span></div>
    {error && <p className="negative" style={{ fontSize: 11, margin: '0 0 12px' }} data-testid="status-order-error">{error}</p>}
    <button className="btn btn-primary full" onClick={submit} disabled={mutation.isPending} data-testid="button-submit-order">{mutation.isPending ? 'Simulating…' : `Simulate ${side} order`}<ArrowUpRight /></button>
    {mutation.isError && <p className="negative" style={{ fontSize: 11, margin: '10px 0 0' }} data-testid="status-order-api-error">{(mutation.error as Error)?.message || 'Order could not be placed. Check your connection and retry.'}</p>}
  </aside>;
}

function MarketDetailPage({ onOrderPlaced }: { onOrderPlaced: () => void }) {
  const params = useParams<{ symbol: string }>();
  const symbol = params.symbol ?? '';
  const assetQuery = useGetAsset(symbol);
  const asset = assetQuery.data as MarketAssetDetail | undefined;
  const me = useMe();
  if (assetQuery.isLoading) return <div className="page"><LoadingDashboard /></div>;
  if (assetQuery.isError || !asset) return <div className="page"><Link href="/markets" className="btn btn-secondary" data-testid="link-back-markets"><ArrowLeft /> Back to markets</Link><div style={{ marginTop: 18 }}><StateCard type="error" title="That asset is unavailable" copy="The instrument may have moved or is not part of this market feed." onRetry={() => assetQuery.refetch()} /></div></div>;
  return <div className="page">
    <Link href="/markets" className="link-button" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 17 }} data-testid="link-back-markets"><ArrowLeft size={14} /> Back to markets</Link>
    <div className="detail-layout">
      <div className="detail-main">
        <div className="asset-hero card"><div className="asset-title"><AssetLogo asset={asset} size="large" /><div><h1>{asset.symbol}</h1><p>{asset.name} · {asset.category}</p></div></div><div className="asset-current"><strong data-testid="text-asset-price">{formatCurrency(asset.price)}</strong><span className={asset.changePercent >= 0 ? 'positive' : 'negative'} data-testid="text-asset-change">{formatPercent(asset.changePercent)} today</span></div></div>
        <div className="chart-card card"><div className="chart-tools"><div><h2>Price history</h2><p className="subtle">A measured view of the trend</p></div></div><Suspense fallback={<div className="skeleton" style={{ height: 280 }} />}><LiveChart symbol={asset.symbol} category={asset.category} price={asset.price} /></Suspense></div>
        <div className="detail-description card"><h2>About {asset.symbol}</h2><p>{asset.description}</p><div className="stats-grid">{[['Day high', asset.stats.high], ['Day low', asset.stats.low], ['Volume', asset.stats.volume], ['Market cap', asset.stats.marketCap]].map(([label, value]) => <div className="stat" key={String(label)}><span>{label}</span><strong>{formatCurrency(Number(value), true)}</strong></div>)}</div></div>
      </div>
      <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>{me.isOwner && <Suspense fallback={null}><LiveTradeBox symbol={asset.symbol} category={asset.category} /></Suspense>}<OrderForm asset={asset} onPlaced={onOrderPlaced} /></div>
    </div>
  </div>;
}

function PortfolioPage() {
  const portfolioQuery = useGetPortfolio();
  const portfolio = portfolioQuery.data as Portfolio | undefined;
  if (portfolioQuery.isLoading) return <div className="page"><LoadingDashboard /></div>;
  if (portfolioQuery.isError || !portfolio) return <div className="page"><StateCard type="error" title="Portfolio is out of view" copy="We could not load your current holdings." onRetry={() => portfolioQuery.refetch()} /></div>;
  const allocationTotal = portfolio.allocation.reduce((total, item) => total + item.value, 0) || 1;
  const conic = portfolio.allocation.reduce<{ css: string; total: number }>((result, item) => {
    const start = result.total;
    const end = start + (item.value / allocationTotal) * 100;
    return { css: `${result.css}${result.css ? ', ' : ''}${item.color} ${start}% ${end}%`, total: end };
  }, { css: '', total: 0 }).css;
  return <div className="page">
    <div className="page-heading"><div><p className="eyebrow">Your capital, in context</p><h1>Portfolio room.</h1><p className="subtle" style={{ margin: '10px 0 0' }}>The whole picture, without the noise.</p></div><button className="btn btn-secondary" onClick={() => portfolioQuery.refetch()} data-testid="button-refresh-portfolio"><RefreshCw /> Refresh view</button></div>
    <div className="portfolio-hero card"><div className="portfolio-stat"><span>Total value</span><strong data-testid="text-portfolio-total">{formatCurrency(portfolio.totalValue)}</strong></div><div className="portfolio-stat"><span>Invested</span><strong data-testid="text-portfolio-invested">{formatCurrency(portfolio.investedValue)}</strong></div><div className="portfolio-stat"><span>Total P&amp;L</span><strong className={portfolio.totalPnl >= 0 ? 'positive' : 'negative'} data-testid="text-total-pnl">{formatCurrency(portfolio.totalPnl)} <small style={{ font: '500 11px var(--app-font-mono)' }}>({formatPercent(portfolio.totalPnlPercent)})</small></strong></div></div>
    <div className="portfolio-body"><section className="allocation-card card"><div className="section-header"><div><h2>Allocation</h2><p className="subtle">By asset class</p></div><SlidersHorizontal size={17} color="hsl(229 12% 46%)" /></div>{portfolio.allocation.length ? <><div className="allocation-visual"><div className="donut" style={{ background: `conic-gradient(${conic})` }}><div className="donut-hole"><div><strong>{portfolio.allocation.length}</strong><span>asset classes</span></div></div></div><div className="legend">{portfolio.allocation.map((item) => <div className="legend-item" key={item.label}><i className="legend-dot" style={{ background: item.color }} /><span>{item.label}</span><strong>{Math.round((item.value / allocationTotal) * 100)}%</strong></div>)}</div></div></> : <StateCard type="empty" title="Nothing allocated yet" copy="Your allocation will take shape as positions are added." />}</section>
      <section className="table-card card"><div className="section-header"><div><h2>Holdings</h2><p className="subtle">Your positions at a glance</p></div><Link href="/markets" className="link-button" data-testid="link-add-holding">Add position</Link></div>{portfolio.holdings.length ? <div className="table-scroll"><table><thead><tr><th>Asset</th><th>Quantity</th><th>Avg. price</th><th>Value</th><th>Return</th></tr></thead><tbody>{portfolio.holdings.map((holding) => <HoldingRow key={holding.symbol} holding={holding} />)}</tbody></table></div> : <StateCard type="empty" title="No holdings yet" copy="Explore a market and place a paper order to start a position." />}</section>
    </div>
  </div>;
}

function HoldingRow({ holding }: { holding: Holding }) {
  return <tr data-testid={`row-holding-${holding.symbol}`}><td><Link href={`/markets/${holding.symbol}`} className="cell-asset"><AssetLogo asset={holding} /><span>{holding.symbol}</span></Link></td><td>{holding.quantity}</td><td>{formatCurrency(holding.averagePrice)}</td><td>{formatCurrency(holding.currentValue)}</td><td className={holding.pnl >= 0 ? 'positive' : 'negative'}>{formatCurrency(holding.pnl)}<br /><small>{formatPercent(holding.pnlPercent)}</small></td></tr>;
}

function OrdersPage({ ordersQuery }: { ordersQuery: ReturnType<typeof useGetOrders> }) {
  const orders = (ordersQuery.data as Order[] | undefined) ?? [];
  if (ordersQuery.isLoading) return <div className="page"><LoadingDashboard /></div>;
  if (ordersQuery.isError) return <div className="page"><StateCard type="error" title="Orders could not be loaded" copy="Your paper order history is temporarily unavailable." onRetry={() => ordersQuery.refetch()} /></div>;
  return <div className="page">
    <div className="page-heading"><div><p className="eyebrow">Practice ledger</p><h1>Paper orders.</h1><p className="subtle" style={{ margin: '10px 0 0' }}>Every decision stays simulated until you choose otherwise.</p></div><Link href="/markets" className="btn btn-primary" data-testid="link-new-paper-order"><LineChart /> New paper order</Link></div>
    {orders.length ? <div className="order-list">{orders.map((order) => <div className="order-row card" key={order.id} data-testid={`row-order-${order.id}`}><div className="order-row-main"><span className="asset-logo">{order.symbol.slice(0, 2)}</span><div><strong>{order.symbol}</strong><span>{order.quantity} units · {order.orderType} order</span></div></div><span className={`order-side ${order.side === 'buy' ? 'positive' : 'negative'}`}>{order.side}</span><span className={`status ${order.status}`}>{order.status}</span><span className="order-date">{formatDate(order.createdAt)}</span></div>)}</div>
      : <div className="card"><StateCard type="empty" title="No paper orders yet" copy="When you are ready to test a thesis, pick an asset and place a simulated order." onRetry={() => {}} /></div>}
    <div className="paper-badge" style={{ marginTop: 16, color: 'hsl(var(--foreground))', background: 'hsl(var(--accent) / .14)', borderColor: 'hsl(var(--accent) / .3)' }} data-testid="status-orders-paper"><ShieldCheck style={{ color: 'hsl(32 77% 38%)' }} /><div><strong>Safe by design</strong><span style={{ color: 'hsl(var(--muted-foreground))' }}>TradeVerse orders never connect to a broker or move real funds.</span></div></div>
  </div>;
}

function ProfilePage() {
  const dashboardQuery = useGetDashboard();
  const me = useMe();
  const stored = (k: string, d: boolean) => { try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch { return d; } };
  const [notifications, setNotificationsRaw] = useState(() => stored('tv_pref_alerts', true));
  const [digest, setDigestRaw] = useState(() => stored('tv_pref_digest', false));
  const setNotifications = (f: (v: boolean) => boolean) => setNotificationsRaw((v) => { const n = f(v); try { localStorage.setItem('tv_pref_alerts', n ? '1' : '0'); } catch {} return n; });
  const setDigest = (f: (v: boolean) => boolean) => setDigestRaw((v) => { const n = f(v); try { localStorage.setItem('tv_pref_digest', n ? '1' : '0'); } catch {} return n; });
  return <div className="page">
    <div className="page-heading"><div><p className="eyebrow">Workspace settings</p><h1>Profile &amp; readiness.</h1><p className="subtle" style={{ margin: '10px 0 0' }}>A quiet place to keep your setup in order.</p></div></div>
    <div className="profile-layout"><section className="profile-card card"><div className="profile-header"><span className="avatar profile-avatar">{me.initials}</span><div><h2>{me.label}</h2><p className="subtle" style={{ margin: 0 }}>Personal workspace</p></div><LogoutButton className="btn btn-secondary" /></div><div className="preference-row"><div><strong>Market movement alerts</strong><span>Keep an eye on the assets in your radar.</span></div><button className={`toggle ${notifications ? 'on' : ''}`} onClick={() => setNotifications((value) => !value)} aria-label="Toggle market movement alerts" data-testid="toggle-market-alerts" /></div><div className="preference-row"><div><strong>Weekly conviction digest</strong><span>A short review of portfolio health and activity.</span></div><button className={`toggle ${digest ? 'on' : ''}`} onClick={() => setDigest((value) => !value)} aria-label="Toggle weekly conviction digest" data-testid="toggle-weekly-digest" /></div><div className="preference-row"><div><strong>Account mode</strong><span>Live execution is deliberately unavailable in this workspace.</span></div><span className="pill">Paper only</span></div></section>
      <aside className="readiness-card card"><div className="section-header"><div><h2>Infrastructure</h2><p className="subtle">What is connected today</p></div><Database size={17} color="hsl(177 57% 35%)" /></div><div className="ready-state">{dashboardQuery.isError ? <CircleAlert /> : <Check />}<div><strong>{dashboardQuery.isError ? 'Needs attention' : 'Workspace ready'}</strong><span>{dashboardQuery.isError ? 'Dashboard data is currently unavailable.' : 'Your market workspace is responding normally.'}</span></div></div><div className="infra-list"><div className="infra-item"><span>Market data</span><strong>{dashboardQuery.isError ? 'CHECK' : 'CONNECTED'}</strong></div><div className="infra-item"><span>Paper order engine</span><strong>ENABLED</strong></div><div className="infra-item"><span>Broker connection</span><strong>OFF BY DESIGN</strong></div><div className="infra-item"><span>Data region</span><strong>IN · MUM</strong></div></div><button className="btn btn-secondary full" style={{ marginTop: 18 }} onClick={() => dashboardQuery.refetch()} data-testid="button-check-readiness"><RefreshCw /> Run readiness check</button></aside>
    </div>
  </div>;
}

function NotFound() {
  return <div className="page"><StateCard type="empty" title="This page is off the map" copy="The route you followed does not exist in TradeVerse." /></div>;
}

function Router() {
  const [location] = useLocation();
  const [, setLocation] = useLocation();
  const ordersQuery = useGetOrders();
  const orders = (ordersQuery.data as Order[] | undefined) ?? [];
  const handleOrderPlaced = () => {
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPortfolioQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetActivityQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey() });
    setLocation('/orders');
  };
  return <ErrorBoundary resetKey={location}><Shell orders={orders}><Suspense fallback={<div className="page"><LoadingDashboard /></div>}><Switch>
    <Route path="/" component={DashboardPage} />
    <Route path="/products" component={ProductsPage} />
    <Route path="/markets" component={MarketsPage} />
    <Route path="/markets/:symbol"><MarketDetailPage onOrderPlaced={handleOrderPlaced} /></Route>
    <Route path="/portfolio" component={PortfolioPage} />
    <Route path="/orders"><OrdersPage ordersQuery={ordersQuery} /></Route>
    <Route path="/fno" component={FnoPage} />
    <Route path="/funds" component={FundsPage} />
    <Route path="/ipo" component={IpoPage} />
    <Route path="/earn" component={EarnPage} />
    <Route path="/p2p" component={P2pPage} />
    <Route path="/futures" component={FuturesPage} />
    <Route path="/wallet" component={WalletPage} />
    <Route path="/live" component={LiveMarketsPage} />
    <Route path="/live/:market/:symbol" component={TradePage} />
    <Route path="/add-money" component={AddMoneyPage} />
    <Route path="/tools" component={ToolsPage} />
    <Route path="/profile" component={ProfilePage} />
    <Route component={NotFound} />
  </Switch></Suspense></Shell></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><AuthGate><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter></AuthGate><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;