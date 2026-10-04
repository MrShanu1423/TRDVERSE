import { Router, type IRouter } from "express";
import {
  GetAssetParams,
  GetAssetResponse,
  ListAssetsQueryParams,
  ListAssetsResponse,
} from "@workspace/api-zod";
import { assetDetail, assets, type MarketAsset } from "./tradeverse-data";
import { cryptoSnapshot } from "./marketdata";

const router: IRouter = Router();

/** Overlays live Binance price/change onto the crypto rows of the demo catalogue; stocks stay catalogue prices until a broker feed is configured. */
async function withLivePrices(list: MarketAsset[]): Promise<MarketAsset[]> {
  let snap: Awaited<ReturnType<typeof cryptoSnapshot>> | null = null;
  try { snap = await cryptoSnapshot(5000); } catch { /* fall back to catalogue prices below */ }
  if (!snap) return list;
  return list.map((asset) => {
    if (asset.category !== "crypto") return asset;
    const row = snap!.rows.find((x) => x.symbol === asset.symbol);
    return row ? { ...asset, price: row.price * snap!.usdInr, changePercent: row.changePct } : asset;
  });
}

router.get("/market/assets", async (req, res) => {
  const parsed = ListAssetsQueryParams.parse(req.query);
  const search = parsed.search?.trim().toLowerCase();

  const filtered = await withLivePrices(assets
    .filter((asset) => parsed.category === "all" || asset.category === parsed.category)
    .filter(
      (asset) =>
        !search ||
        asset.symbol.toLowerCase().includes(search) ||
        asset.name.toLowerCase().includes(search),
    ));
  filtered.sort((left, right) => {
    if (parsed.sort === "gainers") return right.changePercent - left.changePercent;
    if (parsed.sort === "losers") return left.changePercent - right.changePercent;
    return right.marketCap - left.marketCap;
  });

  res.json(ListAssetsResponse.parse(filtered));
});

router.get("/market/assets/:symbol", async (req, res) => {
  const { symbol } = GetAssetParams.parse(req.params);
  const asset = assets.find((item) => item.symbol.toLowerCase() === symbol.toLowerCase());

  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  const [live] = await withLivePrices([asset]);
  res.json(GetAssetResponse.parse(assetDetail(live)));
});

export default router;