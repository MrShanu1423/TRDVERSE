// Downloads the official TradeVerse icon and generates EVERY icon/splash used by the app:
//   Android launcher + splash source files, PWA icons (Android/Chrome), iOS home-screen icon, favicon.
// Usage:  node fetch-icon.mjs                      (downloads from ICON_URL below)
//         ICON_FILE=./logo.png node fetch-icon.mjs (use a local file instead, e.g. offline)
//         ICON_BG=#0B0E14 node fetch-icon.mjs      (background colour behind the transparent logo)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ICON_URL = process.env.ICON_URL ||
  'https://res.cloudinary.com/dfjegeiip/image/upload/v1790924917/no-bg-TradeVerse_Crypto_Trading_Icon_cqlqzt.png';
const BG = process.env.ICON_BG || '#0B0E14';
const here = dirname(fileURLToPath(import.meta.url));
const RES = resolve(here, 'resources');
const PUB = resolve(here, '../artifacts/tradeverse/public');
mkdirSync(RES, { recursive: true }); mkdirSync(`${PUB}/icons`, { recursive: true });

let src;
if (process.env.ICON_FILE) src = readFileSync(process.env.ICON_FILE);
else {
  const r = await fetch(ICON_URL);
  if (!r.ok) throw new Error(`Icon download failed: HTTP ${r.status} for ${ICON_URL}`);
  src = Buffer.from(await r.arrayBuffer());
}
// crop transparent margins so the logo can be scaled predictably
const logo = await sharp(src).ensureAlpha().trim().png().toBuffer();

// logo scaled to fit a box of `box` px (keeps aspect), placed centred on a size x size canvas
async function canvas(size, box, bg) {
  const l = await sharp(logo).resize(box, box, { fit: 'inside' }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: bg ?? { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: l, gravity: 'centre' }]).png();
}
const save = async (img, path) => { await img.toFile(path); console.log('wrote', path.replace(here + '/', '')); };

// --- Android (read by @capacitor/assets) ---
await save(await canvas(1024, 800, BG), `${RES}/icon-only.png`);            // legacy icon
await save(await canvas(1024, 600), `${RES}/icon-foreground.png`);           // adaptive icon: stays in the safe zone
await save(sharp({ create: { width: 1024, height: 1024, channels: 3, background: BG } }).png(), `${RES}/icon-background.png`);
const splash = () => canvas(2732, 900, BG);
await save(await splash(), `${RES}/splash.png`);
await save(await splash(), `${RES}/splash-dark.png`);

// --- PWA / iOS / browser ---
await save(await canvas(512, 420, BG), `${PUB}/icons/icon-512.png`);
await save(await canvas(192, 158, BG), `${PUB}/icons/icon-192.png`);
await save(await canvas(512, 340, BG), `${PUB}/icons/maskable-512.png`);     // maskable: logo inside 66% safe zone
await save((await canvas(180, 150, BG)).flatten({ background: BG }).removeAlpha(), `${PUB}/icons/apple-touch-icon.png`); // iOS needs opaque
await save(await canvas(64, 54, BG), `${PUB}/favicon.png`);
console.log('Done: icon applied to launcher, splash, PWA, iOS home screen and favicon.');
