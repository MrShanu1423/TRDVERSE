export type AssetCategory = "crypto" | "stocks" | "funds";

export type MarketAsset = {
  symbol: string;
  name: string;
  category: AssetCategory;
  price: number;
  changePercent: number;
  marketCap: number;
  logo: string;
  sparkline: number[];
};

export const assets: MarketAsset[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    category: "crypto",
    price: 5738421,
    changePercent: 2.84,
    marketCap: 112000000000000,
    logo: "₿",
    sparkline: [46, 48, 47, 51, 50, 54, 57],
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    category: "crypto",
    price: 298442,
    changePercent: 1.62,
    marketCap: 35800000000000,
    logo: "Ξ",
    sparkline: [45, 46, 44, 48, 49, 50, 52],
  },
  {
    symbol: "SOL",
    name: "Solana",
    category: "crypto",
    price: 14682,
    changePercent: -0.74,
    marketCap: 6900000000000,
    logo: "S",
    sparkline: [53, 52, 54, 50, 51, 48, 49],
  },
  {
    symbol: "RELIANCE",
    name: "Reliance Industries",
    category: "stocks",
    price: 2841.25,
    changePercent: 1.18,
    marketCap: 19200000000000,
    logo: "R",
    sparkline: [42, 43, 42, 46, 45, 48, 49],
  },
  {
    symbol: "HDFCBANK",
    name: "HDFC Bank",
    category: "stocks",
    price: 1684.7,
    changePercent: -0.32,
    marketCap: 12800000000000,
    logo: "H",
    sparkline: [50, 49, 49, 48, 50, 48, 47],
  },
  {
    symbol: "INFY",
    name: "Infosys",
    category: "stocks",
    price: 1922.4,
    changePercent: 0.86,
    marketCap: 7980000000000,
    logo: "I",
    sparkline: [41, 42, 44, 43, 46, 47, 48],
  },
  {
    symbol: "NIFTYBEES",
    name: "Nippon India ETF Nifty BeES",
    category: "funds",
    price: 267.84,
    changePercent: 0.44,
    marketCap: 410000000000,
    logo: "N",
    sparkline: [38, 39, 40, 40, 42, 41, 43],
  },
  {
    symbol: "GOLDBEES",
    name: "Nippon India ETF Gold BeES",
    category: "funds",
    price: 76.31,
    changePercent: 0.21,
    marketCap: 154000000000,
    logo: "G",
    sparkline: [40, 41, 41, 42, 43, 43, 44],
  },
];

export const holdings = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    category: "crypto" as const,
    quantity: 0.18,
    averagePrice: 4820000,
    currentValue: 1032915.78,
    pnl: 165515.78,
    pnlPercent: 19.08,
    logo: "₿",
  },
  {
    symbol: "RELIANCE",
    name: "Reliance Industries",
    category: "stocks" as const,
    quantity: 18,
    averagePrice: 2448.3,
    currentValue: 51142.5,
    pnl: 7072.1,
    pnlPercent: 16.06,
    logo: "R",
  },
  {
    symbol: "NIFTYBEES",
    name: "Nippon India ETF Nifty BeES",
    category: "funds" as const,
    quantity: 120,
    averagePrice: 221.12,
    currentValue: 32140.8,
    pnl: 5566.4,
    pnlPercent: 20.95,
    logo: "N",
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    category: "crypto" as const,
    quantity: 1.1,
    averagePrice: 241500,
    currentValue: 328286.2,
    pnl: 62186.2,
    pnlPercent: 23.37,
    logo: "Ξ",
  },
];

export const allocation = [
  { label: "Crypto", value: 68, color: "#F29D49" },
  { label: "Stocks", value: 18, color: "#5B7CFA" },
  { label: "Funds", value: 9, color: "#6BCB9B" },
  { label: "Cash", value: 5, color: "#B8C0CC" },
];

export const activity = [
  {
    id: "act-001",
    type: "order" as const,
    title: "Bought Bitcoin",
    detail: "0.03 BTC · Paper order",
    amount: 172152.63,
    timestamp: "Today, 9:41 AM",
  },
  {
    id: "act-002",
    type: "sip" as const,
    title: "Nifty BeES SIP",
    detail: "Monthly investment completed",
    amount: 5000,
    timestamp: "Yesterday, 4:00 PM",
  },
  {
    id: "act-003",
    type: "reward" as const,
    title: "Earn rewards credited",
    detail: "USDC yield · Paper balance",
    amount: 842.18,
    timestamp: "28 Sep, 11:12 AM",
  },
  {
    id: "act-004",
    type: "deposit" as const,
    title: "Cash balance added",
    detail: "Demo wallet top-up",
    amount: 25000,
    timestamp: "26 Sep, 10:30 AM",
  },
];

export function assetDetail(asset: MarketAsset) {
  const values = asset.sparkline.map((value, index) => ({
    label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index] ?? "",
    value: Math.round(asset.price * (0.94 + value / 1000)),
  }));

  return {
    ...asset,
    description:
      asset.category === "crypto"
        ? `${asset.name} is available in the TradeVerse demo market for paper trading and portfolio tracking.`
        : `${asset.name} is available in the TradeVerse demo market for research and paper investing.`,
    stats: {
      high: asset.price * 1.04,
      low: asset.price * 0.96,
      volume: asset.marketCap * 0.012,
      marketCap: asset.marketCap,
    },
    chart: values,
  };
}