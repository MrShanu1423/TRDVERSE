import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
// Resolved from the bundled file's own location (not process.cwd()) so it works no matter how/where the server is started.
const apkPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../static/TradeVerse.apk");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// This server only ever returns JSON, never HTML, so helmet's default CSP/HSTS/etc. are safe as-is.
app.use(helmet());
// Open CORS is intentional: every authenticated route takes a Bearer token (never a cookie), so there is no
// session a cross-origin page could ride on - and the APK's WebView origin varies by platform/build.
app.use(cors());
// rawBody is kept so the Razorpay webhook signature can be verified byte-for-byte
app.use(express.json({ limit: "200kb", verify: (req, _res, buf) => { (req as any).rawBody = buf; } }));
app.use(express.urlencoded({ extended: true }));

const jsonLimitHandler = (_req: any, res: any) => res.status(429).json({ error: "Bahut zyada requests. Thodi der baad try karo." });
// Generous baseline so legitimate polling (live prices, pending orders, notifications) never trips it,
// while still stopping a runaway client or scraper from hammering the whole API.
app.use("/api", rateLimit({ windowMs: 15 * 60_000, limit: 1200, standardHeaders: true, legacyHeaders: false, handler: jsonLimitHandler }));
// OTP requests cost a real SMS/email send and can be used to enumerate accounts, so they get their own tight cap per IP
// on top of auth.ts's own per-identifier 30s cooldown.
app.use("/api/auth/request-otp", rateLimit({ windowMs: 10 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, handler: jsonLimitHandler }));
// Everything that moves balance/holdings (paper or demo) gets a tighter cap than general reads.
const financialLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, handler: jsonLimitHandler });
app.use("/api/trade/order", financialLimiter);
app.use("/api/trade/pending-order", financialLimiter);
app.use("/api/wallet/transfer", financialLimiter);
app.use("/api/pay", financialLimiter);

// Direct APK download: forces a file download (never renders as a page) so any mobile browser's
// "Download complete" notification leads straight to the Android install prompt.
app.get("/download/app", (_req, res) => {
  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.setHeader("Content-Disposition", "attachment; filename=\"TradeVerse.apk\"");
  res.sendFile(apkPath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "APK not available yet." });
  });
});

app.use("/api", router);

export default app;
